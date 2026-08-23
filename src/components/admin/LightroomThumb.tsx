import { useEffect, useRef, useState } from "react";
import { lightroomApi } from "../../services/lightroomService";

/**
 * One Lightroom thumbnail, fetched with the admin's token.
 *
 * An image element cannot send an Authorization header, and every Lightroom
 * route is admin-only — so the bytes are fetched, turned into a blob URL, and
 * handed to an `<img>`. The alternatives were a cookie or a signed URL, each of
 * which is a second way of proving who you are, for thumbnails.
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
 * back does not refetch, and so switching albums and returning is free. Never
 * revoked: a revoked URL is a broken image in every tile still pointing at it,
 * and the alternative — reference counting object URLs across a grid — is a
 * great deal of machinery to reclaim a few hundred kilobytes on a page somebody
 * is about to navigate away from.
 */
const CACHE = new Map<string, string>();

/** Assets known to have no thumbnail, so the 404 is asked for once. */
const ABSENT = new Set<string>();

/**
 * How many fetches may be in flight.
 *
 * Four, because each one is a round trip through our API to Adobe and the point
 * is to fill a grid steadily rather than to ask for everything at once. A burst
 * is what gets rate-limited, and a rate-limited grid shows nothing at all.
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

export interface LightroomThumbProps {
  alt: string;
  assetId: string;
}

export function LightroomThumb({ alt, assetId }: LightroomThumbProps) {
  const [src, setSrc] = useState<string | null>(
    () => CACHE.get(assetId) ?? null
  );
  const [absent, setAbsent] = useState(() => ABSENT.has(assetId));
  const holder = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cached = CACHE.get(assetId);
    if (cached) {
      setSrc(cached);
      return;
    }
    if (ABSENT.has(assetId)) {
      setAbsent(true);
      return;
    }
    const node = holder.current;
    if (!node) {
      return;
    }

    let alive = true;
    /*
     * Only once it is worth looking at.
     *
     * `rootMargin` starts the fetch a screen early so a tile is usually filled
     * by the time it is scrolled to, rather than popping in afterwards.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        observer.disconnect();
        void (async () => {
          await takeSlot();
          try {
            if (!alive) {
              return;
            }
            const url = await lightroomApi.thumbUrl(assetId);
            if (url) {
              CACHE.set(assetId, url);
              if (alive) {
                setSrc(url);
              }
            } else {
              ABSENT.add(assetId);
              if (alive) {
                setAbsent(true);
              }
            }
          } catch {
            // A failed thumbnail is a tile without a picture, not an error
            // worth a toast — the filename below it still identifies the asset.
            ABSENT.add(assetId);
            if (alive) {
              setAbsent(true);
            }
          } finally {
            releaseSlot();
          }
        })();
      },
      { rootMargin: "300px" }
    );
    observer.observe(node);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [assetId]);

  return (
    <div className="lightroom__thumb" ref={holder}>
      {src ? (
        <img alt={alt} className="lightroom__thumb-image" src={src} />
      ) : (
        // A tile that says which state it is in: still coming, or never coming.
        // A blank box reads as broken in both cases.
        <span className="lightroom__thumb-empty">{absent ? "—" : "…"}</span>
      )}
    </div>
  );
}
