import { hostMatches } from "./httpUrl.js";
import { resolvePublicUrl, type UrlRefusal } from "./publicHost.js";

/**
 * The images on a published Framer page.
 *
 * Framer has a Server API now, but its reference documents nothing for reading
 * a project's assets — so the reliable way to get at published work is to read
 * the published page, which is a normal website. That also means it works for a
 * site on a custom domain, with no key and nothing to configure.
 *
 * The trade is that this only sees what is published. Unpublished work on the
 * Framer canvas is not reachable this way.
 */

/** Where Framer serves uploaded assets, whatever domain the site itself uses. */
const ASSET_HOSTS = ["framerusercontent.com", "framer.media"];

const FETCH_TIMEOUT_MS = 20_000;

/** Enough of a page to find its images without reading a huge bundle. */
const MAX_HTML_BYTES = 4 * 1024 * 1024;

/** How many images one page may contribute. */
const MAX_IMAGES = 120;

export interface FramerImage {
  altText: string | null;
  imageUrl: string;
  thumbUrl: string;
}

export interface FramerPage {
  images: FramerImage[];
  title: string | null;
}

/** Either the page, or why it could not be read. */
export type FramerResult =
  | { ok: true; page: FramerPage }
  | {
      ok: false;
      reason: UrlRefusal | "protected" | "status" | "unreachable";
      status?: number;
    };

const IMG_TAG = /<img\b[^>]*>/gi;
const SRC_ATTR = /\bsrc=["']([^"']+)["']/i;
const SRCSET_ATTR = /\bsrcset=["']([^"']+)["']/i;
const ALT_ATTR = /\balt=["']([^"']*)["']/i;
const TITLE_TAG = /<title[^>]*>([\s\S]*?)<\/title>/i;
const OG_IMAGE = /<meta[^>]+property=["']og:image["'][^>]*>/i;
const CONTENT_ATTR = /\bcontent=["']([^"']+)["']/i;
/** url(...) inside inline styles, which is how Framer paints many backgrounds. */
const CSS_URL = /url\(["']?(https:\/\/[^"')]+)["']?\)/gi;
/** Whitespace between a srcset candidate and its width descriptor. */
const SRCSET_GAP = /\s+/;

/** The largest candidate in a srcset, which is the one worth pinning. */
const fromSrcset = (srcset: string): string | null => {
  const candidates = srcset
    .split(",")
    .map((entry) => {
      const [url = "", size = ""] = entry.trim().split(SRCSET_GAP);
      return {
        url: decodeEntities(url),
        width: Number.parseInt(size, 10) || 0,
      };
    })
    .filter((candidate) => candidate.url.startsWith("https://"));
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((best, candidate) =>
    candidate.width > best.width ? candidate : best
  ).url;
};

/** Entities that survive into an attribute value and break the URL. */
const ENTITIES: Record<string, string> = {
  "&#38;": "&",
  "&#39;": "'",
  "&amp;": "&",
  "&apos;": "'",
  "&quot;": '"',
};
const ENTITY = /&(?:amp|quot|apos|#38|#39);/g;

/**
 * Attribute values arrive HTML-encoded.
 *
 * A Framer image URL carries query parameters, so its ampersands are written
 * `&amp;` in the markup — pinning that verbatim produces a URL with `&amp;` in
 * it, which is a different address and usually a broken picture.
 */
const decodeEntities = (raw: string): string =>
  raw.replace(ENTITY, (match) => ENTITIES[match] ?? match);

/** Extensions worth treating as a picture. */
const IMAGE_EXT = /\.(?:png|jpe?g|webp|avif|gif|svg)(?:\?|$)/i;

/**
 * True for something worth offering as a reference image.
 *
 * Two filters, both needed. The host must be one whose pictures are plausibly
 * this site's own — Framer's asset store, or the page's own domain. Framer's
 * hosts alone was wrong for the common case: a site published to a custom
 * domain may serve its images from that domain, and a site that turns out not
 * to be Framer at all would have offered nothing whatever. And the file must
 * actually be an image: fonts live alongside pictures, and a .woff2 offered as
 * one is just a broken tile.
 */
const isAsset = (raw: string, pageHost: string): boolean => {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      return false;
    }
    // Either Framer's asset store, or the page's own domain — subdomains in
    // both directions, so a site serving from cdn.example.com is covered when
    // the page is example.com and the other way round. Third-party hosts stay
    // out: a page also carries analytics pixels, embeds and advertising, and
    // none of those are the work.
    const isOurs =
      hostMatches(url.hostname, ASSET_HOSTS) ||
      hostMatches(url.hostname, [pageHost]) ||
      hostMatches(pageHost, [url.hostname]);
    if (!isOurs) {
      return false;
    }
    // Framer files its pictures under /images/; the extension check catches
    // anything served from elsewhere.
    return url.pathname.startsWith("/images/") || IMAGE_EXT.test(url.pathname);
  } catch {
    return false;
  }
};

