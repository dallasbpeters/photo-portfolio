import { useEffect } from "react";
import type { DrawTool } from "../../../boards/drawing/drawing";
import {
  restore,
  type useBoardHistory,
} from "../../../boards/hooks/useBoardHistory";
import { boardsApi } from "../../../services/portfolioService";
import type { BoardItem, BoardWire } from "../../../types";

/**
 * The two things the window tells the board.
 *
 * Lifted out of BoardEditor.tsx, which had no room left to grow. Both are
 * listeners registered once and read through a ref, deliberately: re-subscribing
 * pagehide on every drag frame would be its own performance problem, so neither
 * effect depends on the state it reads.
 *
 * The flush matters more than it looks. Saving is debounced, so the last second
 * or so of work has not reached the server — and because a board has its own
 * URL, coming back to it after a dropped tab looks exactly like the work was
 * saved. `keepalive` lets the request outlive the page; a normal fetch is
 * cancelled the moment the document goes away.
 */
export interface BoardWindowDeps {
  boardId: string;
  history: ReturnType<typeof useBoardHistory>;
  /** The latest state, kept in a ref so a listener never reads a stale copy. */
  pending: React.RefObject<{
    isDirty: boolean;
    isLoaded: boolean;
    items: BoardItem[];
    wires: BoardWire[];
  }>;
  setDrawTool: React.Dispatch<React.SetStateAction<DrawTool | null>>;
  setIsDirty: (dirty: boolean) => void;
  setIsInserting: React.Dispatch<React.SetStateAction<boolean>>;
  setItems: React.Dispatch<React.SetStateAction<BoardItem[]>>;
  setWires: React.Dispatch<React.SetStateAction<BoardWire[]>>;
}

export const useBoardWindowEvents = (deps: BoardWindowDeps) => {
  const {
    boardId,
    history,
    pending,
    setDrawTool,
    setIsDirty,
    setIsInserting,
    setItems,
    setWires,
  } = deps;

  /**
   * Flushes on the way out.
   *
   * The debounce means the last second or so of work has not reached the server
   * yet, so a reload, a closed tab, or a backgrounded phone would drop it — the
   * board having its own URL makes that worse, because coming back looks like
   * the work was saved. keepalive lets the request outlive the page; a normal
   * fetch is cancelled the moment the document goes away.
   */
  // The ref is read here, never subscribed to. Depending on `pending.current`
  // would re-register pagehide on every drag frame — precisely the cost this
  // ref exists to avoid, and the reason the effect takes only `boardId`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: explained above
  useEffect(() => {
    const flush = () => {
      const {
        isDirty: unsaved,
        isLoaded: ready,
        items: latest,
        wires: latestWires,
      } = pending.current;
      // Same guard as save(): a page closing before the board loaded must not
      // flush an empty arrangement over a full one.
      if (unsaved && ready) {
        boardsApi.flush(boardId, latest, latestWires);
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

  /**
   * ⌘/ opens the insert palette.
   *
   * The header has run out of room — notes, text, images, three node types, a
   * frame and 189 shaders do not fit on a toolbar — and searching is faster
   * than hunting a button even when they do.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setIsInserting((open) => !open);
        return;
      }
      // Escape puts the pointer back. Without it a chosen tool is a mode you
      // can only leave by finding the toolbar again, and since a tool draws on
      // every press it also means nothing on the board can be moved — which
      // reads as the cursor being stuck rather than as a mode being on.
      // Undo and redo. Ignored while typing: a field has its own undo, and
      // stealing it would make editing a prompt lose the prompt rather than
      // the last character.
      const active = document.activeElement;
      const isTyping =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "z" &&
        !isTyping
      ) {
        e.preventDefault();
        setItems((currentItems) => {
          setWires((currentWires) => {
            const now = { items: currentItems, wires: currentWires };
            const step = e.shiftKey ? history.redo(now) : history.undo(now);
            if (step) {
              const restored = restore(step, currentItems);
              setItems(restored.items);
              setWires(restored.wires);
              setIsDirty(true);
            }
            return currentWires;
          });
          return currentItems;
        });
        return;
      }
      if (e.key === "Escape") {
        setDrawTool((current) => {
          if (current === null) {
            return current;
          }
          e.preventDefault();
          return null;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, setDrawTool, setIsDirty, setIsInserting, setItems, setWires]);
};
