import { persistGenerated } from "./persistGenerated.js";

/**
 * An element as it is stored: a style already found, kept for reuse.
 *
 * See db/patches/016_elements.sql for why the pictures are a JSONB array and
 * why the cover is kept beside them rather than assumed to be the first.
 */
export interface ElementRow {
  cover_url: string | null;
  created_at: string;
  description: string | null;
  id: string;
  image_urls: unknown;
  name: string;
  updated_at: string;
}

/** An element as the canvas reads it. */
export interface ElementDto {
  /** The one shown in the panel, and the one a wired element hands over. */
  coverUrl: string | null;
  createdAt: string;
  /** What the pictures have in common, in words. This travels into prompts. */
  description: string | null;
  id: string;
  imageUrls: string[];
  name: string;
  updatedAt: string;
}

/** Stored as JSONB, so what comes back is only as trustworthy as what went in. */
export const imageUrlsOf = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.filter((url): url is string => typeof url === "string")
    : [];

export const rowToElementDto = (row: ElementRow): ElementDto => ({
  coverUrl: row.cover_url,
  createdAt: row.created_at,
  description: row.description,
  id: row.id,
  imageUrls: imageUrlsOf(row.image_urls),
  name: row.name,
  updatedAt: row.updated_at,
});

/** One picture, before and after it became ours. */
export interface AdoptedImage {
  /** The address it was found at, so the caller can match it to its choice. */
  source: string;
  url: string;
}

/**
 * Copies the pictures into storage we own, in the order they were given.
 *
 * An element outlives the board it was found on, which is the whole point of
 * it — so it cannot keep pointing at a Pinterest pin, a signed CDN link that
 * expires, or a board item that may be deleted next week. The bytes have to
 * become ours at the moment the element is made.
 *
 * One picture failing does not fail the element. A style found across six
 * references is still that style with five of them, and refusing the whole save
 * because one address had rotted would throw away work that cannot be redone —
 * the same reasoning that stopped a single vector failing a whole batch. What
 * survived comes back paired with where it came from, so the caller can still
 * find the picture that was chosen as the cover and say how many did not make
 * it.
 */
export const adoptImages = async (urls: string[]): Promise<AdoptedImage[]> => {
  const kept: AdoptedImage[] = [];
  // Sequential on purpose: this is a handful of pictures being fetched from
  // hosts that did not ask to be hammered, and the saving is not the slow part
  // of making an element.
  for (const source of urls) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one at a time, deliberately — see above
      kept.push({ source, url: await persistGenerated(source, "elements") });
    } catch {
      // Dropped, not fatal. The caller compares the counts.
    }
  }
  return kept;
};
