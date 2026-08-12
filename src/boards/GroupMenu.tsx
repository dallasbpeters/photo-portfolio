import { HugeiconsIcon } from "@hugeicons/react";
import { FrameIcon } from "@hugeicons-pro/core-stroke-standard";
import type { BoardItem } from "../types";

/**
 * What a selection offers when it is right-clicked.
 *
 * Grouping is the step before compositing: a Composite node renders a frame's
 * contents where they sit, so making the frame is how you say which pictures
 * belong together and how they are arranged. Dragging an empty frame around
 * work that already exists is fiddly and silently wrong by a few pixels — a
 * picture whose centre falls outside is simply not in the group — so the frame
 * is drawn around the selection instead.
 *
 * Positioned in screen pixels like the other canvas menus: it is chrome, and
 * the zoom must not change its size or where it sits.
 */

interface GroupMenuProps {
  /** The selection and where it was clicked, or null when no menu is open. */
  menu: { items: BoardItem[]; point: { x: number; y: number } } | null;
  onDismiss: () => void;
  onGroup: (items: BoardItem[]) => void;
}

export function GroupMenu({ menu, onDismiss, onGroup }: GroupMenuProps) {
  if (!menu) {
    return null;
  }

  const { items, point } = menu;

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
        className="absolute z-50 min-w-52 overflow-hidden rounded-lg border border-white/15 bg-neutral-900/95 shadow-xl backdrop-blur"
        style={{ left: point.x + 10, top: point.y - 8 }}
      >
        <button
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-white/85 transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => onGroup(items)}
          type="button"
        >
          <HugeiconsIcon aria-hidden icon={FrameIcon} size={14} />
          <span>
            Group{" "}
            {items.length === 1
              ? "into a frame"
              : `${items.length} into a frame`}
          </span>
        </button>
        <p className="px-3 pb-2.5 text-[10px] text-white/40 leading-relaxed">
          Arrange them inside, then wire the frame into a Composite node to
          flatten the arrangement into one image.
        </p>
      </div>
    </>
  );
}
