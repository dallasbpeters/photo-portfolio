/**
 * Reading and writing a collection, in the shapes both apps agree on.
 *
 * Kept out of the endpoints because three of them share it — the list, the one,
 * and the items — and because the row-to-DTO mapping is the sort of thing that
 * drifts into three slightly different answers when each handler owns a copy.
 */

/** Longer than a name needs and short enough to render in a card. */
export const MAX_COLLECTION_NAME = 120;
export const MAX_COLLECTION_DESCRIPTION = 600;
/** A title on one item, not prose. */
export const MAX_ITEM_TITLE = 200;

/**
 * How many items one collection may hold.
 *
 * A bound rather than none, because the panel reads a collection whole: the
 * point at which that stops being reasonable is the point at which paging is
 * worth building, and pretending there is no limit until then just means
 * discovering it as a slow request.
 */
export const MAX_COLLECTION_ITEMS = 500;

export interface CollectionRow {
  cover_url: string | null;
  created_at: string | Date;
  description: string | null;
  id: string;
  /** Present on the list query, which counts rather than fetching the items. */
  item_count?: number | string;
  name: string;
  updated_at: string | Date;
}

export interface CollectionItemRow {
  alt: string | null;
  created_at: string | Date;
  height: number | string | null;
  id: string;
  kind: string;
  sort_order: number | string;
  title: string | null;
  url: string;
  width: number | string | null;
}

export interface CollectionItemDto {
  alt: string | null;
  height: number | null;
  id: string;
  kind: "image" | "video";
  title: string | null;
  url: string;
  width: number | null;
}

export interface CollectionDto {
  coverUrl: string | null;
  createdAt: string;
  description: string | null;
  id: string;
  /** Present on list responses; the one-collection response sends items. */
  itemCount?: number;
  items?: CollectionItemDto[];
  name: string;
  updatedAt: string;
}

const toIso = (value: string | Date): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
};

/** A finite positive number, or null. Dimensions are advisory. */
const size = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export const rowToItemDto = (row: CollectionItemRow): CollectionItemDto => ({
  alt: row.alt,
  height: size(row.height),
  id: row.id,
  // Anything that is not exactly "video" is an image, matching the column's
  // default: a row written before the kind existed should render as it always
  // did rather than as a clip that will not play.
  kind: row.kind === "video" ? "video" : "image",
  title: row.title,
  url: row.url,
  width: size(row.width),
});

export const rowToCollectionDto = (
  row: CollectionRow,
  items?: CollectionItemRow[]
): CollectionDto => ({
  // The stored cover, else the first item — so removing the item a cover points
  // at leaves the card showing something rather than a hole.
  coverUrl: row.cover_url ?? items?.[0]?.url ?? null,
  createdAt: toIso(row.created_at),
  description: row.description,
  id: row.id,
  ...(row.item_count === undefined
    ? {}
    : { itemCount: Number(row.item_count) || 0 }),
  ...(items === undefined ? {} : { items: items.map(rowToItemDto) }),
  name: row.name,
  updatedAt: toIso(row.updated_at),
});

/** The kind an incoming item claims to be, narrowed to what the column allows. */
export const itemKind = (value: unknown): "image" | "video" =>
  value === "video" ? "video" : "image";
