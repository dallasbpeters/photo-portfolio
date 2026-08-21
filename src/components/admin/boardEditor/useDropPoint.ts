import { useCallback, useRef } from "react";
import { findFreeSpot } from "../../../boards/geometry/placement";
import type { BoardItem } from "../../../types";
import { dropOrigin } from "./placement";

/**
 * Where the next thing you add should go.
 *
 * Lifted out of BoardEditor.tsx, which had no room left to grow. Small, but
 * nearly every insert path asks it, so it is worth having in one place with the
 * reason written down.
 *
 * It asks for a genuinely free spot rather than nudging by a counter. The rule
 * this replaced offset by how many items already existed, which said nothing
 * about where any of them were — so anything added to a busy board landed on
 * top of it.
 */
export const useDropPoint = () => {
  /**
   * Filled in by the canvas: the middle of what is currently on screen.
   *
   * A ref rather than state because it changes on every pan frame and nothing
   * renders from it — it is only read at the moment something is inserted.
   */
  const viewCentreRef = useRef<(() => { x: number; y: number }) | null>(null);

  /** Somewhere free for a new item, near where you are looking. */
  const dropPoint = useCallback(
    (
      list: BoardItem[],
      width: number,
      height: number
    ): { x: number; y: number } =>
      findFreeSpot({
        height,
        items: list,
        origin: dropOrigin(list, viewCentreRef.current?.() ?? null),
        width,
      }),
    []
  );

  return { dropPoint, viewCentreRef };
};
