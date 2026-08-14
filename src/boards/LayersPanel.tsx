import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  DragDropIcon,
  FrameIcon,
  Image01Icon,
  Layers01Icon,
  MagicWand01Icon,
  PenTool01Icon,
  SparklesIcon,
  TextIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { useRef, useState } from "react";
import { nodeTypeFor } from "../../config/nodeTypes.js";
import type { BoardItem } from "../types";
import { outputImageOf } from "./itemOutput";

/**
 * The board's stack, as a list you can reorder.
 *
 * The canvas has no front-to-back control beyond "raise on grab" — whatever
 * you touch comes to the top, and anything you have not touched lately sits
 * wherever it happened to land. This panel makes the order explicit: every
 * item is a row, topmost first, and dragging a row moves it up or down the
 * stack.
 *
 * Frames are listed but not draggable: a frame is pinned behind everything by
 * design (it is a backdrop), so there is no meaningful position for it to move
 * to. They sit at the bottom of the list, which is where they always render.
 */

interface LayersPanelProps {
  items: BoardItem[];
  /** Applies a new order (and new z values) to every item. */
  onChange: (items: BoardItem[]) => void;
  onClose: () => void;
  /** Selects an item on the canvas, so a row click is not a dead end. */
  onSelect: (item: BoardItem) => void;
  /** The lone selected item's id, or null. */
  selectedId: string | null;
}

const isFrame = (item: BoardItem): boolean => item.kind === "frame";

/** What an item is called in the list. */
const labelOf = (item: BoardItem): string => {
  if (item.kind === "op") {
    return nodeTypeFor(item.nodeType)?.label ?? "Node";
  }
  if (item.kind === "photo" || item.kind === "reference") {
    return "Image";
  }
  if (item.kind === "note") {
    return "Note";
  }
  if (item.kind === "text") {
    return "Text";
  }
  if (item.kind === "frame") {
    return "Frame";
  }
  if (item.kind === "drawing") {
    return "Drawing";
  }
  if (item.kind === "shader") {
    return "Shader";
  }
  return "Item";
};

/** The picture a row can show, or null when the item has none to show. */
const thumbnailOf = (item: BoardItem, items: BoardItem[]): string | null =>
  item.kind === "op" ? outputImageOf(item, items) : (item.imageUrl ?? null);

/** The icon a row falls back to when the item has no picture. */
const kindIcon = (item: BoardItem) => {
  if (item.kind === "frame") {
    return FrameIcon;
  }
  if (item.kind === "photo" || item.kind === "reference") {
    return Image01Icon;
  }
  if (item.kind === "note" || item.kind === "text") {
    return TextIcon;
  }
  if (item.kind === "drawing") {
    return PenTool01Icon;
  }
  if (item.kind === "shader") {
    return MagicWand01Icon;
  }
  return SparklesIcon;
};

export function LayersPanel({
  items,
  onChange,
  onClose,
  onSelect,
  selectedId,
}: LayersPanelProps) {
  // Topmost first, frames always at the bottom.
  const ordered = [...items]
    .sort((a, b) => {
      if (isFrame(a) !== isFrame(b)) {
        // A frame is a backdrop; it sits under everything, whatever its z says.
        return isFrame(a) ? 1 : -1;
      }
      return b.z - a.z;
    })
    .map((item, index) => ({ index, item }));

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const lastOver = useRef<number | null>(null);

  const move = (from: number, to: number) => {
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    // Topmost first, so the first row is the highest z. Sequential after any
    // reorder keeps the stack legible instead of accumulating ever-bigger gaps.
    onChange(next.map(({ item }, i) => ({ ...item, z: next.length - 1 - i })));
  };

  const resetDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
    lastOver.current = null;
  };

  return (
    <div className="pointer-events-auto absolute right-4 bottom-16 flex w-60 flex-col overflow-hidden rounded-lg border border-board-ink/15 bg-board-panel/95 shadow-xl backdrop-blur">
      <header className="flex shrink-0 items-center justify-between gap-2 border-board-ink/10 border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-[10px] text-board-ink/70 uppercase tracking-[0.18em]">
          <HugeiconsIcon aria-hidden icon={Layers01Icon} size={13} />
          Layers
        </span>
        <button
          aria-label="Close layers"
          className="grid size-6 place-items-center rounded text-board-ink/50 hover:bg-board-ink/10 hover:text-board-ink"
          onClick={onClose}
          type="button"
        >
          <HugeiconsIcon aria-hidden icon={Cancel01Icon} size={13} />
        </button>
      </header>

      <ul className="max-h-80 overflow-y-auto p-1.5">
        {ordered.map(({ item, index }) => {
          const frame = isFrame(item);
          const thumb = thumbnailOf(item, items);
          const active = dragIndex === index;
          const over = overIndex === index;
          return (
            <li key={item.id}>
              <button
                className={`group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                  item.id === selectedId
                    ? "bg-board-ink/10 text-board-ink"
                    : "text-board-ink/80 hover:bg-board-ink/5 hover:text-board-ink"
                } ${over && !frame ? "ring-1 ring-sky-300" : ""} ${
                  active ? "opacity-50" : ""
                }`}
                draggable={!frame}
                onClick={() => onSelect(item)}
                onDragEnd={resetDrag}
                onDragOver={(e) => {
                  if (frame) {
                    return;
                  }
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (lastOver.current !== index) {
                    lastOver.current = index;
                    setOverIndex(index);
                  }
                }}
                onDragStart={(e) => {
                  if (frame) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.effectAllowed = "move";
                  setDragIndex(index);
                }}
                onDrop={(e) => {
                  if (frame || dragIndex === null) {
                    return;
                  }
                  e.preventDefault();
                  move(dragIndex, index);
                  resetDrag();
                }}
                type="button"
              >
                <HugeiconsIcon
                  aria-hidden
                  className={
                    frame
                      ? "text-board-ink/25"
                      : "cursor-grab text-board-ink/35"
                  }
                  icon={DragDropIcon}
                  size={13}
                />
                {thumb ? (
                  <img
                    alt=""
                    className="size-8 shrink-0 rounded border border-board-ink/10 object-cover"
                    height={32}
                    loading="lazy"
                    src={thumb}
                    width={32}
                  />
                ) : (
                  <span className="grid size-8 shrink-0 place-items-center rounded border border-board-ink/10 bg-board-surface/40 text-board-ink/50">
                    <HugeiconsIcon
                      aria-hidden
                      icon={kindIcon(item)}
                      size={15}
                    />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-[12px]">
                  {labelOf(item)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
