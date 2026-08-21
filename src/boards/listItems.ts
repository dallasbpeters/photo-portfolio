/**
 * The rows of a List node, and the edits that can be made to them.
 *
 * Pure functions over a plain array so the node's editor has nothing to get
 * wrong: every operation returns a new list, and the store is one string with
 * one row per line — the shape every other node setting already uses, and the
 * only shape the save, validation and history path understands without a
 * bespoke case.
 *
 * Blank rows are dropped on the way out but tolerated on the way in. Someone
 * pressing return at the end of a list has not created an item, and a list that
 * silently sent an empty prompt downstream would spend money on nothing.
 */

/** How many rows a list may hold. A list longer than this is a mistake. */
export const MAX_LIST_ITEMS = 200;

const LINES = /\r?\n/;

/** The rows as stored — one per line, blanks removed. */
export const parseItems = (stored: unknown): string[] => {
  if (typeof stored !== "string") {
    return [];
  }
  return stored
    .split(LINES)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);
};

/** Back to the stored form. */
export const joinItems = (items: readonly string[]): string =>
  items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS)
    .join("\n");

export const replaceItem = (
  items: readonly string[],
  index: number,
  next: string
): string[] => items.map((item, i) => (i === index ? next : item));

export const removeItem = (items: readonly string[], index: number): string[] =>
  items.filter((_, i) => i !== index);

export const addItem = (items: readonly string[], text = ""): string[] =>
  items.length >= MAX_LIST_ITEMS ? [...items] : [...items, text];

/**
 * Moves one row by `delta`, clamped to the ends.
 *
 * Clamped rather than wrapped: dragging the first row up should do nothing,
 * where wrapping would send it to the bottom — which reads as a list that
 * reordered itself.
 */
export const moveItem = (
  items: readonly string[],
  index: number,
  delta: number
): string[] => {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(to, 0, moved as string);
  return next;
};

/**
 * The rows a wire is offering.
 *
 * A wired source may hand over one string containing many lines — an Iterate
 * node writes its prompts that way — so each is split before being counted, or
 * "fill from" would add one enormous row instead of fifty.
 */
export const itemsFromWire = (sent: readonly string[]): string[] =>
  sent.flatMap((text) => parseItems(text)).slice(0, MAX_LIST_ITEMS);

/**
 * What a List should do about the wire feeding it.
 *
 * Wiring an Iterate node into a List fills the list with the prompts it wrote —
 * no button, because pressing one is not a decision anybody was making. That
 * only holds while the rows are still the ones the wire put there. The instant
 * three of the fifty have been rewritten by hand, refilling would throw those
 * edits away, and editing them is the entire reason the List node exists.
 *
 * So the last fill is written down beside the rows, and the two are compared:
 * matching means nothing has been touched and the next fill is free, differing
 * means someone has been working and the refill is offered rather than taken.
 * Deleting every row counts as working — an emptied list that instantly refilled
 * itself would be unusable — which falls out of the same comparison rather than
 * needing a case of its own.
 */
export type ListSync =
  | { items: string[]; kind: "fill" }
  | { items: string[]; kind: "offer" }
  | { kind: "none" }
  | { kind: "synced" };

export const listSync = (
  stored: unknown,
  /** What the wire last put here, as written down at the time. */
  lastFilled: unknown,
  wired: readonly string[]
): ListSync => {
  const items = itemsFromWire(wired);
  if (items.length === 0) {
    return { kind: "none" };
  }
  const offered = joinItems(items);
  const current = joinItems(parseItems(stored));
  if (offered === current) {
    return { kind: "synced" };
  }
  // Normalised through the same pair of functions on both sides, so a stored
  // value that merely differs in whitespace does not read as a hand edit.
  const untouched = current === joinItems(parseItems(lastFilled));
  return untouched ? { items, kind: "fill" } : { items, kind: "offer" };
};
