import type { VercelRequest, VercelResponse } from "@vercel/node";
import { LIGHTROOM_THUMB_RENDITION } from "../../config/lightroom.js";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { connectionFor } from "../_lib/lightroom.js";
import { fetchCatalogId, fetchRendition } from "../_lib/lightroomCatalog.js";
import { isConfigured, loadCredentials } from "../_lib/lightroomConfig.js";

/**
 * One asset's thumbnail, fetched with our credentials and handed to the browser.
 *
 * The picker first shipped without thumbnails on the reasoning that a rendition
 * needs both the bearer token and the API key, so it cannot be the `src` of an
 * image element. That much is true and it was still the wrong conclusion: a
 * picker for choosing *photographs* is close to useless as a list of filenames.
 * The answer is to proxy them.
 *
 * Small deliberately — the 640 rendition, not the full one — because this is a
 * grid and the point is to recognise a picture, not to inspect it. An import
 * pulls a much larger rendition; see LIGHTROOM_IMPORT_RENDITION.
 *
 * **Cached hard, and it has to be.** An album of a hundred assets is a hundred
 * authenticated round trips through here, each of which is a second round trip
 * to Adobe. `max-age` on a private cache means scrolling back up, reopening an
 * album, or returning tomorrow costs nothing — a Lightroom rendition does not
 * change unless the photograph is edited, and an edit changes the asset's own
 * version rather than silently replacing these bytes.
 */

/** A day. Long enough to make browsing free, short enough that an edit lands. */
const CACHE_SECONDS = 86_400;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  /*
   * Admin-only, like every other Lightroom route.
   *
   * Which is why this is fetched with `fetch` and turned into a blob URL rather
   * than set as an `<img src>`: an image element cannot send an Authorization
   * header, and the alternatives — a cookie, or a signed URL — would each be a
   * second way of proving who you are, for thumbnails.
   */
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const assetId =
    typeof req.query.assetId === "string" ? req.query.assetId : "";
  if (!assetId) {
    return res.status(400).json({ error: "An assetId is required" });
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
    const catalogId =
      connection.catalogId ?? (await fetchCatalogId(connection));

    const found = await fetchRendition(
      connection,
      catalogId,
      assetId,
      LIGHTROOM_THUMB_RENDITION
    );
    if (found === "absent") {
      /*
       * Not generated yet, and deliberately not generated here.
       *
       * Asking Adobe to render a thumbnail costs a POST and a wait, and a grid
       * that did that for every unseen asset would spend a minute drawing one
       * screen. The tile shows a placeholder; the import path does generate on
       * demand, because there it is one picture somebody has chosen.
       */
      return res.status(404).json({ error: "No thumbnail yet" });
    }

    res.setHeader("Content-Type", found.contentType ?? "image/jpeg");
    // Private: this passed through an admin's credentials and must not sit in a
    // shared cache. Immutable is deliberate — see the note at the top.
    res.setHeader(
      "Cache-Control",
      `private, max-age=${CACHE_SECONDS}, immutable`
    );
    return res.status(200).send(Buffer.from(found.bytes));
  } catch (e) {
    return res
      .status(502)
      .json({ error: e instanceof Error ? e.message : "Lightroom failed" });
  }
}
