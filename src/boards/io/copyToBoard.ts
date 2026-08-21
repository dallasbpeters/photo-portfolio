import { containedBy } from "../../../config/graph.js";
import type { BoardItem, BoardWire } from "../../types";
import { newItemId } from "./newItemId";

/**
 * A frame and its contents, ready to be written to a board of their own.
 *
 * Ids are reminted rather than carried across. Item ids are owned by the
 * client, and the upsert in api/boards/[id].ts is guarded by `board_id` — so an
 * item arriving on a new board under its existing id updates nothing and is
 * silently dropped. Reminting is also what makes this a copy: the original
 * keeps its ids, and editing one board cannot reach into the other.
 *
 * Wires are rewritten against the new ids, and only those with both endpoints
 * inside the frame survive — a wire to something left behind has nothing to
 * connect to. Results are not copied at all: `result` belongs to the run
 * endpoint and the board save cannot write it, so a generated node arrives on
 * the new board with its settings but without its generations.
 */
export interface FrameCopy {
  items: BoardItem[];
  /** How many wires were dropped for pointing outside the frame. */
  severed: number;
  wires: BoardWire[];
}

/**
 * What a copy would take, without doing it.
 *
 * The menu says how much is about to move and what will not survive, and it has
 * to say so before anything is minted — so the counting lives here rather than
 * being read off a discarded copy.
 */
export const frameSummary = (
  frame: BoardItem,
  items: BoardItem[],
  wires: BoardWire[]
): { count: number; severed: number } => {
  const inside = new Set([
    frame.id,
    ...containedBy(frame, items).map((i) => i.id),
  ]);
  return {
    count: inside.size,
    severed: wires.filter(
      (wire) => inside.has(wire.sourceItemId) !== inside.has(wire.targetItemId)
    ).length,
  };
};

export const copyOfFrame = (
  frame: BoardItem,
  items: BoardItem[],
  wires: BoardWire[]
): FrameCopy => {
  const inside = [frame, ...containedBy(frame, items)];

  const idMap = new Map(inside.map((item) => [item.id, newItemId()]));

  // Moved to the origin so the copy opens where the new board is looking
  // rather than wherever on the old canvas it happened to sit. The offset is
  // the frame's own corner, less a margin, so the arrangement is preserved
  // exactly — only its position changes.
  const MARGIN = 200;
  const dx = frame.x - MARGIN;
  const dy = frame.y - MARGIN;

  const copiedItems = inside.map((item) => ({
    ...item,
    id: idMap.get(item.id) ?? newItemId(),
    // Absent on the new board for the reason given above; spelled out rather
    // than left to the spread so a future field cannot smuggle one across.
    result: null,
    runError: null,
    runState: null,
    x: item.x - dx,
    y: item.y - dy,
  }));

  const kept = wires.filter(
    (wire) => idMap.has(wire.sourceItemId) && idMap.has(wire.targetItemId)
  );

  const copiedWires = kept.map((wire) => ({
    ...wire,
    id: newItemId(),
    sourceItemId: idMap.get(wire.sourceItemId) ?? wire.sourceItemId,
    targetItemId: idMap.get(wire.targetItemId) ?? wire.targetItemId,
  }));

  return {
    items: copiedItems,
    severed: frameSummary(frame, items, wires).severed,
    wires: copiedWires,
  };
};

/** The name a copied frame suggests for its board. */
export const frameBoardTitle = (frame: BoardItem): string =>
  frame.body?.trim() || "Untitled board";
