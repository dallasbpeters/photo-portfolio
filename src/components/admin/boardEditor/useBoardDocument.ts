import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { DrawTool } from "../../../boards/drawing";
import type { useBoardHistory } from "../../../boards/useBoardHistory";
import type { BoardComment } from "../../../services/comments";
import { commentsApi } from "../../../services/comments";
import {
  boardsApi,
  portfolioService,
} from "../../../services/portfolioService";
import type {
  Board,
  BoardItem,
  BoardSource,
  BoardWire,
  Photo,
} from "../../../types";
import { dropComposites } from "./placement";
import { useBoardWindowEvents } from "./useBoardWindowEvents";

/** How long after the last change before the board saves itself. */
const AUTOSAVE_DELAY_MS = 1200;

/**
 * The board document: loading it, saving it, and every edit that dirties it.
 *
 * Lifted out of BoardEditor.tsx, which had no room left to grow. Everything
 * here is one concern — the arrangement, and keeping the server's copy of it
 * honest — and three rules in it are easy to lose and expensive to rediscover.
 *
 * Saves are **serialised**. A save replaces the whole arrangement, so two in
 * flight can land out of order and let the older snapshot win, resetting
 * positions or deleting an item added in between. Each save waits for the last.
 *
 * A save **refuses to write a board it has not read**. Without that, the first
 * debounce after any early edit replaces the stored arrangement with the empty
 * one this component starts with.
 *
 * The response is deliberately **not** adopted back into state. The canvas is
 * the source of truth while it is open, and taking the server's items would
 * discard anything typed or dragged while the request was in flight. Run
 * results are safe in the other direction too: a save never writes them, so a
 * generation landing mid-request cannot be clobbered by the copy it carried.
 */
export interface BoardDocumentDeps {
  board: Board | null;
  boardId: string;
  history: ReturnType<typeof useBoardHistory>;
  isDirty: boolean;
  isLoaded: boolean;
  items: BoardItem[];
  setBoard: React.Dispatch<React.SetStateAction<Board | null>>;
  setComments: React.Dispatch<React.SetStateAction<BoardComment[]>>;
  setDrawTool: React.Dispatch<React.SetStateAction<DrawTool | null>>;
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setIsInserting: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoaded: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPublishing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setItems: React.Dispatch<React.SetStateAction<BoardItem[]>>;
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
  setSources: React.Dispatch<React.SetStateAction<BoardSource[]>>;
  setWires: React.Dispatch<React.SetStateAction<BoardWire[]>>;
  sources: BoardSource[];
  wires: BoardWire[];
}

