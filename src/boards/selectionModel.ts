/**
 * What is selected on a board, keyed by item id.
 *
 * The canvas held `number[]` of array indices, which is only correct while the
 * item list is frozen. It never is: an undo swaps the whole array, a raise on
 * drag rewrites z and reorders it, a delete shifts every index after the gap.
 * Index 3 then quietly means a different photograph, and anything anchored to
 * the selection — a contextual bar, a group drag, the right-click menu — points
 * at the wrong thing without ever looking wrong enough to notice.
 *
 * An id survives all three, so everything here is keyed by `BoardItem.id` and
 * the item list is passed in only when a caller needs the items themselves.
 *
 * Pure throughout: no React, no DOM, canvas units only. Every operation returns
 * a new selection rather than mutating, and returns the *same* selection object
 * when nothing changed, so a caller storing this in React state does not
 * re-render on a click that picked what was already picked.
 */

/**
 * The selected ids.
 *
 * A set rather than an array because membership is the question asked most —
 * once per item per render, to draw its chrome — and because selecting the same
 * item twice is meaningless. Order is not carried: the useful order is the item
 * list's own (see `selectedItems`), not the order things were clicked in.
 */
export type Selection = ReadonlySet<string>;

/** The empty selection, shared so repeated clears keep the same identity. */
export const EMPTY_SELECTION: Selection = new Set<string>();

/**
 * The part of a `BoardItem` selection cares about.
 *
 * Structural rather than importing `BoardItem`, so hit-testing can be exercised
 * with four numbers and an id instead of the twenty-odd fields an item carries.
 */
export interface SelectableItem {
  height: number;
  id: string;
  width: number;
  x: number;
  y: number;
}

