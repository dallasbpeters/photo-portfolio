import crypto from "node:crypto";
import { getDownloadUrl, put } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../../_lib/auth.js";
import { blobToken } from "../../_lib/blobToken.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import { type ItemRow, urlsFor } from "../../_lib/frameImages.js";
import { parseJsonBody } from "../../_lib/parseBody.js";
import { zipSync } from "../../_lib/zip.js";

/**
 * Everything one node made, or one frame holds, as a single archive.
 *
 * Batch work produces batches: vectorise a frame of twenty stickers and you
 * have twenty SVGs living inside a node, reachable only by clicking through
 * them one at a time. Getting them out was the missing half of being able to
 * make them at once.
 *
 * Zipped on the server rather than in the browser because the files are
 * already ours and already remote — the browser would have to fetch every one
 * back down just to post it up again.
 */

/** A board is bounded, and so is anything on it worth sending in one file. */
const MAX_FILES = 200;

/** Big enough for a full-resolution generation, small enough to stay sane. */
const MAX_BYTES_EACH = 24 * 1024 * 1024;

const EXTENSION = /\.([a-z0-9]+)(?:\?|$)/i;

const extensionOf = (url: string): string =>
  url.match(EXTENSION)?.[1]?.toLowerCase() ?? "png";

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
  const body = parseJsonBody(req.body);
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!(boardId && itemId)) {
    return res.status(400).json({ error: "A board and an item are required" });
  }

  const sql = getSql();
  const rows = (await sql`
    SELECT i.id, i.kind, i.image_url, i.result, i.config,
           i.x, i.y, i.width, i.height, p.url AS photo_url
    FROM board_items i
    LEFT JOIN photos p ON p.id = i.photo_id
    WHERE i.board_id = ${boardId}
  `) as ItemRow[];

  const target = rows.find((row) => row.id === itemId);
  if (!target) {
    return res.status(404).json({ error: "Not found on this board" });
  }

  const urls = [...new Set(urlsFor(target, rows))].slice(0, MAX_FILES);
  if (urls.length === 0) {
    return res.status(400).json({ error: "There is nothing here to export" });
  }

  /*
   * One file is a file, not an archive.
   *
   * Handed back as it stands. The bytes are already ours and already public, so
   * packing them would mean downloading the image, zipping it, and writing a
   * second copy to storage — three round trips and a duplicate blob, to deliver
   * something the browser then has to unpack to get back what it started with.
   *
   * getDownloadUrl sets the attachment disposition, which the `download`
   * attribute cannot do from here: the blob host is a different origin, and a
   * cross-origin `download` is ignored. Without it "Download it" opens a tab.
   */
  if (urls.length === 1 && urls[0]) {
    return res
      .status(200)
      .json({ count: 1, skipped: 0, url: getDownloadUrl(urls[0]) });
  }

  try {
    // Fetched together: they are our own blobs, and waiting for each in turn
    // would add a round trip per file for no reason.
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
        // Numbered so the archive opens in the order the board shows, and
        // padded so a file manager sorts it that way too.
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
      return res.status(502).json({ error: "None of these could be read" });
    }

    const blob = await put(
      `boards/exports/${boardId}-${crypto.randomUUID()}.zip`,
      zipSync(entries),
      {
        access: "public",
        contentType: "application/zip",
        token: blobToken(),
      }
    );

    return res.status(200).json({
      count: entries.length,
      skipped: urls.length - entries.length,
      url: blob.url,
    });
  } catch (e) {
    console.error(e);
    return res.status(502).json({
      error: e instanceof Error ? e.message : "Could not build the archive",
    });
  }
}
