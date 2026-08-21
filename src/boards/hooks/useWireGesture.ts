import { useCallback, useState } from "react";
import { checkWire, type GraphItem } from "../../../config/graph.js";
import type { BoardItem, BoardWire } from "../../types";
import type { Point } from "../geometry/portGeometry";
import { newItemId } from "../io/newItemId";

/**
 * How far the pointer may travel and still count as a click.
 *
 * Screen pixels, because it is about the hand rather than the board: the same
 * small wobble whether the canvas is fitted to the window or magnified.
 */
const CLICK_SLOP_PX = 4;

/** Where a wire drag started: an output port on a particular item. */
interface Origin {
  itemId: string;
  point: Point;
  portKey: string;
  /** Where the press landed on screen, so a click can be told from a drag. */
  screen: Point;
}

/** The input port the pointer is currently over, if any. */
export interface DropTarget {
  itemId: string;
  portKey: string;
}

interface UseWireGestureArgs {
  items: BoardItem[];
  onConnect: (wire: BoardWire) => void;
  wires: BoardWire[];
}

const toGraphItems = (items: BoardItem[]): GraphItem[] =>
  items.map((item) => ({
    id: item.id,
    kind: item.kind,
    nodeType: item.nodeType,
  }));

/**
 * Dragging a wire from an output port to an input port.
 *
 * Validity is decided while the pointer moves, not when it is released, and
 * through the same `checkWire` the API uses on save. Two consequences worth
 * having: the refusal is visible during the drag rather than as a surprise
 * afterwards, and a wire that can be drawn is always a wire that can be saved
 * and run — there is no second opinion for the two to disagree about.
 */
export function useWireGesture({
  items,
  onConnect,
  wires,
}: UseWireGestureArgs) {
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);

  const isDragging = origin !== null;

  /**
   * Whether the wire being dragged could land on this input.
   *
   * Called per candidate port while the pointer moves, so it has to be cheap;
   * at 300 items and 600 wires the whole check is a handful of map lookups and
   * one walk of the graph, which is nothing at pointer rates.
   */
  const canDropOn = useCallback(
    (itemId: string, portKey: string): boolean => {
      if (!origin) {
        return false;
      }
      return checkWire(toGraphItems(items), wires, {
        sourceItemId: origin.itemId,
        sourcePort: origin.portKey,
        targetItemId: itemId,
        targetPort: portKey,
      }).ok;
    },
    [items, origin, wires]
  );

  const begin = useCallback(
    (itemId: string, portKey: string, point: Point, screen: Point) => {
      setOrigin({ itemId, point, portKey, screen });
      setPointer(point);
      setTarget(null);
    },
    []
  );

  const moveTo = useCallback((point: Point) => setPointer(point), []);

  const enterPort = useCallback(
    (itemId: string, portKey: string) => setTarget({ itemId, portKey }),
    []
  );

  const leavePort = useCallback(
    (itemId: string, portKey: string) =>
      setTarget((current) =>
        current?.itemId === itemId && current.portKey === portKey
          ? null
          : current
      ),
    []
  );

  /**
   * Ends the drag, connecting if it landed somewhere valid.
   *
   * Releasing over nothing simply cancels. That is the right default for a
   * gesture people abandon halfway through all the time.
   */
  /**
   * Ends the drag.
   *
   * Returns the origin when the pointer never really moved and landed on
   * nothing — that is a click, not an abandoned drag, and the canvas answers it
   * with a menu of what to create next.
   */
  const end = useCallback(
    (screen?: Point): Origin | null => {
      let clicked: Origin | null = null;
      if (origin && !target && screen) {
        const moved =
          Math.abs(screen.x - origin.screen.x) +
          Math.abs(screen.y - origin.screen.y);
        if (moved < CLICK_SLOP_PX) {
          clicked = origin;
        }
      }
      if (origin && target && canDropOn(target.itemId, target.portKey)) {
        onConnect({
          id: newItemId(),
          sourceItemId: origin.itemId,
          sourcePort: origin.portKey,
          targetItemId: target.itemId,
          targetPort: target.portKey,
        });
      }
      setOrigin(null);
      setPointer(null);
      setTarget(null);
      return clicked;
    },
    [canDropOn, onConnect, origin, target]
  );

  const cancel = useCallback(() => {
    setOrigin(null);
    setPointer(null);
    setTarget(null);
  }, []);

  const draft =
    origin && pointer
      ? {
          from: origin.point,
          isValid: target
            ? canDropOn(target.itemId, target.portKey)
            : // Not over a port yet, so nothing has been refused. Drawn as
              // valid rather than invalid: a wire in mid-air is undecided.
              true,
          to: pointer,
        }
      : null;

  return {
    begin,
    cancel,
    canDropOn,
    draft,
    end,
    enterPort,
    isDragging,
    leavePort,
    moveTo,
    origin,
  };
}
