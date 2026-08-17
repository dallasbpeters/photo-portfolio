import useSWR from "swr";
import { collectionsApi } from "../services/portfolioService";
import type { Collection } from "../types";

/**
 * The collections, shared by everything that reads them.
 *
 * One SWR entry, so the board's save menu, the admin panel and the page editor's
 * picker all draw from the same list — and a collection created in one appears
 * in the others without a refetch. The alternative, a fetch per surface, is
 * three lists that disagree about what exists.
 */

/**
 * Scoped to whether there is a token, like `usePhotos`.
 *
 * Collections are admin-only, so the unauthenticated answer is an error rather
 * than an empty list. Keying on the token means signing in swaps the cache entry
 * instead of leaving a failure cached under the same key.
 */
const collectionsKey = (): readonly [string, boolean] =>
  ["collections", Boolean(localStorage.getItem("cyan_admin_token"))] as const;

export interface UseCollectionsResult {
  collections: Collection[];
  error: unknown;
  isLoading: boolean;
  /** Re-reads the list. Called after a create, a rename or a delete. */
  refresh: () => Promise<unknown>;
}

export const useCollections = (enabled = true): UseCollectionsResult => {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? collectionsKey() : null,
    () => collectionsApi.list(),
    {
      // The library changes when this admin changes it, and every one of those
      // paths refreshes explicitly. Refetching on window focus would just
      // re-download it after each trip to another tab.
      keepPreviousData: true,
      revalidateOnFocus: false,
    }
  );

  return {
    collections: data ?? [],
    error,
    isLoading,
    refresh: () => mutate(),
  };
};
