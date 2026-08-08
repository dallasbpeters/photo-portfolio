export interface DailyInspirationPhoto {
  altText: string | null;
  downloadLocation: string | null;
  imageThumbUrl: string;
  imageUrl: string;
  photographerName: string;
  photographerUsername: string;
  unsplashHtmlLink: string;
  unsplashPhotoId: string;
}

interface UnsplashRandomJson {
  alt_description?: string | null;
  description?: string | null;
  id: string;
  links?: { html?: string; download_location?: string };
  urls?: { regular?: string; small?: string; thumb?: string };
  user?: { name?: string; username?: string };
}

const FALLBACK_BY_DAY: DailyInspirationPhoto[] = [
  {
    altText: "Mountain landscape",
    downloadLocation: null,
    imageThumbUrl:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=400&q=80",
    imageUrl:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1600&q=80",
    photographerName: "Yannick Pulver",
    photographerUsername: "yanu",
    unsplashHtmlLink:
      "https://unsplash.com/photos/white-and-black-mountain-snowcap-under-clear-skies-SqE4YLx1Iog",
    unsplashPhotoId: "fallback-0",
  },
  {
    altText: "Forest and mountains",
    downloadLocation: null,
    imageThumbUrl:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=400&q=80",
    imageUrl:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1600&q=80",
    photographerName: "David Marcu",
    photographerUsername: "davidmarcu",
    unsplashHtmlLink:
      "https://unsplash.com/photos/green-pine-trees-on-mountain-range-78A265wPiO4",
    unsplashPhotoId: "fallback-1",
  },
  {
    altText: "Foggy mountains",
    downloadLocation: null,
    imageThumbUrl:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=400&q=80",
    imageUrl:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1600&q=80",
    photographerName: "V2osk",
    photographerUsername: "v2osk",
    unsplashHtmlLink:
      "https://unsplash.com/photos/landscape-photography-of-mountain-hit-by-sun-rays-lVljzGX9BN4",
    unsplashPhotoId: "fallback-2",
  },
];

export const pickFallbackForDate = (utcDate: string): DailyInspirationPhoto => {
  let hash = 0;
  for (let i = 0; i < utcDate.length; i += 1) {
    hash = (hash + utcDate.charCodeAt(i) * (i + 1)) % 997;
  }
  return FALLBACK_BY_DAY[Math.abs(hash) % FALLBACK_BY_DAY.length];
};

const mapJson = (json: UnsplashRandomJson): DailyInspirationPhoto | null => {
  const { id, links, urls, user } = json;
  const regular = urls?.regular;
  if (!(id && regular)) {
    return null;
  }
  return {
    altText: json.description ?? json.alt_description ?? null,
    downloadLocation: links?.download_location ?? null,
    imageThumbUrl: json.urls?.small ?? json.urls?.thumb ?? regular,
    imageUrl: regular,
    photographerName: user?.name ?? "Unknown",
    photographerUsername: user?.username ?? "",
    unsplashHtmlLink: links?.html ?? "https://unsplash.com",
    unsplashPhotoId: id,
  };
};

const randomFallback = (): DailyInspirationPhoto =>
  FALLBACK_BY_DAY[Math.floor(Math.random() * FALLBACK_BY_DAY.length)];

/** `refresh` picks a random fallback when no API key so “new photo” works without Unsplash. */
export const fetchUnsplashDailyPhoto = async (
  mode: "initial" | "refresh" = "initial"
): Promise<DailyInspirationPhoto> => {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  const fallbackNoKey = (): DailyInspirationPhoto =>
    mode === "refresh"
      ? randomFallback()
      : pickFallbackForDate(new Date().toISOString().slice(0, 10));
  if (!key) {
    return fallbackNoKey();
  }

  const url =
    "https://api.unsplash.com/photos/random?orientation=landscape&content_filter=high";
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}` },
  });
  if (!res.ok) {
    const d = new Date().toISOString().slice(0, 10);
    return mode === "refresh" ? randomFallback() : pickFallbackForDate(d);
  }
  const json = (await res.json()) as UnsplashRandomJson;
  const mapped = mapJson(json);
  if (!mapped) {
    const d = new Date().toISOString().slice(0, 10);
    return mode === "refresh" ? randomFallback() : pickFallbackForDate(d);
  }

  if (mapped.downloadLocation) {
    // Unsplash asks that a download be registered when a photo is used. It is
    // a courtesy ping: nothing downstream depends on it, so a failure is
    // swallowed rather than surfaced.
    void fetch(mapped.downloadLocation, {
      headers: { Authorization: `Client-ID ${key}` },
    }).catch(() => undefined);
  }

  return mapped;
};
