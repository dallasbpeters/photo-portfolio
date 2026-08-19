import { describe, expect, it } from "vitest";
import {
  addItem,
  itemsFromWire,
  joinItems,
  MAX_LIST_ITEMS,
  moveItem,
  parseItems,
  removeItem,
  replaceItem,
} from "./listItems";

/**
 * The edits a List node makes to its own rows.
 *
 * Worth pinning because a list is what a run is billed from: an empty row that
 * survives to the graph is a prompt sent to a generator for nothing, and a
 * reorder that wraps instead of clamping looks like the list rearranging itself.
 */

describe("parseItems", () => {
  it("reads one row per line", () => {
    expect(parseItems("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("drops blank rows and trims the rest", () => {
    // Pressing return at the end of a list has not created an item.
    expect(parseItems("  a  \n\n\n b \n   \n")).toEqual(["a", "b"]);
  });

  it("handles carriage returns, which is what a paste often carries", () => {
    expect(parseItems("a\r\nb")).toEqual(["a", "b"]);
  });

  it("is empty for anything that is not a string", () => {
    for (const value of [null, undefined, 7, {}, []]) {
      expect(parseItems(value)).toEqual([]);
    }
  });

  it("stops at the maximum rather than accepting an unbounded paste", () => {
    const many = Array.from({ length: MAX_LIST_ITEMS + 50 }, (_, i) => `p${i}`);
    expect(parseItems(many.join("\n"))).toHaveLength(MAX_LIST_ITEMS);
  });
});

describe("joinItems", () => {
  it("round trips through parseItems", () => {
    const items = ["a chair", "a table", "a lamp"];
    expect(parseItems(joinItems(items))).toEqual(items);
  });

  it("drops blanks on the way out too", () => {
    expect(joinItems(["a", "  ", "", "b"])).toBe("a\nb");
  });
});

describe("replaceItem", () => {
  it("changes one row and leaves the rest", () => {
    expect(replaceItem(["a", "b", "c"], 1, "B")).toEqual(["a", "B", "c"]);
  });

  it("does nothing for an index that is not there", () => {
    expect(replaceItem(["a"], 5, "x")).toEqual(["a"]);
  });

  it("does not mutate the list it was given", () => {
    const items = ["a", "b"];
    replaceItem(items, 0, "z");
    expect(items).toEqual(["a", "b"]);
  });
});

describe("removeItem", () => {
  it("removes the row at the index", () => {
    expect(removeItem(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("removes the right row when two are identical", () => {
    // By position, not by value — deleting the second of two identical prompts
    // must not take the first.
    expect(removeItem(["a", "a", "b"], 1)).toEqual(["a", "b"]);
  });

  it("does nothing for an index that is not there", () => {
    expect(removeItem(["a"], 9)).toEqual(["a"]);
  });
});

describe("addItem", () => {
  it("appends to the end", () => {
    expect(addItem(["a"], "b")).toEqual(["a", "b"]);
  });

  it("appends an empty row to be typed into", () => {
    expect(addItem(["a"])).toEqual(["a", ""]);
  });

  it("refuses to grow past the maximum", () => {
    const full = Array.from({ length: MAX_LIST_ITEMS }, (_, i) => `p${i}`);
    expect(addItem(full, "one more")).toHaveLength(MAX_LIST_ITEMS);
  });
});

describe("moveItem", () => {
  it("moves a row down", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("moves a row up", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("clamps at the ends rather than wrapping", () => {
    // Wrapping would send the first row to the bottom, which reads as the list
    // rearranging itself rather than as the drag doing nothing.
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("does not mutate the list it was given", () => {
    const items = ["a", "b", "c"];
    moveItem(items, 0, 2);
    expect(items).toEqual(["a", "b", "c"]);
  });
});

describe("itemsFromWire", () => {
  it("splits a source that sent many lines as one string", () => {
    // An Iterate node writes its prompts this way; taken whole it would become
    // one enormous row instead of fifty.
    expect(itemsFromWire(["a\nb\nc"])).toEqual(["a", "b", "c"]);
  });

  it("flattens several wires in order", () => {
    expect(itemsFromWire(["a\nb", "c"])).toEqual(["a", "b", "c"]);
  });

  it("is empty when nothing is wired", () => {
    expect(itemsFromWire([])).toEqual([]);
  });
});
