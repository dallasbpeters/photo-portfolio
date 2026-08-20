import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MIN_ITEM_SIZE,
} from "../../config/canvas.js";
import { findOutputPort, withWire } from "../../config/graph.js";
import type { PortType } from "../../config/nodeTypes.js";
import type { BoardComment } from "../services/comments";
import type { BoardItem, BoardWire } from "../types";
import { BoardItemView } from "./BoardItemView";
import { CanvasMenu, type CanvasMenuTarget } from "./CanvasMenu";
import { CanvasChrome } from "./canvas/CanvasChrome";
import { markFromStroke } from "./canvas/markFromStroke";
import { maskStrokeIn } from "./canvas/maskStroke";
import { portHandlersFor } from "./canvas/portHandlers";
import {
  RecipeGroupView,
  type RecipeGroupViewProps,
} from "./canvas/RecipeGroupView";
import {
  previewImagesFor,
  previewTextFor,
  wiredImageCountFor,
  wiredImageFor,
  wiredItemsFor,
  wiredTextFor,
} from "./canvas/wiredPreviews";
import {
  type DrawingConfig,
  type DrawTool,
  isFreehand,
  isMaskTool,
  type Point,
} from "./drawing";
import {
  type Guides,
  NO_GUIDES,
  type ResizeHandle,
  snapResize,
  snapToGuides,
} from "./geometry/alignmentGuides";
import {
  contentBounds,
  containedIndices as indicesWithin,
  topmostAt,
} from "./geometry/hitTest";
import { resizeBox } from "./geometry/resizeBox";
import {
  applyMarquee,
  EMPTY_SELECTION,
  press,
  reconcile,
  type Selection,
  select,
  selectedItems,
  soleSelected,
} from "./geometry/selectionModel";
import {
  buildSnapIndex,
  type Box as SnapBox,
  type SnapIndex,
} from "./geometry/snapIndex";
import { BOARD_IMAGE_TYPE } from "./itemOutput";
import type { MaskStroke } from "./mask";
import { PortMenu, type PortTarget } from "./PortMenu";
import { StrokePreview } from "./StrokePreview";
import { isImageDrop } from "./svgToRaster";
import { useBoardTools } from "./tools/useBoardTools";
import { useCanvasViewport } from "./useCanvasViewport";
import { useDeleteKey } from "./useDeleteKey";
import { useSpaceKey } from "./useSpaceKey";
import { useWireGesture } from "./useWireGesture";
import { WireLayer } from "./WireLayer";

const NO_WIRES: BoardWire[] = [];

/**
 * Stand-in for a caller that does not want the view centre.
 *
 * Shared and written to harmlessly, the same shape as NO_WIRES above — it lets
 * the canvas publish the getter unconditionally instead of guarding every
 * render on whether anyone asked for it.
 */
const NO_VIEW_CENTRE: RefObject<(() => { x: number; y: number }) | null> = {
  current: null,
};

/** Where a mark ended up, in canvas units. */
export interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** A pasted address worth treating as an image. No whitespace: one URL, not prose. */
const HTTP_URL = /^https?:\/\/\S+$/i;

