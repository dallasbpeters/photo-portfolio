import useSWR from "swr";
import { brandKitsApi } from "../services/brandKitService";
import { authStorage } from "../services/portfolioService";

/**
 * The brand kits, shared by everything that reads them.
 *
 * Keyed on whether there is a token, like `usePhotos` and `useCollections`:
 * kits are admin-only, so the unauthenticated answer is an error rather than an
 * empty list, and signing in has to swap the cache entry instead of leaving a
 * failure cached under the same key.
 */
const kitsKey = (): readonly [string, boolean] =>
  ["brand-kits", Boolean(authStorage.getToken())] as const;

export const useBrandKits = () => {
  const { data, error, isLoading, mutate } = useSWR(kitsKey, () =>
    brandKitsApi.list()
  );
  return {
    error,
    isLoading,
    kits: data ?? [],
    refresh: mutate,
  };
};
