import { useCallback, useRef } from "react";
import type { BoardItem, BoardWire } from "../types";

/**
 * Undo and redo for a board.
 *
 * Snapshots rather than inverse operations. A board has few kinds of change but
 * many places that make them — dragging, drawing, wiring, pasting, a finished
 * run tiling itself into a frame — and writing an undo for each would mean
 * every future edit remembering to write one too. A snapshot cannot fall out of
 * step with what it is undoing.
 *
 * Results are deliberately part of the snapshot. Undoing a move must not
 * resurrect a generation that has since finished, so what is restored is the
 * arrangement as it was *plus* whatever results exist now — see `restore`.
 */

export interface BoardSnapshot {
  items: BoardItem[];
  wires: BoardWire[];
}

/** Deep enough to cover a working session, shallow enough to stay cheap. */
const MAX_DEPTH = 100;

/**
 * Edits closer together than this are treated as one.
 *
 * A drag emits a change per pointer move, and undo that steps back through
 * every frame of a drag is useless. Anything within the same gesture collapses
 * into a single entry.
 */
const COALESCE_MS = 400;

export interface BoardHistory {
  canRedo: boolean;
  canUndo: boolean;
  /** Records the state *before* an edit. Call immediately prior to changing. */
  record: (snapshot: BoardSnapshot) => void;
  redo: (current: BoardSnapshot) => BoardSnapshot | null;
  /** Clears everything — a different board has a different history. */
  reset: () => void;
  undo: (current: BoardSnapshot) => BoardSnapshot | null;
}

export const useBoardHistory = (): BoardHistory => {
  const past = useRef<BoardSnapshot[]>([]);
  const future = useRef<BoardSnapshot[]>([]);
  const lastAt = useRef(0);

  const record = useCallback((snapshot: BoardSnapshot) => {
    const now = Date.now();
    // A new edit invalidates anything that was undone: the timeline has forked,
    // and keeping the old branch would let redo restore something that never
    // followed from what is on screen.
    future.current = [];
    if (now - lastAt.current < COALESCE_MS && past.current.length > 0) {
      lastAt.current = now;
      return;
    }
    lastAt.current = now;
    past.current = [...past.current, snapshot].slice(-MAX_DEPTH);
  }, []);

  const undo = useCallback((current: BoardSnapshot) => {
    const previous = past.current.at(-1);
    if (!previous) {
      return null;
    }
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, current];
    // The gesture that made the last edit is over, so the next one must not
    // coalesce into it.
    lastAt.current = 0;
    return previous;
  }, []);

  const redo = useCallback((current: BoardSnapshot) => {
    const next = future.current.at(-1);
    if (!next) {
      return null;
    }
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, current];
    lastAt.current = 0;
    return next;
  }, []);

  const reset = useCallback(() => {
    past.current = [];
    future.current = [];
    lastAt.current = 0;
  }, []);

  return {
    canRedo: future.current.length > 0,
    canUndo: past.current.length > 0,
    record,
    redo,
    reset,
    undo,
  };
};

/**
 * A snapshot with today's results kept.
 *
 * Undo is for the arrangement, not for the work. Restoring an item wholesale
 * would throw away a generation that finished after the snapshot was taken —
 * paid for, and not what "undo my last drag" means. So geometry and wiring come
 * from the past while `result` and its run state come from the present.
 */
export const restore = (
  snapshot: BoardSnapshot,
  current: BoardItem[]
): BoardSnapshot => {
  const now = new Map(current.map((item) => [item.id, item]));
  return {
    items: snapshot.items.map((item) => {
      const live = now.get(item.id);
      return live
        ? {
            ...item,
            result: live.result,
            runError: live.runError,
            runState: live.runState,
          }
        : item;
    }),
    wires: snapshot.wires,
  };
};
