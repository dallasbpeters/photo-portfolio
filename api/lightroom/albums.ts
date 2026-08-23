import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { connectionFor } from "../_lib/lightroom.js";
import { fetchCatalogId, listAlbums } from "../_lib/lightroomCatalog.js";
import { isConfigured, loadCredentials } from "../_lib/lightroomConfig.js";

/** The albums in the connected catalogue, as a flat list with parent ids. */
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

  try {
    const sql = getSql();
    if (!isConfigured(await loadCredentials(sql))) {
      return res.status(503).json({ error: "Lightroom is not configured" });
    }
    const connection = await connectionFor(sql, user.userId);
    if (!connection) {
      return res.status(409).json({ error: "Lightroom is not connected" });
    }
    // Cached at connect time; looked up now if that call had failed.
    const catalogId =
      connection.catalogId ?? (await fetchCatalogId(connection));
    const albums = await listAlbums(connection, catalogId);
    return res.status(200).json({ albums, catalogId });
  } catch (e) {
    return res
      .status(502)
      .json({ error: e instanceof Error ? e.message : "Lightroom failed" });
  }
}
