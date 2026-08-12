import type { MutableRefObject, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MIN_ITEM_SIZE,
} from "../../config/canvas.js";
import { containedBy, findOutputPort, withWire } from "../../config/graph.js";
import type { PortType } from "../../config/nodeTypes.js";
import type { BoardItem, BoardWire } from "../types";
import { type Guides, NO_GUIDES, snapToGuides } from "./alignmentGuides";
import { BoardItemView } from "./BoardItemView";
import { CanvasMenu, type CanvasMenuTarget } from "./CanvasMenu";
import {
  boundsOf,
  type DrawingConfig,
  type DrawTool,
  isFreehand,
  isMaskTool,
  type Point,
  toUnitSpace,
} from "./drawing";
import {
  BOARD_IMAGE_TYPE,
  iteratedTextOf,
  outputImageOf,
  outputListOf,
  outputTextOf,
} from "./itemOutput";
import type { MaskStroke } from "./mask";
import { PortMenu, type PortTarget } from "./PortMenu";
import { outputPointFor } from "./portGeometry";
import { StrokePreview } from "./StrokePreview";
import { isImageDrop } from "./svgToRaster";
import { useCanvasViewport } from "./useCanvasViewport";
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
const NO_VIEW_CENTRE: MutableRefObject<
  (() => { x: number; y: number }) | null
> = { current: null };

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
  /** Colours and weight the next mark is drawn with. */
  drawStyle?: { fill: string; stroke: string; strokeWidth: number };
  /** The active drawing tool, or null when the pointer selects and pans. */
  drawTool?: DrawTool | null;
  items: BoardItem[];
  /** Stable per-item React key. */
  keyOf: (item: BoardItem) => string;
  /** Stops whatever run is in flight. */
  onCancel?: () => void;
  onChange: (items: BoardItem[]) => void;
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
  /**
   * A stroke painted onto an image with the mask brush.
   *
   * The canvas owns the gesture and knows which picture it landed on; the
   * editor owns the item's config, which is where the mask is kept.
   */
  /**
   * Wraps the given items in a frame of their own.
   *
   * The canvas knows what is selected; only the editor can mint an item, which
   * is the same division onCreateFromPort and onCopyFrame already use.
   */
  onGroupIntoFrame?: (items: BoardItem[]) => void;
  onMaskStroke?: (itemId: string, stroke: MaskStroke) => void;
  /** Deletes one stored version of a node's output. */
  onRemoveVersion?: (itemId: string, index: number) => void;
  /** Runs one node. `force` ignores a stored result that is still current. */
  onRun?: (itemId: string, force: boolean) => void;
  /**
   * The item currently selected, or null.
   *
   * Reported up so the editor can offer controls for it — a drawing's colours
   * are edited by the same toolbar that set them, which only works if the
   * toolbar knows what is selected.
   */
  onSelectionChange?: (item: BoardItem | null) => void;
  /** Pins every stored version of a node onto the board. */
  onSendVersions?: (itemId: string) => void;
  onWiresChange?: (wires: BoardWire[]) => void;
  /**
   * Viewing rather than editing. Pan and zoom remain, since a published board
   * is still something you explore; selection, dragging and the item chrome go.
   * Wires still render — on a graph they are the explanation of how the images
   * were made, which is most of the reason to publish one.
   */
  readOnly?: boolean;
  /**
   * Filled with a getter for the middle of what is currently on screen.
   *
   * Only the canvas can turn the viewport into a board coordinate, but it is
   * the editor that decides where a new item goes — so instead of lifting the
   * viewport into the editor, the canvas hands down the one question the
   * editor needs answered.
   */
  viewCentreRef?: MutableRefObject<(() => { x: number; y: number }) | null>;
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

/** True when a canvas point falls inside an item's box. */
const covers = (item: BoardItem, point: Point): boolean =>
  point.x >= item.x &&
  point.x <= item.x + item.width &&
  point.y >= item.y &&
  point.y <= item.y + item.height;

/**
 * The topmost item under a point that satisfies `wanted`.
 *
 * Searched from the end because later items sit above earlier ones, so the one
 * drawn last is the one a pointer is aiming at. Module-level and pure: it needs
 * nothing but the list and the point.
 */
