/**
 * Where a port sits on an item, in canvas units.
 *
 * Derived arithmetically from the item's own geometry rather than measured from
 * the DOM. A measured position would need a layout pass after every drag frame
 * and would be wrong for one frame each time — wires visibly lagging behind the
 * node they are attached to. The item already knows its box; the port is a
 * fraction of it.
 *
 * Shared by BoardItemView, which draws the handles, and WireLayer, which draws
 * the curves between them. If these two disagreed by a pixel every wire would
 * float off its handle.
 */

import { inputPortsFor, outputPortsFor } from "../../config/graph.js";
import type { BoardItem } from "../types";

export interface Point {
  x: number;
  y: number;
}

/**
 * Inputs run down the left edge, the single output sits on the right.
 *
 * Evenly spaced by dividing the edge into (count + 1) gaps, so two ports sit at
 * one third and two thirds rather than crowding the corners — and a single port
 * lands exactly halfway up whatever the item's height.
 */
const edgePoint = (
  item: BoardItem,
  side: "in" | "out",
  index: number,
  count: number
): Point => ({
  x: side === "in" ? item.x : item.x + item.width,
  y: item.y + (item.height * (index + 1)) / (count + 1),
});

export const inputPoints = (item: BoardItem): Map<string, Point> => {
  const ports = inputPortsFor(item);
  return new Map(
    ports.map((port, index) => [
      port.key,
      edgePoint(item, "in", index, ports.length),
    ])
  );
};

export const outputPoints = (item: BoardItem): Map<string, Point> => {
  const ports = outputPortsFor(item);
  return new Map(
    ports.map((port, index) => [
      port.key,
      edgePoint(item, "out", index, ports.length),
    ])
  );
};

export const inputPointFor = (item: BoardItem, key: string): Point | null =>
  inputPoints(item).get(key) ?? null;

export const outputPointFor = (item: BoardItem, key: string): Point | null =>
  outputPoints(item).get(key) ?? null;

/**
 * A cubic Bézier with horizontal control points.
 *
 * Horizontal because every port leaves an item sideways, so a curve that starts
 * and ends horizontally reads as a cable rather than a diagonal. The control
 * distance grows with the gap but never shrinks below a floor, or a wire
 * between two touching nodes collapses into a straight line through them.
 */
export const wirePath = (from: Point, to: Point): string => {
  const reach = Math.max(48, Math.abs(to.x - from.x) * 0.5);
  return `M ${from.x} ${from.y} C ${from.x + reach} ${from.y}, ${to.x - reach} ${to.y}, ${to.x} ${to.y}`;
};
