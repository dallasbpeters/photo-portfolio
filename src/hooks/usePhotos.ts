import useSWR, { mutate as globalMutate } from "swr";
import { authStorage, portfolioService } from "../services/portfolioService";
import type { Photo } from "../types";

/**
 * The photograph library, fetched once and shared by everything that needs it.
 *
 * Before this, the gallery and the admin each held their own copy and kept them
 * in step by dispatching a `cyan-photos-changed` CustomEvent that both listened
 * for. That worked, but it meant two fetches of the same endpoint on any screen
 * showing both, and a hand-rolled cache-invalidation protocol. SWR already
 * dedupes concurrent requests behind one key and shares the result, so the
 * event bus is no longer doing anything the cache does not.
 *
 * The key carries whether a token is present because the endpoint answers
 * differently for an admin (`WHERE ${isAdmin} OR p.is_published`). Signing in or
 * out therefore reads from a different cache entry rather than showing the
 * previous visitor's list until it revalidates.
 */
const photosKey = (): readonly [string, boolean] =>
  ["photos", Boolean(authStorage.getToken())] as const;

/** Refetches the library everywhere it is shown, whatever the auth state. */
export const revalidatePhotos = (): Promise<unknown> =>
  globalMutate((key) => Array.isArray(key) && key[0] === "photos", undefined, {
    revalidate: true,
  });

export interface UsePhotosResult {
  error: Error | undefined;
  isLoading: boolean;
  /**
   * Writes straight to the cache without a refetch.
   *
   * The server has already returned the saved row, so re-reading the whole
   * library to learn what we were just told repaints every card and drops
   * scroll position. Passing `false` for `revalidate` is what keeps a rename
   * from flickering the admin.
   */
  patch: (next: Photo[] | ((current: Photo[]) => Photo[])) => Promise<unknown>;
  photos: Photo[];
  /** Refetch from the server. */
  refresh: () => Promise<unknown>;
}

/**
 * @param enabled Pass false to hold the request — the admin must not fetch
 * before the user is signed in.
 */
export const usePhotos = (enabled = true): UsePhotosResult => {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? photosKey() : null,
    () => portfolioService.getPhotos(),
    {
      // Signing in swaps the cache key. Without this the gallery would blank
      // back to the loading state mid-session rather than showing the list it
      // already has while the admin view loads.
      keepPreviousData: true,
      // The library changes when this admin changes it, and every one of those
      // paths already calls patch() or refresh(). Refetching on every window
      // focus would just re-download it after each trip to another tab.
      revalidateOnFocus: false,
    }
  );

  return {
    error: error as Error | undefined,
    isLoading,
    patch: (next) =>
      mutate(
        (current) => (typeof next === "function" ? next(current ?? []) : next),
        false
      ),
    photos: data ?? [],
    refresh: () => mutate(),
  };
};
