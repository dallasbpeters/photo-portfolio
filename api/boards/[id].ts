import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MAX_WIRES } from "../../config/canvas.js";
import { checkWire, type GraphItem, hasCycle } from "../../config/graph.js";
import { getBearerUser } from "../_lib/auth.js";
import {
  type BoardItemRow,
  type BoardRow,
  type BoardSourceRow,
  type BoardWireRow,
  type IncomingItem,
  type IncomingSource,
  type IncomingWire,
  parseIncomingItem,
  parseIncomingSource,
  parseIncomingWire,
  rowToBoardDto,
} from "../_lib/boards.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { sanitizeText } from "../_lib/httpUrl.js";
import { slugify } from "../_lib/pages.js";
import { parseJsonBody } from "../_lib/parseBody.js";

type Sql = ReturnType<typeof getSql>;
type User = ReturnType<typeof getBearerUser>;

/** Guards a runaway client; a moodboard this size is already unusable. */
const MAX_ITEMS = 300;

/** A planning board draws on a handful of places, not hundreds. */
const MAX_SOURCES = 50;

const loadItems = async (
  sql: Sql,
  boardId: string
): Promise<BoardItemRow[]> => {
  const rows = (await sql`
    SELECT i.id, i.kind, i.photo_id, i.image_url, i.thumb_url,
           i.credit_name, i.credit_url, i.body, i.font_size,
           i.node_type, i.config, i.result, i.run_state, i.run_error,
           i.x, i.y, i.width, i.height, i.z_index, i.created_at,
           p.url AS photo_url
    FROM board_items i
    LEFT JOIN photos p ON p.id = i.photo_id
    WHERE i.board_id = ${boardId}
    ORDER BY i.z_index ASC, i.created_at ASC
  `) as BoardItemRow[];

  return rows;
};

const loadSources = async (
  sql: Sql,
  boardId: string
): Promise<BoardSourceRow[]> =>
  (await sql`
    SELECT id, provider, url, title
    FROM board_sources
    WHERE board_id = ${boardId}
    ORDER BY created_at ASC
  `) as BoardSourceRow[];

const loadWires = async (sql: Sql, boardId: string): Promise<BoardWireRow[]> =>
  (await sql`
    SELECT id, source_item_id, source_port, target_item_id, target_port
    FROM board_wires
    WHERE board_id = ${boardId}
    ORDER BY created_at ASC
  `) as BoardWireRow[];

