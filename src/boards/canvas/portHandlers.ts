import type { BoardItem } from "../../types";
import type { PortHandlers } from "../BoardItemView";
import { outputPointFor } from "../geometry/portGeometry";

/**
 * What an item needs to take part in a wire drag.
 *
 * Built per item because the drag has to start from *this* item's port, which
 * is the only part of it that is not shared. Lifted out of the render because a
 * fourteen-line object literal inside JSX is a function with the wrong syntax,
 * and BoardCanvas had no room left for it.
 *
 * Absent as a unit on a published board, which has no wiring at all — the
 * caller passes `undefined` rather than a set of handlers that refuse.
 */

export interface WireGesture {
  begin: (
    itemId: string,
    portKey: string,
    point: { x: number; y: number },
    screen: { x: number; y: number }
  ) => void;
  canDropOn: (itemId: string, portKey: string) => boolean;
  enterPort: (itemId: string, portKey: string) => void;
  isDragging: boolean;
  leavePort: (itemId: string, portKey: string) => void;
}

export const portHandlersFor = (
  item: BoardItem,
  wiring: WireGesture,
  /** Stops the viewport re-framing itself under a drag in progress. */
  markUserMoved: () => void
): PortHandlers => ({
  canDropOn: wiring.canDropOn,
  isDragging: wiring.isDragging,
  onPortDown: (itemId, portKey, screen) => {
    const point = outputPointFor(item, portKey);
    if (point) {
      markUserMoved();
      wiring.begin(itemId, portKey, point, screen);
    }
  },
  onPortEnter: wiring.enterPort,
  onPortLeave: wiring.leavePort,
});
