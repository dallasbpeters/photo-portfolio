export interface PhotoRow {
  alt: string | null;
  category_id: string;
  category_label: string;
  category_slug: string;
  created_at: string | Date;
  exif: unknown;
  height: number | null;
  id: string;
  lqip: string | null;
  sort_order: number;
  title: string;
  url: string;
  width: number | null;
}

export interface PhotoDto {
  /** Falls back to the title so an <img> is never left without a description. */
  alt: string;
  category: string;
  categoryId: string;
  categoryLabel: string;
  createdAt: string;
  exif: unknown;
  height: number | null;
  id: string;
  lqip: string | null;
  order: number;
  title: string;
  url: string;
  width: number | null;
}

const toIso = (value: string | Date): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return new Date(0).toISOString();
  }
  return d.toISOString();
};

export const rowToDto = (row: PhotoRow): PhotoDto => ({
  alt: (row.alt ?? "").trim() || row.title,
  category: row.category_slug,
  categoryId: row.category_id,
  categoryLabel: row.category_label,
  createdAt: toIso(row.created_at),
  exif: row.exif ?? null,
  height: row.height ?? null,
  id: row.id,
  lqip: row.lqip ?? null,
  order: Number(row.sort_order),
  title: row.title,
  url: row.url,
  width: row.width ?? null,
});

/** Columns every photo query needs, kept in one place so they cannot drift. */
export const PHOTO_COLUMNS = `p.id, p.url, p.title, p.sort_order, p.created_at,
  p.alt, p.width, p.height, p.lqip, p.exif,
  c.id AS category_id, c.slug AS category_slug, c.label AS category_label`;
