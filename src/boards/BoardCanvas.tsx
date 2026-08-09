import { useCallback, useEffect, useRef, useState } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MIN_ITEM_SIZE,
} from "../../config/canvas.js";
import type { BoardItem } from "../types";
import { type Guides, NO_GUIDES, snapToGuides } from "./alignmentGuides";
import { BoardItemView } from "./BoardItemView";
import { useCanvasViewport } from "./useCanvasViewport";

interface BoardCanvasProps {
  /** Item to open for typing as soon as it appears — a just-placed note. */
  autoEditId?: string | null;
  items: BoardItem[];
  /** Stable per-item React key. */
  keyOf: (item: BoardItem) => string;
  onChange: (items: BoardItem[]) => void;
}

/**
 * Snap distance, in screen pixels.
 *
 * Screen rather than canvas units so it feels the same at every zoom: the same
 * few pixels of pointer movement, whether the board is fit to the window or
 * magnified.
 */
const SNAP_PX = 6;

type Gesture =
  | { kind: "none" }
  | {
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
  keyOf,
  autoEditId,
}: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const view = useCanvasViewport(containerRef);
  const [selected, setSelected] = useState<number | null>(null);
  // Selecting and editing are separate: one click picks an item up, typing
  // needs a second. Without that split a note could never be dragged.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);

  useEffect(() => {
    if (autoEditId) {
      setEditingId(autoEditId);
    }
  }, [autoEditId]);
  const gesture = useRef<Gesture>({ kind: "none" });

  const topZ = items.reduce((max, i) => Math.max(max, i.z), 0);

  const beginMove = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const item = items[index];
      if (!item) {
        return;
      }
      const p = view.toCanvas(clientX, clientY);
      gesture.current = {
        index,
        kind: "move",
        originX: item.x,
        originY: item.y,
        startX: p.x,
        startY: p.y,
      };
      setSelected(index);
      // Raise on grab: the thing you are touching should be the thing on top.
      onChange(
        items.map((it, i) => (i === index ? { ...it, z: topZ + 1 } : it))
      );
    },
    [items, onChange, topZ, view]
  );

  const beginResize = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const item = items[index];
      if (!item) {
        return;
      }
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
        onChange(
          items.map((it, i) =>
            i === g.index ? { ...it, x: snapped.x, y: snapped.y } : it
          )
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
    [items, onChange, view]
  );

  const endGesture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (gesture.current.kind === "none") {
        view.onPointerUp(e);
        return;
      }
      gesture.current = { kind: "none" };
      setGuides(NO_GUIDES);
    },
    [view]
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
      <div
        className={`h-full w-full touch-none ${view.isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerCancel={endGesture}
        onPointerDown={(e) => {
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
          className="relative origin-top-left shadow-[0_0_120px_rgba(0,0,0,0.6)] outline outline-white/5"
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

          {items.map((item, index) => (
            <BoardItemView
              index={index}
              isEditing={editingId === item.id}
              isSelected={selected === index}
              item={item}
              key={keyOf(item)}
              onBeginEdit={() => setEditingId(item.id)}
              onDelete={() => onChange(items.filter((_, i) => i !== index))}
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
              onResizeStart={beginResize}
              onSelect={beginMove}
              scale={view.viewport.scale}
            />
          ))}
        </div>
      </div>

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
