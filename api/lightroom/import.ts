import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  LIGHTROOM_IMPORT_MAX,
  LIGHTROOM_IMPORT_RENDITION,
} from "../../config/lightroom.js";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { connectionFor, type LightroomConnection } from "../_lib/lightroom.js";
import {
  fetchCatalogId,
  fetchRendition,
  requestRendition,
} from "../_lib/lightroomCatalog.js";
import { isLightroomConfigured } from "../_lib/lightroomEnv.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import { persistBytes } from "../_lib/persistGenerated.js";

/**
 * Copies chosen Lightroom assets into the photo library.
 *
 * A copy, not a link: the bytes are downloaded from Adobe and stored in our own
 * blob host, because a Lightroom rendition URL is signed and short-lived and a
 * portfolio cannot hold a photograph that stops loading next week. That is also
 * what makes the lightroom_assets record necessary — see patch 033.
 *
 * **One asset failing does not fail the import.** Twenty pictures chosen and
 * nineteen copied is nineteen pictures somebody now has; refusing the whole
 * batch because one rendition was missing would throw away work that has to be
 * redone by hand. The same reasoning `adoptImages` applies to elements. What
 * failed comes back named, so the panel can say which and offer to retry.
 */

type Sql = ReturnType<typeof getSql>;

/**
 * An asset as the panel sends it: the id, plus the metadata it already listed.
 *
 * Sent back rather than re-fetched per asset. The panel has just read all of it
 * from the album listing, and asking Adobe again — once per picture, inside a
 * loop that is already doing two transfers each — would double the round trips
 * to learn nothing new. Every field is optional and validated here anyway,
 * because it has come from a client.
 */
interface IncomingAsset {
  camera?: string | null;
  captureDate?: string | null;
  fileName?: string | null;
  height?: number | null;
  id: string;
  width?: number | null;
}

interface ImportOutcome {
  assetId: string;
  error?: string;
  photoId?: string;
  /** True when this asset had already been imported and was left alone. */
  skipped?: boolean;
}

/**
 * How long to wait for Adobe to generate a rendition that does not exist yet.
 *
 * A rendition is made on demand: the first request for a size nobody has asked
 * for answers 404, and a POST asks for it. Two seconds is enough for a JPEG
 * derivative in practice, and this is deliberately one attempt rather than a
 * poll loop — a whole album of ungenerated renditions would otherwise sit here
 * until the function is killed, and the honest answer in that case is "some of
 * these are not ready, press it again".
 */
const RENDITION_WAIT_MS = 2000;

/** The trailing `.jpg` of a Lightroom filename, which is not part of a title. */
const FILE_EXTENSION = /\.[^.]+$/;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** The bytes for one asset, asking Adobe to make the rendition if it must. */
const renditionBytes = async (
  connection: LightroomConnection,
  catalogId: string,
  assetId: string
): Promise<{ bytes: ArrayBuffer; contentType: string }> => {
  let found = await fetchRendition(
    connection,
    catalogId,
    assetId,
    LIGHTROOM_IMPORT_RENDITION
  );

  if (found === "absent") {
    await requestRendition(
      connection,
      catalogId,
      assetId,
      LIGHTROOM_IMPORT_RENDITION
    );
    await sleep(RENDITION_WAIT_MS);
    found = await fetchRendition(
      connection,
      catalogId,
      assetId,
      LIGHTROOM_IMPORT_RENDITION
    );
  }

  if (found === "absent") {
    throw new Error(
      "Lightroom is still generating this size — try again in a moment"
    );
  }
  return {
    bytes: found.bytes,
    // Renditions are JPEG; the header is trusted only if it names an image, for
    // the reason persistGenerated gives about octet-stream.
    contentType: found.contentType?.startsWith("image/")
      ? found.contentType
      : "image/jpeg",
  };
};

