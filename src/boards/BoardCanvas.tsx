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
import {
  boundsOf,
  CORNER_RADIUS,
  type DrawingConfig,
  type DrawTool,
  isFreehand,
  isTransparent,
  type Point,
  pathFor,
  toUnitSpace,
} from "./drawing";
import {
  BOARD_IMAGE_TYPE,
  iteratedTextOf,
  outputImageOf,
  outputTextOf,
} from "./itemOutput";
import { PortMenu, type PortTarget } from "./PortMenu";
import { outputPointFor } from "./portGeometry";
import { useCanvasViewport } from "./useCanvasViewport";
import { useWireGesture } from "./useWireGesture";
import { WireLayer } from "./WireLayer";

const NO_WIRES: BoardWire[] = [];

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
  onChange: (items: BoardItem[]) => void;
  /** Settings edited on an operation node. */
  onConfigChange?: (itemId: string, config: Record<string, unknown>) => void;
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
  onCreateFromPort,
  drawTool = null,
  drawStyle,
  onDraw,
  onDropFiles,
  onDropImage,
  onRemoveVersion,
  onRun,
  onSelectionChange,
  onSendVersions,
  onWiresChange,
  keyOf,
  autoEditId,
  readOnly = false,
  wires = NO_WIRES,
}: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The viewport frames itself on the items, and keeps doing so as the
  // container settles, until the board is panned, zoomed or rearranged.
  const view = useCanvasViewport(containerRef, () => contentBounds(items));
  const [selected, setSelected] = useState<number | null>(null);
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

  useEffect(() => {
    if (autoEditId) {
      setEditingId(autoEditId);
    }
  }, [autoEditId]);
  const gesture = useRef<Gesture>({ kind: "none" });

  // Reported from an effect rather than at each call site: selection is cleared
  // in half a dozen places — a background press, a delete, a drawing gesture —
  // and every one of them would otherwise have to remember to announce it.
  const selectedItem = selected === null ? null : (items[selected] ?? null);
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

  const isDrawing = drawTool !== null && !readOnly && Boolean(onDraw);

  /** Ends the mark, handing the editor a config and the box it occupies. */
  const finishStroke = useCallback(
    (points: Point[]) => {
      setStroke(null);
      if (!(drawTool && onDraw && drawStyle) || points.length === 0) {
        return;
      }
      const [first] = points;
      const last = points.at(-1);
      if (!(first && last)) {
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
    [drawStyle, drawTool, onDraw]
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
        file.type.startsWith("image/")
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
    if (item.nodeType === "join") {
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
    const wire = wires.find(
      (candidate) =>
        candidate.targetItemId === itemId && candidate.targetPort === "prompt"
    );
    if (!wire) {
      return null;
    }
    const source = items.find((item) => item.id === wire.sourceItemId);
    return source ? outputTextOf(source, { items, wires }) : null;
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
    return source ? outputImageOf(source) : null;
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

  const beginMove = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const item = items[index];
      if (!item) {
        return;
      }
      // Rearranging the board counts as taking hold of it: the view must stay
      // put from here on, rather than re-framing on the next container resize.
      view.markUserMoved();
      const p = view.toCanvas(clientX, clientY);
      const isFrame = item.kind === "frame";
      gesture.current = {
        // A frame takes whatever is sitting on it; everything else moves alone.
        carried: isFrame
          ? containedIndices(item).map((i) => ({
              index: i,
              originX: items[i]?.x ?? 0,
              originY: items[i]?.y ?? 0,
            }))
          : [],
        index,
        kind: "move",
        originX: item.x,
        originY: item.y,
        startX: p.x,
        startY: p.y,
      };
      setSelected(index);
      // Raise on grab: the thing you are touching should be the thing on top.
      // Except a frame, which is a backdrop — raising it would bury everything
      // it contains the moment it was nudged.
      if (!isFrame) {
        onChange(
          items.map((it, i) => (i === index ? { ...it, z: topZ + 1 } : it))
        );
      }
    },
    [containedIndices, items, onChange, topZ, view]
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
      setSelected(index);
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
                  file.type.startsWith("image/")
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
            setSelected(null);
            setEditingId(null);
            setStroke([view.toCanvas(e.clientX, e.clientY)]);
            return;
          }
          // Landing on the background clears the selection and starts a pan.
          if (e.target === e.currentTarget || gesture.current.kind === "none") {
            setSelected(null);
            setEditingId(null);
            view.onPointerDown(e);
          }
        }}
        onPointerMove={(e) => {
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
              once it becomes an item — no jump on release. */}
          {stroke && drawTool && drawStyle ? (
            <svg
              className="pointer-events-none absolute inset-0 overflow-visible"
              height={CANVAS_HEIGHT}
              width={CANVAS_WIDTH}
            >
              <title>Drawing in progress</title>
              {isFreehand(drawTool) ? (
                <path
                  d={pathFor(stroke, drawTool === "brush")}
                  fill="none"
                  stroke={drawStyle.stroke}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={drawStyle.strokeWidth}
                />
              ) : (
                <PreviewShape
                  points={stroke}
                  style={drawStyle}
                  tool={drawTool}
                />
              )}
            </svg>
          ) : null}

          {items.map((item, index) => (
            <BoardItemView
              hasWiredPrompt={wiredPorts.has(`${item.id}:prompt`)}
              imageUrl={wiredImageFor(item.id)}
              index={index}
              isEditing={!readOnly && editingId === item.id}
              isSelected={!readOnly && selected === index}
              item={item}
              key={keyOf(item)}
              onBeginEdit={() => {
                if (!readOnly) {
                  setEditingId(item.id);
                }
              }}
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

/**
 * The outline of a shape while it is still being dragged out.
 *
 * Separate from DrawingView because that renders a finished item inside its own
 * box, whereas this lives in canvas space and has no box yet — the box is what
 * the drag is deciding.
 */
function PreviewShape({
  points,
  style,
  tool,
}: {
  points: Point[];
  style: { fill: string; stroke: string; strokeWidth: number };
  tool: DrawTool;
}) {
  const [first] = points;
  const last = points.at(-1);
  if (!(first && last)) {
    return null;
  }
  const x = Math.min(first.x, last.x);
  const y = Math.min(first.y, last.y);
  const width = Math.abs(last.x - first.x);
  const height = Math.abs(last.y - first.y);
  const fill = isTransparent(style.fill) ? "none" : style.fill;

  if (tool === "ellipse") {
    return (
      <ellipse
        cx={x + width / 2}
        cy={y + height / 2}
        fill={fill}
        rx={width / 2}
        ry={height / 2}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
      />
    );
  }
  return (
    <rect
      fill={fill}
      height={height}
      rx={tool === "rounded" ? CORNER_RADIUS : 0}
      stroke={style.stroke}
      strokeWidth={style.strokeWidth}
      width={width}
      x={x}
      y={y}
    />
  );
}