export const useBoardDocument = (deps: BoardDocumentDeps) => {
  const {
    board,
    boardId,
    history,
    isDirty,
    isLoaded,
    items,
    setBoard,
    setComments,
    setDrawTool,
    setIsDirty,
    setIsInserting,
    setIsLoaded,
    setIsPublishing,
    setIsSaving,
    setItems,
    setPhotos,
    setSources,
    setWires,
    sources,
    wires,
  } = deps;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [loaded, photoList, commentList] = await Promise.all([
          boardsApi.get(boardId),
          portfolioService.getPhotos(),
          commentsApi.list(boardId),
        ]);
        if (cancelled) {
          return;
        }
        setBoard(loaded);
        setItems(loaded.items ?? []);
        setWires(loaded.wires ?? []);
        setSources(loaded.sources ?? []);
        setIsLoaded(true);
        setPhotos(photoList);
        setComments(commentList);
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
  }, [
    boardId,
    setBoard,
    setComments,
    setIsLoaded,
    setItems,
    setPhotos,
    setSources,
    setWires,
  ]);

  // Serialises board saves. A save replaces the whole arrangement (the server
  // deletes and re-inserts every item), so two in flight can land out of order
  // and the older snapshot would win — resetting positions to an earlier state,
  // or deleting an item added in the meantime. Each save waits for the last.
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const save = useCallback(
    /**
     * `override` is for a caller that has just computed the items and cannot
     * wait for React to re-render with them — rendering masks before a run is
     * the case, and so is a node created the same moment it is run. Without it
     * that save would write the state from before the masks were attached (or
     * the node was added), and the run would read a board that lacks them.
     */
    async (override?: { items?: BoardItem[]; wires?: BoardWire[] }) => {
      // Refuses to write a board it has not read. Without this the first
      // debounce after any early edit replaces the stored arrangement with the
      // empty one this component starts with.
      if (!isLoaded) {
        return;
      }
      const saving = override?.items ?? items;
      const savingWires = override?.wires ?? wires;
      // The first image on the board becomes its cover, so the list has
      // something to show without asking anyone to choose.
      const coverUrl =
        saving.find(
          (i) => (i.kind === "photo" || i.kind === "reference") && i.imageUrl
        )?.imageUrl ?? undefined;
      const run = saveChain.current.then(async () => {
        setIsSaving(true);
        try {
          await boardsApi.update(boardId, {
            coverUrl,
            items: saving,
            sources,
            wires: savingWires,
          });
          // Deliberately does not adopt saved.items. The canvas is the source of
          // truth while it is open, and replacing state here discarded anything
          // typed or dragged while the request was in flight.
          //
          // Run results are safe from this in the other direction too: the server
          // never writes them from a save, so a generation landing mid-request
          // cannot be overwritten by the copy this call carried.
          setIsDirty(false);
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Could not save board"
          );
        } finally {
          setIsSaving(false);
        }
      });
      saveChain.current = run;
      await run;
    },
    [
      boardId,
      isLoaded,
      items,
      sources,
      wires,
      setIsSaving, // Deliberately does not adopt saved.items. The canvas is the source of
      // truth while it is open, and replacing state here discarded anything
      // typed or dragged while the request was in flight.
      //
      // Run results are safe from this in the other direction too: the server
      // never writes them from a save, so a generation landing mid-request
      // cannot be overwritten by the copy this call carried.
      setIsDirty,
    ]
  );

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
  const pending = useRef<{
    isDirty: boolean;
    isLoaded: boolean;
    items: BoardItem[];
    wires: BoardWire[];
  }>({
    isDirty,
    isLoaded,
    items,
    wires,
  });
  pending.current = { isDirty, isLoaded, items, wires };

  useBoardWindowEvents({
    boardId,
    history,
    pending,
    setDrawTool,
    setIsDirty,
    setIsInserting,
    setItems,
    setWires,
  });

  /**
   * Records the state about to be replaced.
   *
   * Taken from the setters rather than passed in, so a caller cannot forget —
   * and read inside the updater so it is the state React actually holds rather
   * than whatever this closure captured.
   */
  const remember = useCallback(() => {
    setItems((currentItems) => {
      setWires((currentWires) => {
        history.record({ items: currentItems, wires: currentWires });
        return currentWires;
      });
      return currentItems;
    });
  }, [history, setItems, setWires]);

  const change = useCallback(
    (next: BoardItem[]) => {
      remember();
      setItems(dropComposites(next));
      setIsDirty(true);
    },
    [remember, setIsDirty, setItems]
  );

  const changeWires = useCallback(
    (next: BoardWire[]) => {
      remember();
      setWires(next);
      // Rewiring changes what a composite is made of, so it invalidates one
      // just as surely as moving a picture does.
      setItems(dropComposites);
      setIsDirty(true);
    },
    [
      remember,
      setWires, // Rewiring changes what a composite is made of, so it invalidates one
      // just as surely as moving a picture does.
      setItems,
      setIsDirty,
    ]
  );

  /**
   * Remembers a place this board pulls references from.
   *
   * Keyed by URL rather than id: attaching the same Pinterest board twice is
   * the same source, not a second one, and the database says so too.
   */
  const attachSource = useCallback(
    (source: BoardSource) => {
      setSources((current) =>
        current.some((existing) => existing.url === source.url)
          ? current
          : [...current, source]
      );
      setIsDirty(true);
    },
    [setSources, setIsDirty]
  );

  const detachSource = useCallback(
    (id: string) => {
      setSources((current) => current.filter((source) => source.id !== id));
      setIsDirty(true);
    },
    [setSources, setIsDirty]
  );

  const changeConfig = useCallback(
    (itemId: string, config: Record<string, unknown>) => {
      setItems((current) =>
        current.map((item) => (item.id === itemId ? { ...item, config } : item))
      );
      setIsDirty(true);
    },
    [setItems, setIsDirty]
  );

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

  /**
   * Leaves the board, but not before its work is safe.
   *
   * The debounce means the last second or so has not reached the server, and a
   * board has its own URL — so coming back to it looks exactly like the work
   * was saved.
   */
  const close = async (onClose: () => void) => {
    if (isDirty) {
      await save();
    }
    onClose();
  };

  return {
    attachSource,
    change,
    changeConfig,
    changeWires,
    close,
    detachSource,
    pending,
    publicUrl,
    publish,
    save,
  };
};
