import { useSyncExternalStore } from "react";

/**
 * Whether the reader has asked for less movement.
 *
 * `useSyncExternalStore` rather than an effect and a piece of state: the media
 * query is external, already has a subscribe/read shape, and reading it during
 * render avoids the frame where a page autoplays and then stops — which is
 * worse than either answer given honestly.
 *
 * The server snapshot is `false`, so markup rendered without a window matches
 * the common case and hydration does not have to correct it. Someone with the
 * setting on gets one correction rather than everyone getting none.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void): (() => void) => {
  const media = window.matchMedia?.(QUERY);
  if (!media) {
    return () => {
      /* nothing to unsubscribe from */
    };
  }
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const read = (): boolean => window.matchMedia?.(QUERY).matches ?? false;

export const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, read, () => false);
