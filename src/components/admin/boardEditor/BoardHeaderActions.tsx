import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  PlayIcon,
  StopIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { toast } from "sonner";
import ThemeToggle from "../../ThemeToggle";
import { Button } from "../../ui/button";
import "./boardEditorChrome.css";

/** Strips the scheme so the shared link reads as a plain address. */
const SCHEME = /^https?:\/\//;

/** The board header's actions: run, comment, share, publish, close. */
export function BoardHeaderActions({
  commentCount,
  hasNodes,
  isPublic,
  isPublishing,
  isRunning,
  onCancelRun,
  onClose,
  onPublish,
  onRun,
  onToggleComments,
  publicUrl,
  showComments,
}: {
  commentCount: number;
  hasNodes: boolean;
  isPublic: boolean;
  isPublishing: boolean;
  isRunning: boolean;
  onCancelRun: () => void;
  onClose: () => void;
  onPublish: () => void;
  onRun: () => void;
  onToggleComments: () => void;
  publicUrl: string | null;
  showComments: boolean;
}) {
  return (
    <>
      {/* Only offered once there is a graph to run. A board of pinned
          photographs has nothing to execute, and a control that would always
          be a no-op is noise. */}
      {hasNodes ? (
        <Button
          onClick={isRunning ? onCancelRun : onRun}
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            aria-hidden
            icon={isRunning ? StopIcon : PlayIcon}
            size={14}
          />
          {isRunning ? "Cancel" : "Run board"}
        </Button>
      ) : null}
      <Button
        aria-label="Comments"
        className={`board-header-action ${
          showComments ? "board-header-action--on" : "board-header-action--off"
        }`}
        onClick={onToggleComments}
        type="button"
        variant="ghost"
      >
        Comments{commentCount > 0 ? ` (${commentCount})` : ""}
      </Button>
      {publicUrl ? (
        <button
          className="board-header-link"
          onClick={() => {
            void navigator.clipboard.writeText(publicUrl);
            toast.success("Link copied");
          }}
          type="button"
        >
          {publicUrl.replace(SCHEME, "")}
        </button>
      ) : null}
      <Button
        disabled={isPublishing}
        onClick={onPublish}
        type="button"
        variant="ghost"
      >
        {isPublic ? "Unpublish" : "Publish"}
      </Button>
      <ThemeToggle />
      <Button
        aria-label="Close board"
        onClick={onClose}
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={18} />
      </Button>
    </>
  );
}
