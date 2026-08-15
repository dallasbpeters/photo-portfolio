export interface PhotoRow {
  alt: string | null;
  category_id: string;
  category_label: string;
  category_slug: string;
  created_at: string | Date;
  exif: unknown;
  height: number | null;
  id: string;
  /** Null on databases where the featured patch has not been applied yet. */
  is_featured: boolean | null;
  /** Null on databases where the publishing patch has not been applied yet. */
  is_published: boolean | null;
  lqip: string | null;
  original_height: number | null;
  original_url: string | null;
  original_width: number | null;
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
  /** True includes this photo in the homepage hero slideshow. */
  isFeatured: boolean;
  /** False hides it from the site while leaving it in the library. */
  isPublished: boolean;
  lqip: string | null;
  order: number;
  /** The pre-edit image, kept so an edit can be undone. Null on untouched photos. */
  originalUrl: string | null;
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
  // Photographs predating the featured column default to false.
  isFeatured: row.is_featured ?? false,
  // Photographs predating the column have no value; they were visible then and
  // must stay visible now.
  isPublished: row.is_published ?? true,
  lqip: row.lqip ?? null,
  order: Number(row.sort_order),
  originalUrl: row.original_url ?? null,
  title: row.title,
  url: row.url,
  width: row.width ?? null,
});

/** The shooting details a photographer may correct by hand. */
export interface IncomingExif {
  aperture?: number;
  exposureTime?: number;
  focalLength?: number;
  iso?: number;
  lens?: string;
  make?: string;
  model?: string;
  takenAt?: string;
}

/** A positive, finite number rounded to `places`, or undefined. */
const positive = (value: unknown, places: number): number | undefined => {
  const n = typeof value === "number" ? value : Number(value);
  if (!(Number.isFinite(n) && n > 0)) {
    return;
  }
  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
};

const shortText = (value: unknown): string | undefined => {
  const s = typeof value === "string" ? value.trim() : "";
  // Matches the width the browser-side reader already truncates to, so a value
  // typed by hand and one read from a file are bounded the same way.
  return s === "" ? undefined : s.slice(0, 120);
};

/**
 * Validates EXIF submitted from the editor.
 *
 * Every field is dropped rather than rejected when it does not make sense — a
 * blanked box means "I do not know this", which is a legitimate state for a
 * scan or a screenshot, and should not fail the whole save. Returns null when
 * nothing usable is left, which clears the column.
 *
 * Rewritten rather than merged into what is already stored: the editor sends
 * the complete set it is showing, so a field the photographer emptied has to
 * come back empty instead of reverting to the value read off the file.
 */
export const parseIncomingExif = (value: unknown): IncomingExif | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;

  const takenAtRaw = typeof raw.takenAt === "string" ? raw.takenAt.trim() : "";
  const takenAtDate = takenAtRaw ? new Date(takenAtRaw) : null;

  const exif: IncomingExif = {
    aperture: positive(raw.aperture, 1),
    exposureTime: positive(raw.exposureTime, 6),
    focalLength: positive(raw.focalLength, 1),
    iso: positive(raw.iso, 0),
    lens: shortText(raw.lens),
    make: shortText(raw.make),
    model: shortText(raw.model),
    takenAt:
      takenAtDate && !Number.isNaN(takenAtDate.getTime())
        ? takenAtDate.toISOString()
        : undefined,
  };

  const kept = Object.fromEntries(
    Object.entries(exif).filter(([, v]) => v !== undefined)
  ) as IncomingExif;

  return Object.keys(kept).length > 0 ? kept : null;
};

/** Columns every photo query needs, kept in one place so they cannot drift. */
export const PHOTO_COLUMNS = `p.id, p.url, p.title, p.sort_order, p.created_at,
  p.alt, p.width, p.height, p.lqip, p.exif, p.is_published, p.is_featured,
  p.original_url, p.original_width, p.original_height,
  c.id AS category_id, c.slug AS category_slug, c.label AS category_label`;
