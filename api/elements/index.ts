import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  MAX_ELEMENT_DESCRIPTION,
  MAX_ELEMENT_IMAGES,
  MAX_ELEMENT_NAME,
} from "../../config/elements.js";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import {
  adoptImages,
  type ElementRow,
  rowToElementDto,
} from "../_lib/elements.js";
import { parsePublicHttpUrl, sanitizeText } from "../_lib/httpUrl.js";
import { parseJsonBody } from "../_lib/parseBody.js";

type Sql = ReturnType<typeof getSql>;
type User = ReturnType<typeof getBearerUser>;

async function handleGet(sql: Sql, user: User, res: VercelResponse) {
  // Admin-only, like the board list. An element is a working library rather
  // than anything published, and the panel that reads it is behind the same
  // door.
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const rows = (await sql`
    SELECT id, name, description, cover_url, image_urls, created_at, updated_at
    FROM elements
    ORDER BY updated_at DESC
  `) as ElementRow[];

  return res.status(200).json(rows.map((row) => rowToElementDto(row)));
}

/**
 * The pictures, checked before any of them is fetched.
 *
 * Validated for the same reason the run endpoint validates a wired image: these
 * addresses are handed to a fetcher, so an unchecked one is a request forwarder
 * pointed at whatever the caller likes.
 */
const wantedImages = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const urls: string[] = [];
  for (const value of raw) {
    const url = typeof value === "string" ? parsePublicHttpUrl(value) : null;
    // De-duplicated: the same picture selected twice is one picture, and
    // copying it twice would bill storage for a mistake.
    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls.slice(0, MAX_ELEMENT_IMAGES);
};

async function handlePost(
  sql: Sql,
  user: User,
  req: VercelRequest,
  res: VercelResponse
) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseJsonBody(req.body);
  const name =
    typeof body.name === "string"
      ? sanitizeText(body.name).slice(0, MAX_ELEMENT_NAME)
      : "";
  // Refused rather than defaulted to "Untitled", unlike a board. A board is
  // somewhere you are about to work and can be named later; an element is only
  // ever found again by its name, so an unnamed one is a row nobody will ever
  // pick out of the panel.
  if (!name) {
    return res.status(422).json({ error: "An element needs a name" });
  }

  const wanted = wantedImages(body.imageUrls);
  if (wanted.length === 0) {
    return res
      .status(422)
      .json({ error: "An element needs at least one picture" });
  }

  const description =
    typeof body.description === "string"
      ? body.description.trim().slice(0, MAX_ELEMENT_DESCRIPTION)
      : "";

  const adopted = await adoptImages(wanted);
  if (adopted.length === 0) {
    return res
      .status(502)
      .json({ error: "None of those pictures could be copied" });
  }

  // The chosen cover, matched by where it came from rather than by position:
  // a picture that could not be copied shifts every index after it.
  const wantedCover =
    typeof body.coverUrl === "string"
      ? parsePublicHttpUrl(body.coverUrl)
      : null;
  const cover =
    adopted.find((image) => image.source === wantedCover)?.url ??
    adopted[0].url;

  const urls = adopted.map((image) => image.url);
  const rows = (await sql`
    INSERT INTO elements (name, description, cover_url, image_urls, created_by)
    VALUES (
      ${name},
      ${description || null},
      ${cover},
      ${JSON.stringify(urls)}::jsonb,
      ${user.userId}
    )
    RETURNING id, name, description, cover_url, image_urls, created_at, updated_at
  `) as ElementRow[];

  return res.status(201).json({
    ...rowToElementDto(rows[0]),
    // Never silent about a picture that did not make it: an element that
    // quietly saved four of six references is worse than one that says so.
    dropped: wanted.length - adopted.length,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  const sql = getSql();
  const user = getBearerUser(req.headers.authorization);

  try {
    if (req.method === "GET") {
      return await handleGet(sql, user, res);
    }
    if (req.method === "POST") {
      return await handlePost(sql, user, req, res);
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not load elements" });
  }
}