/** Words that mark the landing place as a sign-in page rather than content. */
const LOGIN_PATH = /\/(?:login|signin|sign-in|auth)(?:\/|\?|$)/i;

/**
 * True when the request ended up somewhere other than the site, at a sign-in.
 *
 * Judged on the host changing as well as the path: a page of the site's own
 * called /login is the site's content and perfectly readable, whereas being
 * sent to another domain to sign in means the door was shut.
 */
const isLoginWall = (asked: URL, landed: string): boolean => {
  try {
    const final = new URL(landed);
    return final.hostname !== asked.hostname && LOGIN_PATH.test(final.pathname);
  } catch {
    return false;
  }
};

const textOf = (html: string, pattern: RegExp): string | null => {
  const match = html.match(pattern);
  return match?.[1]?.trim() || null;
};

/**
 * Reads a published Framer page and returns the images it shows.
 *
 * Order is preserved and duplicates dropped, so what comes back reads like the
 * page rather than like a crawl of it — the same asset used in three places is
 * one image, offered once.
 */
export const fetchFramerPage = async (raw: string): Promise<FramerResult> => {
  const resolved = await resolvePublicUrl(raw);
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }
  const { url } = resolved;

  // The request itself decides whether the site exists. The pre-check above
  // only refuses private targets; a name that resolves nowhere fails here, and
  // this is where that can be said accurately.
  let res: Response;
  try {
    res = await fetch(url.href, {
      // A published Framer site is a normal website and will serve a bot the
      // same markup, but some hosts refuse a request with no user agent at all.
      headers: {
        accept: "text/html",
        "user-agent": "Mozilla/5.0 (compatible; moodboard-importer)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (!res.ok) {
    return { ok: false, reason: "status", status: res.status };
  }

  // A site that is not public answers 200 and then bounces to a sign-in page,
  // so success here is not the same as having the content. Framer's staging
  // sites sit behind its own account login; without this the page reads as one
  // with no images on it, which sends you looking for the wrong problem.
  if (isLoginWall(url, res.url)) {
    return { ok: false, reason: "protected" };
  }
  const html = (await res.text()).slice(0, MAX_HTML_BYTES);

  const found = new Map<string, string | null>();
  const remember = (candidate: string | null, alt: string | null) => {
    const imageUrl = candidate ? decodeEntities(candidate) : null;
    if (imageUrl && isAsset(imageUrl, url.hostname) && !found.has(imageUrl)) {
      found.set(imageUrl, alt);
    }
  };

  const og = html.match(OG_IMAGE)?.[0];
  remember(og ? (og.match(CONTENT_ATTR)?.[1] ?? null) : null, null);

  for (const tag of html.match(IMG_TAG) ?? []) {
    const alt = tag.match(ALT_ATTR)?.[1]?.trim() || null;
    const srcset = tag.match(SRCSET_ATTR)?.[1];
    // srcset first: it names the full-size rendition, while src is often the
    // small one the browser would have replaced.
    remember(srcset ? fromSrcset(srcset) : null, alt);
    remember(tag.match(SRC_ATTR)?.[1] ?? null, alt);
  }

  for (const match of html.matchAll(CSS_URL)) {
    remember(match[1] ?? null, null);
  }

  return {
    ok: true,
    page: {
      images: [...found].slice(0, MAX_IMAGES).map(([imageUrl, altText]) => ({
        altText,
        imageUrl,
        thumbUrl: imageUrl,
      })),
      title: textOf(html, TITLE_TAG),
    },
  };
};
