import { HugeiconsIcon } from "@hugeicons/react";
import { CopyIcon } from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useRef, useState } from "react";
import type { BoardItem, BoardWire } from "../types";
import { frameBoardTitle, frameSummary } from "./copyToBoard";

interface FrameMenuProps {
  items: BoardItem[];
  /** The frame and where it was clicked, or null when no menu is open. */
  menu: { item: BoardItem; point: { x: number; y: number } } | null;
  onCopy: (frame: BoardItem, title: string) => void;
  onDismiss: () => void;
  wires: BoardWire[];
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
  items,
  menu,
  onCopy,
  onDismiss,
  wires,
}: FrameMenuProps) {
  // Hooks first: this component owns its closed state rather than being
  // wrapped in a conditional at the call site, which keeps one more branch out
  // of the canvas — already the most tangled component here.
  const [typed, setTyped] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menu) {
      return;
    }
    // Keyed on the menu rather than on mount: this component is now always
    // mounted and merely renders nothing when closed, so a mount-only effect
    // would fire once at startup and never again when a menu actually opened.
    //
    // The typed name is cleared at the same moment, so opening a second frame's
    // menu suggests that frame's name instead of keeping the first one's.
    setTyped(null);
    // Selected rather than merely focused: the default is a suggestion, and
    // typing over it should not mean clearing it first.
    field.current?.select();
  }, [menu]);

  if (!menu) {
    return null;
  }

  const { item: frame, point } = menu;
  const defaultTitle = frameBoardTitle(frame);
  const { count, severed } = frameSummary(frame, items, wires);
  // Null until something is typed, so the suggested name tracks the frame the
  // menu was opened on rather than sticking at whichever one came first.
  const title = typed ?? defaultTitle;

  const submit = () => onCopy(frame, title.trim() || defaultTitle);

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
            onChange={(e) => setTyped(e.target.value)}
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
