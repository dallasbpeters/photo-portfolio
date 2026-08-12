import { hostMatches } from "./httpUrl.js";

/**
 * The generation history on the fal account, read back as a library.
 *
 * fal keeps every request made with a key and will list them, which means the
 * work already paid for is browsable rather than lost the moment a page closes.
 * That covers generations made in fal's own playground too, not just the ones
 * this app made — so it is a genuine second source, not a duplicate of what the
 * boards already store.
 *
 * Two things to know about the endpoint. It lives under `rest.alpha.fal.ai`,
 * and "alpha" is not decoration: it is undocumented and may change shape or
 * disappear, so every field is read defensively and a failure here degrades to
 * an empty library rather than an error. And it returns `total: null` and
 * `pages: null`, so there is no count to page against — the only way to know
 * you have reached the end is a page shorter than the one you asked for.
 */

const REQUESTS_URL = "https://rest.alpha.fal.ai/requests/";

/** Where fal serves generated output. Checked before any URL is fetched. */
const MEDIA_HOSTS = ["fal.media", "fal.ai", "fal.run"];

/**
 * How many to ask for at a time.
 *
 * Modest because vector previews travel inline in the response — a page of
 * forty 20KB SVGs is most of a megabyte, and the grid is browsed rather than
 * read straight through.
 */
export const LIBRARY_PAGE_SIZE = 24;

/** How far back the library reaches, in days. */
const DEFAULT_WINDOW_DAYS = 90;

const REQUEST_TIMEOUT_MS = 30_000;

/** Shorter than the listing: one slow preview must not hold up the grid. */
const PREVIEW_TIMEOUT_MS = 8000;

export interface LibraryItem {
  contentType: string | null;
  createdAt: string;
  /** The model that made it, for a label that says where it came from. */
  endpoint: string;
  id: string;
  /**
   * What to actually show in the grid.
   *
   * Usually `url`, but a data URI for vector output. fal serves its SVGs as
   * `application/octet-stream`, and a browser will not render SVG in an <img>
   * without the real type — SVG is the one image format it refuses to sniff,
   * because SVG can carry script. So four fifths of the library rendered as
   * broken pictures despite every byte being present and every request
   * returning 200.
   *
   * Inlined rather than proxied because an <img> cannot send an Authorization
   * header, and this endpoint is admin-only. These files are ~20KB.
   */
  previewUrl: string;
  /** The prompt, when the request had one — the useful caption. */
  prompt: string | null;
  url: string;
}

interface FalFile {
  content_type?: string | null;
  url?: string;
}

interface FalRequest {
  endpoint?: string;
  json_input?: { prompt?: unknown } | null;
  json_output?: { image?: FalFile; images?: FalFile[] } | null;
  request_id?: string;
  request_started_at?: string;
  status_code?: number;
}

/** True for a URL this app is willing to go and fetch. */
export const isFalMediaUrl = (raw: string): boolean => {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && hostMatches(url.hostname, MEDIA_HOSTS);
  } catch {
    return false;
  }
};

/**
 * The output of one request, or null if it produced no image.
 *
 * Both response shapes, for the same reason fal.ts reads both: models that can
 * produce several answer with `images`, single-output ones with `image`.
 */
const outputOf = (entry: FalRequest): FalFile | null => {
  const output = entry.json_output;
  if (!output) {
    return null;
  }
  return output.images?.[0] ?? output.image ?? null;
};

const promptOf = (entry: FalRequest): string | null => {
  const prompt = entry.json_input?.prompt;
  return typeof prompt === "string" && prompt.trim() ? prompt.trim() : null;
};

const toItem = (entry: FalRequest): LibraryItem | null => {
  // Only successes: a failed request has no picture, and listing it would offer
  // something that cannot be added.
  if (entry.status_code !== 200) {
    return null;
  }
  const file = outputOf(entry);
  const url = file?.url;
  if (!(url && isFalMediaUrl(url))) {
    return null;
  }
  return {
    contentType: file?.content_type ?? null,
    createdAt: entry.request_started_at ?? new Date(0).toISOString(),
    endpoint: entry.endpoint ?? "unknown",
    id: entry.request_id ?? url,
    // Replaced with a data URI below for the vector ones. Raster output is
    // served with an honest type and needs nothing.
    previewUrl: url,
    prompt: promptOf(entry),
    url,
  };
};

/** Matches vector output by extension, ignoring any query string. */
const SVG_URL = /\.svg(\?|$)/i;

const isVector = (item: LibraryItem): boolean =>
  SVG_URL.test(item.url) || item.contentType?.includes("svg") === true;

/** Largest vector file worth inlining. Past this the grid pays too much. */
const MAX_INLINE_BYTES = 96 * 1024;

const inlineVector = async (item: LibraryItem): Promise<LibraryItem> => {
  try {
    const res = await fetch(item.url, {
      signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
    });
    if (!res.ok) {
      return item;
    }
    const text = await res.text();
    if (text.length > MAX_INLINE_BYTES) {
      return item;
    }
    // Percent-encoded rather than base64: SVG is text, and base64 would add a
    // third to something already going over the wire.
    return {
      ...item,
      previewUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`,
    };
  } catch {
    // A preview that will not load is not worth failing a page of results for;
    // the tile falls back to the original URL and shows as broken, which is no
    // worse than before.
    return item;
  }
};

/**
 * Gives the vector items something a browser will actually render.
 *
 * All at once: they are small and independent, and doing them in turn would add
 * their latencies together for no benefit.
 */
const withPreviews = (items: LibraryItem[]): Promise<LibraryItem[]> =>
  Promise.all(
    items.map((item) => (isVector(item) ? inlineVector(item) : item))
  );

export interface LibraryPage {
  /** False once fal returns a short page — the only end-of-list signal there is. */
  hasMore: boolean;
  items: LibraryItem[];
}

export const fetchFalLibrary = async (
  key: string,
  page: number,
  windowDays = DEFAULT_WINDOW_DAYS
): Promise<LibraryPage> => {
  const end = new Date();
  const start = new Date(end.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    end_time: end.toISOString(),
    page: String(Math.max(1, page)),
    size: String(LIBRARY_PAGE_SIZE),
    start_time: start.toISOString(),
  });

  const res = await fetch(`${REQUESTS_URL}?${query}`, {
    headers: { Authorization: `Key ${key}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`fal would not list the library (status ${res.status})`);
  }

  const json = (await res.json().catch(() => ({}))) as { items?: FalRequest[] };
  const raw = Array.isArray(json.items) ? json.items : [];
  const items = raw
    .map(toItem)
    .filter((item): item is LibraryItem => item !== null);

  return {
    // Judged on the raw page, not the filtered one: a page of nothing but
    // failures is still a full page, and stopping there would hide everything
    // behind it.
    hasMore: raw.length >= LIBRARY_PAGE_SIZE,
    items: await withPreviews(items),
  };
};
