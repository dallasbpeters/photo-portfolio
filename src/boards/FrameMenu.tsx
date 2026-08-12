import { HugeiconsIcon } from "@hugeicons/react";
import { CopyIcon } from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useRef, useState } from "react";

interface FrameMenuProps {
  /** How many items would travel, the frame included. Shown so the size of
   *  what is about to be copied is visible before committing to it. */
  count: number;
  /** The name to start from — the frame's own, when it has one. */
  defaultTitle: string;
  onCopy: (title: string) => void;
  onDismiss: () => void;
  point: { x: number; y: number };
  /** Wires that would not survive the copy, having one end outside the frame. */
  severed: number;
}

/**
 * What a frame offers when it is right-clicked.
 *
 * One action so far, so the menu is the naming field rather than a list that
 * leads to one: copying a frame to a new board always needs a title, and asking
 * for it here is one gesture instead of a menu, then a dialog, then a rename.
 *
 * Positioned in screen pixels like PortMenu, and for the same reason — it is
 * chrome, so the zoom must not change its size or where it sits.
 */
export function FrameMenu({
  count,
  defaultTitle,
  onCopy,
  onDismiss,
  point,
  severed,
}: FrameMenuProps) {
  const [title, setTitle] = useState(defaultTitle);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Selected rather than merely focused: the default is a suggestion, and
    // typing over it should not mean clearing it first.
    field.current?.select();
  }, []);

  const submit = () => onCopy(title.trim() || defaultTitle);

  return (
    <>
      <button
        aria-label="Dismiss"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onDismiss}
        tabIndex={-1}
        type="button"
      />
      <div
        className="absolute z-50 w-60 overflow-hidden rounded-lg border border-white/15 bg-neutral-900/95 shadow-xl backdrop-blur"
        style={{ left: point.x + 10, top: point.y - 8 }}
      >
        <p className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 text-[9px] text-white/35 uppercase tracking-[0.18em]">
          <HugeiconsIcon aria-hidden icon={CopyIcon} size={12} />
          Copy to new board
        </p>

        <div className="px-3 pb-2.5">
          <input
            aria-label="New board name"
            className="w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-[12px] text-white outline-none focus:border-white/45"
            onChange={(e) => setTitle(e.target.value)}
            // Enter creates and Escape closes, both from the field, because
            // the field is where the focus already is — reaching for the mouse
            // to confirm a name you have just typed is a detour.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") {
                onDismiss();
              }
            }}
            ref={field}
            value={title}
          />

          <p className="mt-1.5 text-[10px] text-white/40 leading-relaxed">
            {count === 1 ? "The frame alone" : `${count} items`}, copied. This
            board keeps its own.
            {severed > 0 ? (
              // Said plainly rather than discovered later: a wire reaching out
              // of the frame has nothing to land on once the copy is on a board
              // of its own, and a graph quietly missing an input is a puzzle.
              <span className="block text-amber-300/70">
                {severed === 1
                  ? "1 wire leaves the frame and will not come across."
                  : `${severed} wires leave the frame and will not come across.`}
              </span>
            ) : null}
          </p>

          <div className="mt-2 flex justify-end gap-1.5">
            <button
              className="rounded px-2 py-1 text-[11px] text-white/50 hover:text-white"
              onClick={onDismiss}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded bg-white/15 px-2.5 py-1 text-[11px] text-white hover:bg-white/25"
              onClick={submit}
              type="button"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
