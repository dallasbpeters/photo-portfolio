import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  MinusSignIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { type RefObject, useEffect, useRef } from "react";
import {
  DEFAULT_NOTE_FONT_SIZE,
  DEFAULT_TEXT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
} from "../../config/canvas.js";
import type { BoardItem } from "../types";

/** One press changes the size by this much, in canvas units. */
const FONT_STEP = 4;

interface BoardItemViewProps {
  index: number;
  /** True while this item's text is being typed into. */
  isEditing: boolean;
  isSelected: boolean;
  item: BoardItem;
  /** Enters text editing — a second click, or a double click. */
  onBeginEdit: () => void;
  onDelete: () => void;
  onEditBody: (body: string) => void;
  onFontSize: (fontSize: number) => void;
  onResizeStart: (index: number, clientX: number, clientY: number) => void;
  onSelect: (index: number, clientX: number, clientY: number) => void;
  /** Viewing a published board: no controls at all, not merely disabled ones. */
  readOnly?: boolean;
  /** Current zoom, so chrome can cancel it out and stay a constant size. */
  scale: number;
}

/**
 * Keeps the caret in the item's field whenever editing begins.
 *
 * Entering edit mode has to move focus as well as unlock the field; without
 * this, double-clicking a note made it editable but keystrokes went nowhere.
 */
function useEditingCaret(
  isEditing: boolean
): RefObject<HTMLTextAreaElement | null> {
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);

  // Deferred by a frame on purpose. Double-click is how you enter editing, and
  // the browser follows it by selecting the word under the pointer — so placing
  // the caret synchronously loses to that, and the first keystroke replaces a
  // word instead of appending. Running after the native selection wins.
  useEffect(() => {
    if (!isEditing) {
      return;
    }
    // Focus at once, so a keystroke arriving before the next frame still
    // reaches the field rather than the document.
    fieldRef.current?.focus();

    const frame = requestAnimationFrame(() => {
      const field = fieldRef.current;
      field?.focus();
      const caret = field?.value.length ?? 0;
      field?.setSelectionRange(caret, caret);
    });
    return () => cancelAnimationFrame(frame);
  }, [isEditing]);

  return fieldRef;
}

interface BoardItemBodyProps {
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  fontSize: number;
  isEditing: boolean;
  item: BoardItem;
  onEditBody: (body: string) => void;
}

/**
 * What the item actually shows: an editable field for a note or text, and
 * otherwise the image with its credit.
 *
 * Images are deliberately not <OptimizedImage>: an item is resized freely on
 * the canvas, so there is no stable render width to request, and re-requesting
 * a new size mid-drag would flicker. The board is an admin surface, so the cost
 * is paid by one person rather than every visitor.
 */
function BoardItemBody({
  fieldRef,
  fontSize,
  isEditing,
  item,
  onEditBody,
}: BoardItemBodyProps) {
  const isNote = item.kind === "note";

  if (isNote || item.kind === "text") {
    return (
      <textarea
        className={
          isNote
            ? "h-full w-full resize-none bg-amber-100/95 p-3 text-neutral-900 outline-none"
            : // Plain text: no card, no background — just words on the board.
              "h-full w-full resize-none border-0 bg-transparent p-1 font-light text-white outline-none placeholder:text-white/30"
        }
        onChange={(e) => onEditBody(e.target.value)}
        placeholder={isNote ? "Note…" : "Type…"}
        // A note is covered edge to edge by its field, so while it is not
        // being edited the field must let pointers through — otherwise there
        // is nowhere on the item to grab, and it can never be dragged,
        // selected, or resized.
        readOnly={!isEditing}
        ref={fieldRef}
        style={{
          fontSize,
          // Follows the text rather than the browser default, which would
          // leave lines overlapping at large sizes.
          lineHeight: 1.25,
          pointerEvents: isEditing ? "auto" : "none",
        }}
        value={item.body ?? ""}
      />
    );
  }

  // A photograph is cropped to fill its frame, which is what you want when the
  // frame is the composition. A generated icon is a shape on a transparent
  // ground, and cropping one just cuts the glyph in half — so icons are fitted
  // inside the frame instead.
  //
  // Keyed on where the file is stored rather than on the extension: an icon
  // comes back as a PNG whenever the vectoriser is unavailable, and it needs
  // fitting just as much as the SVG would have.
  const isIcon = item.imageUrl?.includes("/boards/icons/") ?? false;

  return (
    <figure className="h-full w-full">
      <img
        alt=""
        className={`h-full w-full ${isIcon ? "object-contain" : "object-cover"}`}
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
  );
}

