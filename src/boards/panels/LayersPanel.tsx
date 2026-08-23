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
import { nodeTypeFor } from "../../../config/nodeTypes.js";
import type { BoardItem } from "../../types";
import { outputImageOf } from "../itemOutput";
import "../boardChrome.css";
import "./LayersPanel.css";

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
  // Where the dragged row would land, as an insertion position (0..length).
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const lastOver = useRef<number | null>(null);

  // The first frame's position: frames are pinned at the bottom, so dropping
  // anywhere on them means "the very bottom of the stack", not "between frames".
  const firstFrameIndex = ordered.findIndex(({ item }) => isFrame(item));

  const move = (from: number, to: number) => {
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    // Positions past the removed row shift by one; inserting at `to` after the
    // splice would otherwise land one place lower than the drop pointed at.
    const at = to > from ? to - 1 : to;
    next.splice(at, 0, moved);
    // Topmost first, so the first row is the highest z. Sequential after any
    // reorder keeps the stack legible instead of accumulating ever-bigger gaps.
    onChange(next.map(({ item }, i) => ({ ...item, z: next.length - 1 - i })));
  };

  const resetDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
    lastOver.current = null;
  };

  /** Where dropping on a row inserts, from the pointer's half of that row. */
  const positionFor = (
    e: React.DragEvent<HTMLButtonElement>,
    index: number,
    frame: boolean
  ): number => {
    if (frame) {
      return firstFrameIndex === -1 ? ordered.length : firstFrameIndex;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? index : index + 1;
  };

  return (
    <div className="panel-surface panel-docked layers-panel">
      <header className="panel-header">
        <span className="panel-header__title">
          <HugeiconsIcon aria-hidden icon={Layers01Icon} size={13} />
          Layers
        </span>
        <button
          aria-label="Close layers"
          className="panel-icon-button"
          onClick={onClose}
          type="button"
        >
          <HugeiconsIcon aria-hidden icon={Cancel01Icon} size={13} />
        </button>
      </header>

      <ul className="layers-panel__list">
        {ordered.map(({ item, index }) => {
          const frame = isFrame(item);
          const thumb = thumbnailOf(item, items);
          const active = dragIndex === index;
          // Inserted before this row, or just after it — both show here.
          const over = overIndex === index || overIndex === index + 1;
          return (
            <li key={item.id}>
              <button
                className={`layers-panel__row ${
                  item.id === selectedId ? "layers-panel__row--selected" : ""
                } ${over ? "layers-panel__row--over" : ""} ${
                  active ? "layers-panel__row--dragging" : ""
                }`}
                draggable={!frame}
                onClick={() => onSelect(item)}
                onDragEnd={resetDrag}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const position = positionFor(e, index, frame);
                  if (lastOver.current !== position) {
                    lastOver.current = position;
                    setOverIndex(position);
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
                  if (dragIndex === null) {
                    return;
                  }
                  e.preventDefault();
                  move(dragIndex, positionFor(e, index, frame));
                  resetDrag();
                }}
                type="button"
              >
                <HugeiconsIcon
                  aria-hidden
                  className={
                    frame
                      ? "layers-panel__grip layers-panel__grip--fixed"
                      : "layers-panel__grip"
                  }
                  icon={DragDropIcon}
                  size={13}
                />
                {thumb ? (
                  <img
                    alt=""
                    className="layers-panel__thumb"
                    height={32}
                    loading="lazy"
                    src={thumb}
                    width={32}
                  />
                ) : (
                  <span className="layers-panel__thumb layers-panel__thumb--glyph">
                    <HugeiconsIcon
                      aria-hidden
                      icon={kindIcon(item)}
                      size={15}
                    />
                  </span>
                )}
                <span className="layers-panel__name">{labelOf(item)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
