import { HugeiconsIcon } from "@hugeicons/react";
import { GridViewIcon, Tick02Icon } from "@hugeicons-pro/core-stroke-standard";
import "./boardEditorChrome.css";

/**
 * The board's name, and whether its work is safe.
 *
 * Lifted out of BoardEditor.tsx, which had no room left to grow. Small, but the
 * save indicator is the honest half of saving on a debounce: there is no save
 * button to press, so this is the only thing telling anyone whether what they
 * just dragged has reached the server.
 *
 * The name is also where it is renamed, because it is the only place the name
 * appears while the board is open — a rename buried in a menu would be looked
 * for here first.
 */
export interface BoardStatusBarProps {
  isDirty: boolean;
  isSaving: boolean;
  /** Omitted for a read-only view, which then renders a plain heading. */
  onRename?: () => void;
  title: string;
}

export function BoardStatusBar({
  isDirty,
  isSaving,
  onRename,
  title,
}: BoardStatusBarProps) {
  return (
    <div className="board-panel board-panel--top board-status">
      <HugeiconsIcon
        aria-hidden
        className="board-status__icon"
        icon={GridViewIcon}
        size={14}
      />
      <h2 className="board-status__title">
        {onRename ? (
          <button
            className="board-status__rename"
            onClick={onRename}
            title="Rename this board"
            type="button"
          >
            {title}
          </button>
        ) : (
          title
        )}
      </h2>
      <p className="board-status__state">
        {isSaving ? "Saving…" : null}
        {!isSaving && isDirty ? "Unsaved changes" : null}
        {isSaving || isDirty ? null : (
          <span className="board-status__detail">
            <HugeiconsIcon aria-hidden icon={Tick02Icon} size={11} />
            Saved
          </span>
        )}
      </p>
    </div>
  );
}
