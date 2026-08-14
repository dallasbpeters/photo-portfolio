import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Message02Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { nodeTypeFor } from "../../config/nodeTypes.js";
import type { BoardComment } from "../services/comments";
import type { BoardItem } from "../types";

interface CommentsPanelProps {
  comments: BoardComment[];
  /** The board's items, to say what each comment is on. */
  items: BoardItem[];
  onClose: () => void;
  /** Marks a comment resolved (or re-opens it). Absent when read-only. */
  onResolve?: (commentId: string, resolved: boolean) => void;
}

const itemLabel = (item: BoardItem | undefined): string => {
  if (!item) {
    return "a removed item";
  }
  if (item.kind === "op") {
    return nodeTypeFor(item.nodeType)?.label ?? "a node";
  }
  if (item.kind === "photo" || item.kind === "reference") {
    return "an image";
  }
  if (item.kind === "frame") {
    return "a frame";
  }
  return item.kind;
};

const timeAgo = (iso: string): string => {
  const ms = Date.now() - Date.parse(iso);
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }
  return `${Math.round(hours / 24)}d`;
};

/**
 * The comments on a board, newest first, with a resolved toggle for whoever
 * owns the board. Public boards show the same list without the toggle.
 */
export function CommentsPanel({
  comments,
  items,
  onClose,
  onResolve,
}: CommentsPanelProps) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const open = comments.filter((comment) => !comment.resolved);
  const resolved = comments.filter((comment) => comment.resolved);
  const list = [...open, ...resolved];

  return (
    <div className="pointer-events-auto absolute top-4 right-4 flex max-h-[calc(100%-6rem)] w-80 flex-col overflow-hidden rounded-lg border border-white/15 bg-[#181818]/95 shadow-xl backdrop-blur">
      <header className="flex shrink-0 items-center justify-between gap-2 border-white/10 border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-[10px] text-white/70 uppercase tracking-[0.18em]">
          <HugeiconsIcon aria-hidden icon={Message02Icon} size={13} />
          Comments
          <span className="text-white/40">
            {open.length > 0 ? `· ${open.length} open` : ""}
          </span>
        </span>
        <button
          aria-label="Close comments"
          className="grid size-6 place-items-center rounded text-white/50 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          type="button"
        >
          <HugeiconsIcon aria-hidden icon={Cancel01Icon} size={13} />
        </button>
      </header>

      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {list.length === 0 ? (
          <li className="px-2 py-6 text-center text-[11px] text-white/40 leading-relaxed">
            No comments yet. Click an image or node to leave one.
          </li>
        ) : (
          list.map((comment) => {
            const item = byId.get(comment.itemId);
            return (
              <li
                className={`rounded-lg border px-2.5 py-2 ${
                  comment.resolved
                    ? "border-white/5 opacity-50"
                    : "border-white/10"
                }`}
                key={comment.id}
              >
                <p className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-[12px] text-white">
                    {comment.authorName}
                  </span>
                  <span className="shrink-0 text-[9px] text-white/40 tabular-nums">
                    {timeAgo(comment.createdAt)}
                  </span>
                </p>
                <p className="mt-0.5 break-words text-[12px] text-white/85 leading-relaxed">
                  {comment.body}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[9px] text-white/40 uppercase tracking-[0.14em]">
                    on {itemLabel(item)}
                  </span>
                  {onResolve ? (
                    <button
                      className={`rounded px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] transition-colors ${
                        comment.resolved
                          ? "text-emerald-300/80 hover:text-emerald-300"
                          : "text-white/40 hover:text-white"
                      }`}
                      onClick={() => onResolve(comment.id, !comment.resolved)}
                      type="button"
                    >
                      {comment.resolved ? "Re-open" : "Mark resolved"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