async function handleGet(
  sql: Sql,
  user: User,
  id: string,
  res: VercelResponse
) {
  // The admin addresses a board by id; a published link addresses it by slug.
  // UUIDs and slugs cannot collide, so one lookup serves both.
  const rows = (await sql`
    SELECT id, title, cover_url, is_public, slug, created_at, updated_at
    FROM boards
    WHERE id::text = ${id} OR slug = ${id}
    LIMIT 1
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

  const [items, allWires, sources] = await Promise.all([
    loadItems(sql, board.id),
    loadWires(sql, board.id),
    loadSources(sql, board.id),
  ]);
  // Wires are the machinery. A visitor gets the results the board arrived at,
  // not the pipeline that produced them.
  const wires = user ? allWires : [];
  // An anonymous visitor gets the graph but not the upstream error text — see
  // ItemDtoOptions for why the prompt stays and the error does not. Sources are
  // withheld from them entirely by rowToBoardDto.
  return res
    .status(200)
    .json(
      rowToBoardDto(board, items, wires, { isPublicReader: !user }, sources)
    );
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
    // Only geometry, body and node settings are updatable: an item's kind and
    // source never change, so a payload cannot repoint an existing item at
    // another photograph. The board_id guard means an id belonging to a
    // different board updates nothing rather than being stolen into this one.
    //
    // `result`, `run_state` and `run_error` are absent from the SET list on
    // purpose, and must stay absent. The canvas saves on a debounce while a
    // generation can take two minutes, so a save already in flight when a
    // result lands would write back the pre-run copy and erase work that has
    // been paid for. Those three columns belong to POST /api/boards/:id/run.
    // biome-ignore lint/performance/noAwaitInLoops: the HTTP driver has no multi-statement batch, and a board is bounded at MAX_ITEMS
    await sql`
      INSERT INTO board_items (
        id, board_id, kind, photo_id, image_url, thumb_url,
        credit_name, credit_url, body, font_size,
        node_type, config,
        x, y, width, height, z_index
      ) VALUES (
        ${item.id}, ${boardId}, ${item.kind}, ${item.photoId}, ${item.imageUrl},
        ${item.thumbUrl}, ${item.creditName}, ${item.creditUrl}, ${item.body},
        ${item.fontSize},
        ${item.nodeType}, ${item.config === null ? null : JSON.stringify(item.config)},
        ${item.x}, ${item.y}, ${item.width}, ${item.height}, ${item.z}
      )
      ON CONFLICT (id) DO UPDATE
      SET x = EXCLUDED.x, y = EXCLUDED.y,
          width = EXCLUDED.width, height = EXCLUDED.height,
          z_index = EXCLUDED.z_index, body = EXCLUDED.body,
          font_size = EXCLUDED.font_size, config = EXCLUDED.config
      WHERE board_items.board_id = ${boardId}
    `;
  }
}

/**
 * Replaces the board's wires, the same way items are replaced and for the same
 * reason: the canvas owns the arrangement, so anything absent was deleted.
 *
 * Always runs after replaceItems, so a wire drawn between two items added in
 * the same save has both endpoints present when its foreign keys are checked.
 */
async function replaceWires(sql: Sql, boardId: string, wires: IncomingWire[]) {
  // Cleared wholesale rather than diffed. A reconnected input changes which
  // wire occupies it, and board_wires_unique_target would reject the insert
  // before the old row had gone.
  await sql`DELETE FROM board_wires WHERE board_id = ${boardId}`;

  for (const wire of wires) {
    // biome-ignore lint/performance/noAwaitInLoops: as with items — no multi-statement batch, and the set is bounded at MAX_WIRES
    await sql`
      INSERT INTO board_wires (
        id, board_id, source_item_id, source_port, target_item_id, target_port
      ) VALUES (
        ${wire.id}, ${boardId}, ${wire.sourceItemId}, ${wire.sourcePort},
        ${wire.targetItemId}, ${wire.targetPort}
      )
    `;
  }
}

/**
 * Replaces the board's attached sources.
 *
 * Replace-all like items and wires, for the same reason: the panel holds the
 * set, so anything absent was detached.
 */
async function replaceSources(
  sql: Sql,
  boardId: string,
  sources: IncomingSource[]
) {
  await sql`DELETE FROM board_sources WHERE board_id = ${boardId}`;
  for (const source of sources) {
    // biome-ignore lint/performance/noAwaitInLoops: no multi-statement batch on the HTTP driver, and the set is bounded at MAX_SOURCES
    await sql`
      INSERT INTO board_sources (id, board_id, provider, url, title)
      VALUES (${source.id}, ${boardId}, ${source.provider}, ${source.url}, ${source.title})
      ON CONFLICT (board_id, url) DO NOTHING
    `;
  }
}

/**
 * The wires worth storing, and whether the set as a whole is runnable.
 *
 * Two different failure modes, deliberately handled differently. A single
 * malformed wire is dropped, exactly as parseIncomingItem drops a malformed
 * item — one bad entry should not cost the rest of the save. A cycle is a
 * property of the whole set, and dropping one edge of it arbitrarily would hand
 * back a graph the user did not draw, so that fails the request instead.
 */
function resolveWires(
  graphItems: GraphItem[],
  raw: unknown[]
): { error: string } | { wires: IncomingWire[] } {
  if (raw.length > MAX_WIRES) {
    return { error: `A board is limited to ${MAX_WIRES} connections.` };
  }

  const parsed = raw
    .map(parseIncomingWire)
    .filter((wire): wire is IncomingWire => wire !== null);

  // Checked against an empty wire set, which validates every rule except the
  // acyclicity one — that needs the final set and is applied below.
  const wellFormed = parsed.filter(
    (wire) => checkWire(graphItems, [], wire).ok
  );

  // An input holds one value. Later wins, matching what the canvas does when a
  // new wire is dropped on an occupied port.
  const byTarget = new Map<string, IncomingWire>();
  for (const wire of wellFormed) {
    byTarget.set(`${wire.targetItemId}:${wire.targetPort}`, wire);
  }
  const wires = [...byTarget.values()];

  if (hasCycle(graphItems, wires)) {
    return { error: "Those connections form a loop, which cannot run." };
  }
  return { wires };
}

/**
 * The slug a board being published should take, or null to keep what it has.
 *
 * A board is only reachable publicly once it has a slug, so publishing mints
 * one. Existing slugs are kept: changing it would break a link already shared.
 */
async function mintSlug(
  sql: Sql,
  id: string,
  title: string | null
): Promise<string | null> {
  const current = (await sql`
    SELECT slug, title FROM boards WHERE id::text = ${id} LIMIT 1
  `) as { slug: string | null; title: string }[];

  if (current[0]?.slug) {
    return null;
  }

  const base = slugify(title ?? current[0]?.title ?? "board") || "board";

  // Every slug that could collide, fetched at once — a suffix loop that
  // queried per attempt would be a round trip per clash.
  const taken = (await sql`
    SELECT slug FROM boards
    WHERE slug = ${base} OR slug LIKE ${`${base}-%`}
  `) as { slug: string | null }[];
  const used = new Set(taken.map((row) => row.slug));

  let slug = base;
  // Suffix until free rather than failing the publish on a title clash.
  for (let n = 2; used.has(slug); n += 1) {
    slug = `${base}-${n}`;
  }
  return slug;
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
    SELECT id FROM boards WHERE id::text = ${id} LIMIT 1
  `) as { id: string }[];
  if (exists.length === 0) {
    return res.status(404).json({ error: "Board not found" });
  }

  let parsedItems: IncomingItem[] | null = null;
  if (Array.isArray(body.items)) {
    if (body.items.length > MAX_ITEMS) {
      return res
        .status(400)
        .json({ error: `A board is limited to ${MAX_ITEMS} items.` });
    }
    // Malformed items are dropped rather than failing the save, so one bad
    // entry cannot cost the user the rest of their arrangement.
    parsedItems = body.items
      .map(parseIncomingItem)
      .filter((i): i is IncomingItem => i !== null);
  }

  // Wires are validated before anything is written, so a rejected graph leaves
  // the board exactly as it was rather than half-saved.
  let parsedWires: IncomingWire[] | null = null;
  if (Array.isArray(body.wires)) {
    const graphItems: GraphItem[] = parsedItems
      ? parsedItems.map((item) => ({
          id: item.id,
          kind: item.kind,
          nodeType: item.nodeType,
        }))
      : // Wires saved without items — validate against what is already stored.
        (await loadItems(sql, id)).map((row) => ({
          id: row.id,
          kind: row.kind,
          nodeType: row.node_type ?? null,
        }));

    const resolved = resolveWires(graphItems, body.wires);
    if ("error" in resolved) {
      return res.status(400).json({ error: resolved.error });
    }
    parsedWires = resolved.wires;
  }

  if (parsedItems) {
    await replaceItems(sql, id, parsedItems);
  }
  if (parsedWires) {
    await replaceWires(sql, id, parsedWires);
  }
  if (Array.isArray(body.sources)) {
    if (body.sources.length > MAX_SOURCES) {
      return res
        .status(400)
        .json({ error: `A board is limited to ${MAX_SOURCES} sources.` });
    }
    await replaceSources(
      sql,
      id,
      body.sources
        .map(parseIncomingSource)
        .filter((source): source is IncomingSource => source !== null)
    );
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

  const slug = isPublic === true ? await mintSlug(sql, id, title) : null;

  const rows = (await sql`
    UPDATE boards
    SET title = COALESCE(${title}, title),
        slug = COALESCE(${slug}, slug),
        is_public = COALESCE(${isPublic}, is_public),
        cover_url = COALESCE(${coverUrl}, cover_url),
        updated_at = now()
    WHERE id::text = ${id}
    RETURNING id, title, cover_url, is_public, slug, created_at, updated_at
  `) as BoardRow[];

  const [items, wires, sources] = await Promise.all([
    loadItems(sql, id),
    loadWires(sql, id),
    loadSources(sql, id),
  ]);
  return res
    .status(200)
    .json(rowToBoardDto(rows[0], items, wires, {}, sources));
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
