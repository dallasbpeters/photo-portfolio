import { describe, expect, it } from "vitest";
import {
  GROUP_PADDING,
  type GroupItem,
  groupBounds,
  groupIdsOf,
  hasNewerVersion,
  versionLabel,
} from "./recipeGroup";

const item = (over: Partial<GroupItem> & { id: string }): GroupItem => ({
  height: 100,
  recipeUseId: "use-1",
  width: 100,
  x: 0,
  y: 0,
  ...over,
});

describe("groupBounds", () => {
  it("boxes a single item with padding on every side", () => {
    const bounds = groupBounds([item({ id: "a", x: 500, y: 300 })], "use-1");
    expect(bounds).toEqual({
      height: 100 + GROUP_PADDING * 2,
      width: 100 + GROUP_PADDING * 2,
      x: 500 - GROUP_PADDING,
      y: 300 - GROUP_PADDING,
    });
  });

  it("spans every member of the group", () => {
    const items = [
      item({ id: "a", x: 100, y: 100 }),
      item({ id: "b", x: 400, y: 250 }),
    ];
    const bounds = groupBounds(items, "use-1", 0);
    expect(bounds).toEqual({ height: 250, width: 400, x: 100, y: 100 });
  });

  it("follows a member dragged away from the cluster", () => {
    // The outline is computed, never stored — dragging one node out must widen
    // the box rather than leave it behind.
    const items = [
      item({ id: "a", x: 0, y: 0 }),
      item({ id: "b", x: 2000, y: 0 }),
    ];
    const bounds = groupBounds(items, "use-1", 0);
    expect(bounds?.width).toBe(2100);
  });

  it("ignores items belonging to another group or to none", () => {
    const items = [
      item({ id: "a", x: 0, y: 0 }),
      item({ id: "b", recipeUseId: "use-2", x: 5000, y: 5000 }),
      item({ id: "c", recipeUseId: null, x: 9000, y: 9000 }),
    ];
    const bounds = groupBounds(items, "use-1", 0);
    expect(bounds).toEqual({ height: 100, width: 100, x: 0, y: 0 });
  });

  it("returns null when nothing carries the id, rather than a zero box", () => {
    expect(groupBounds([item({ id: "a" })], "use-missing")).toBeNull();
    expect(groupBounds([], "use-1")).toBeNull();
  });
});

describe("groupIdsOf", () => {
  it("lists each id once, in first-seen order", () => {
    const items = [
      item({ id: "a", recipeUseId: "b-use" }),
      item({ id: "b", recipeUseId: "a-use" }),
      item({ id: "c", recipeUseId: "b-use" }),
    ];
    expect(groupIdsOf(items)).toEqual(["b-use", "a-use"]);
  });

  it("skips items with no group", () => {
    const items = [
      item({ id: "a", recipeUseId: null }),
      item({ id: "b", recipeUseId: undefined }),
      item({ id: "c", recipeUseId: "" }),
    ];
    expect(groupIdsOf(items)).toEqual([]);
  });
});

describe("hasNewerVersion", () => {
  it("is true only when the library has moved past this board", () => {
    expect(hasNewerVersion({ latestVersion: 5, pinnedVersion: 3 })).toBe(true);
    expect(hasNewerVersion({ latestVersion: 3, pinnedVersion: 3 })).toBe(false);
  });

  it("is false for a deleted recipe — it works, it just cannot upgrade", () => {
    expect(hasNewerVersion({ latestVersion: null, pinnedVersion: 3 })).toBe(
      false
    );
  });

  it("is false when the board is somehow ahead, rather than offering a downgrade", () => {
    expect(hasNewerVersion({ latestVersion: 2, pinnedVersion: 3 })).toBe(false);
  });
});

describe("versionLabel", () => {
  it("distinguishes all three states", () => {
    expect(versionLabel({ latestVersion: 3, pinnedVersion: 3 })).toBe("v3");
    expect(versionLabel({ latestVersion: 5, pinnedVersion: 3 })).toBe(
      "v3 · v5 available"
    );
    expect(versionLabel({ latestVersion: null, pinnedVersion: 3 })).toBe(
      "v3 · recipe deleted"
    );
  });
});
