import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Image01Icon,
  NotebookIcon,
  TextIcon,
  Tick02Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_WIDTH,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  DEFAULT_TEXT_HEIGHT,
  DEFAULT_TEXT_WIDTH,
} from "../../../config/canvas.js";
import { BoardCanvas } from "../../boards/BoardCanvas";
import { newItemId } from "../../boards/newItemId";
import {
  authStorage,
  boardsApi,
  portfolioService,
} from "../../services/portfolioService";
import type { Board, BoardItem, Photo } from "../../types";
import { Button } from "../ui/button";
import { BoardInsertPanel, type ExternalImage } from "./BoardInsertPanel";
import { CustomCursor } from "./CustomCurstor";

/** Strips the scheme so the shared link reads as a plain address. */
const SCHEME = /^https?:\/\//;

/** How long after the last change before the board saves itself. */
const AUTOSAVE_DELAY_MS = 1200;

/** New items land near the middle of the canvas, offset so they do not stack. */
const dropPoint = (count: number) => ({
  x: CANVAS_WIDTH / 2 - 240 + (count % 6) * 40,
  y: CANVAS_HEIGHT / 2 - 160 + (count % 6) * 40,
});

/**
 * Full-screen board editor.
 *
 * Saves on a debounce rather than behind a button: the canvas is edited by
 * dragging, and a drag has no natural moment where a person would think to
 * press save. The unsaved marker is what makes that honest.
 */
