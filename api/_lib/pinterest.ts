/**
 * Reading Pinterest through the surfaces it publishes for other sites.
 *
 * Three of them, all public and all intended to be read: a board's RSS feed,
 * the oEmbed endpoint for a single pin, and the OpenGraph tags a pin page
 * carries so it can be shared. None of this scrapes the rendered application or
 * touches a private API — that would break Pinterest's terms and would break
 * again every time their markup changed.
 *
 * Shared by api/pinterest/pin.ts and api/pinterest/board.ts, which are thin
 * handlers over this.
 */

import { hostMatches, sanitizeText } from "./httpUrl.js";

/**
 * Hosts this will fetch from.
 *
 * The whole point of the check: a caller supplies a URL and the *server* goes
 * and gets it, so without an allowlist these endpoints are an open proxy into
 * anything the function can reach, including the platform's own metadata
 * service. parsePublicHttpUrl is not enough on its own — it happily accepts
 * http://169.254.169.254/.
 */
const ALLOWED_HOSTS = [
  "pinterest.com",
  "pin.it",
  "pinterest.at",
  "pinterest.ca",
  "pinterest.ch",
  "pinterest.cl",
  "pinterest.co.uk",
  "pinterest.com.au",
  "pinterest.de",
  "pinterest.dk",
  "pinterest.es",
  "pinterest.fr",
  "pinterest.ie",
  "pinterest.it",
  "pinterest.jp",
  "pinterest.kr",
  "pinterest.mx",
  "pinterest.nz",
  "pinterest.ph",
  "pinterest.pt",
  "pinterest.ru",
  "pinterest.se",
];

/** Where pin images are actually served from. */
const IMAGE_HOSTS = ["pinimg.com"];

const HTTP_SCHEME = /^https?:\/\//i;

/** Pinterest encodes the rendition in the path: /236x/, /736x/, /originals/. */
const PIN_SIZE_SEGMENT = /\/(?:\d+x\d*|originals)\//;

/**
 * The rendition a board item gets.
 *
 * Not `originals`: those run to several megabytes each, and a board of two
 * dozen hot-linked pins would pull tens of megabytes every time it opened.
 * 736px is sharp enough for a 480-unit item on the canvas and roughly forty
 * times smaller.
 */
const DISPLAY_SIZE = "736x";

/** The small rendition RSS hands back, kept as the thumbnail. */
export const upgradeSize = (url: string): string =>
  url.replace(PIN_SIZE_SEGMENT, `/${DISPLAY_SIZE}/`);