interface BoardCanvasProps {
  /** Item to open for typing as soon as it appears — a just-placed note. */
  autoEditId?: string | null;
  /**
   * The board a tool's result is written to, null where there is none. Omitting
   * it is how every tool result came to be dropped on reload.
   */
  boardId: string | null;
  /** When true, clicking an item targets it for a comment rather than selecting. */
  commentMode?: boolean;
  /** Comments on the board's items, shown as badges and in the sidebar. */
  comments?: BoardComment[];
  /** Colours and weight the next mark is drawn with. */
  drawStyle?: { fill: string; stroke: string; strokeWidth: number };
  /** The active drawing tool, or null when the pointer selects and pans. */
  drawTool?: DrawTool | null;
  items: BoardItem[];
  /** Stable per-item React key. */
  keyOf: (item: BoardItem) => string;
  /**
   * A stroke painted onto an image with the mask brush. The canvas owns the
   * gesture and knows which picture it landed on; the editor owns the config.
   */
  /**
   * Wraps the given items in a frame of their own. The canvas knows what is
   * selected, only the editor can mint an item.
   */
  /** Lays a frame's contents out in a grid, keeping their order. */
  onArrangeFrame?: (itemId: string) => void;
  /** Brings one item to the very front of the stack. */
  onBringToFront?: (itemId: string) => void;
  /** Stops whatever run is in flight. */
  onCancel?: () => void;
  onChange: (items: BoardItem[]) => void;
  /** Called when an item is clicked while in comment mode. */
  onCommentItem?: (itemId: string) => void;
  /** Settings edited on an operation node. */
  onConfigChange?: (itemId: string, config: Record<string, unknown>) => void;
  /**
   * Copies a frame and its contents onto a board of their own.
   *
   * Same division as onCreateFromPort: the canvas knows which frame was asked
   * for, and the editor is the only thing that can talk to the API.
   */
  onCopyFrame?: (frame: BoardItem, title: string) => void;
  /**
   * Creates the thing a clicked port should feed, already wired to it.
   *
   * The canvas knows which port was clicked; only the editor can mint an item
   * and place it, so the decision is passed up.
   */
  onCreateFromPort?: (
    sourceItemId: string,
    sourcePort: string,
    target: PortTarget
  ) => void;
  /**
   * A mark drawn on the board, in canvas units.
   *
   * The canvas owns the gesture because only it can turn a pointer into a board
   * coordinate; the editor turns the result into an item.
   */
  onDraw?: (config: DrawingConfig, box: Box) => void;
  /** Picks the drawing tool, so a mask tool can arm the brush it needs. */
  onDrawTool?: (tool: DrawTool) => void;
  /**
   * Image files dragged onto the board, with the canvas point they landed on.
   *
   * The canvas is the only place that can turn a screen coordinate into a board
   * one, so it reports where; the editor uploads and mints the items.
   */
  onDropFiles?: (files: File[], point: { x: number; y: number }) => void;
  /**
   * An image that arrives already hosted — dragged off a node, or pasted as an
   * address.
   *
   * Separate from a file drop because there is nothing to upload: only a URL to
   * pin where it landed. Typed as the URL alone, since that is all this needs to
   * know; where it came from is the editor's business.
   */
  onDropImage?: (
    image: { url: string },
    point: { x: number; y: number }
  ) => void;
  /** Opens the manual photo editor on one item. */
  onEditImage?: (item: BoardItem) => void;
  /** Downloads everything a node made, or a frame holds, as one archive. */
  onExportItem?: (itemId: string) => void;
  onGroupIntoFrame?: (items: BoardItem[]) => void;
  onMaskStroke?: (itemId: string, stroke: MaskStroke) => void;
  /** Sends a node's SVG to Affinity and syncs its edits back. */
  onOpenInAffinity?: (itemId: string) => void;
  /** Deletes one stored version of a node's output. */
  onRemoveVersion?: (itemId: string, index: number) => void;
  /** Runs one node. `force` ignores a stored result that is still current. */
  onRun?: (itemId: string, force: boolean) => void;
  /** Stores the selected items as a reusable element. */
  onSaveElement?: (items: BoardItem[]) => void;
  /** Keeps a selection as a reusable way of working. */
  onSaveRecipe?: (items: BoardItem[], name: string) => void;
  /**
   * The item currently selected, or null.
   *
   * Reported up so the editor can offer controls for it — a drawing's colours
   * are edited by the same toolbar that set them, which only works if the
   * toolbar knows what is selected.
   */
  onSelectionChange?: (item: BoardItem | null) => void;
  /** Sends one item to the very back of the stack, above the frames. */
  onSendToBack?: (itemId: string) => void;
  /** Sends one item's picture into a Canva design. */
  onSendToCanva?: (item: BoardItem) => void;
  /** Pins every stored version of a node onto the board. */
  onSendVersions?: (itemId: string) => void;
  /** Runs the Recraft vectorizer on a placed image, via a fresh node. */
  onVectorize?: (itemId: string) => void;
  onWiresChange?: (wires: BoardWire[]) => void;
  /**
   * Viewing rather than editing. Pan and zoom remain, since a published board
   * is still something you explore; selection, dragging and the item chrome go.
   * Wires still render — on a graph they are the explanation of how the images
   * were made, which is most of the reason to publish one.
   */
  readOnly?: boolean;
  /** The recipe groups on this board, so their outlines can be drawn. */
  recipeUses?: RecipeGroupViewProps["uses"];
  /**
   * Filled with a getter for the middle of what is currently on screen.
   *
   * Only the canvas can turn the viewport into a board coordinate, but it is
   * the editor that decides where a new item goes — so instead of lifting the
   * viewport into the editor, the canvas hands down the one question the
   * editor needs answered.
   */
  viewCentreRef?: RefObject<(() => { x: number; y: number }) | null>;
  wires?: BoardWire[];
}

/**
 * Snap distance, in screen pixels.
 *
 * Screen rather than canvas units so it feels the same at every zoom: the same
 * few pixels of pointer movement, whether the board is fit to the window or
 * magnified.
 */
const SNAP_PX = 6;

/** Pointer movement (screen px) that counts as a drag rather than a click. */
const DRAG_RAISE_PX = 4;

type Gesture =
  | { kind: "none" }
  | {
      /** Items carried along, for a frame drag. Empty for everything else. */
      carried: { index: number; originX: number; originY: number }[];
      index: number;
      kind: "move";
      /** True once the drag has raised the item to the top of the stack. */
      raised: boolean;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    }
  | {
      index: number;
      kind: "resize";
      startX: number;
      startY: number;
      /** The box when the drag began; the pinned corner is derived from it. */
      origin: SnapBox;
      /** Which corner was taken. Decides which corner stays still. */
      handle: ResizeHandle;
      /** Snap targets, built once when the gesture began. */
      snap: SnapIndex;
    };

/**
 * The board surface: a fixed canvas you pan and zoom, with items dragged
 * directly on it.
 *
 * Item gestures are handled here rather than inside each item so that dragging
 * one item cannot be interrupted by the pointer crossing another — the whole
 * gesture belongs to the surface, and the surface knows which item owns it.
 */
