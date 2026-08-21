import { useEffect, useRef, useState } from "react";
import { MAX_COMMENT_BODY, MAX_COMMENT_NAME } from "../../../config/comments";
import "./CommentDialog.css";

interface CommentDialogProps {
  /** What the item being commented on is called, for the heading. */
  itemLabel: string;
  onCancel: () => void;
  onCreate: (name: string, body: string) => void;
  /** True while the comment is being saved. */
  submitting: boolean;
}

/**
 * Leaving a comment: a name and the words. Deliberately minimal — this is the
 * public's side of a board, so it must not feel like a form.
 */
export function CommentDialog({
  itemLabel,
  onCancel,
  onCreate,
  submitting,
}: CommentDialogProps) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameField.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const ready = name.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="comment-dialog">
      <button
        aria-label="Cancel"
        className="comment-dialog__scrim"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />
      <div className="comment-dialog__panel">
        <header className="comment-dialog__header">
          <h2 className="comment-dialog__title">Leave a comment</h2>
          <p className="comment-dialog__note">On {itemLabel}</p>
        </header>

        <div className="comment-dialog__body">
          <label className="comment-dialog__field-group">
            <span className="comment-dialog__label">Your name</span>
            <input
              className="comment-dialog__field"
              maxLength={MAX_COMMENT_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane"
              ref={nameField}
              value={name}
            />
          </label>
          <label className="comment-dialog__field-group">
            <span className="comment-dialog__label">Comment</span>
            <textarea
              className="comment-dialog__field comment-dialog__field--multiline"
              maxLength={MAX_COMMENT_BODY}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What would you change about this one?"
              value={body}
            />
          </label>
        </div>

        <footer className="comment-dialog__footer">
          <button
            className="comment-dialog__button"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="comment-dialog__button comment-dialog__button--primary"
            disabled={!ready || submitting}
            onClick={() => onCreate(name.trim(), body.trim())}
            type="button"
          >
            {submitting ? "Posting…" : "Post comment"}
          </button>
        </footer>
      </div>
    </div>
  );
}
