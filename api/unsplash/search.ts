import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { parseJsonBody } from "../_lib/parseBody.js";

const PER_PAGE = 24;

interface UnsplashPhotoJson {
  alt_description?: string | null;
  description?: string | null;
  id: string;
  links?: { html?: string; download_location?: string };
  urls?: { regular?: string; small?: string; thumb?: string };
  user?: { name?: string; username?: string };
}

/**
 * One search result, already reduced to what a board item needs.
 *
 * The credit fields are not decoration: Unsplash's licence requires the
 * photographer be named wherever the photograph appears, so they travel with
 * the result and get stored on the item.
 */
const toResult = (photo: UnsplashPhotoJson) => ({
  altText: photo.description ?? photo.alt_description ?? null,
  creditName: photo.user?.name ?? "Unknown",
  creditUrl: photo.links?.html ?? "https://unsplash.com",
  /** Pinged when the photo is actually used. Required by the API terms. */
  downloadLocation: photo.links?.download_location ?? null,
  id: photo.id,
  imageUrl: photo.urls?.regular ?? "",
  thumbUrl: photo.urls?.small ?? photo.urls?.thumb ?? "",
});

async function handleSearch(
  key: string,
  req: VercelRequest,
  res: VercelResponse
) {
  const raw = req.query.q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  if (!query) {
    return res.status(400).json({ error: "A search term is required" });
  }

  const url = `https://api.unsplash.com/search/photos?per_page=${PER_PAGE}&content_filter=high&query=${encodeURIComponent(query)}`;
  const upstream = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}` },
  });

  if (!upstream.ok) {
    // 403 here is nearly always the hourly rate limit, which is worth naming
    // rather than reporting as a generic failure.
    const reason =
      upstream.status === 403
        ? "Unsplash rate limit reached. Try again shortly."
        : `Unsplash search failed (${upstream.status})`;
    return res.status(502).json({ error: reason });
  }

  const json = (await upstream.json()) as { results?: UnsplashPhotoJson[] };
  const results = (json.results ?? [])
    .map(toResult)
    .filter((r) => r.imageUrl !== "");
  return res.status(200).json({ results });
}

/**
 * Registers a download with Unsplash.
 *
 * Their API terms require this whenever a photo is actually used, as distinct
 * from merely appearing in search results — it is how photographers are
 * credited with usage. Failure is not surfaced: it must never block adding the
 * image to a board.
 */
async function handleTrack(
  key: string,
  req: VercelRequest,
  res: VercelResponse
) {
  const body = parseJsonBody(req.body);
  const location =
    typeof body.downloadLocation === "string" ? body.downloadLocation : "";

  if (location.startsWith("https://api.unsplash.com/")) {
    await fetch(location, {
      headers: { Authorization: `Client-ID ${key}` },
    }).catch(() => undefined);
  }
  return res.status(204).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  // Admin-only: this spends the project's Unsplash quota.
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) {
    return res.status(503).json({
      error: "Unsplash is not configured. Set UNSPLASH_ACCESS_KEY.",
    });
  }

  try {
    if (req.method === "GET") {
      return await handleSearch(key, req, res);
    }
    if (req.method === "POST") {
      return await handleTrack(key, req, res);
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "Could not reach Unsplash" });
  }
}