export function BoardCanvas({
  items,
  onChange,
  onConfigChange,
  onCopyFrame,
  onArrangeFrame,
  onCreateFromPort,
  onExportItem,
  onGroupIntoFrame,
  onMaskStroke,
  onOpenInAffinity,
  onBringToFront,
  onSendToBack,
  drawTool = null,
  drawStyle,
  onDraw,
  onDropFiles,
  onCancel,
  onDropImage,
  onRemoveVersion,
  onRun,
  onSaveElement,
  onSaveRecipe,
  recipeUses,
  boardId,
  onDrawTool,
  onEditImage,
  onSendToCanva,
  onSelectionChange,
  onSendVersions,
  comments,
  commentMode,
  onCommentItem,
  onVectorize,
  onWiresChange,
  viewCentreRef = NO_VIEW_CENTRE,
  keyOf,
  autoEditId,
  readOnly = false,
  wires = NO_WIRES,
}: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The viewport frames itself on the items, and keeps doing so as the
  // container settles, until the board is panned, zoomed or rearranged.
  const view = useCanvasViewport(containerRef, () => contentBounds(items));
  const space = useSpaceKey();
  // Held space pans rather than sweeps a box; the pointerdown handler reads it.
  /**
   * Which items are selected, by index. A list rather than one index: several
   * can be picked with a marquee or with shift, and dragging any moves the
   * whole set. One selection is a list of length one, so every read is the
   * same shape.
   */
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  /** The marquee being dragged out on the background, in canvas units. */
  const [marquee, setMarquee] = useState<{ from: Point; to: Point } | null>(
    null
  );
  // Selecting and editing are separate: one click picks an item up, typing
  // needs a second. Without that split a note could never be dragged.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);
  /** An output port was clicked; it is offering what to create next. */
  const [portMenu, setPortMenu] = useState<{
    itemId: string;
    point: { x: number; y: number };
    portKey: string;
    portType: PortType;
  } | null>(null);
  /** The canvas was right-clicked; what is offered depends on where. */
  const [menu, setMenu] = useState<CanvasMenuTarget | null>(null);
  // Owned here rather than in CanvasMenu so a run outlives the menu that
  // started it: the menu is dismissed the instant a tool is picked.
  const tools = useBoardTools({
    boardId,
    items,
    onChange,
    onNeedsMask: () => onDrawTool?.("mask"),
  });

  useEffect(() => {
    if (autoEditId) {
      setEditingId(autoEditId);
    }
  }, [autoEditId]);
  const gesture = useRef<Gesture>({ kind: "none" });

  // Ids outlive indices but not deletion: an item removed by an undo, a delete
  // or a concurrent edit must fall out of the selection rather than linger as
  // an id nothing answers to. reconcile returns the same set when nothing was
  // dropped, so this does not invalidate memos on every item change.
  useEffect(() => {
    setSelection((current) => reconcile(current, items));
  }, [items]);

  // Reported from an effect rather than at each call site: selection is cleared
  // in half a dozen places — a background press, a delete, a drawing gesture —
  // and every one of them would otherwise have to remember to announce it.
  // The toolbar edits one thing, so it is told about a lone selection only —
  // with several picked there is no single item its controls could mean.
  const selectedItem = soleSelected(selection, items);

  // Open comments per item, for the badges the canvas draws on top of them.
  const openCommentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of comments ?? []) {
      if (!comment.resolved) {
        counts.set(comment.itemId, (counts.get(comment.itemId) ?? 0) + 1);
      }
    }
    return counts;
  }, [comments]);

  // Selecting vs commenting: comment targeting happens on the item's click
  // (see onCommentTarget below), so a read-only board just never selects.
  const selectFor = () => (readOnly ? () => undefined : beginMove);

  // Held in a ref so the effect below can read the current item without
  // depending on it: the item is a new object on every edit, and depending on
  // it would re-announce the selection on each keystroke.
  const selectedRef = useRef(selectedItem);
  selectedRef.current = selectedItem;
  const selectedId = selectedItem?.id ?? null;
  useEffect(() => {
    // selectedId is what makes this fire, and reading it here rather than
    // relying on it only as a dependency keeps that visible — the ref supplies
    // the item, the id decides when.
    onSelectionChange?.(selectedId === null ? null : selectedRef.current);
  }, [selectedId, onSelectionChange]);

  /** Picks one item, as a layer-row click would — a lone, deliberate choice. */
  const selectItem = useCallback((item: BoardItem) => {
    setSelection(select(item.id));
  }, []);

  /**
   * The mark being drawn right now, in canvas units.
   *
   * Held in state rather than a ref because it has to render as it grows —
   * drawing you cannot see until you let go is not drawing.
   */
  const [stroke, setStroke] = useState<Point[] | null>(null);

  // The mask brush is a drawing gesture that ends somewhere else, so it is
  // enabled by its own handler rather than by onDraw — which it never calls.
  const isDrawing =
    drawTool !== null &&
    !readOnly &&
    Boolean(isMaskTool(drawTool) ? onMaskStroke : onDraw);

  /**
   * The image a mask stroke belongs to: the topmost picture under its start.
   *
   * Chosen from where the stroke began rather than where it ended, so running
   * off the edge of a photograph while painting keeps the paint on it instead
   * of moving the mask to whatever the pointer finished over.
   */
  const imageAt = useCallback(
    (point: Point): BoardItem | null =>
      topmostAt(
        items,
        point,
        (item) => Boolean(item.imageUrl) && item.kind !== "frame"
      ),
    [items]
  );

  /**
   * A mask stroke, handed to the picture it was painted on.
   *
   * The mask brush never reaches onDraw: it leaves no mark of its own. A
   * stroke that began off any image is dropped, there being nothing for it to
   * be a mask of.
   */
  const finishMaskStroke = useCallback(
    (points: Point[], strokeWidth: number) => {
      const [start] = points;
      const target = start ? imageAt(start) : null;
      if (!(target && onMaskStroke)) {
        return;
      }
      onMaskStroke(target.id, maskStrokeIn(points, target, strokeWidth));
    },
    [imageAt, onMaskStroke]
  );

  /** Ends the mark, handing the editor a config and the box it occupies. */
  const finishStroke = useCallback(
    (points: Point[]) => {
      setStroke(null);
      if (!(drawTool && drawStyle) || points.length === 0) {
        return;
      }

      if (isMaskTool(drawTool)) {
        finishMaskStroke(points, drawStyle.strokeWidth);
        return;
      }
      const mark = markFromStroke(points, drawTool, drawStyle);
      if (mark) {
        onDraw?.(mark.config, mark.box);
      }
    },
    [drawStyle, drawTool, finishMaskStroke, onDraw]
  );

  /**
   * Where something arriving without a pointer position should go: the middle of
   * what is currently on screen.
   *
   * A paste has no coordinates, and the centre of the *canvas* is the wrong
   * answer — on a board panned somewhere else it would put the image out of
   * sight. The centre of the view is where you are looking.
   */
  const viewCentre = useCallback((): { x: number; y: number } => {
    // The ref really can be null — tsc insists, and it is right, even though
    // the paste handler that calls this cannot fire before mount. Read through
    // an optional chain so the fallback is a value rather than a branch the
    // linter reads as dead.
    const rect = containerRef.current?.getBoundingClientRect();
    return rect
      ? view.toCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  }, [view]);

  // Published so the editor can drop new items where you are looking. Assigned
  // during render, not in an effect: an insert can happen on the very first
  // interaction, before effects from a later render have run.
  viewCentreRef.current = viewCentre;

  /**
   * Pasting an image onto the board: the same act as dropping a file, down the
   * same path. Listens on the window rather than an element because paste is
   * not delivered to something merely hovered — it goes to whatever has focus,
   * which on a board you are looking at is the document.
   */
  useEffect(() => {
    if (readOnly || !(onDropFiles || onDropImage)) {
      return;
    }
    const onPaste = (e: ClipboardEvent) => {
      // A paste aimed at a note, a prompt or any other field belongs to that
      // field. Only a paste with nowhere else to go lands on the board.
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      const files = [...(e.clipboardData?.files ?? [])].filter((file) =>
        isImageDrop(file)
      );
      if (files.length > 0 && onDropFiles) {
        e.preventDefault();
        onDropFiles(files, viewCentre());
        return;
      }

      // No bitmap, but an address is the other way an image gets copied —
      // "copy image address" from a browser puts only text on the clipboard.
      // Any http(s) URL is accepted rather than only ones ending in .jpg:
      // plenty of image URLs carry no extension at all, and a link pasted onto
      // a board with nothing focused can only mean "put this here". A URL that
      // turns out not to be an image shows as a broken item and can be deleted,
      // which is a smaller cost than silently ignoring a valid one.
      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (text && onDropImage && HTTP_URL.test(text)) {
        e.preventDefault();
        onDropImage({ url: text }, viewCentre());
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onDropFiles, onDropImage, readOnly, viewCentre]);

  const topZ = items.reduce((max, i) => Math.max(max, i.z), 0);

  /**
   * Adds a wire, letting the registry decide whether it replaces or accumulates.
   *
   * A single-value input swaps: dropping a second wire on it means "use this
   * instead". A batch input keeps both, because four references wired into one
   * Generate node are four jobs. withWire knows which is which; the canvas
   * should not have a second opinion.
   */
  const connect = useCallback(
    (wire: BoardWire) => {
      onWiresChange?.(
        withWire(
          items.map((item) => ({
            id: item.id,
            kind: item.kind,
            nodeType: item.nodeType,
          })),
          wires,
          wire
        ) as BoardWire[]
      );
    },
    [items, onWiresChange, wires]
  );

  const wiring = useWireGesture({ items, onConnect: connect, wires });

  /** Inputs already fed by a wire, so a node can say its prompt is wired in. */
  /** The graph the preview helpers read. One object, so they share an identity. */
  const graph = { items, wires };

  const wiredPorts = new Set(
    wires.map((wire) => `${wire.targetItemId}:${wire.targetPort}`)
  );

  /**
   * Removes an item and everything attached to it.
   *
   * One action, not two: a board must never be left holding a wire that points
   * at nothing. The schema cascades on the server for the same reason.
   */
  /**
   * Items gone, with every wire that touched any of them.
   *
   * One removal rather than one per way of asking. The cross on an item's
   * chrome and the Delete key were separate code doing the same thing, and only
   * the first of them remembered to take the wires — a node deleted by keyboard
   * would have left wires pointing at nothing.
   */
  const removeIds = useCallback(
    (doomed: Set<string>) => {
      if (doomed.size === 0) {
        return;
      }
      onChange(items.filter((item) => !doomed.has(item.id)));
      onWiresChange?.(
        wires.filter(
          (wire) =>
            !(doomed.has(wire.sourceItemId) || doomed.has(wire.targetItemId))
        )
      );
    },
    [items, onChange, onWiresChange, wires]
  );

  const removeItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        removeIds(new Set([item.id]));
      }
    },
    [items, removeIds]
  );

  // Frames the arrangement the first time the board has one. A published board
  // arrives from the API well after the canvas has been laid out, so nothing
  // else tells the viewport that there is finally something to look at.
  //
  // Pulled out of `view`, whose identity changes every render; `frameContent`
  // itself is stable, so this runs only when the items change, and it declines
  // to do anything once the board has been framed or taken hold of.
  const removeSelected = useCallback(() => {
    removeIds(new Set(selectedItems(selection, items).map((i) => i.id)));
    setSelection(EMPTY_SELECTION);
  }, [items, removeIds, selection]);

  // Not while a visitor is looking at a published board, and not while a node
  // is being edited — the node's own fields handle their own keys.
  useDeleteKey(removeSelected, !(readOnly || editingId));

  const { frameContent } = view;
  useEffect(() => {
    // An empty board has nothing to frame, and the viewport already centres the
    // bare canvas on its own.
    if (items.length > 0) {
      frameContent();
    }
  }, [items, frameContent]);

  /** Indices of the items a frame carries. Membership comes from graph.ts. */
  /** Indices of the items a frame carries. Membership comes from graph.ts. */
  const containedIndices = useCallback(
    (frame: BoardItem): number[] => indicesWithin(frame, items),
    [items]
  );

  /**
   * The frame under a canvas point, topmost first.
   *
   * Only frames, and searched from the end because later items sit above
   * earlier ones — a frame dropped on top of another should be the one that
   * answers. Hit-testing here rather than putting a handler on every item
   * keeps the cost to the one right-click that asks.
   */
  const frameAt = useCallback(
    (point: Point): BoardItem | null =>
      topmostAt(items, point, (item) => item.kind === "frame"),
    [items]
  );

  /**
   * Right-clicking a frame offers to copy it to a board of its own.
   *
   * Anywhere else keeps the browser's own menu, which is still how an image
   * gets saved or a link copied — so this only preempts it over a frame.
   */
  const openMenu = useCallback(
    (e: ReactMouseEvent) => {
      if (readOnly) {
        return;
      }
      // Both targets are gathered and the menu offers whichever apply. Asking
      // "is there a frame here?" first made grouping unreachable on any board
      // with a frame spread under the work — which is most of them.
      const chosen = selectedItems(selection, items);
      const frame = onCopyFrame
        ? frameAt(view.toCanvas(e.clientX, e.clientY))
        : null;
      if (chosen.length === 0 && !frame) {
        // Nothing to offer, so the browser's own menu stays — which is still
        // how an image gets saved or a link copied.
        return;
      }
      e.preventDefault();
      setMenu({
        frame,
        point: { x: e.clientX, y: e.clientY },
        selection: onGroupIntoFrame ? chosen : [],
      });
    },
    [frameAt, items, onCopyFrame, onGroupIntoFrame, readOnly, selection, view]
  );

  /** Everything the swept rectangle touches, by index. */
  /**
   * Everything the swept rectangle touches.
   *
   * The rules — overlap rather than enclosure, and a sweep under a few units
   * counting as a click that clears — live in selectionModel with tests, since
   * they are the kind of thing that gets quietly changed and quietly regresses.
   */
  const finishMarquee = useCallback(
    (box: { from: Point; to: Point }, add: boolean) => {
      setMarquee(null);
      setSelection((current) => applyMarquee(current, items, box, add));
    },
    [items]
  );

  const beginMove = useCallback(
    (index: number, clientX: number, clientY: number, additive = false) => {
      const item = items[index];
      if (!item) {
        return;
      }
      // Rearranging the board counts as taking hold of it: the view must stay
      // put from here on, rather than re-framing on the next container resize.
      view.markUserMoved();
      const p = view.toCanvas(clientX, clientY);
      const isFrame = item.kind === "frame";
      // Shift or cmd adds to the selection instead of replacing it, and does
      // not begin a drag — picking several one by one should not nudge them.
      if (additive) {
        setSelection((current) => press(current, item.id, true));
        gesture.current = { kind: "none" };
        return;
      }
      // Pressing something already selected drags the whole selection; pressing
      // something outside it selects that one instead, which is what every
      // canvas does and what stops a stray click scattering a careful set.
      const inSelection = selection.has(item.id);
      // The gesture still carries indices: it is in flight for one drag and the
      // array does not reorder underneath it except by raise-to-top, which it
      // performs itself. Converting the gesture to ids is a separate change.
      const moving = inSelection
        ? items.reduce<number[]>((acc, candidate, i) => {
            if (selection.has(candidate.id)) {
              acc.push(i);
            }
            return acc;
          }, [])
        : [index];
      const alsoCarried = isFrame ? containedIndices(item) : [];
      const carriedIndices = [...new Set([...moving, ...alsoCarried])].filter(
        (i) => i !== index
      );

      gesture.current = {
        // A frame takes whatever is sitting on it, and a multiple selection
        // takes the rest of itself.
        carried: carriedIndices.map((i) => ({
          index: i,
          originX: items[i]?.x ?? 0,
          originY: items[i]?.y ?? 0,
        })),
        index,
        kind: "move",
        originX: item.x,
        originY: item.y,
        // Raised to the top only once the item is actually dragged — see
        // onPointerMove. A plain click selects without reordering the stack,
        // which is what the layers panel and the stack menu are for.
        raised: false,
        startX: p.x,
        startY: p.y,
      };
      if (!inSelection) {
        setSelection(select(item.id));
      }
    },
    [containedIndices, items, selection, view]
  );

  const beginResize = useCallback(
    (index: number, clientX: number, clientY: number, handle: ResizeHandle) => {
      const item = items[index];
      if (!item) {
        return;
      }
      view.markUserMoved();
      const p = view.toCanvas(clientX, clientY);
      gesture.current = {
        handle,
        index,
        kind: "resize",
        origin: {
          height: item.height,
          width: item.width,
          x: item.x,
          y: item.y,
        },
        // Built once, here: the one-shot helper rebuilt its coordinate arrays
        // on every pointermove, which is the per-frame cost the indexed version
        // exists to remove. The item being resized is excluded so it cannot
        // snap to itself.
        snap: buildSnapIndex(items, {
          exclude: [item.id],
          includeCanvas: true,
        }),
        startX: p.x,
        startY: p.y,
      };
      setSelection(select(item.id));
    },
    [items, view]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // A wire being dragged owns the pointer outright: it must not pan the
      // board underneath itself, and no item gesture can be in flight at the
      // same time, since a port press never starts one.
      if (wiring.isDragging) {
        const p = view.toCanvas(e.clientX, e.clientY);
        wiring.moveTo(p);
        return;
      }

      const g = gesture.current;
      if (g.kind === "none") {
        view.onPointerMove(e);
        return;
      }
      const p = view.toCanvas(e.clientX, e.clientY);
      const dx = p.x - g.startX;
      const dy = p.y - g.startY;

      if (g.kind === "move") {
        const item = items[g.index];
        if (!item) {
          return;
        }
        // Raised to the top once it is really being dragged, not on the press
        // that merely selected it — a click must not reorder the stack, which
        // is what the layers panel and the stack menu are for. Frames stay
        // backdrops whatever happens.
        const raised = !g.raised && item.kind !== "frame";
        const distance =
          Math.abs(dx) > DRAG_RAISE_PX / view.viewport.scale ||
          Math.abs(dy) > DRAG_RAISE_PX / view.viewport.scale;
        if (raised && distance) {
          onChange(
            items.map((it, i) => (i === g.index ? { ...it, z: topZ + 1 } : it))
          );
          gesture.current = { ...g, raised: true };
        }
        // Snapping compares against every other item, so the dragged one is
        // excluded — it would otherwise align to itself and never move.
        const snapped = snapToGuides(
          {
            height: item.height,
            width: item.width,
            x: g.originX + dx,
            y: g.originY + dy,
          },
          items.filter((_, i) => i !== g.index),
          SNAP_PX / view.viewport.scale
        );
        setGuides(snapped.guides);
        // The frame lands on the snapped position; its contents keep their
        // offsets from it, so the arrangement inside is preserved exactly.
        const shiftX = snapped.x - g.originX;
        const shiftY = snapped.y - g.originY;
        const carried = new Map(
          g.carried.map((c) => [
            c.index,
            { x: c.originX + shiftX, y: c.originY + shiftY },
          ])
        );
        onChange(
          items.map((it, i) => {
            if (i === g.index) {
              return { ...it, x: snapped.x, y: snapped.y };
            }
            const moved = carried.get(i);
            return moved ? { ...it, x: moved.x, y: moved.y } : it;
          })
        );
        return;
      }

      const dragged = resizeBox({
        dx,
        dy,
        handle: g.handle,
        lockAspect: e.shiftKey,
        minSize: MIN_ITEM_SIZE,
        origin: g.origin,
      });
      // Only the dragged edges snap. The pinned corner is the whole meaning of
      // a resize, so a snap that moved it would be a move in disguise.
      const sized = snapResize(dragged, g.handle, g.snap, {
        scale: view.viewport.scale,
      });
      setGuides(sized.guides);
      onChange(
        items.map((it, i) =>
          i === g.index
            ? {
                ...it,
                height: sized.height,
                width: sized.width,
                x: sized.x,
                y: sized.y,
              }
            : it
        )
      );
    },
    [items, onChange, topZ, view, wiring]
  );

  const endGesture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Released while dragging a wire: connect if it landed on a port it is
      // allowed to land on, otherwise simply drop it. Abandoning a wire
      // half-drawn is a thing people do constantly, and it should cost nothing.
      if (wiring.isDragging) {
        // A press that went nowhere is a click, and a click asks what should
        // come next rather than quietly cancelling.
        const clicked = wiring.end({ x: e.clientX, y: e.clientY });
        if (clicked && onCreateFromPort) {
          const source = items.find((item) => item.id === clicked.itemId);
          const port = source ? findOutputPort(source, clicked.portKey) : null;
          if (port) {
            setPortMenu({
              itemId: clicked.itemId,
              point: { x: e.clientX, y: e.clientY },
              portKey: clicked.portKey,
              portType: port.type,
            });
          }
        }
        return;
      }
      if (gesture.current.kind === "none") {
        view.onPointerUp(e);
        return;
      }
      gesture.current = { kind: "none" };
      setGuides(NO_GUIDES);
    },
    [items, onCreateFromPort, view, wiring]
  );

  /**
   * The dot grid, drawn on the unscaled viewport rather than on the board.
   *
   * On the scaled layer it zoomed with everything else: boulders zoomed in,
   * nothing zoomed out. Here the spacing is in screen pixels, identical at
   * every zoom. It still slides with the pan, which keeps the movement legible
   * — background-position moves the pattern without resizing it.
   */
  const dotGridStyle = {
    background:
      "linear-gradient(90deg, var(--dot-bg) calc(var(--dot-space) - var(--dot-size)), transparent 1%) center / var(--dot-space) var(--dot-space), linear-gradient(var(--dot-bg) calc(var(--dot-space) - var(--dot-size)), transparent 1%) center / var(--dot-space) var(--dot-space), var(--dot-color)",
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-board-ground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={dotGridStyle}
      />
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the pan/zoom surface is scenery, not a control — keyboard users reach the items themselves, which are focusable */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: same — this element exists to receive pointer gestures and file drops aimed at the board as a whole */}
      <div
        className={`h-full w-full touch-none ${
          // No native cursor on the canvas: CustomCursor draws the pointer, and
          // two of them is one too many. A `cursor-*` class here would win over
          // `cursor: none` on `.board` however that rule were written, since it
          // sits on the element the pointer is actually over — which is why
          // hiding it in the stylesheet alone did nothing.
          "cursor-none"
        }`}
        onContextMenu={openMenu}
        onDragOver={
          onDropFiles || onDropImage
            ? (e) => {
                // Without this the browser treats the drop as navigation and
                // replaces the board with the image.
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }
            : undefined
        }
        onDrop={
          onDropFiles || onDropImage
            ? (e) => {
                const point = view.toCanvas(e.clientX, e.clientY);

                // An image pulled off a node: already ours, already stored, so
                // it only needs pinning where it landed.
                const pulled = e.dataTransfer.getData(BOARD_IMAGE_TYPE);
                if (pulled && onDropImage) {
                  e.preventDefault();
                  try {
                    onDropImage(JSON.parse(pulled) as { url: string }, point);
                  } catch {
                    // Malformed payload — nothing worth interrupting for.
                  }
                  return;
                }

                const files = [...e.dataTransfer.files].filter((file) =>
                  isImageDrop(file)
                );
                if (files.length === 0 || !onDropFiles) {
                  return;
                }
                e.preventDefault();
                // Dropped where it was let go of, not where a counter says.
                onDropFiles(files, point);
              }
            : undefined
        }
        onPointerCancel={(e) => {
          if (marquee) {
            setMarquee(null);
            return;
          }
          if (stroke) {
            finishStroke(stroke);
            return;
          }
          endGesture(e);
        }}
        onPointerDown={(e) => {
          // Only the primary button begins anything. A right-click also emits
          // pointerdown, so without this it started a drag that captured every
          // item's position, sat there while the context menu was open, and
          // wrote those stale positions back when it ended — which looked
          // exactly like the menu's action being undone a moment after it ran.
          if (e.button !== 0) {
            return;
          }
          // A press that began on a port is already a wire drag; the surface
          // must not also start panning underneath it.
          if (wiring.isDragging) {
            return;
          }
          // A tool is chosen, so a press is a mark rather than a selection or a
          // pan. Capture the pointer so a stroke that leaves the element still
          // finishes here instead of being abandoned mid-line.
          if (isDrawing) {
            e.currentTarget.setPointerCapture(e.pointerId);
            setSelection(EMPTY_SELECTION);
            setEditingId(null);
            setStroke([view.toCanvas(e.clientX, e.clientY)]);
            return;
          }
          // Space pans, a plain drag sweeps a selection box. The convention
          // every canvas tool shares, and worth matching even though it used to
          // be the other way round here: a hand reaching for the board expects
          // to hold space, and a drag on empty canvas expects to select.
          if (e.target === e.currentTarget || gesture.current.kind === "none") {
            setEditingId(null);
            if (space.heldRef.current) {
              setSelection(EMPTY_SELECTION);
              view.onPointerDown(e);
              return;
            }
            e.currentTarget.setPointerCapture(e.pointerId);
            // Shift keeps what is already picked, matching what shift does on
            // a single item; a plain sweep starts fresh.
            if (!e.shiftKey) {
              setSelection(EMPTY_SELECTION);
            }
            const start = view.toCanvas(e.clientX, e.clientY);
            setMarquee({ from: start, to: start });
          }
        }}
        onPointerMove={(e) => {
          if (marquee) {
            setMarquee({
              from: marquee.from,
              to: view.toCanvas(e.clientX, e.clientY),
            });
            return;
          }
          if (stroke) {
            const point = view.toCanvas(e.clientX, e.clientY);
            // A shape only ever needs where it started and where it is now;
            // keeping every sample would make its box jitter with the pointer.
            setStroke((current) => {
              if (!current) {
                return current;
              }
              const [first] = current;
              if (!(first && drawTool)) {
                return current;
              }
              return isFreehand(drawTool)
                ? [...current, point]
                : [first, point];
            });
            return;
          }
          onPointerMove(e);
        }}
        onPointerUp={(e) => {
          if (marquee) {
            finishMarquee(marquee, e.shiftKey);
            return;
          }
          if (stroke) {
            finishStroke(stroke);
            return;
          }
          endGesture(e);
        }}
        ref={containerRef}
      >
        <div
          className="relative origin-top-left outline outline-board-ink/5"
          ref={view.layerRef}
          style={{
            height: CANVAS_HEIGHT,
            transform: `translate(${view.viewport.tx}px, ${view.viewport.ty}px) scale(${view.viewport.scale})`,
            width: CANVAS_WIDTH,
          }}
        >
          {guides.vertical.map((guide) => (
            <div
              className="pointer-events-none absolute bg-sky-400"
              key={`v-${guide.position}-${guide.from}`}
              style={{
                height: guide.to - guide.from,
                left: guide.position,
                // Hairline at any zoom, and pulled back by half its own width
                // so it sits centred on the edge it marks.
                marginLeft: -0.5 / view.viewport.scale,
                top: guide.from,
                width: 1 / view.viewport.scale,
                zIndex: 9999,
              }}
            />
          ))}
          {guides.horizontal.map((guide) => (
            <div
              className="pointer-events-none absolute bg-sky-400"
              key={`h-${guide.position}-${guide.from}`}
              style={{
                height: 1 / view.viewport.scale,
                left: guide.from,
                marginTop: -0.5 / view.viewport.scale,
                top: guide.position,
                width: guide.to - guide.from,
                zIndex: 9999,
              }}
            />
          ))}

          {/* Behind the items on purpose: a wire should pass under the nodes
              it connects rather than across their faces. */}
          <WireLayer
            draft={wiring.draft}
            items={items}
            onDelete={
              onWiresChange
                ? (wireId) =>
                    onWiresChange(wires.filter((wire) => wire.id !== wireId))
                : undefined
            }
            readOnly={readOnly}
            scale={view.viewport.scale}
            wires={wires}
          />

          {/* The mark as it is being made. Rendered here, inside the canvas
              transform, so it sits in the same coordinate space it will occupy
              once it becomes an item — no jump on release.

              Above the items, which is the whole point: items carry a z-index
              and this did not, so a stroke drawn over a picture was painted
              over by it. Invisible drawing was survivable on bare canvas and
              fatal for the mask brush, which is only ever used on top of an
              image. */}
          <StrokePreview points={stroke} style={drawStyle} tool={drawTool} />

          {/* Behind the items, in canvas units: a group is part of the
              arrangement rather than chrome, so it zooms and pans with the
              nodes it describes. */}
          {recipeUses && recipeUses.length > 0 ? (
            <RecipeGroupView items={items} uses={recipeUses} />
          ) : null}

          {/* Drawn in canvas units inside the transform, so it stays exactly
              under the pointer at any zoom. */}
          {marquee ? (
            <div
              className="pointer-events-none absolute border border-sky-300 bg-sky-300/10"
              style={{
                height: Math.abs(marquee.to.y - marquee.from.y),
                left: Math.min(marquee.from.x, marquee.to.x),
                top: Math.min(marquee.from.y, marquee.to.y),
                width: Math.abs(marquee.to.x - marquee.from.x),
              }}
            />
          ) : null}

          {items.map((item, index) => (
            <BoardItemView
              commentCount={openCommentCounts.get(item.id) ?? 0}
              hasWiredPrompt={wiredPorts.has(`${item.id}:prompt`)}
              imageCount={wiredImageCountFor(item, graph)}
              imageUrl={wiredImageFor(item.id, graph)}
              index={index}
              isEditing={!readOnly && editingId === item.id}
              isSelected={!readOnly && selection.has(item.id)}
              isSoleSelected={selectedItem?.id === item.id}
              item={item}
              key={keyOf(item)}
              onBeginEdit={() => {
                if (!readOnly) {
                  setEditingId(item.id);
                }
              }}
              onCancel={onCancel}
              onCommentTarget={
                commentMode && onCommentItem
                  ? () => onCommentItem(item.id)
                  : undefined
              }
              onConfigChange={(config) => onConfigChange?.(item.id, config)}
              onDelete={() => removeItem(index)}
              onEditBody={(body) =>
                onChange(
                  items.map((it, i) => (i === index ? { ...it, body } : it))
                )
              }
              onEditManually={onEditImage ? () => onEditImage(item) : undefined}
              onPatch={(patch) =>
                onChange(
                  items.map((it, i) => (i === index ? { ...it, ...patch } : it))
                )
              }
              onRemoveVersion={
                onRemoveVersion
                  ? (version) => onRemoveVersion(item.id, version)
                  : undefined
              }
              onResizeStart={readOnly ? () => undefined : beginResize}
              onRun={(force) => onRun?.(item.id, force)}
              onSelect={selectFor()}
              onSendVersions={
                onSendVersions ? () => onSendVersions(item.id) : undefined
              }
              outputText={previewTextFor(item, graph)}
              ports={
                readOnly
                  ? undefined
                  : portHandlersFor(item, wiring, view.markUserMoved)
              }
              previewImages={previewImagesFor(item, graph)}
              readOnly={readOnly}
              scale={view.viewport.scale}
              tools={readOnly ? undefined : tools}
              wiredItems={wiredItemsFor(item, graph)}
              wiredPrompt={wiredTextFor(item.id, graph)}
            />
          ))}
        </div>
      </div>
      <CanvasMenu
        items={items}
        menu={menu}
        onArrange={(itemId) => {
          onArrangeFrame?.(itemId);
          setMenu(null);
        }}
        onBringToFront={(itemId) => {
          onBringToFront?.(itemId);
          setMenu(null);
        }}
        onCopyFrame={(frame, title) => {
          onCopyFrame?.(frame, title);
          setMenu(null);
        }}
        onDismiss={() => setMenu(null)}
        onExport={(itemId) => {
          onExportItem?.(itemId);
          setMenu(null);
        }}
        onGroup={(chosen) => {
          onGroupIntoFrame?.(chosen);
          setMenu(null);
        }}
        onOpenInAffinity={(itemId) => {
          onOpenInAffinity?.(itemId);
          setMenu(null);
        }}
        onRunTool={readOnly ? undefined : tools.run}
        onSaveElement={(chosen) => {
          onSaveElement?.(chosen);
          setMenu(null);
        }}
        onSaveRecipe={
          readOnly || !onSaveRecipe
            ? undefined
            : (chosen, name) => {
                onSaveRecipe(chosen, name);
                setMenu(null);
              }
        }
        onSendToBack={(itemId) => {
          onSendToBack?.(itemId);
          setMenu(null);
        }}
        onSendToCanva={(item) => {
          onSendToCanva?.(item);
          setMenu(null);
        }}
        onVectorize={(itemId) => {
          onVectorize?.(itemId);
          setMenu(null);
        }}
        wires={wires}
      />
      {portMenu ? (
        <PortMenu
          onChoose={(target) => {
            onCreateFromPort?.(portMenu.itemId, portMenu.portKey, target);
            setPortMenu(null);
          }}
          onDismiss={() => setPortMenu(null)}
          point={portMenu.point}
          portType={portMenu.portType}
        />
      ) : null}
      <CanvasChrome
        items={items}
        onChange={onChange}
        onSelect={selectItem}
        readOnly={readOnly}
        selectedId={selectedId}
        view={view}
      />
    </div>
  );
}
