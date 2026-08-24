import "./BoardViewPage.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { frameForSlug, frameSlugs } from "../../config/frameSlug";
import { containedBy } from "../../config/graph";
import { nodeTypeFor } from "../../config/nodeTypes";
import { BoardCanvas } from "../boards/BoardCanvas";
import { FrameOpenProvider, frameLink } from "../boards/FrameOpenContext";
import { FrameViewer } from "../boards/FrameViewer";
import { currentImageUrl } from "../boards/itemOutput";
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
  const { frameSlug, slug } = useParams<{ frameSlug?: string; slug: string }>();
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [commentTarget, setCommentTarget] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /*
   * Which picture in the open frame is being looked at.
   *
   * Not in the URL. The frame is the thing worth sharing — "look at the deck
   * mockups" — and putting the index there too would mean every arrow press
   * pushed a history entry, so leaving the viewer took eleven Backs.
   */
  const [shownIndex, setShownIndex] = useState(0);

  useEffect(() => {
    if (!slug) {
      return;
    }
    let cancelled = false;
    void (async () => {
      let loaded: Board;
      try {
        loaded = await boardsApi.get(slug);
      } catch {
        if (!cancelled) {
          setError("This board is not available.");
        }
        return;
      }
      if (cancelled) {
        return;
      }
      setBoard(loaded);

      /*
       * The comments are fetched on their own, and are allowed to fail.
       *
       * They used to share the board's try, so a comments endpoint that answered
       * 502 threw out a board that had already loaded perfectly and put "this
       * board is not available" in front of a visitor looking at a live public
       * board. The two requests are not one operation: the board is the page,
       * and the comments are an annotation on it.
       *
       * Silent, because there is nothing a visitor can do about it and the
       * sidebar showing none is the truthful state — the alternative is an error
       * over a board they can otherwise read and share.
       */
      try {
        const list = await commentsApi.list(loaded.id);
        if (!cancelled) {
          setComments(list);
        }
      } catch {
        // Left empty; the board stands on its own.
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

  /*
   * Which frame the address names, and what is in it.
   *
   * Memoised on the items rather than recomputed per render: `containedBy` walks
   * every item against every nested frame, and this runs on a board that is also
   * panning and zooming under the pointer.
   */
  const items = board?.items ?? [];
  const frames = useMemo(
    () => items.filter((item) => item.kind === "frame"),
    [items]
  );
  const openFrame = useMemo(
    () =>
      frameSlug
        ? (frameForSlug(
            frames.map((frame) => ({ id: frame.id, name: frame.body })),
            frameSlug
          ) ?? null)
        : null,
    [frames, frameSlug]
  );
  const framed = useMemo(() => {
    const frame = openFrame && frames.find((one) => one.id === openFrame.id);
    if (!frame) {
      return [];
    }
    // Only what has a picture: a frame may also hold a note or a prompt node,
    // and paging onto one of those would look like the viewer breaking.
    return containedBy(frame, items).filter((item) =>
      Boolean(currentImageUrl(item))
    );
  }, [items, frames, openFrame]);

  const openFrameSlug = useCallback(
    (frameId: string) => {
      const slugs = frameSlugs(
        frames.map((frame) => ({ id: frame.id, name: frame.body }))
      );
      const named = slugs.get(frameId);
      if (named && slug) {
        setShownIndex(0);
        navigate(`/board/${slug}/${named}`);
      }
    },
    [frames, navigate, slug]
  );

  // Back to the board. `navigate` rather than a history pop so closing works
  // the same whether the frame was opened here or arrived at by a shared link.
  const closeFrame = useCallback(() => {
    if (slug) {
      navigate(`/board/${slug}`);
    }
  }, [navigate, slug]);

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
        {/* Frames on a published board open as their own view; the provider is
            what tells them so. See FrameOpenContext. */}
        <FrameOpenProvider
          linkFor={(frameId) =>
            frameLink(
              slug ? `${window.location.origin}/board/${slug}` : null,
              items,
              frameId
            )
          }
          onOpenFrame={openFrameSlug}
        >
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
        </FrameOpenProvider>

        {openFrame ? (
          <FrameViewer
            index={Math.min(shownIndex, Math.max(framed.length - 1, 0))}
            items={framed}
            link={
              slug
                ? frameLink(
                    `${window.location.origin}/board/${slug}`,
                    items,
                    openFrame.id
                  )
                : null
            }
            name={openFrame.name?.trim() || "Frame"}
            onClose={closeFrame}
            onIndex={setShownIndex}
          />
        ) : null}

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
