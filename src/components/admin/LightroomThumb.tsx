import { useEffect, useState } from "react";
import { lightroomApi } from "../../services/lightroomService";

/**
 * One Lightroom thumbnail, fetched with the admin's token.
 *
 * An image element cannot send an Authorization header, and every Lightroom
 * route is admin-only — so the bytes are fetched, turned into a blob URL, and
 * handed to an `<img>`. The alternatives were a cookie or a signed URL, each of
 * which is a second way of proving who you are, introduced for thumbnails.
 *
 * Three things keep an album of a hundred from behaving like an album of a
 * hundred:
 *
 *   - nothing is fetched until the tile is near the viewport
 *   - at most a few are in flight at once
 *   - what has been fetched is remembered for the session
 *
 * Without the first two, opening an album fired a request per asset the instant
 * it rendered, and Adobe answers a burst like that with rate limits rather than
 * pictures.
 */

/**
 * Blob URLs by asset id, for the life of the page.
 *
 * Module scope rather than component state so scrolling a tile out of view and
 * back does not refetch, and so leaving an album and returning is free. Never
 * revoked: a revoked URL is a broken image in every tile still pointing at it,
 * and reference-counting object URLs across a grid is a great deal of machinery
 * to reclaim a few hundred kilobytes on a page somebody is about to leave.
 */
const CACHE = new Map<string, string>();

/** Assets known to have no thumbnail, so the 404 is asked for once. */
const ABSENT = new Set<string>();

/**
 * How many fetches may be in flight.
 *
 * Four, because each is a round trip through our API to Adobe and the point is
 * to fill a grid steadily rather than ask for everything at once. A burst is
 * what gets rate-limited, and a rate-limited grid shows nothing at all.
 */
const MAX_IN_FLIGHT = 4;

let inFlight = 0;
const waiting: (() => void)[] = [];

/** Waits for a slot, so the grid drains rather than floods. */
const takeSlot = async (): Promise<void> => {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    waiting.push(resolve);
  });
  inFlight += 1;
};

const releaseSlot = (): void => {
  inFlight -= 1;
  waiting.shift()?.();
};

/**
 * The thumbnail for one asset: cached, queued, fetched.
 *
 * A module function rather than a closure inside the effect. It was inline and
 * the effect became too tangled to read — the cache check, the queue, the fetch
 * and three failure paths in one callback inside an observer inside an effect.
 * Pulling it out here is also what makes it obvious that nothing in it depends
 * on the component.
 *
 * Null means "there is no thumbnail", which covers both a rendition Adobe has
 * not generated and a request that failed: the tile has the same nothing to show
 * either way, and the filename beneath it still identifies the asset.
 */
const loadThumb = async (assetId: string): Promise<string | null> => {
  const cached = CACHE.get(assetId);
  if (cached) {
    return cached;
  }
  if (ABSENT.has(assetId)) {
    return null;
  }
  await takeSlot();
  try {
    const url = await lightroomApi.thumbUrl(assetId);
    if (url) {
      CACHE.set(assetId, url);
      return url;
    }
    ABSENT.add(assetId);
    return null;
  } catch {
    // Not worth a toast: one tile without a picture is not a broken screen.
    ABSENT.add(assetId);
    return null;
  } finally {
    releaseSlot();
  }
};

export interface LightroomThumbProps {
  alt: string;
  assetId: string;
}

export function LightroomThumb({ alt, assetId }: LightroomThumbProps) {
  const [src, setSrc] = useState<string | null>(
    () => CACHE.get(assetId) ?? null
  );
  const [settled, setSettled] = useState(() => ABSENT.has(assetId));
  /*
   * The element as state rather than a ref.
   *
   * An observer needs the node, and a ref's `.current` is not a dependency — so
   * an effect reading it has to guard against a null the type system cannot
   * prove either way. Holding it in state means the effect simply does not run
   * until there is something to observe.
   */
  const [holder, setHolder] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!holder || src || settled) {
      return;
    }
    let alive = true;
    /*
     * Only once it is worth looking at.
     *
     * `rootMargin` starts the fetch a screen early, so a tile is usually filled
     * by the time it is scrolled to rather than popping in afterwards.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        observer.disconnect();
        void loadThumb(assetId).then((url) => {
          if (!alive) {
            return;
          }
          setSrc(url);
          setSettled(true);
        });
      },
      { rootMargin: "300px" }
    );
    observer.observe(holder);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [assetId, holder, src, settled]);

  return (
    <div className="lightroom__thumb" ref={setHolder}>
      {src ? (
        // biome-ignore lint/correctness/useImageSize: the parent fixes a 4:3 box and this fills it at 100%/100% with object-fit, so the space is reserved before the bytes arrive and there is no shift for the rule to prevent — and the real dimensions are unknowable here without decoding the blob
        <img alt={alt} className="lightroom__thumb-image" src={src} />
      ) : (
        // Which state the tile is in: still coming, or never coming. A blank box
        // reads as broken in both cases.
        <span className="lightroom__thumb-empty">{settled ? "—" : "…"}</span>
      )}
    </div>
  );
}
