import { Trash } from "iconoir-react";
import type { BoardItem } from "../types";

interface BoardItemViewProps {
  index: number;
  isSelected: boolean;
  item: BoardItem;
  onDelete: () => void;
  onEditBody: (body: string) => void;
  onResizeStart: (index: number, clientX: number, clientY: number) => void;
  onSelect: (index: number, clientX: number, clientY: number) => void;
  /** Current zoom, so chrome can cancel it out and stay a constant size. */
  scale: number;
}

/**
 * One item on the board.
 *
 * Images are deliberately not <OptimizedImage>: an item is resized freely on
 * the canvas, so there is no stable render width to request, and re-requesting
 * a new size mid-drag would flicker. The board is an admin surface, so the cost
 * is paid by one person rather than every visitor.
 */
export function BoardItemView({
  index,
  isSelected,
  item,
  onDelete,
  onEditBody,
  onResizeStart,
  onSelect,
  scale,
}: BoardItemViewProps) {
  const isNote = item.kind === "note";
  const isText = item.kind === "text";
  const isWritable = isNote || isText;

  // Controls live inside the scaled canvas, so without this they would grow and
  // shrink with the zoom — unusably small when zoomed out to see the whole
  // board, absurd when zoomed in. Cancelling the scale keeps them thumb-sized
  // at every zoom level.
  const chromeScale = { transform: `scale(${1 / scale})` };

  return (
    <div
      className={`group absolute ${isText ? "" : "select-none"} ${
        isSelected ? "ring-2 ring-white/80" : "ring-1 ring-white/10"
      } ${isText && !isSelected ? "ring-0" : ""}`}
      onPointerDown={(e) => {
        // A textarea must keep the pointer so focus and caret placement work.
        // Stopping propagation matters as much as returning: otherwise the
        // canvas below captures the pointer and the field never focuses — which
        // is exactly what made notes impossible to type in.
        if ((e.target as HTMLElement).tagName === "TEXTAREA") {
          e.stopPropagation();
          return;
        }
        e.stopPropagation();
        onSelect(index, e.clientX, e.clientY);
      }}
      style={{
        height: item.height,
        left: item.x,
        top: item.y,
        width: item.width,
        zIndex: item.z,
      }}
    >
      {isWritable ? (
        <textarea
          className={
            isNote
              ? "h-full w-full resize-none bg-amber-100/95 p-3 text-[15px] text-neutral-900 leading-snug outline-none"
              : // Plain text: no card, no background — just words on the board.
                "h-full w-full resize-none border-0 bg-transparent p-1 font-light text-[22px] text-white leading-tight outline-none placeholder:text-white/30"
          }
          onChange={(e) => onEditBody(e.target.value)}
          placeholder={isNote ? "Note…" : "Type…"}
          value={item.body ?? ""}
        />
      ) : (
        <figure className="h-full w-full">
          <img
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
            height={item.height}
            src={item.imageUrl ?? ""}
            width={item.width}
          />
          {/* Unsplash's licence requires the photographer be credited wherever
              the image appears, so the credit renders with the item rather than
              living only in the database. */}
          {item.creditName ? (
            <figcaption className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-[10px] text-white/80">
              {item.creditName}
            </figcaption>
          ) : null}
        </figure>
      )}

      {/* Revealed on hover, and kept visible while selected so it does not
          vanish mid-interaction on a touch screen, which has no hover. */}
      <button
        aria-label="Remove from board"
        className={`absolute top-0 right-0 flex size-8 origin-top-right items-center justify-center rounded-full border border-white/20 bg-black text-white/80 transition-opacity hover:text-white focus-visible:opacity-100 group-hover:opacity-100 ${
          isSelected ? "opacity-100" : "opacity-0"
        }`}
        onClick={onDelete}
        onPointerDown={(e) => e.stopPropagation()}
        style={chromeScale}
        type="button"
      >
        <Trash height={14} width={14} />
      </button>

      {isSelected ? (
        <div
          className="absolute right-0 bottom-0 size-6 origin-bottom-right cursor-nwse-resize rounded-sm border border-white/40 bg-white/90"
          onPointerDown={(e) => {
            e.stopPropagation();
            onResizeStart(index, e.clientX, e.clientY);
          }}
          style={chromeScale}
        />
      ) : null}
    </div>
  );
}