/** Copies one asset, and records that it has been copied. */
const importOne = async (
  sql: Sql,
  connection: LightroomConnection,
  catalogId: string,
  userId: string,
  categoryId: string,
  asset: IncomingAsset
): Promise<ImportOutcome> => {
  /*
   * Claim the asset before spending a download on it.
   *
   * ON CONFLICT DO NOTHING against the primary key, so two requests racing on
   * the same album cannot both import it — the loser sees no inserted row and
   * skips. Cheaper and more reliable than checking first and inserting after,
   * which has a window between the two.
   */
  const claimed = (await sql`
    INSERT INTO lightroom_assets (asset_id, catalog_id, direction, rendition)
    VALUES (${asset.id}, ${catalogId}, 'import', ${LIGHTROOM_IMPORT_RENDITION})
    ON CONFLICT (asset_id) DO NOTHING
    RETURNING asset_id
  `) as { asset_id: string }[];
  if (claimed.length === 0) {
    return { assetId: asset.id, skipped: true };
  }

  try {
    const { bytes, contentType } = await renditionBytes(
      connection,
      catalogId,
      asset.id
    );
    const url = await persistBytes(bytes, "photos/lightroom", contentType);

    // The filename without its extension, which is what a photographer named
    // it. Falling back to the asset id rather than to "Untitled" so two
    // unnamed imports do not collide in a list.
    const title =
      asset.fileName?.replace(FILE_EXTENSION, "") ??
      `Lightroom ${asset.id.slice(0, 8)}`;

    // Kept rather than discarded: the capture date and camera are the two
    // things a photograph loses when it is exported and re-uploaded by hand,
    // and they are exactly what a portfolio wants to sort and caption by.
    const exif = JSON.stringify({
      camera: asset.camera ?? null,
      captureDate: asset.captureDate ?? null,
      lightroomAssetId: asset.id,
      source: "lightroom",
    });

    const inserted = (await sql`
      INSERT INTO photos
        (url, title, category_id, sort_order, created_by, width, height, exif)
      VALUES (
        ${url}, ${title}, ${categoryId}, 0, ${userId},
        ${asset.width ?? null}, ${asset.height ?? null}, ${exif}::jsonb
      )
      RETURNING id
    `) as { id: string }[];

    const photoId = inserted[0]?.id;
    if (!photoId) {
      throw new Error("The photograph could not be stored");
    }
    await sql`
      UPDATE lightroom_assets SET photo_id = ${photoId}
      WHERE asset_id = ${asset.id}
    `;
    return { assetId: asset.id, photoId };
  } catch (e) {
    /*
     * Release the claim, so a failure is retryable.
     *
     * Without this a rendition that was merely not ready yet would be recorded
     * as imported for good, and the picture would be permanently missing with
     * the panel insisting it had already been fetched.
     */
    await sql`
      DELETE FROM lightroom_assets
      WHERE asset_id = ${asset.id} AND photo_id IS NULL
    `;
    return {
      assetId: asset.id,
      error: e instanceof Error ? e.message : "Import failed",
    };
  }
};

/** The chosen assets, bounded and with every field checked. */
const readAssets = (raw: unknown): IncomingAsset[] => {
  const str = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value : null;
  const num = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.round(value)
      : null;

  return (Array.isArray(raw) ? raw : [])
    .map((entry): IncomingAsset | null => {
      const asset = (entry ?? {}) as Record<string, unknown>;
      const id = str(asset.id);
      return id
        ? {
            camera: str(asset.camera),
            captureDate: str(asset.captureDate),
            fileName: str(asset.fileName),
            height: num(asset.height),
            id,
            width: num(asset.width),
          }
        : null;
    })
    .filter((asset): asset is IncomingAsset => asset !== null)
    .slice(0, LIGHTROOM_IMPORT_MAX);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!isLightroomConfigured()) {
    return res.status(503).json({ error: "Lightroom is not configured" });
  }

  const body = parseJsonBody(req.body) as {
    assets?: unknown;
    categoryId?: string;
  };
  const { categoryId } = body;
  if (typeof categoryId !== "string" || !categoryId) {
    // photos.category_id is NOT NULL with a foreign key, so there is no
    // sensible default to invent here — the panel picks one.
    return res.status(400).json({ error: "A categoryId is required" });
  }
  const assets = readAssets(body.assets);
  if (assets.length === 0) {
    return res.status(400).json({ error: "No assets were chosen" });
  }

  try {
    const sql = getSql();
    const connection = await connectionFor(sql, user.userId);
    if (!connection) {
      return res.status(409).json({ error: "Lightroom is not connected" });
    }
    const catalogId =
      connection.catalogId ?? (await fetchCatalogId(connection));

    // Sequential on purpose, and a chained promise rather than a loop because
    // each step is a download from Adobe and an upload to blob storage; a fleet
    // of those fired at once is how a rate limit is found, and the same choice
    // `adoptImages` makes. Order is preserved, so `outcomes` reads in the order
    // the panel sent the assets.
    const outcomes: ImportOutcome[] = [];
    await assets.reduce(
      (earlier, asset) =>
        earlier.then(async () => {
          outcomes.push(
            await importOne(
              sql,
              connection,
              catalogId,
              user.userId,
              categoryId,
              asset as Parameters<typeof importOne>[5]
            )
          );
        }),
      Promise.resolve()
    );

    return res.status(200).json({
      failed: outcomes.filter((outcome) => outcome.error),
      imported: outcomes.filter((outcome) => outcome.photoId).length,
      outcomes,
      skipped: outcomes.filter((outcome) => outcome.skipped).length,
    });
  } catch (e) {
    return res
      .status(502)
      .json({ error: e instanceof Error ? e.message : "Import failed" });
  }
}
