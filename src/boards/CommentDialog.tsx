import { useEffect, useRef, useState } from "react";
import { MAX_COMMENT_BODY, MAX_COMMENT_NAME } from "../../config/comments";

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <button
        aria-label="Cancel"
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />
      <div className="relative flex w-[min(92vw,30rem)] flex-col overflow-hidden rounded-xl border border-white/15 bg-[#181818] shadow-2xl">
        <header className="shrink-0 border-white/10 border-b px-4 py-3">
          <h2 className="text-[11px] text-white uppercase tracking-[0.18em]">
            Leave a comment
          </h2>
          <p className="mt-1 text-[11px] text-white/50 leading-relaxed">
            On {itemLabel}
          </p>
        </header>

        <div className="space-y-3 p-4">
          <label className="block">
            <span className="mb-1 block text-[9px] text-white/40 uppercase tracking-[0.18em]">
              Your name
            </span>
            <input
              className="w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-[13px] text-white outline-none focus:border-white/40"
              maxLength={MAX_COMMENT_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane"
              ref={nameField}
              value={name}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] text-white/40 uppercase tracking-[0.18em]">
              Comment
            </span>
            <textarea
              className="min-h-24 w-full resize-y rounded border border-white/15 bg-black/40 px-2 py-1.5 text-[13px] text-white leading-relaxed outline-none focus:border-white/40"
              maxLength={MAX_COMMENT_BODY}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What would you change about this one?"
              value={body}
            />
          </label>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-white/10 border-t px-4 py-3">
          <button
            className="rounded px-2.5 py-1.5 text-[12px] text-white/60 hover:text-white"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded bg-white/15 px-3 py-1.5 text-[12px] text-white hover:bg-white/25 disabled:opacity-40"
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
