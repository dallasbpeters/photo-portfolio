import { describe, expect, it } from "vitest";
import {
  addMany,
  applyMarquee,
  clear,
  EMPTY_SELECTION,
  hitTest,
  isClickSweep,
  isSelected,
  press,
  reconcile,
  type SelectableItem,
  select,
  selectedItems,
  selectMany,
  soleSelected,
  toggle,
} from "./selectionModel";

/**
 * Items are given ids that say nothing about position, because the whole point
 * is that position in the array is not identity. Reordering the fixtures below
 * must change no answer.
 */
const item = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 100
): SelectableItem => ({ height, id, width, x, y });

/** Three items in a row, 100 wide with 100-unit gaps. */
const board = (): SelectableItem[] => [
  item("photo", 0, 0),
  item("note", 200, 0),
  item("frame", 400, 0),
];

const box = (x1: number, y1: number, x2: number, y2: number) => ({
  from: { x: x1, y: y1 },
  to: { x: x2, y: y2 },
});

const ids = (selection: ReadonlySet<string>): string[] => [...selection].sort();

describe("basic set operations", () => {
  it("selects one, replacing what was there", () => {
    expect(ids(select("note"))).toEqual(["note"]);
    expect(ids(select("frame"))).toEqual(["frame"]);
  });

  it("toggles an item in and back out", () => {
    const one = toggle(EMPTY_SELECTION, "photo");
    expect(isSelected(one, "photo")).toBe(true);
    const two = toggle(one, "note");
    expect(ids(two)).toEqual(["note", "photo"]);
    expect(ids(toggle(two, "photo"))).toEqual(["note"]);
  });

  it("adds many while keeping what was already picked", () => {
    const start = select("photo");
    expect(ids(addMany(start, ["note", "frame"]))).toEqual([
      "frame",
      "note",
      "photo",
    ]);
  });

  it("clears to the shared empty selection", () => {
    expect(clear().size).toBe(0);
    expect(clear()).toBe(EMPTY_SELECTION);
    expect(toggle(select("photo"), "photo")).toBe(EMPTY_SELECTION);
  });

  it("returns the same selection when nothing changed", () => {
    // Identity matters: this lands in React state, and a new Set on every
    // no-op click re-renders every item on the board.
    const start = selectMany(["photo", "note"]);
    expect(addMany(start, ["photo"])).toBe(start);
    expect(press(start, "photo", false)).toBe(start);
  });
});

describe("reconcile — surviving a changed item list", () => {
  it("keeps the same items selected after a reorder", () => {
    const items = board();
    const selection = selectMany(["photo", "frame"]);

    // The exact thing that broke indices: an undo, or a raise-on-drag, hands
    // back the same items in a different order.
    const reordered = [...items].reverse();
    const after = reconcile(selection, reordered);

    expect(ids(after)).toEqual(["frame", "photo"]);
    expect(selectedItems(after, reordered).map((i) => i.id)).toEqual([
      "frame",
      "photo",
    ]);
    // Under indices, [0, 2] on a reversed list would now mean frame and photo
    // only by luck; a shuffle proves it properly.
    const shuffled = [items[1], items[2], items[0]] as SelectableItem[];
    expect(ids(reconcile(selection, shuffled))).toEqual(["frame", "photo"]);
    expect(selectedItems(reconcile(selection, shuffled), shuffled)).toEqual([
      item("frame", 400, 0),
      item("photo", 0, 0),
    ]);
  });

  it("drops a deleted item and leaves the rest selected", () => {
    const items = board();
    const selection = selectMany(["photo", "note", "frame"]);

    const afterDelete = items.filter((i) => i.id !== "note");
    const after = reconcile(selection, afterDelete);

    expect(ids(after)).toEqual(["frame", "photo"]);
    expect(selectedItems(after, afterDelete).map((i) => i.id)).toEqual([
      "photo",
      "frame",
    ]);
  });

  it("empties when every selected item is gone", () => {
    expect(reconcile(selectMany(["photo", "note"]), [])).toBe(EMPTY_SELECTION);
  });

  it("keeps its identity when nothing was dropped", () => {
    const selection = selectMany(["photo", "note"]);
    expect(reconcile(selection, board())).toBe(selection);
    expect(reconcile(selection, [...board()].reverse())).toBe(selection);
  });

  it("does not resurrect an id that comes back", () => {
    const selection = reconcile(select("note"), []);
    expect(reconcile(selection, board()).size).toBe(0);
  });
});

