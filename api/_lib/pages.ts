/**
 * Shared shapes and validation for editorial pages.
 *
 * Slugs are also route segments, so they are validated rather than trusted:
 * a slug colliding with an existing route would shadow the admin.
 */

export type PageStatus = 'draft' | 'published';

export type PageRow = {
  id: string;
  slug: string;
  title: string;
  icon: string | null;
  content: unknown;
  status: PageStatus;
  sort_order: number;
  created_at: string | Date;
  updated_at: string | Date;
};

export type PageDto = {
  id: string;
  slug: string;
  title: string;
  icon: string | null;
  content: unknown;
  status: PageStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
};

/** Summary used by the public nav — no body, so the payload stays small. */
export type PageSummaryDto = Pick<PageDto, 'id' | 'slug' | 'title' | 'icon' | 'order'>;

const toIso = (value: string | Date): string => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
};

export const rowToDto = (row: PageRow): PageDto => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  icon: row.icon,
  content: row.content,
  status: row.status,
  order: Number(row.sort_order),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const rowToSummary = (row: PageRow): PageSummaryDto => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  icon: row.icon,
  order: Number(row.sort_order),
});

/**
 * Top-level paths the SPA already owns. A page may not take one of these, or it
 * would make the admin or the reset flow unreachable.
 */
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'reset-password',
  'sites',
  'assets',
  'manifest',
  'favicon',
  'robots',
  'sitemap',
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugCheck = { ok: true; slug: string } | { ok: false; error: string };

export const normalizeSlug = (raw: unknown): SlugCheck => {
  const slug = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!slug) return { ok: false, error: 'A page address is required.' };
  if (slug.length > 60) return { ok: false, error: 'Page address must be 60 characters or fewer.' };
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error: 'Page address may use lowercase letters, numbers and single hyphens only.',
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: `"${slug}" is reserved by the site and cannot be used.` };
  }
  return { ok: true, slug };
};

/** Derives a slug from a title, for the "create" form's default. */
export const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export const isPageStatus = (value: unknown): value is PageStatus =>
  value === 'draft' || value === 'published';

/**
 * Structural check on the editor document.
 *
 * Deliberately shallow: the body is rendered by walking the node tree and
 * emitting known node types, so an unrecognised node is ignored at render time
 * rather than needing an exhaustive schema here. What matters is that this is a
 * document object at all, not a string of markup.
 */
export const isEditorDoc = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  (value as { type?: unknown }).type === 'doc' &&
  Array.isArray((value as { content?: unknown }).content);