/** A marquee as the canvas has it: where the sweep began and where it is now. */
export interface MarqueeBox {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/** A marquee with its corners sorted, which is what hit-testing wants. */
export interface Bounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/**
 * A sweep smaller than this on both axes was a click, not a selection.
 *
 * In canvas units, deliberately: it is a tolerance for the hand not being
 * perfectly still, and a press-and-release with a pixel of tremor should read
 * as a click at every zoom level.
 */
export const MARQUEE_MIN_SWEEP = 4;

/** Sorts a swept box's corners; a marquee may be dragged in any direction. */
export const boundsOf = (box: MarqueeBox): Bounds => ({
  bottom: Math.max(box.from.y, box.to.y),
  left: Math.min(box.from.x, box.to.x),
  right: Math.max(box.from.x, box.to.x),
  top: Math.min(box.from.y, box.to.y),
});

/**
 * Whether a sweep was really a click.
 *
 * Both axes have to be short. A long thin sweep is a deliberate gesture — it is
 * how a row of items gets picked — so it must not be mistaken for a click.
 */
export const isClickSweep = (box: MarqueeBox): boolean => {
  const b = boundsOf(box);
  return (
    b.right - b.left < MARQUEE_MIN_SWEEP && b.bottom - b.top < MARQUEE_MIN_SWEEP
  );
};

/** Picks exactly one item, replacing whatever was selected. */
export const select = (id: string): Selection => new Set([id]);

/** Picks a set of items outright, replacing whatever was selected. */
export const selectMany = (ids: Iterable<string>): Selection => {
  const next = new Set(ids);
  return next.size === 0 ? EMPTY_SELECTION : next;
};

/** Nothing selected. */
export const clear = (): Selection => EMPTY_SELECTION;

export const isSelected = (selection: Selection, id: string): boolean =>
  selection.has(id);

/**
 * Adds an unselected item or removes a selected one.
 *
 * This is what shift- or cmd-clicking an item does: building a set one item at
 * a time, including changing your mind about one of them.
 */
export const toggle = (selection: Selection, id: string): Selection => {
  const next = new Set(selection);
  if (next.delete(id)) {
    return next.size === 0 ? EMPTY_SELECTION : next;
  }
  next.add(id);
  return next;
};

/** Adds items to the selection, keeping what was already there. */
export const addMany = (
  selection: Selection,
  ids: Iterable<string>
): Selection => {
  const next = new Set(selection);
  for (const id of ids) {
    next.add(id);
  }
  // Unchanged sets are returned as-is: a shift-sweep over already-selected
  // items should not make React think the selection moved.
  return next.size === selection.size ? selection : next;
};

/** Removes items from the selection, leaving the rest. */
export const removeMany = (
  selection: Selection,
  ids: Iterable<string>
): Selection => {
  const next = new Set(selection);
  let removed = false;
  for (const id of ids) {
    removed = next.delete(id) || removed;
  }
  if (!removed) {
    return selection;
  }
  return next.size === 0 ? EMPTY_SELECTION : next;
};

/**
 * Everything a swept rectangle touches, in item order.
 *
 * Touched, not enclosed. Requiring an item to be wholly inside the marquee
 * means sweeping *around* a large photograph rather than across it, which on a
 * zoomed-in board can be impossible without scrolling. The comparisons are
 * strict, so an item merely sharing an edge with the rectangle is not hit — a
 * sweep that stops exactly at a photograph's left edge has not touched it.
 *
 * Returned in the order the items are given so the result reads the same way
 * the board does, bottom of the stack first.
 */
export const hitTest = <T extends SelectableItem>(
  items: readonly T[],
  box: MarqueeBox
): string[] => {
  const { bottom, left, right, top } = boundsOf(box);
  const hit: string[] = [];
  for (const item of items) {
    if (
      item.x < right &&
      item.x + item.width > left &&
      item.y < bottom &&
      item.y + item.height > top
    ) {
      hit.push(item.id);
    }
  }
  return hit;
};

/**
 * The selection a finished marquee leaves behind.
 *
 * `additive` is the shift-sweep: it keeps what was already picked and adds to
 * it. Without shift the sweep replaces the selection outright.
 *
 * A sweep too small to have meant anything clears instead of picking whatever
 * happened to be under the pointer — clicking the background is how you let go
 * of a selection, and it would be maddening if a click on empty canvas grabbed
 * the frame spread underneath the whole board. An additive click keeps the
 * selection: shift means "as well as", so it cannot be a way of clearing.
 */
export const applyMarquee = <T extends SelectableItem>(
  selection: Selection,
  items: readonly T[],
  box: MarqueeBox,
  additive: boolean
): Selection => {
  if (isClickSweep(box)) {
    return additive ? selection : clear();
  }
  const hit = hitTest(items, box);
  return additive ? addMany(selection, hit) : selectMany(hit);
};

/**
 * The selection a press on an item leaves behind.
 *
 * Additive — shift or cmd — toggles that one item and leaves the rest alone.
 *
 * Otherwise: pressing something already selected keeps the whole selection, so
 * the press can drag the set; pressing something outside it selects that one
 * instead. That is what every canvas does, and it is what stops a stray click
 * scattering a carefully built set.
 *
 * Whether the press should begin a drag of one item or of the group is the
 * caller's question, answered by `isSelected` *before* calling this.
 */
export const press = (
  selection: Selection,
  id: string,
  additive: boolean
): Selection => {
  if (additive) {
    return toggle(selection, id);
  }
  return selection.has(id) ? selection : select(id);
};

/**
 * Drops ids that no longer name an item.
 *
 * This is the whole point of keying by id. A delete, an undo, or a board
 * reloaded from the server hands back a different item list, and any id not in
 * it refers to something that no longer exists — while every id that *is* still
 * there keeps pointing at the same item however far it has moved in the array.
 *
 * Reordering therefore changes nothing here, which is the property indices
 * cannot offer at any price.
 */
export const reconcile = <T extends { id: string }>(
  selection: Selection,
  items: readonly T[]
): Selection => {
  if (selection.size === 0) {
    return selection;
  }
  const live = new Set(items.map((item) => item.id));
  const next = new Set<string>();
  for (const id of selection) {
    if (live.has(id)) {
      next.add(id);
    }
  }
  if (next.size === selection.size) {
    // Nothing was dropped, so hand back the original — a reconcile on every
    // item change must not invalidate every memo that depends on selection.
    return selection;
  }
  return next.size === 0 ? EMPTY_SELECTION : next;
};

/**
 * The selected items themselves, in board order.
 *
 * Board order rather than selection order: what a caller does with these —
 * group them into a frame, copy them, move them — reads off the stack, not off
 * the order they happened to be clicked in.
 */
export const selectedItems = <T extends SelectableItem>(
  selection: Selection,
  items: readonly T[]
): T[] => {
  if (selection.size === 0) {
    return [];
  }
  return items.filter((item) => selection.has(item.id));
};

/**
 * The lone selected item, or null.
 *
 * Anything anchored to a selection — the contextual bar, the toolbar that edits
 * one thing — needs a single subject, and with two items picked there is no
 * single item its controls could mean. Null too when the one selected id names
 * something that has since been deleted, which is the case the index-keyed
 * version got wrong: it returned whatever had slid into that slot.
 */
export const soleSelected = <T extends SelectableItem>(
  selection: Selection,
  items: readonly T[]
): T | null => {
  if (selection.size !== 1) {
    return null;
  }
  const [id] = selection;
  return items.find((item) => item.id === id) ?? null;
};
