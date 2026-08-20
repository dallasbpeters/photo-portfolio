import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { nodeTypeFor } from "../../config/nodeTypes";
import { BoardCanvas } from "../boards/BoardCanvas";
import { CommentDialog } from "../boards/panels/CommentDialog";
import { CommentsPanel } from "../boards/panels/CommentsPanel";
import { ShareButtons } from "../components/ShareButtons";
import { type BoardComment, commentsApi } from "../services/comments";
import { boardsApi } from "../services/portfolioService";
import { useSiteSettings } from "../theme/SiteSettingsProvider";
import type { Board, BoardItem } from "../types";

const itemLabel = (item: BoardItem | undefined): string => {
  if (!item) {
    return "this item";
  }
  if (item.kind === "op") {
    return nodeTypeFor(item.nodeType)?.label ?? "this node";
  }
  return "this image";
};

/** The public page's actions: comment mode, the sidebar, and sharing. */
function PublishedActions({
  board,
  commentMode,
  commentCount,
  onToggleCommentMode,
  onToggleComments,
}: {
  board: Board;
  commentMode: boolean;
  commentCount: number;
  onToggleCommentMode: () => void;
  onToggleComments: () => void;
}) {
  const { settings } = useSiteSettings();
  return (
    <div className="flex items-center gap-2">
      <button
        className={`rounded border px-2.5 py-1.5 text-[10px] uppercase tracking-[0.16em] transition-colors ${
          commentMode
            ? "border-amber-300/60 bg-amber-300/10 text-amber-300"
            : "border-white/15 text-white/70 hover:text-white"
        }`}
        onClick={onToggleCommentMode}
        type="button"
      >
        {commentMode ? "Cancel comment" : "Leave a comment"}
      </button>
      <button
        className="rounded border border-white/15 px-2.5 py-1.5 text-[10px] text-white/70 uppercase tracking-[0.16em] transition-colors hover:text-white"
        onClick={onToggleComments}
        type="button"
      >
        Comments{commentCount > 0 ? ` (${commentCount})` : ""}
      </button>
      <ShareButtons
        description={board.title}
        imageUrl={board.coverUrl ?? undefined}
        title={`${board.title} — ${settings.name}`}
        url={`/board/${board.slug ?? ""}`}
      />
    </div>
  );
}

/**
 * A published board, read-only, at its own address.
 *
 * No authentication: publishing is what makes a board readable, and the API
 * returns 404 for one that is not published rather than 403 — a private board
 * should not be discoverable by the difference between the two.
 *
 * Visitors can leave a comment on any item: clicking an item in comment mode
 * opens a small form, and the run of comments lives in the sidebar. Comments
 * are public; marking one resolved is not.
 */
export function BoardViewPage() {
  const { slug } = useParams<{ slug: string }>();
  const { settings } = useSiteSettings();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [commentTarget, setCommentTarget] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!slug) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await boardsApi.get(slug);
        if (!cancelled) {
          setBoard(loaded);
        }
        const list = await commentsApi.list(loaded.id);
        if (!cancelled) {
          setComments(list);
        }
      } catch {
        if (!cancelled) {
          setError("This board is not available.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const createComment = useCallback(
    async (name: string, body: string) => {
      if (!(board && commentTarget)) {
        return;
      }
      setSubmitting(true);
      try {
        const created = await commentsApi.create({
          authorName: name,
          boardId: board.id,
          body,
          itemId: commentTarget,
        });
        setComments((current) => [...current, created]);
        setCommentTarget(null);
        toast.success("Comment posted");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not post the comment"
        );
      } finally {
        setSubmitting(false);
      }
    },
    [board, commentTarget]
  );

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-[12px] text-white/60 uppercase tracking-[0.2em]">
          {error}
        </p>
      </div>
    );
  }

  const targetItem = commentTarget
    ? board?.items?.find((item) => item.id === commentTarget)
    : undefined;

  return (
    // `board-fixed` pins the canvas to the dark board palette. A published board
    // is front end: it belongs to the branded site, so a visitor sees it the way
    // it was shared whatever their machine prefers. The light/dark switch is for
    // the editor, which is a surface you work on rather than a page you are sent.
    <div className="board-fixed flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-white/10 border-b px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-light text-sm text-white/90 uppercase tracking-[0.2em]">
            {board?.title ?? "Board"}
          </h1>
          <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">
            {settings.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {board ? (
            <PublishedActions
              board={board}
              commentCount={comments.length}
              commentMode={commentMode}
              onToggleCommentMode={() => setCommentMode((mode) => !mode)}
              onToggleComments={() => setShowComments((open) => !open)}
            />
          ) : null}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <BoardCanvas
          // A visitor runs no tools, so there is no result to write back.
          boardId={null}
          commentMode={commentMode}
          comments={comments}
          items={board?.items ?? []}
          keyOf={(item: BoardItem) => item.id}
          // Nothing here can change the board; the setter exists only because
          // the canvas is shared with the editor.
          onChange={() => undefined}
          onCommentItem={(itemId) => {
            setCommentTarget(itemId);
            setCommentMode(false);
          }}
          readOnly
          // Wires render for a visitor too. On a graph they are the account of
          // how the images were made, which is most of the reason to publish
          // one — and `readOnly` is what keeps them un-draggable. Running is
          // refused by the API regardless of what this page offers.
          wires={board?.wires ?? []}
        />

        {showComments && board ? (
          <CommentsPanel
            comments={comments}
            items={board.items ?? []}
            onClose={() => setShowComments(false)}
          />
        ) : null}

        {commentTarget && board ? (
          <CommentDialog
            itemLabel={itemLabel(targetItem)}
            onCancel={() => setCommentTarget(null)}
            onCreate={(name, body) => void createComment(name, body)}
            submitting={submitting}
          />
        ) : null}
      </div>
    </div>
  );
}