const topmostAt = (
  items: BoardItem[],
  point: Point,
  wanted: (item: BoardItem) => boolean
): BoardItem | null => {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item && wanted(item) && covers(item, point)) {
      return item;
    }
  }
  return null;
};

/**
 * The rectangle the items occupy, or null for an empty board.
 *
 * This is what the view is framed on: the arrangement usually fills a small
 * part of the 4000×3000 canvas, so framing the canvas itself leaves the board
 * off to one side and too small to read.
 */
const contentBounds = (items: BoardItem[]) => {
  if (items.length === 0) {
    return null;
  }
  const left = Math.min(...items.map((i) => i.x));
  const top = Math.min(...items.map((i) => i.y));
  const right = Math.max(...items.map((i) => i.x + i.width));
  const bottom = Math.max(...items.map((i) => i.y + i.height));
  return { height: bottom - top, width: right - left, x: left, y: top };
};

type Gesture =
  | { kind: "none" }
  | {
      /** Items carried along, for a frame drag. Empty for everything else. */
      carried: { index: number; originX: number; originY: number }[];
      index: number;
      kind: "move";
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
      originW: number;
      originH: number;
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
  onCreateFromPort,
  onGroupIntoFrame,
  onMaskStroke,
  drawTool = null,
  drawStyle,
  onDraw,
  onDropFiles,
  onCancel,
  onDropImage,
  onRemoveVersion,
  onRun,
  onSelectionChange,
  onSendVersions,
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
  /**
   * Which items are selected, by index.
   *
   * A list rather than one index: several can be picked with a marquee or with
   * shift, and dragging any of them moves the whole set. One selection is just
   * a list of length one, which keeps every read the same shape.
   */
  const [selection, setSelection] = useState<number[]>([]);
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

  useEffect(() => {
    if (autoEditId) {
      setEditingId(autoEditId);
    }
  }, [autoEditId]);
  const gesture = useRef<Gesture>({ kind: "none" });

  // Reported from an effect rather than at each call site: selection is cleared
  // in half a dozen places — a background press, a delete, a drawing gesture —
  // and every one of them would otherwise have to remember to announce it.
  // The toolbar edits one thing, so it is told about a lone selection only —
  // with several picked there is no single item its controls could mean.
  const selectedItem =
    selection.length === 1 ? (items[selection[0] ?? -1] ?? null) : null;
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
      onMaskStroke(target.id, {
        points: toUnitSpace(points, {
          height: target.height,
          width: target.width,
          x: target.x,
          y: target.y,
        }),
        // Stored relative to the item's width so the mask scales with the
        // node, exactly as the points do.
        width: strokeWidth / target.width,
      });
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
      const [first] = points;
      const last = points.at(-1);
      if (!(first && last && onDraw)) {
        return;
      }

      if (isFreehand(drawTool)) {
        const box = boundsOf(points, drawStyle.strokeWidth);
        onDraw(
          {
            fill: null,
            points: toUnitSpace(points, box),
            stroke: drawStyle.stroke,
            strokeWidth: drawStyle.strokeWidth,
            tool: drawTool,
          },
          box
        );
        return;
      }

      // A shape is defined by where the drag began and ended, in either
      // direction — dragging up and left is as natural as down and right.
      const box = {
        height: Math.abs(last.y - first.y),
        width: Math.abs(last.x - first.x),
        x: Math.min(first.x, last.x),
        y: Math.min(first.y, last.y),
      };
      if (box.width < MIN_ITEM_SIZE || box.height < MIN_ITEM_SIZE) {
        // A click rather than a drag. Nothing was asked for.
        return;
      }
      onDraw(
        {
          fill: drawStyle.fill,
          stroke: drawStyle.stroke,
          strokeWidth: drawStyle.strokeWidth,
          tool: drawTool,
        },
        box
      );
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
  // during render rather than in an effect: an insert can happen on the very
  // first interaction, before effects from a later render have run.
  viewCentreRef.current = viewCentre;

  /**
   * Pasting an image onto the board.
   *
   * The same act as dropping a file, and it goes down the same path — a
   * screenshot is the commonest way an image reaches a moodboard, and having to
   * save it to disk first only to drag it back in is a detour.
   *
   * Listens on the window rather than an element because paste is not delivered
   * to something merely hovered; it goes to whatever has focus, which on a board
   * you are just looking at is the document.
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
  const wiredPorts = new Set(
    wires.map((wire) => `${wire.targetItemId}:${wire.targetPort}`)
  );

  /**
   * What a node that composes text will send, so it can be read before it runs.
   *
   * A Combine node answers with one string; an Iterate node answers with one
   * per value, numbered, because seeing "3 prompts" and what they say is the
   * only way to know a batch is set up the way you meant.
   */
  const previewTextFor = (item: BoardItem): string | null => {
    if (item.nodeType === "join" || item.nodeType === "palette") {
      return outputTextOf(item, { items, wires });
    }
    if (item.nodeType !== "iterate") {
      return null;
    }
    const prompts = iteratedTextOf(item, { items, wires });
    if (prompts.length === 0) {
      return null;
    }
    return prompts.map((text, index) => `${index + 1}. ${text}`).join("\n");
  };

  /**
   * The words arriving on an item's prompt input, so the node can show them.
   *
   * Resolved here because only the canvas holds the wires; the node itself
   * knows nothing about what feeds it.
   */
  const wiredTextFor = (itemId: string): string | null => {
    // Every wire on the prompt port, kept apart: each contributes a part of
    // each run, and a wire carrying several values makes several runs. Mirrors
    // jobsFor, so what the node shows is what the node will send.
    const perWire = wires
      .filter((w) => w.targetItemId === itemId && w.targetPort === "prompt")
      .map((w) => items.find((i) => i.id === w.sourceItemId))
      .map((source) => outputListOf(source ?? null, { items, wires }))
      .map((list) => list.filter((text) => text.trim()))
      .filter((list) => list.length > 0);

    if (perWire.length === 0) {
      return null;
    }
    const rows = Math.max(...perWire.map((list) => list.length));
    const prompts = Array.from({ length: rows }, (_, row) =>
      perWire.map((list) => list[row % list.length] ?? "").join(", ")
    );
    return rows === 1
      ? (prompts[0] ?? null)
      : prompts.map((text, index) => `${index + 1}. ${text}`).join("\n");
  };

  /**
   * The picture feeding an item's image input, for the kinds that render one
   * themselves rather than being run on the server.
   *
   * A shader restyles its input live in the browser, so the URL has to reach
   * the component; nothing is written to the item, which keeps the wire the
   * single source of truth for what is being shown.
   */
  const wiredImageFor = (itemId: string): string | null => {
    const wire = wires.find(
      (candidate) =>
        candidate.targetItemId === itemId && candidate.targetPort === "image"
    );
    if (!wire) {
      return null;
    }
    const source = items.find((item) => item.id === wire.sourceItemId);
    return source ? outputImageOf(source, items) : null;
  };

  /**
   * Removes an item and everything attached to it.
   *
   * One action, not two: a board must never be left holding a wire that points
   * at nothing. The schema cascades on the server for the same reason.
   */
  const removeItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) {
        return;
      }
      onChange(items.filter((_, i) => i !== index));
      onWiresChange?.(
        wires.filter(
          (wire) =>
            wire.sourceItemId !== item.id && wire.targetItemId !== item.id
        )
      );
    },
    [items, onChange, onWiresChange, wires]
  );

  // Frames the arrangement the first time the board has one. A published board
  // arrives from the API well after the canvas has been laid out, so nothing
  // else tells the viewport that there is finally something to look at.
  //
  // Pulled out of `view`, whose identity changes every render; `frameContent`
  // itself is stable, so this runs only when the items change, and it declines
  // to do anything once the board has been framed or taken hold of.
  const { frameContent } = view;
  useEffect(() => {
    // An empty board has nothing to frame, and the viewport already centres the
    // bare canvas on its own.
    if (items.length > 0) {
      frameContent();
    }
  }, [items, frameContent]);

  /** Indices of the items a frame carries. Membership comes from graph.ts. */
  const containedIndices = useCallback(
    (frame: BoardItem): number[] => {
      const inside = new Set(containedBy(frame, items).map((item) => item.id));
      return items.reduce<number[]>((acc, item, index) => {
        if (inside.has(item.id)) {
          acc.push(index);
        }
        return acc;
      }, []);
    },
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
      const chosen = selection
        .map((index) => items[index])
        .filter((item): item is BoardItem => Boolean(item));
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
  const finishMarquee = useCallback(
    (box: { from: Point; to: Point }, add: boolean) => {
      setMarquee(null);
      const left = Math.min(box.from.x, box.to.x);
      const right = Math.max(box.from.x, box.to.x);
      const top = Math.min(box.from.y, box.to.y);
      const bottom = Math.max(box.from.y, box.to.y);
      // A click rather than a sweep: too small to have meant a selection, so it
      // clears rather than picking whatever happened to be under the pointer.
      if (right - left < 4 && bottom - top < 4) {
        return;
      }
      // Touched, not enclosed. Requiring an item to be wholly inside means
      // sweeping around a large photograph rather than across it, which on a
      // zoomed-in board can be impossible without scrolling.
      const hit = items
        .map((item, index) => ({ index, item }))
        .filter(
          ({ item }) =>
            item.x < right &&
            item.x + item.width > left &&
            item.y < bottom &&
            item.y + item.height > top
        )
        .map(({ index }) => index);
      setSelection((current) =>
        add ? [...new Set([...current, ...hit])] : hit
      );
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
        setSelection((current) =>
          current.includes(index)
            ? current.filter((i) => i !== index)
            : [...current, index]
        );
        gesture.current = { kind: "none" };
        return;
      }
      // Pressing something already selected drags the whole selection; pressing
      // something outside it selects that one instead, which is what every
      // canvas does and what stops a stray click scattering a careful set.
      const inSelection = selection.includes(index);
      const moving = inSelection ? selection : [index];
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
        startX: p.x,
        startY: p.y,
      };
      if (!inSelection) {
        setSelection([index]);
      }
      // Raise on grab: the thing you are touching should be the thing on top.
      // Except a frame, which is a backdrop — raising it would bury everything
      // it contains the moment it was nudged.
      if (!isFrame) {
        onChange(
          items.map((it, i) => (i === index ? { ...it, z: topZ + 1 } : it))
        );
      }
    },
    [containedIndices, items, onChange, selection, topZ, view]
  );

  const beginResize = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const item = items[index];
      if (!item) {
        return;
      }
      view.markUserMoved();
      const p = view.toCanvas(clientX, clientY);
      gesture.current = {
        index,
        kind: "resize",
        originH: item.height,
        originW: item.width,
        startX: p.x,
        startY: p.y,
      };
      setSelection([index]);
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

      onChange(
        items.map((it, i) =>
          i === g.index
            ? {
                ...it,
                height: Math.max(MIN_ITEM_SIZE, g.originH + dy),
                width: Math.max(MIN_ITEM_SIZE, g.originW + dx),
              }
            : it
        )
      );
    },
    [items, onChange, view, wiring]
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
   * On the scaled layer it zoomed with everything else: dots turned into
   * boulders zoomed in and vanished zoomed out. Here the spacing is in screen
   * pixels, so it is identical at every zoom level. It still slides with the
   * pan, which is what keeps the movement legible — background-position moves
   * the pattern without resizing it.
   */
  const dotGridStyle = {
    backgroundColor: "var(--dot-color)",
    backgroundImage:
      "linear-gradient(90deg, var(--dot-bg) calc(var(--dot-space) - var(--dot-size)), transparent 1%), linear-gradient(var(--dot-bg) calc(var(--dot-space) - var(--dot-size)), transparent 1%)",
    backgroundPosition: `${view.viewport.tx}px ${view.viewport.ty}px`,
    backgroundSize: "var(--dot-space) var(--dot-space)",
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-neutral-950">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={dotGridStyle}
      />
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the pan/zoom surface is scenery, not a control — keyboard users reach the items themselves, which are focusable */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: same — this element exists to receive pointer gestures and file drops aimed at the board as a whole */}
      <div
        className={`h-full w-full touch-none ${
          isDrawing
            ? "cursor-crosshair"
            : (view.isPanning && "cursor-grabbing") || "cursor-grab"
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
            setSelection([]);
            setEditingId(null);
            setStroke([view.toCanvas(e.clientX, e.clientY)]);
            return;
          }
          // Landing on the background pans, as it always has. Sweeping out a
          // selection is behind shift: dragging the board is the gesture
          // reached for constantly, and selecting several is occasional, so
          // the plain drag belongs to the common one.
          if (e.target === e.currentTarget || gesture.current.kind === "none") {
            setEditingId(null);
            if (!(e.shiftKey || e.altKey)) {
              setSelection([]);
              view.onPointerDown(e);
              return;
            }
            e.currentTarget.setPointerCapture(e.pointerId);
            // Alt sweeps a fresh selection; shift keeps what is already picked,
            // matching what shift does on a single item.
            if (!e.shiftKey) {
              setSelection([]);
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
          className="relative origin-top-left outline outline-white/5"
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
              hasWiredPrompt={wiredPorts.has(`${item.id}:prompt`)}
              imageUrl={wiredImageFor(item.id)}
              index={index}
              isEditing={!readOnly && editingId === item.id}
              isSelected={!readOnly && selection.includes(index)}
              item={item}
              key={keyOf(item)}
              onBeginEdit={() => {
                if (!readOnly) {
                  setEditingId(item.id);
                }
              }}
              onCancel={onCancel}
              onConfigChange={(config) => onConfigChange?.(item.id, config)}
              onDelete={() => removeItem(index)}
              onEditBody={(body) =>
                onChange(
                  items.map((it, i) => (i === index ? { ...it, body } : it))
                )
              }
              onFontSize={(fontSize) =>
                onChange(
                  items.map((it, i) => (i === index ? { ...it, fontSize } : it))
                )
              }
              onRemoveVersion={
                onRemoveVersion
                  ? (version) => onRemoveVersion(item.id, version)
                  : undefined
              }
              onResizeStart={readOnly ? () => undefined : beginResize}
              onRun={(force) => onRun?.(item.id, force)}
              onSelect={readOnly ? () => undefined : beginMove}
              onSendVersions={
                onSendVersions ? () => onSendVersions(item.id) : undefined
              }
              outputText={previewTextFor(item)}
              ports={
                readOnly
                  ? undefined
                  : {
                      canDropOn: wiring.canDropOn,
                      isDragging: wiring.isDragging,
                      onPortDown: (itemId, portKey, screen) => {
                        const point = outputPointFor(item, portKey);
                        if (point) {
                          view.markUserMoved();
                          wiring.begin(itemId, portKey, point, screen);
                        }
                      },
                      onPortEnter: wiring.enterPort,
                      onPortLeave: wiring.leavePort,
                    }
              }
              readOnly={readOnly}
              scale={view.viewport.scale}
              wiredPrompt={wiredTextFor(item.id)}
            />
          ))}
        </div>
      </div>
      <CanvasMenu
        items={items}
        menu={menu}
        onCopyFrame={(frame, title) => {
          onCopyFrame?.(frame, title);
          setMenu(null);
        }}
        onDismiss={() => setMenu(null)}
        onGroup={(chosen) => {
          onGroupIntoFrame?.(chosen);
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
      <div className="pointer-events-none absolute right-4 bottom-4 flex items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-white/10 bg-black/80 p-1 backdrop-blur">
          <button
            aria-label="Zoom out"
            className="min-h-9 min-w-9 text-white/70 text-xs uppercase tracking-widest hover:text-white"
            onClick={() => view.zoomBy(1 / 1.25)}
            type="button"
          >
            −
          </button>
          <span className="w-12 text-center text-[10px] text-white/50 tabular-nums">
            {Math.round(view.viewport.scale * 100)}%
          </span>
          <button
            aria-label="Zoom in"
            className="min-h-9 min-w-9 text-white/70 text-xs uppercase tracking-widest hover:text-white"
            onClick={() => view.zoomBy(1.25)}
            type="button"
          >
            +
          </button>
          <button
            className="min-h-9 px-2 text-[10px] text-white/70 uppercase tracking-widest hover:text-white"
            onClick={view.fit}
            type="button"
          >
            Fit
          </button>
        </div>
      </div>
    </div>
  );
}
