export type PhotoRow = {
  id: string;
  url: string;
  title: string;
  sort_order: number;
  created_at: string | Date;
  category_id: string;
  category_slug: string;
  category_label: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  lqip: string | null;
  exif: unknown;
};

export type PhotoDto = {
  id: string;
  url: string;
  title: string;
  categoryId: string;
  category: string;
  categoryLabel: string;
  order: number;
  createdAt: string;
  /** Falls back to the title so an <img> is never left without a description. */
  alt: string;
  width: number | null;
  height: number | null;
  lqip: string | null;
  exif: unknown;
};

const toIso = (value: string | Date): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date(0).toISOString();
  return d.toISOString();
};

export const rowToDto = (row: PhotoRow): PhotoDto => ({
  id: row.id,
  url: row.url,
  title: row.title,
  categoryId: row.category_id,
  category: row.category_slug,
  categoryLabel: row.category_label,
  order: Number(row.sort_order),
  createdAt: toIso(row.created_at),
  alt: (row.alt ?? '').trim() || row.title,
  width: row.width ?? null,
  height: row.height ?? null,
  lqip: row.lqip ?? null,
  exif: row.exif ?? null,
});

/** Columns every photo query needs, kept in one place so they cannot drift. */
export const PHOTO_COLUMNS = `p.id, p.url, p.title, p.sort_order, p.created_at,
  p.alt, p.width, p.height, p.lqip, p.exif,
  c.id AS category_id, c.slug AS category_slug, c.label AS category_label`;
