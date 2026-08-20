import { useState } from "react";
import type { BoardItem } from "../../../types";

/**
 * Which item is selected, as it is now rather than as it was when clicked.
 *
 * The id is the state; the item is looked up on every render. Holding the item
 * itself is the obvious way and the wrong one: an item captured once is an item
 * frozen once, so editing a setting rewrote the board's items and left the
 * panel holding the version from before the edit. Every field snapped back the
 * instant it was changed, and — worse than a display fault — each write spread
 * that stale config, so changing one setting reverted the one changed before
 * it. Two settings could never both be set.
 *
 * A panel must edit the item it is showing. This is the only arrangement in
 * which what it shows can be trusted.
 */
export interface SelectedItem {
  item: BoardItem | null;
  select: (item: BoardItem | null) => void;
}

export const useSelectedItem = (items: BoardItem[]): SelectedItem => {
  const [id, setId] = useState<string | null>(null);
  return {
    item: id ? (items.find((item) => item.id === id) ?? null) : null,
    select: (item) => setId(item?.id ?? null),
  };
};
