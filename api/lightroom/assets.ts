import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { connectionFor } from "../_lib/lightroom.js";
import { fetchCatalogId, listAlbumAssets } from "../_lib/lightroomCatalog.js";
import { isConfigured, loadCredentials } from "../_lib/lightroomConfig.js";

/**
 * What is in one album, one page at a time, with "already imported" marked.
 *
 * The already-imported flag is the reason this is not a straight proxy. An
 * import copies bytes, so without it the picker offers the same fifty pictures
 * every time the album is opened and pressing the button makes duplicates — see
 * the note on lightroom_assets in patch 033.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const albumId =
    typeof req.query.albumId === "string" ? req.query.albumId : "";
  if (!albumId) {
    return res.status(400).json({ error: "An albumId is required" });
  }
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;

  try {
    const sql = getSql();
    if (!isConfigured(await loadCredentials(sql))) {
      return res.status(503).json({ error: "Lightroom is not configured" });
    }
    const connection = await connectionFor(sql, user.userId);
    if (!connection) {
      return res.status(409).json({ error: "Lightroom is not connected" });
    }
    const catalogId =
      connection.catalogId ?? (await fetchCatalogId(connection));
    const page = await listAlbumAssets(connection, catalogId, albumId, cursor);

    // One query for the whole page rather than one per asset.
    const ids = page.assets.map((asset) => asset.id);
    const known =
      ids.length === 0
        ? []
        : ((await sql`
            SELECT asset_id, photo_id FROM lightroom_assets
            WHERE asset_id = ANY(${ids})
          `) as { asset_id: string; photo_id: string | null }[]);
    const byId = new Map(known.map((row) => [row.asset_id, row.photo_id]));

    return res.status(200).json({
      assets: page.assets.map((asset) => ({
        ...asset,
        imported: byId.has(asset.id),
        photoId: byId.get(asset.id) ?? null,
      })),
      next: page.next,
    });
  } catch (e) {
    return res
      .status(502)
      .json({ error: e instanceof Error ? e.message : "Lightroom failed" });
  }
}
