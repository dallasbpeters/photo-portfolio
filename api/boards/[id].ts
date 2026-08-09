import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import {
  type BoardItemRow,
  type BoardRow,
  type IncomingItem,
  parseIncomingItem,
  rowToBoardDto,
} from "../_lib/boards.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { sanitizeText } from "../_lib/httpUrl.js";
import { parseJsonBody } from "../_lib/parseBody.js";

type Sql = ReturnType<typeof getSql>;
type User = ReturnType<typeof getBearerUser>;

/** Guards a runaway client; a moodboard this size is already unusable. */
const MAX_ITEMS = 300;

const loadItems = async (
  sql: Sql,
  boardId: string
): Promise<BoardItemRow[]> => {
  const rows = (await sql`
    SELECT i.id, i.kind, i.photo_id, i.image_url, i.thumb_url,
           i.credit_name, i.credit_url, i.body, i.font_size,
           i.x, i.y, i.width, i.height, i.z_index, i.created_at,
           p.url AS photo_url
    FROM board_items i
    LEFT JOIN photos p ON p.id = i.photo_id
    WHERE i.board_id = ${boardId}
    ORDER BY i.z_index ASC, i.created_at ASC
  `) as BoardItemRow[];

  return rows;
};

async function handleGet(
  sql: Sql,
  user: User,
  id: string,
  res: VercelResponse
) {
  const rows = (await sql`
    SELECT id, title, cover_url, is_public, slug, created_at, updated_at
    FROM boards WHERE id = ${id} LIMIT 1
  `) as BoardRow[];

  const [board] = rows;
  if (!board) {
    return res.status(404).json({ error: "Board not found" });
  }
  // A private board is only visible to a signed-in admin. Published boards are
  // readable by anyone, which is what publishing means.
  if (!(board.is_public || user)) {
    return res.status(404).json({ error: "Board not found" });
  }

  const items = await loadItems(sql, id);
  return res.status(200).json(rowToBoardDto(board, items));
}

/**
 * Replaces the board's items with the set the canvas is holding.
 *
 * The canvas owns the whole arrangement, so it saves the arrangement — moving
 * one item can change another's stacking order, and reconciling per-item deltas
 * across a drag would be far more code for a board of a few dozen items.
 * Anything absent from the payload was deleted on the canvas.
 */
async function replaceItems(sql: Sql, boardId: string, items: IncomingItem[]) {
  const keptIds = items.map((i) => i.id);

  // Delete first so an item dragged out is gone even if nothing is re-inserted.
  if (keptIds.length > 0) {
    await sql`
      DELETE FROM board_items
      WHERE board_id = ${boardId} AND NOT (id = ANY(${keptIds}::uuid[]))
    `;
  } else {
    await sql`DELETE FROM board_items WHERE board_id = ${boardId}`;
  }

  for (const item of items) {
    // One upsert covers both cases because the client owns identity. Having the
    // server mint ids meant the canvas had to adopt them from the response,
    // which overwrote whatever had been typed while the request was in flight.
    //
    // Only geometry and body are updatable: an item's kind and source never
    // change, so a payload cannot repoint an existing item at another
    // photograph. The board_id guard means an id belonging to a different board
    // updates nothing rather than being stolen into this one.
    // biome-ignore lint/performance/noAwaitInLoops: the HTTP driver has no multi-statement batch, and a board is bounded at MAX_ITEMS
    await sql`
      INSERT INTO board_items (
        id, board_id, kind, photo_id, image_url, thumb_url,
        credit_name, credit_url, body, font_size,
        x, y, width, height, z_index
      ) VALUES (
        ${item.id}, ${boardId}, ${item.kind}, ${item.photoId}, ${item.imageUrl},
        ${item.thumbUrl}, ${item.creditName}, ${item.creditUrl}, ${item.body},
        ${item.fontSize},
        ${item.x}, ${item.y}, ${item.width}, ${item.height}, ${item.z}
      )
      ON CONFLICT (id) DO UPDATE
      SET x = EXCLUDED.x, y = EXCLUDED.y,
          width = EXCLUDED.width, height = EXCLUDED.height,
          z_index = EXCLUDED.z_index, body = EXCLUDED.body,
          font_size = EXCLUDED.font_size
      WHERE board_items.board_id = ${boardId}
    `;
  }
}

async function handlePatch(
  sql: Sql,
  user: User,
  id: string,
  req: VercelRequest,
  res: VercelResponse
) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseJsonBody(req.body);
  const exists = (await sql`
    SELECT id FROM boards WHERE id = ${id} LIMIT 1
  `) as { id: string }[];
  if (exists.length === 0) {
    return res.status(404).json({ error: "Board not found" });
  }

  if (Array.isArray(body.items)) {
    if (body.items.length > MAX_ITEMS) {
      return res
        .status(400)
        .json({ error: `A board is limited to ${MAX_ITEMS} items.` });
    }
    // Malformed items are dropped rather than failing the save, so one bad
    // entry cannot cost the user the rest of their arrangement.
    const parsed = body.items
      .map(parseIncomingItem)
      .filter((i): i is IncomingItem => i !== null);
    await replaceItems(sql, id, parsed);
  }

  const title =
    typeof body.title === "string"
      ? sanitizeText(body.title).slice(0, 120)
      : null;
  const isPublic = typeof body.isPublic === "boolean" ? body.isPublic : null;
  const coverUrl =
    typeof body.coverUrl === "string"
      ? sanitizeText(body.coverUrl).slice(0, 2000)
      : null;

  const rows = (await sql`
    UPDATE boards
    SET title = COALESCE(${title}, title),
        is_public = COALESCE(${isPublic}, is_public),
        cover_url = COALESCE(${coverUrl}, cover_url),
        updated_at = now()
    WHERE id = ${id}
    RETURNING id, title, cover_url, is_public, slug, created_at, updated_at
  `) as BoardRow[];

  const items = await loadItems(sql, id);
  return res.status(200).json(rowToBoardDto(rows[0], items));
}

async function handleDelete(
  sql: Sql,
  user: User,
  id: string,
  res: VercelResponse
) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // board_items cascade, so the arrangement goes with the board.
  await sql`DELETE FROM boards WHERE id = ${id}`;
  return res.status(204).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) {
    return res.status(400).json({ error: "A board id is required" });
  }

  const sql = getSql();
  const user = getBearerUser(req.headers.authorization);

  try {
    if (req.method === "GET") {
      return await handleGet(sql, user, id, res);
    }
    if (req.method === "PATCH") {
      return await handlePatch(sql, user, id, req, res);
    }
    if (req.method === "DELETE") {
      return await handleDelete(sql, user, id, res);
    }
    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not load this board" });
  }
}
