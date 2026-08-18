import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../../../../config/canvas.js";
import type { BoardItem } from "../../../types";

/**
 * Where a new item lands, and what it starts out holding.
 *
 * Lifted out of BoardEditor.tsx, which had no room left to grow: none of this
 * needs React, and a placement rule is easier to trust when it is not buried
 * two thousand lines into a component.
 *
 * Three doc comments in the original had drifted off the declarations they
 * described — one about "where the next item goes" was sitting above a spacing
 * constant. They are reattached here rather than carried across still wrong,
 * since a comment moved into a new file and left pointing at the wrong thing
 * reads as a mistake made during the move.
 */

/** How far a port-created node sits from the thing feeding it, in canvas units. */
export const PORT_SPAWN_GAP = 120;

/** Offset between images dropped together, so they do not land in one pile. */
export const DROP_FAN = 28;

/**
 * Where something arriving without a position should look for room.
 *
 * Callers pair this with a free-spot search rather than nudging by a counter:
 * the rule this replaced offset by how many items existed, which said nothing
 * about where any of them were, so anything added to a busy board landed on
 * top of it.
 *
 * The middle of what is already on the board, not the middle of the canvas.
 * The canvas is far larger than any one board fills, so its centre is usually
 * empty space a long way from the work — and since the view frames the items
 * rather than the canvas, an item dropped there lands off screen and reads as
 * nothing having happened. Only an empty board falls back to the canvas centre,
 * which is where an empty board is already looking.
 */
export const dropOrigin = (
  items: BoardItem[],
  /** The middle of what is on screen, when the canvas has reported it. */
  inView: { x: number; y: number } | null
): { x: number; y: number } => {
  // Where you are looking, first. The canvas is far larger than the screen, so
  // an item placed at the middle of the *board* lands off screen on any board
  // that has been panned — which reads as the insert having done nothing.
  if (inView) {
    return inView;
  }
  if (items.length === 0) {
    return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  }
  const xs = items.map((item) => item.x + item.width / 2);
  const ys = items.map((item) => item.y + item.height / 2);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
};

/**
 * Throws away any rendered composite.
 *
 * A composite is a picture of the arrangement, so *any* edit can invalidate it.
 * Working out which ones actually mattered would be a dependency graph over
 * geometry, and getting it subtly wrong means a node quietly showing
 * yesterday's layout. Clearing always costs one render and cannot be wrong.
 */
export const dropComposites = (list: BoardItem[]): BoardItem[] =>
  list.map((item) =>
    item.nodeType === "composite" &&
    typeof item.config?.compositeUrl === "string"
      ? { ...item, config: { ...item.config, compositeUrl: null } }
      : item
  );

/**
 * The fields every item carries whatever its kind, all empty. Spread first and
 * overridden, so adding a field to BoardItem is not four identical edits.
 */
export const BLANK_ITEM = {
  body: null,
  config: null,
  creditName: null,
  creditUrl: null,
  fontSize: null,
  imageUrl: null,
  nodeType: null,
  photoId: null,
  result: null,
  runError: null,
  runState: null,
  thumbUrl: null,
} satisfies Partial<BoardItem>;
