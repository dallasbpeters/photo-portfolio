import { Check, Journal, MediaImage, Text, Xmark } from "iconoir-react";
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
import {
  authStorage,
  boardsApi,
  portfolioService,
} from "../../services/portfolioService";
import type { Board, BoardItem, Photo } from "../../types";
import { Button } from "../ui/button";
import { CustomCursor } from "./CustomCurstor";

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

  // Read once: the signed-in admin cannot change while the board is open.
  const [displayName] = useState(
    () => authStorage.getUser()?.displayName ?? "You"
  );

  // A saved item is keyed by its id; an unsaved one by the key it was created
  // with. Both survive the new object that every edit produces.
  const keyOf = useCallback(
    (item: BoardItem, index: number) =>
      item.id ?? item.localKey ?? `index-${index}`,
    []
  );

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
      const saved = await boardsApi.update(boardId, {
        // The first image on the board becomes its cover, so the list has
        // something to show without asking anyone to choose.
        coverUrl:
          items.find(
            (i) => (i.kind === "photo" || i.kind === "reference") && i.imageUrl
          )?.imageUrl ?? undefined,
        items,
      });
      // Adopt the server's ids so the next save updates rather than re-inserts.
      setItems(saved.items ?? []);
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
    change([
      ...items,
      {
        body: "",
        creditName: null,
        creditUrl: null,
        height: kind === "note" ? DEFAULT_NOTE_HEIGHT : DEFAULT_TEXT_HEIGHT,
        id: null,
        imageUrl: null,
        kind,
        localKey: crypto.randomUUID(),
        photoId: null,
        thumbUrl: null,
        width: kind === "note" ? DEFAULT_NOTE_WIDTH : DEFAULT_TEXT_WIDTH,
        x: p.x,
        y: p.y,
        z: items.length + 1,
      },
    ]);
  };

  const addPhoto = (photo: Photo) => {
    const p = dropPoint(items.length);
    change([
      ...items,
      {
        body: null,
        creditName: null,
        creditUrl: null,
        height: DEFAULT_IMAGE_HEIGHT,
        id: null,
        imageUrl: photo.url,
        kind: "photo",
        localKey: crypto.randomUUID(),
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
                <Check aria-hidden height={11} width={11} />
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
            <Journal aria-hidden height={14} width={14} />
            Note
          </Button>
          <Button
            className="min-h-11 text-[10px] text-white/80 uppercase tracking-[0.18em] hover:text-white"
            onClick={() => addWritable("text")}
            type="button"
            variant="ghost"
          >
            <Text aria-hidden height={14} width={14} />
            Text
          </Button>
          <Button
            className="min-h-11 text-[10px] text-white/80 uppercase tracking-[0.18em] hover:text-white"
            onClick={() => setIsPicking((v) => !v)}
            type="button"
            variant="ghost"
          >
            <MediaImage aria-hidden height={14} width={14} />
            Photo
          </Button>
          <Button
            aria-label="Close board"
            className="min-h-11 text-white/80 hover:text-white"
            onClick={() => void close()}
            type="button"
            variant="ghost"
          >
            <Xmark height={18} width={18} />
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <BoardCanvas items={items} keyOf={keyOf} onChange={change} />

        {isPicking ? (
          <div className="absolute inset-y-0 right-0 z-10 w-72 overflow-y-auto border-white/10 border-l bg-black/95 p-3 backdrop-blur">
            <p className="mb-3 text-[10px] text-white/50 uppercase tracking-[0.2em]">
              Add one of your photographs
            </p>
            {photos.length === 0 ? (
              <p className="text-[12px] text-white/50">No photographs yet.</p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {photos.map((photo) => (
                <button
                  className="overflow-hidden rounded border border-white/10 transition-colors hover:border-white/50"
                  key={photo.id}
                  onClick={() => addPhoto(photo)}
                  type="button"
                >
                  <img
                    alt={photo.alt}
                    className="aspect-square w-full object-cover"
                    height={160}
                    loading="lazy"
                    src={photo.url}
                    width={160}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
