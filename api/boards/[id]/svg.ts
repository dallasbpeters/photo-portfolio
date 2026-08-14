import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../../_lib/auth.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import { parseJsonBody } from "../../_lib/parseBody.js";
import { persistSvgText } from "../../_lib/persistGenerated.js";

/**
 * Writes an edited SVG back onto a node.
 *
 * The write-back half of "Open in Affinity": the local bridge hands the SVG to
 * Affinity and the user edits it there; when it changes, the browser brings the
 * new source back here to be kept. Its own endpoint rather than part of saving
 * the board, because `result` is not the canvas's to write — the same rule the
 * version endpoint exists for. A board save carrying a pre-run copy would
 * otherwise land after an edit and erase it.
 *
 * The edit arrives as a new version in the node's history (never a silent
 * replacement of the one it was made from — the original stays, exactly as a
 * re-run's output does) and the client selects it. `config.selectedVersion` is
 * not touched here: that lives in `config`, which the canvas owns, so the
 * client does the selecting just as it does when a version is removed.
 *
 * Only the bytes and a URL change. `fingerprint` and `ranAt` describe a run,
 * and no run happened — the edit is a rework of what one produced, not a new
 * generation, so neither should be rewritten.
 */

/** Mirrors run.ts's cap so an edit cannot grow history without bound either. */
const MAX_HISTORY = 40;

/** The opening `<svg>` tag, which is where width/height and viewBox live. */
const SVG_TAG = /<svg[\s>]/i;
const ROOT_TAG = /<svg[^>]*>/i;
const WIDTH_ATTR = /\bwidth\s*=\s*["'](\d+(?:\.\d+)?)/i;
const HEIGHT_ATTR = /\bheight\s*=\s*["'](\d+(?:\.\d+)?)/i;
const VIEWBOX_ATTR = /\bviewBox\s*=\s*["']([^"']*)["']/i;
const LEADING_NUMBER = /^\s*(\d+(?:\.\d+)?)/;
const VIEWBOX_SEPARATOR = /[\s,]+/;

/** An SVG's intrinsic size, from its root attributes or falling back to its
 * viewBox. Browsers render a viewBox-only SVG in an <img> as 300×150, which is
 * not the shape a node should claim it is. */
const svgDimensions = (
  svg: string
): { height: number | null; width: number | null } => {
  const root = svg.match(ROOT_TAG)?.[0] ?? "";
  const measure = (raw: string | undefined): number | null => {
    const match = raw?.match(LEADING_NUMBER);
    return match ? Math.round(Number(match[1])) : null;
  };
  const width = measure(root.match(WIDTH_ATTR)?.[1]);
  const height = measure(root.match(HEIGHT_ATTR)?.[1]);
  if (width !== null && height !== null) {
    return { height, width };
  }
  const parts = root
    .match(VIEWBOX_ATTR)?.[1]
    ?.trim()
    .split(VIEWBOX_SEPARATOR)
    .map(Number);
  if (parts && parts.length === 4 && parts.every(Number.isFinite)) {
    return { height: Math.round(parts[3]), width: Math.round(parts[2]) };
  }
  return { height: null, width: null };
};

interface StoredResult {
  history?: { description?: string | null; url?: string }[];
  url?: string;
}

interface Variation {
  description: string | null;
  height: number | null;
  isVector: boolean | null;
  url: string;
  width: number | null;
}

type Sql = ReturnType<typeof getSql>;

const saveFailure = (res: VercelResponse, e: unknown) => {
  console.error(e);
  const message =
    e instanceof Error ? e.message : "Could not save the edited SVG";
  return res.status(502).json({ error: message });
};

/**
 * The edit to a node that already has a result: a new version appended to its
 * history, the original left in place below it — the same rule a re-run's
 * output follows.
 */
const writeVersionEdit = async (
  sql: Sql,
  itemId: string,
  boardId: string,
  svg: string,
  stored: StoredResult
) => {
  const url = await persistSvgText(svg, "boards/svg");
  const size = svgDimensions(svg);
  const edited: Variation = {
    description: null,
    height: size.height,
    isVector: true,
    url,
    width: size.width,
  };

  const history = Array.isArray(stored.history)
    ? (stored.history as Variation[])
    : [];
  const result = {
    ...stored,
    history: [...history, edited].slice(-MAX_HISTORY),
    kind: "image",
  };

  await sql`
    UPDATE board_items
    SET result = ${JSON.stringify(result)}::jsonb
    WHERE id = ${itemId} AND board_id = ${boardId}
  `;

  return result;
};

/**
 * The edit to a reference whose source is the SVG: no history to append to, so
 * the edited file replaces the picture the item shows.
 */
const writeReferenceEdit = async (
  sql: Sql,
  itemId: string,
  boardId: string,
  svg: string
): Promise<string> => {
  const url = await persistSvgText(svg, "boards/svg");
  await sql`
    UPDATE board_items
    SET image_url = ${url}, thumb_url = ${url}
    WHERE id = ${itemId} AND board_id = ${boardId}
  `;
  return url;
};

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

  const raw = req.query.id;
  const boardId = Array.isArray(raw) ? raw[0] : raw;
  const body = parseJsonBody(req.body) as {
    itemId?: unknown;
    svg?: unknown;
  };
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const svg = typeof body.svg === "string" ? body.svg.trim() : "";
  if (!(boardId && itemId)) {
    return res.status(400).json({ error: "An item is required" });
  }
  if (!(svg && SVG_TAG.test(svg.slice(0, 512)))) {
    return res.status(400).json({
      error: "The edit is not an SVG — did it save as something else?",
    });
  }
  if (svg.length > 1_000_000) {
    return res.status(413).json({ error: "That SVG is too large" });
  }

  const sql = getSql();
  const rows = (await sql`
    SELECT result FROM board_items
    WHERE id = ${itemId} AND board_id = ${boardId}
  `) as { result: unknown }[];

  const stored = rows[0]?.result as StoredResult | null;

  try {
    // A node without a result has nothing to append a version to, but a
    // reference whose source is an SVG still deserves the edit: its source is
    // the edited file, so the edit replaces the picture on the board rather
    // than growing a history. The item owns its own source image, the same way
    // the canvas owns its config.
    if (stored) {
      const result = await writeVersionEdit(sql, itemId, boardId, svg, stored);
      return res.status(200).json({ result });
    }
    const imageUrl = await writeReferenceEdit(sql, itemId, boardId, svg);
    return res.status(200).json({ imageUrl });
  } catch (e) {
    return saveFailure(res, e);
  }
}
