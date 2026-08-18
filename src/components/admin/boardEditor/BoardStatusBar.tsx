import { HugeiconsIcon } from "@hugeicons/react";
import { GridViewIcon, Tick02Icon } from "@hugeicons-pro/core-stroke-standard";

/**
 * The board's name, and whether its work is safe.
 *
 * Lifted out of BoardEditor.tsx, which had no room left to grow. Small, but the
 * save indicator is the honest half of saving on a debounce: there is no save
 * button to press, so this is the only thing telling anyone whether what they
 * just dragged has reached the server.
 */
export interface BoardStatusBarProps {
  isDirty: boolean;
  isSaving: boolean;
  title: string;
}

export function BoardStatusBar({
  isDirty,
  isSaving,
  title,
}: BoardStatusBarProps) {
  return (
    <div className="board-panel board-panel--top min-w-0">
      <HugeiconsIcon
        aria-hidden
        className="text-board-ink"
        icon={GridViewIcon}
        size={14}
      />
      <h2 className="truncate font-light text-board-ink/90 text-sm uppercase tracking-[0.2em]">
        {title}
      </h2>
      <p className="text-[10px] text-board-ink/40 uppercase tracking-[0.2em]">
        {isSaving ? "Saving…" : null}
        {!isSaving && isDirty ? "Unsaved changes" : null}
        {isSaving || isDirty ? null : (
          <span className="flex items-center gap-1">
            <HugeiconsIcon aria-hidden icon={Tick02Icon} size={11} />
            Saved
          </span>
        )}
      </p>
    </div>
  );
}
