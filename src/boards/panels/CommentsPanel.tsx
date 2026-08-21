import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Message02Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { nodeTypeFor } from "../../../config/nodeTypes.js";
import type { BoardComment } from "../../services/comments";
import type { BoardItem } from "../../types";
import "../boardChrome.css";
import "./CommentsPanel.css";

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
    <div className="board-panel board-panel--column panel-surface panel-docked comments-panel">
      <header className="panel-header">
        <span className="comments-panel__header-title">
          <HugeiconsIcon aria-hidden icon={Message02Icon} size={13} />
          Comments
          <span className="comments-panel__count">
            {open.length > 0 ? `· ${open.length} open` : ""}
          </span>
        </span>
        <button
          aria-label="Close comments"
          className="panel-icon-button panel-icon-button--plain"
          onClick={onClose}
          type="button"
        >
          <HugeiconsIcon aria-hidden icon={Cancel01Icon} size={13} />
        </button>
      </header>

      <ul className="panel-list">
        {list.length === 0 ? (
          <li className="panel-empty">
            No comments yet. Click an image or node to leave one.
          </li>
        ) : (
          list.map((comment) => {
            const item = byId.get(comment.itemId);
            return (
              <li
                className={`comments-panel__comment ${
                  comment.resolved ? "comments-panel__comment--resolved" : ""
                }`}
                key={comment.id}
              >
                <p className="comments-panel__byline">
                  <span className="comments-panel__author">
                    {comment.authorName}
                  </span>
                  <span className="comments-panel__time">
                    {timeAgo(comment.createdAt)}
                  </span>
                </p>
                <p className="comments-panel__body">{comment.body}</p>
                <div className="comments-panel__footer">
                  <span className="comments-panel__subject">
                    on {itemLabel(item)}
                  </span>
                  {onResolve ? (
                    <button
                      className={`comments-panel__resolve ${
                        comment.resolved
                          ? "comments-panel__resolve--resolved"
                          : ""
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
