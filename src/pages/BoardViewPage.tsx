import "./BoardViewPage.css";
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
    <div className="row">
      <button
        className={
          commentMode
            ? "board-view-page__action board-view-page__action--armed"
            : "board-view-page__action"
        }
        onClick={onToggleCommentMode}
        type="button"
      >
        {commentMode ? "Cancel comment" : "Leave a comment"}
      </button>
      <button
        className="board-view-page__action"
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
      <div className="page board-view-page__error">
        <p className="board-view-page__error-note">{error}</p>
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
    <div className="board-fixed board-view-page">
      <header className="row board-view-page__bar row--between row--wrap">
        <div className="board-view-page__identity">
          <h1 className="board-view-page__title">{board?.title ?? "Board"}</h1>
          <p className="board-view-page__site">{settings.name}</p>
        </div>
        <div className="row">
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

      <div className="board-view-page__canvas">
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