describe("hitTest — overlap, not enclosure", () => {
  it("hits an item the marquee only clips a corner of", () => {
    expect(hitTest(board(), box(-50, -50, 10, 10))).toEqual(["photo"]);
  });

  it("hits an item far larger than the marquee", () => {
    // A sweep entirely inside one big photograph still picks it. Requiring
    // enclosure would make a zoomed-in board impossible to select on.
    const items = [item("wall", 0, 0, 5000, 5000)];
    expect(hitTest(items, box(100, 100, 200, 200))).toEqual(["wall"]);
  });

  it("hits every item a long sweep crosses", () => {
    expect(hitTest(board(), box(50, 50, 450, 60))).toEqual([
      "photo",
      "note",
      "frame",
    ]);
  });

  it("misses items the marquee falls between", () => {
    expect(hitTest(board(), box(110, 10, 190, 90))).toEqual([]);
  });

  it("does not count merely touching an edge as a hit", () => {
    // The sweep stops exactly on the note's left edge.
    expect(hitTest(board(), box(150, 0, 200, 50))).toEqual([]);
  });

  it("reads a marquee swept in any direction", () => {
    const upLeft = hitTest(board(), box(450, 60, 50, 50));
    expect(upLeft).toEqual(["photo", "note", "frame"]);
  });

  it("returns ids in board order, not sweep order", () => {
    const items = [item("frame", 400, 0), item("photo", 0, 0)];
    expect(hitTest(items, box(0, 0, 500, 50))).toEqual(["frame", "photo"]);
  });
});

describe("applyMarquee — additive vs replacing", () => {
  it("replaces the selection without shift", () => {
    const start = selectMany(["frame"]);
    const after = applyMarquee(start, board(), box(-10, -10, 250, 50), false);
    expect(ids(after)).toEqual(["note", "photo"]);
  });

  it("adds to the selection with shift", () => {
    const start = selectMany(["frame"]);
    const after = applyMarquee(start, board(), box(-10, -10, 250, 50), true);
    expect(ids(after)).toEqual(["frame", "note", "photo"]);
  });

  it("treats a sweep under four units as a click that clears", () => {
    const start = selectMany(["photo", "note"]);
    // Pressed and released on top of the photo, with a pixel of tremor.
    const after = applyMarquee(start, board(), box(50, 50, 52, 53), false);
    expect(after.size).toBe(0);
  });

  it("keeps the selection when that click was additive", () => {
    // Shift means "as well as", so it can never be the gesture that clears.
    const start = selectMany(["photo", "note"]);
    const after = applyMarquee(start, board(), box(50, 50, 52, 53), true);
    expect(ids(after)).toEqual(["note", "photo"]);
  });

  it("still selects on a long thin sweep", () => {
    // Only two units tall, but 400 wide: a deliberate gesture across a row.
    expect(isClickSweep(box(0, 50, 450, 52))).toBe(false);
    const after = applyMarquee(
      EMPTY_SELECTION,
      board(),
      box(0, 50, 450, 52),
      false
    );
    expect(ids(after)).toEqual(["frame", "note", "photo"]);
  });

  it("clears when a real sweep touches nothing", () => {
    const start = selectMany(["photo"]);
    const after = applyMarquee(start, board(), box(0, 500, 500, 900), false);
    expect(after).toBe(EMPTY_SELECTION);
  });
});

describe("press — what a pointer down on an item does", () => {
  it("selects an item that was not selected", () => {
    expect(ids(press(selectMany(["photo", "note"]), "frame", false))).toEqual([
      "frame",
    ]);
  });

  it("keeps the whole selection when pressing one of its members", () => {
    // This is what lets a press drag the group rather than scattering it.
    const start = selectMany(["photo", "note"]);
    expect(ids(press(start, "photo", false))).toEqual(["note", "photo"]);
  });

  it("toggles rather than replacing when additive", () => {
    const start = selectMany(["photo"]);
    expect(ids(press(start, "note", true))).toEqual(["note", "photo"]);
    expect(ids(press(selectMany(["photo", "note"]), "note", true))).toEqual([
      "photo",
    ]);
  });
});

describe("soleSelected — what a contextual bar anchors to", () => {
  it("gives the item when exactly one is selected", () => {
    expect(soleSelected(select("note"), board())?.id).toBe("note");
  });

  it("gives null for none or several", () => {
    expect(soleSelected(EMPTY_SELECTION, board())).toBeNull();
    expect(soleSelected(selectMany(["photo", "note"]), board())).toBeNull();
  });

  it("gives null when the selected item has been deleted", () => {
    // The index-keyed version returned whatever slid into that slot, so a bar
    // anchored to it silently retargeted at a neighbour.
    const afterDelete = board().filter((i) => i.id !== "note");
    expect(soleSelected(select("note"), afterDelete)).toBeNull();
  });

  it("follows its item through a reorder", () => {
    const selection = select("photo");
    const reordered = [...board()].reverse();
    expect(soleSelected(selection, reordered)?.x).toBe(0);
    // Index 0 on the reordered list is the frame; the id is not fooled.
    expect(reordered[0]?.id).toBe("frame");
  });
});
