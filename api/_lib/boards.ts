/**
 * Shared shapes and validation for moodboards.
 *
 * Item geometry arrives from a canvas the user drags directly, so every number
 * is clamped rather than trusted: a NaN reaching the database would render an
 * item at an unreachable position with no way to select it and drag it back.
 */

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MIN_ITEM_SIZE,
} from "../../config/canvas.js";

export type BoardItemKind = "photo" | "reference" | "note" | "text";

export interface BoardRow {
  cover_url: string | null;
  created_at: string | Date;
  id: string;
  is_public: boolean;
  item_count?: number | string;
  slug: string | null;
  title: string;
  updated_at: string | Date;
}

export interface BoardItemRow {
  body: string | null;
  created_at: string | Date;
  credit_name: string | null;
  credit_url: string | null;
  height: number | string;
  id: string;
  image_url: string | null;
  kind: BoardItemKind;
  photo_id: string | null;
  /** Joined from photos so the canvas can render without a second request. */
  photo_url?: string | null;
  thumb_url: string | null;
  width: number | string;
  x: number | string;
  y: number | string;
  z_index: number | string;
}

export interface BoardItemDto {
  body: string | null;
  creditName: string | null;
  creditUrl: string | null;
  height: number;
  id: string;
  imageUrl: string | null;
  kind: BoardItemKind;
  photoId: string | null;
  thumbUrl: string | null;
  width: number;
  x: number;
  y: number;
  z: number;
}

export interface BoardDto {
  coverUrl: string | null;
  createdAt: string;
  id: string;
  isPublic: boolean;
  /** Present on list responses only. */
  itemCount?: number;
  items?: BoardItemDto[];
  slug: string | null;
  title: string;
  updatedAt: string;
}

const toIso = (value: string | Date): string => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? new Date(0).toISOString()
    : d.toISOString();
};

/** Coerces anything to a finite number, falling back rather than yielding NaN. */
const num = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const rowToItemDto = (row: BoardItemRow): BoardItemDto => ({
  body: row.body,
  creditName: row.credit_name,
  creditUrl: row.credit_url,
  height: num(row.height, 240),
  id: row.id,
  // A photo item resolves its URL through the join, so moving or re-uploading
  // the photograph keeps the board correct instead of pinning a stale copy.
  imageUrl: row.kind === "photo" ? (row.photo_url ?? null) : row.image_url,
  kind: row.kind,
  photoId: row.photo_id,
  thumbUrl: row.thumb_url,
  width: num(row.width, 320),
  x: num(row.x, 0),
  y: num(row.y, 0),
  z: num(row.z_index, 0),
});

export const rowToBoardDto = (
  row: BoardRow,
  items?: BoardItemRow[]
): BoardDto => ({
  coverUrl: row.cover_url,
  createdAt: toIso(row.created_at),
  id: row.id,
  isPublic: row.is_public,
  ...(row.item_count === undefined
    ? {}
    : { itemCount: num(row.item_count, 0) }),
  ...(items === undefined ? {} : { items: items.map(rowToItemDto) }),
  slug: row.slug,
  title: row.title,
  updatedAt: toIso(row.updated_at),
});

export const isBoardItemKind = (value: unknown): value is BoardItemKind =>
  value === "photo" ||
  value === "reference" ||
  value === "note" ||
  value === "text";

/** One item as accepted from the client, already validated and clamped. */
export interface IncomingItem {
  body: string | null;
  creditName: string | null;
  creditUrl: string | null;
  height: number;
  id: string | null;
  imageUrl: string | null;
  kind: BoardItemKind;
  photoId: string | null;
  thumbUrl: string | null;
  width: number;
  x: number;
  y: number;
  z: number;
}

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/**
 * Validates one item from the client.
 *
 * Returns null for anything malformed rather than throwing: a single bad item
 * in a bulk save should be dropped, not cost the user every other edit they
 * made in the same session.
 */
export const parseIncomingItem = (raw: unknown): IncomingItem | null => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (!isBoardItemKind(o.kind)) {
    return null;
  }

  const photoId = typeof o.photoId === "string" ? o.photoId : null;
  const imageUrl = text(o.imageUrl, 2000);
  const body = text(o.body, 2000);

  // Mirrors the CHECK constraint, so a bad item is refused here with the rest
  // of the save intact rather than aborting the whole transaction.
  if (o.kind === "photo" && !photoId) {
    return null;
  }
  if (o.kind === "reference" && !imageUrl) {
    return null;
  }
  // A note and a plain text item both carry their content in `body`.
  if ((o.kind === "note" || o.kind === "text") && !body) {
    return null;
  }

  const width = clamp(num(o.width, 320), MIN_ITEM_SIZE, CANVAS_WIDTH);
  const height = clamp(num(o.height, 240), MIN_ITEM_SIZE, CANVAS_HEIGHT);

  return {
    body,
    creditName: text(o.creditName, 200),
    creditUrl: text(o.creditUrl, 2000),
    height,
    id: typeof o.id === "string" && o.id ? o.id : null,
    imageUrl,
    kind: o.kind,
    photoId,
    thumbUrl: text(o.thumbUrl, 2000),
    width,
    // Keeping the top-left inside the canvas is enough: an item may hang off
    // the right edge, but it can always be grabbed and pulled back.
    x: clamp(num(o.x, 0), 0, CANVAS_WIDTH),
    y: clamp(num(o.y, 0), 0, CANVAS_HEIGHT),
    z: Math.trunc(clamp(num(o.z, 0), -9999, 9999)),
  };
};