/** One item on the board. */
export function BoardItemView({
  index,
  isEditing,
  isSelected,
  onBeginEdit,
  item,
  onDelete,
  onEditBody,
  onFontSize,
  onResizeStart,
  onSelect,
  readOnly = false,
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

  const fontSize =
    item.fontSize ?? (isNote ? DEFAULT_NOTE_FONT_SIZE : DEFAULT_TEXT_FONT_SIZE);

  const stepFont = (delta: number) =>
    onFontSize(
      Math.min(Math.max(fontSize + delta, MIN_FONT_SIZE), MAX_FONT_SIZE)
    );

  const fieldRef = useEditingCaret(isEditing);

  return (
    <div
      className={`group absolute ${isText ? "" : "select-none"} ${
        isSelected ? "ring-2 ring-white/80" : "ring-1 ring-white/10"
      } ${isText && !isSelected ? "ring-0" : ""}`}
      onPointerDown={(e) => {
        // While editing, the press belongs to the field — placing a caret or
        // selecting text must not start a drag, and must not reach the
        // background handler, which would clear the selection and pan.
        if (isEditing) {
          e.stopPropagation();
          return;
        }
        onSelect(index, e.clientX, e.clientY);
        // Already selected, so this is the second press: start typing.
        if (isWritable && isSelected) {
          onBeginEdit();
        }
      }}
      style={{
        height: item.height,
        left: item.x,
        top: item.y,
        width: item.width,
        zIndex: item.z,
      }}
    >
      <BoardItemBody
        fieldRef={fieldRef}
        fontSize={fontSize}
        isEditing={isEditing}
        item={item}
        onEditBody={onEditBody}
      />

      {/* Revealed on hover, and kept visible while selected so it does not
          vanish mid-interaction on a touch screen, which has no hover. Absent
          entirely when viewing: the API refuses the call anyway, but offering a
          control that cannot work is its own bug. */}
      {readOnly ? null : (
        <button
          aria-label="Remove from board"
          className={`absolute top-0 left-full flex size-8 origin-top-left items-center justify-center rounded-full border border-white/20 bg-black text-white/80 transition-opacity hover:text-white focus-visible:opacity-100 group-hover:opacity-100 ${
            isSelected ? "opacity-100" : "opacity-0"
          }`}
          onClick={onDelete}
          onPointerDown={(e) => e.stopPropagation()}
          style={chromeScale}
          type="button"
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} />
        </button>
      )}

      {isSelected && isWritable && !readOnly ? (
        <div
          className="absolute bottom-full left-0 flex origin-bottom-left items-center gap-1 rounded-full border border-white/20 bg-black/90 p-1"
          style={chromeScale}
        >
          <button
            aria-label="Smaller text"
            className="flex size-7 items-center justify-center text-white/70 hover:text-white"
            onClick={() => stepFont(-FONT_STEP)}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <HugeiconsIcon icon={MinusSignIcon} size={13} />
          </button>
          <span className="min-w-6 text-center text-[10px] text-white/50 tabular-nums">
            {Math.round(fontSize)}
          </span>
          <button
            aria-label="Larger text"
            className="flex size-7 items-center justify-center text-white/70 hover:text-white"
            onClick={() => stepFont(FONT_STEP)}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <HugeiconsIcon icon={Add01Icon} size={13} />
          </button>
        </div>
      ) : null}

      {isSelected && !readOnly ? (
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