/** A Pinterest URL we are willing to fetch, or null. */
export const parsePinterestUrl = (raw: string): URL | null => {
  const trimmed = sanitizeText(raw);
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(
      HTTP_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`
    );
    if (url.protocol !== "https:") {
      return null;
    }
    // Credentials in the URL are never legitimate here and would be forwarded.
    if (url.username || url.password) {
      return null;
    }
    return hostMatches(url.hostname, ALLOWED_HOSTS) ? url : null;
  } catch {
    return null;
  }
};

/** An image URL a pin points at, checked before it is handed onward. */
export const parseImageUrl = (
  raw: string | null | undefined
): string | null => {
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      return null;
    }
    return hostMatches(url.hostname, [...IMAGE_HOSTS, ...ALLOWED_HOSTS])
      ? url.href
      : null;
  } catch {
    return null;
  }
};

export interface PinResult {
  altText: string | null;
  /** Whose pin this is, when Pinterest says. */
  creditName: string | null;
  /** Always the pin itself, so a board can link back to where this came from. */
  creditUrl: string;
  imageUrl: string;
  thumbUrl: string | null;
}

const FETCH_TIMEOUT_MS = 12_000;

/**
 * A browser-ish user agent.
 *
 * Not evasion: Pinterest serves OpenGraph tags to share previews and returns a
 * bare shell to clients it does not recognise, so without this the fallback
 * path finds nothing to read.
 */
const UA =
  "Mozilla/5.0 (compatible; MoodboardBot/1.0; +https://pinterest.com/oembed)";

export const fetchText = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
};

interface OEmbed {
  author_name?: string;
  thumbnail_url?: string;
  title?: string;
}

/** Pinterest's own oEmbed endpoint — the documented way to embed a pin. */
export const fromOEmbed = async (pin: URL): Promise<PinResult | null> => {
  const body = await fetchText(
    `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(pin.href)}`
  );
  if (!body) {
    return null;
  }
  let json: OEmbed;
  try {
    json = JSON.parse(body) as OEmbed;
  } catch {
    return null;
  }
  const image = parseImageUrl(json.thumbnail_url);
  if (!image) {
    return null;
  }
  return {
    altText: json.title?.trim() || null,
    creditName: json.author_name?.trim() || null,
    creditUrl: pin.href,
    imageUrl: upgradeSize(image),
    thumbUrl: image,
  };
};

const META_TAG = /<meta[^>]+>/gi;
const PROPERTY_ATTR = /\bproperty\s*=\s*["']([^"']*)["']/i;
const NAME_ATTR = /\bname\s*=\s*["']([^"']*)["']/i;
const CONTENT_ATTR = /\bcontent\s*=\s*["']([^"']*)["']/i;

const attr = (tag: string, pattern: RegExp): string | null =>
  tag.match(pattern)?.[1] ?? null;

/** The OpenGraph tags a pin page carries so it can be shared. */
export const fromOpenGraph = async (pin: URL): Promise<PinResult | null> => {
  const html = await fetchText(pin.href);
  if (!html) {
    return null;
  }

  const meta: Record<string, string | undefined> = {};
  for (const tag of html.match(META_TAG) ?? []) {
    const key = attr(tag, PROPERTY_ATTR) ?? attr(tag, NAME_ATTR);
    const content = attr(tag, CONTENT_ATTR);
    if (key && content) {
      meta[key.toLowerCase()] = content;
    }
  }

  const image = parseImageUrl(meta["og:image"]);
  if (!image) {
    return null;
  }
  return {
    altText: meta["og:description"] ?? meta["og:title"] ?? null,
    creditName: meta["article:author"] ?? null,
    creditUrl: pin.href,
    imageUrl: upgradeSize(image),
    thumbUrl: image,
  };
};

const RSS_ITEM = /<item>([\s\S]*?)<\/item>/gi;
/** A trailing slash 301s to a .rss URL that does not exist. */
const TRAILING_SLASHES = /\/+$/;
const RSS_TITLE = /<title>([\s\S]*?)<\/title>/i;
const RSS_LINK = /<link>([\s\S]*?)<\/link>/i;
/** The description is escaped HTML holding an anchor round an img. */
const RSS_IMG = /&lt;img src=&quot;([^&]*)&quot;/i;

const unescapeXml = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

export interface BoardResult {
  pins: PinResult[];
  title: string | null;
}

/**
 * Every pin a board's RSS feed lists.
 *
 * This is the one public surface that returns a whole board rather than one
 * pin. It is a feed, so it carries a page of the most recent pins — a couple of
 * dozen — not the entire history. Reading beyond that needs OAuth and a
 * Pinterest-reviewed app.
 */
export const fromBoardRss = async (board: URL): Promise<BoardResult | null> => {
  // Pinterest serves the feed at <board>.rss. A trailing slash 301s to a URL
  // that does not exist, so it is trimmed first.
  const base = board.href.replace(TRAILING_SLASHES, "");
  const xml = await fetchText(`${base}.rss`);
  if (!xml) {
    return null;
  }

  // The channel title, taken before the items so an <item><title> cannot win.
  const channel = xml.split("<item>")[0] ?? "";
  const title = channel.match(RSS_TITLE)?.[1];

  const pins: PinResult[] = [];
  for (const [, block] of xml.matchAll(RSS_ITEM)) {
    const link = block.match(RSS_LINK)?.[1]?.trim();
    const rawImage = block.match(RSS_IMG)?.[1];
    const image = parseImageUrl(rawImage ? unescapeXml(rawImage) : null);
    if (!(link && image)) {
      continue;
    }
    pins.push({
      altText: unescapeXml(block.match(RSS_TITLE)?.[1] ?? "") || null,
      // The feed names the board, not the pinner. The link is the provenance
      // that matters, and it is always present.
      creditName: null,
      creditUrl: link,
      imageUrl: upgradeSize(image),
      thumbUrl: image,
    });
  }

  return pins.length > 0
    ? { pins, title: title ? unescapeXml(title) : null }
    : null;
};
