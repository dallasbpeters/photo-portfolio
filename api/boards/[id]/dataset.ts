import { put } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../../_lib/auth.js";
import { blobToken } from "../../_lib/blobToken.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import { zipSync } from "../../_lib/zip.js";

/**
 * Packs a board's images into one archive, ready to train on.
 *
 * fal's LoRA trainer takes a dataset as a single zip at a public URL, so this
 * is the step between "the references are on a board" and "a model can be
 * trained on them". Assembling it here rather than by hand is the point: the
 * board is already where the images were gathered, deduplicated and judged, and
 * asking someone to download twenty pictures and re-zip them would throw that
 * away.
 *
 * Only images already stored by this app are included. Every one has been
 * through the uploader or persistGenerated, so the bytes are ours and near the
 * function — no third-party host is fetched to build a training set.
 */

/** More than a LoRA needs, and enough that the function stays well inside memory. */
const MAX_IMAGES = 60;

/** Bigger than this and something other than a photograph is being packed. */
const MAX_BYTES_EACH = 12 * 1024 * 1024;

const EXTENSION = /\.([a-z0-9]{2,5})(?:\?|$)/i;

const extensionOf = (url: string): string =>
  url.match(EXTENSION)?.[1]?.toLowerCase() ?? "jpg";

interface ImageRow {
  image_url: string | null;
  photo_url: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return res.status(503).json({ error: "Upload storage is not configured" });
  }

  const raw = req.query.id;
  const boardId = Array.isArray(raw) ? raw[0] : raw;
  if (!boardId) {
    return res.status(400).json({ error: "A board is required" });
  }

  const sql = getSql();
  // Photographs resolve through the join, exactly as the board itself does, so
  // a re-uploaded photograph trains on its current bytes rather than a stale
  // copy.
  const rows = (await sql`
    SELECT i.image_url, p.url AS photo_url
    FROM board_items i
    LEFT JOIN photos p ON p.id = i.photo_id
    WHERE i.board_id = ${boardId}
      AND i.kind IN ('photo', 'reference')
    ORDER BY i.z_index
  `) as ImageRow[];

  const urls = [
    ...new Set(
      rows
        .map((row) => row.photo_url ?? row.image_url)
        .filter((url): url is string => typeof url === "string" && url !== "")
    ),
  ].slice(0, MAX_IMAGES);

  if (urls.length === 0) {
    return res
      .status(400)
      .json({ error: "This board has no images to train on." });
  }

  try {
    // Fetched together: these are our own blobs, and waiting for each in turn
    // would add sixty round trips end to end for no reason.
    const files = await Promise.all(
      urls.map(async (url, index) => {
        const response = await fetch(url);
        if (!response.ok) {
          return null;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > MAX_BYTES_EACH) {
          return null;
        }
        // Numbered rather than named after the original. The trainer reads the
        // archive in order and does not care about names, and an original
        // filename can carry a client's name into a third party's logs.
        return {
          bytes,
          name: `${String(index + 1).padStart(3, "0")}.${extensionOf(url)}`,
        };
      })
    );

    const entries = files.filter((file): file is NonNullable<typeof file> =>
      Boolean(file)
    );
    if (entries.length === 0) {
      return res
        .status(502)
        .json({ error: "None of this board's images could be read." });
    }

    const blob = await put(
      `boards/datasets/${boardId}-${crypto.randomUUID()}.zip`,
      zipSync(entries),
      {
        access: "public",
        contentType: "application/zip",
        token: blobToken(),
      }
    );

    return res.status(200).json({
      count: entries.length,
      // Named as fal names it, so it can be pasted straight into the trainer.
      images_data_url: blob.url,
      skipped: urls.length - entries.length,
    });
  } catch (e) {
    console.error(e);
    return res.status(502).json({
      error: e instanceof Error ? e.message : "Could not build the dataset",
    });
  }
}
