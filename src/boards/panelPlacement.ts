/**
 * Which side of an item a panel anchored to it sits on.
 *
 * Its own module, like anchorBar and resizeBox, because "does it flip below
 * when the item is near the top" is a question worth answering in a test rather
 * than by dragging something to the top of a real board.
 */

/** Screen pixels between the item's edge and the panel. */
export const PANEL_GAP = 10;

/** How close to the top of the viewport the panel may sit. */
export const PANEL_MARGIN = 8;

export type PanelPlacement = "above" | "below";

/**
 * Which side of the item the panel sits on.
 *
 * Above by default, below only when above would be off the top of the window —
 * the same rule and the same reasoning as anchorBar: a panel below an item
 * covers whatever the item is sitting on, which on a moodboard is usually the
 * thing being compared against, so it flips only when flipping is the
 * difference between visible and not.
 *
 * Deliberately not clamped into the viewport instead. A panel that detaches
 * from its item and slides along the top edge stops saying which item it edits,
 * and that it says so is the whole reason it moved onto the item.
 */
export const placePanel = (
  /** The item's top edge, in screen pixels from the top of the window. */
  itemTop: number,
  /** The panel's height on screen — it never scales with the zoom. */
  panelHeight: number
): PanelPlacement =>
  itemTop - panelHeight - PANEL_GAP >= PANEL_MARGIN ? "above" : "below";