export function BoardEditor({
  boardId,
  onClose,
}: {
  boardId: string;
  onClose: () => void;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [autoEditId, setAutoEditId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  /**
   * Publishing mints the slug server-side, so the link only exists once the
   * response comes back — there is nothing to show optimistically.
   */
  const publish = async (isPublic: boolean) => {
    setIsPublishing(true);
    try {
      const saved = await boardsApi.update(boardId, { isPublic });
      setBoard(saved);
      toast.success(isPublic ? "Board published" : "Board unpublished");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not publish");
    } finally {
      setIsPublishing(false);
    }
  };

  const publicUrl =
    board?.isPublic && board.slug
      ? `${window.location.origin}/board/${board.slug}`
      : null;

  // Read once: the signed-in admin cannot change while the board is open.
  const [displayName] = useState(() => {
    const user = authStorage.getUser();
    return user ? user.displayName : "You";
  });

  // A saved item is keyed by its id; an unsaved one by the key it was created
  // with. Both survive the new object that every edit produces.
  const keyOf = useCallback((item: BoardItem) => item.id, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [loaded, photoList] = await Promise.all([
          boardsApi.get(boardId),
          portfolioService.getPhotos(),
        ]);
        if (cancelled) {
          return;
        }
        setBoard(loaded);
        setItems(loaded.items ?? []);
        setPhotos(photoList);
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Could not load this board"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      await boardsApi.update(boardId, {
        // The first image on the board becomes its cover, so the list has
        // something to show without asking anyone to choose.
        coverUrl:
          items.find(
            (i) => (i.kind === "photo" || i.kind === "reference") && i.imageUrl
          )?.imageUrl ?? undefined,
        items,
      });
      // Deliberately does not adopt saved.items. The canvas is the source of
      // truth while it is open, and replacing state here discarded anything
      // typed or dragged while the request was in flight.
      setIsDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save board");
    } finally {
      setIsSaving(false);
    }
  }, [boardId, items]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isDirty, save]);

  // Latest state, readable from listeners that must not re-subscribe on every
  // drag frame — re-registering pagehide hundreds of times during a drag would
  // be its own problem.
  const pending = useRef<{ isDirty: boolean; items: BoardItem[] }>({
    isDirty,
    items,
  });
  pending.current = { isDirty, items };

  /**
   * Flushes on the way out.
   *
   * The debounce means the last second or so of work has not reached the server
   * yet, so a reload, a closed tab, or a backgrounded phone would drop it — the
   * board having its own URL makes that worse, because coming back looks like
   * the work was saved. keepalive lets the request outlive the page; a normal
   * fetch is cancelled the moment the document goes away.
   */
  useEffect(() => {
    const flush = () => {
      const { isDirty: unsaved, items: latest } = pending.current;
      if (unsaved) {
        boardsApi.flush(boardId, latest);
      }
    };

    // pagehide covers reload, navigation and tab close. visibilitychange is the
    // one that fires when a phone backgrounds the app, which on iOS may be the
    // last callback before the page is discarded.
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [boardId]);

  const change = useCallback((next: BoardItem[]) => {
    setItems(next);
    setIsDirty(true);
  }, []);

  /**
   * Adds a note or a plain text item.
   *
   * Both are empty on creation, which the API would reject as malformed — so
   * they only reach a save once something has been typed. That is deliberate:
   * an empty card left on the board is noise, not content.
   */
  const addWritable = (kind: "note" | "text") => {
    const p = dropPoint(items.length);
    const id = newItemId();
    change([
      ...items,
      {
        body: "",
        creditName: null,
        creditUrl: null,
        fontSize: null,
        height: kind === "note" ? DEFAULT_NOTE_HEIGHT : DEFAULT_TEXT_HEIGHT,
        id,
        imageUrl: null,
        kind,
        photoId: null,
        thumbUrl: null,
        width: kind === "note" ? DEFAULT_NOTE_WIDTH : DEFAULT_TEXT_WIDTH,
        x: p.x,
        y: p.y,
        z: items.length + 1,
      },
    ]);
    // Placed to be written in, so it opens for typing immediately.
    setAutoEditId(id);
  };

  const addPhoto = (photo: Photo) => {
    const p = dropPoint(items.length);
    change([
      ...items,
      {
        body: null,
        creditName: null,
        creditUrl: null,
        fontSize: null,
        height: DEFAULT_IMAGE_HEIGHT,
        id: newItemId(),
        imageUrl: photo.url,
        kind: "photo",
        photoId: photo.id,
        thumbUrl: photo.url,
        width: DEFAULT_IMAGE_WIDTH,
        x: p.x,
        y: p.y,
        z: items.length + 1,
      },
    ]);
    setIsPicking(false);
  };

  /** An Unsplash reference or a generated image. */
  const addExternal = (image: ExternalImage) => {
    const p = dropPoint(items.length);
    change([
      ...items,
      {
        body: null,
        // Credit travels with the item: the licence requires it wherever the
        // photograph is shown, and the search response is long gone by then.
        creditName: image.creditName,
        creditUrl: image.creditUrl,
        fontSize: null,
        height: DEFAULT_IMAGE_HEIGHT,
        id: newItemId(),
        imageUrl: image.imageUrl,
        kind: "reference",
        photoId: null,
        thumbUrl: image.thumbUrl,
        width: DEFAULT_IMAGE_WIDTH,
        x: p.x,
        y: p.y,
        z: items.length + 1,
      },
    ]);
  };

  const close = async () => {
    if (isDirty) {
      await save();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <CustomCursor cursorColor="#9100FF" userName={displayName} />
      <header className="flex shrink-0 items-center justify-between gap-4 border-white/10 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-light text-sm text-white/90 uppercase tracking-[0.2em]">
            {board?.title ?? "Board"}
          </h2>
          <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">
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

        <div className="flex shrink-0 items-center gap-2">
          <Button
            className="min-h-11 text-[10px] text-white/80 uppercase tracking-[0.18em] hover:text-white"
            onClick={() => addWritable("note")}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon aria-hidden icon={NotebookIcon} size={14} />
            Note
          </Button>
          <Button
            className="min-h-11 text-[10px] text-white/80 uppercase tracking-[0.18em] hover:text-white"
            onClick={() => addWritable("text")}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon aria-hidden icon={TextIcon} size={14} />
            Text
          </Button>
          <Button
            className="min-h-11 text-[10px] text-white/80 uppercase tracking-[0.18em] hover:text-white"
            onClick={() => setIsPicking((v) => !v)}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon aria-hidden icon={Image01Icon} size={14} />
            Photo
          </Button>
          {publicUrl ? (
            <button
              className="max-w-40 truncate text-[10px] text-emerald-300/80 underline-offset-2 hover:underline"
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
            className="min-h-11 text-[10px] text-white/80 uppercase tracking-[0.18em] hover:text-white"
            disabled={isPublishing}
            onClick={() => void publish(!board?.isPublic)}
            type="button"
            variant="ghost"
          >
            {board?.isPublic ? "Unpublish" : "Publish"}
          </Button>
          <Button
            aria-label="Close board"
            className="min-h-11 text-white/80 hover:text-white"
            onClick={() => void close()}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} />
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <BoardCanvas
          autoEditId={autoEditId}
          items={items}
          keyOf={keyOf}
          onChange={change}
        />

        {isPicking ? (
          <BoardInsertPanel
            onAddExternal={addExternal}
            onAddPhoto={addPhoto}
            onClose={() => setIsPicking(false)}
            photos={photos}
          />
        ) : null}
      </div>
    </div>
  );
}
