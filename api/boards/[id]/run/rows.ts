import type { GraphItem, GraphWire } from "../../../../config/graph.js";
import type { BoardItemRow, BoardWireRow } from "../../../_lib/boards.js";

/**
 * Reading a database row as something the graph understands.
 *
 * Small, dull and used by every other module in this directory, which is
 * exactly why it is here rather than repeated in each of them. Nothing in this
 * file makes a decision — it coerces, it shapes, and it stops.
 */

/** JSONB arrives as whatever was stored; a non-object is treated as empty. */
export const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Geometry arrives from the driver as strings often enough to coerce here. */
export const num = (value: number | string): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const toBox = (row: BoardItemRow) => ({
  height: num(row.height),
  id: row.id,
  kind: row.kind,
  width: num(row.width),
  x: num(row.x),
  y: num(row.y),
});

export const toGraphItems = (rows: BoardItemRow[]): GraphItem[] =>
  rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    nodeType: row.node_type ?? null,
  }));

export const toGraphWires = (rows: BoardWireRow[]): GraphWire[] =>
  rows.map((row) => ({
    id: row.id,
    sourceItemId: row.source_item_id,
    sourcePort: row.source_port,
    targetItemId: row.target_item_id,
    targetPort: row.target_port,
  }));
