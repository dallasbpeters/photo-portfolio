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
import { outputImageOf } from "./itemOutput";
import { PortMenu, type PortTarget } from "./PortMenu";
import { outputPointFor } from "./portGeometry";
import { useCanvasViewport } from "./useCanvasViewport";
import { useWireGesture } from "./useWireGesture";
import { WireLayer } from "./WireLayer";

const NO_WIRES: BoardWire[] = [];

interface BoardCanvasProps {
  /** Item to open for typing as soon as it appears — a just-placed note. */
  autoEditId?: string | null;
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
   * Image files dragged onto the board, with the canvas point they landed on.
   *
   * The canvas is the only place that can turn a screen coordinate into a board
   * one, so it reports where; the editor uploads and mints the items.
   */
  onDropFiles?: (files: File[], point: { x: number; y: number }) => void;
  /** Runs one node. `force` ignores a stored result that is still current. */
  onRun?: (itemId: string, force: boolean) => void;
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
  onDropFiles,
  onRun,
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
        className={`h-full w-full touch-none ${view.isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        onDragOver={
          onDropFiles
            ? (e) => {
                // Without this the browser treats the drop as navigation and
                // replaces the board with the image.
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }
            : undefined
        }
        onDrop={
          onDropFiles
            ? (e) => {
                const files = [...e.dataTransfer.files].filter((file) =>
                  file.type.startsWith("image/")
                );
                if (files.length === 0) {
                  return;
                }
                e.preventDefault();
                // Dropped where it was let go of, not where a counter says.
                onDropFiles(files, view.toCanvas(e.clientX, e.clientY));
              }
            : undefined
        }
        onPointerCancel={endGesture}
        onPointerDown={(e) => {
          // A press that began on a port is already a wire drag; the surface
          // must not also start panning underneath it.
          if (wiring.isDragging) {
            return;
          }
          // Landing on the background clears the selection and starts a pan.
          if (e.target === e.currentTarget || gesture.current.kind === "none") {
            setSelected(null);
            setEditingId(null);
            view.onPointerDown(e);
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
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
              onResizeStart={readOnly ? () => undefined : beginResize}
              onRun={(force) => onRun?.(item.id, force)}
              onSelect={readOnly ? () => undefined : beginMove}
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
