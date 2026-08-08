import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { sanitizeText } from "../_lib/httpUrl.js";
import {
  isEditorDoc,
  isPageStatus,
  normalizeSlug,
  type PageRow,
  rowToDto,
} from "../_lib/pages.js";
import { parseJsonBody } from "../_lib/parseBody.js";

type Sql = ReturnType<typeof getSql>;
type BearerUser = ReturnType<typeof getBearerUser>;

async function handleGet(
  sql: Sql,
  res: VercelResponse,
  slug: string,
  user: BearerUser
) {
  const rows = (await sql`
        SELECT id, slug, title, icon, content, status, sort_order, created_at, updated_at
        FROM pages WHERE slug = ${slug} LIMIT 1
      `) as PageRow[];

  const [row] = rows;
  // A draft is reachable by direct URL only while signed in, so it can be
  // previewed without being discoverable.
  if (!row || (row.status !== "published" && !user)) {
    return res.status(404).json({ error: "Page not found" });
  }
  if (row.status === "published") {
    res.setHeader(
      "Cache-Control",
      "public, max-age=15, stale-while-revalidate=30"
    );
  }
  return res.status(200).json(rowToDto(row));
}

async function handlePatch(
  sql: Sql,
  req: VercelRequest,
  res: VercelResponse,
  slug: string,
  user: BearerUser
) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseJsonBody(req.body);

  const title =
    typeof body.title === "string"
      ? sanitizeText(body.title).slice(0, 120)
      : "";
  if (!title) {
    return res.status(400).json({ error: "A page title is required." });
  }

  // Renaming the address is allowed, but it must still be a legal, unused slug.
  const slugCheck = normalizeSlug(body.slug ?? slug);
  if (!slugCheck.ok) {
    return res.status(400).json({ error: slugCheck.error });
  }

  if (slugCheck.slug !== slug) {
    const clash =
      await sql`SELECT id FROM pages WHERE slug = ${slugCheck.slug} LIMIT 1`;
    if (clash.length > 0) {
      return res
        .status(409)
        .json({ error: `A page already uses "${slugCheck.slug}".` });
    }
  }

  const icon =
    typeof body.icon === "string" ? sanitizeText(body.icon).slice(0, 40) : null;
  const status = isPageStatus(body.status) ? body.status : "draft";
  if (body.content !== undefined && !isEditorDoc(body.content)) {
    return res
      .status(400)
      .json({ error: "Page content is not a valid document." });
  }
  const order = Number(body.order);

  // RETURNING every column the response needs: a data-modifying CTE's writes
  // are invisible to the rest of the same statement, so re-selecting would
  // hand back the pre-update row.
  const rows = (await sql`
        UPDATE pages SET
          slug = ${slugCheck.slug},
          title = ${title},
          icon = ${icon || null},
          content = COALESCE(${body.content === undefined ? null : JSON.stringify(body.content)}::jsonb, content),
          status = ${status},
          sort_order = ${Number.isFinite(order) ? order : 0},
          updated_at = now(),
          updated_by = ${user.userId}
        WHERE slug = ${slug}
        RETURNING id, slug, title, icon, content, status, sort_order, created_at, updated_at
      `) as PageRow[];

  const [row] = rows;
  if (!row) {
    return res.status(404).json({ error: "Page not found" });
  }
  return res.status(200).json(rowToDto(row));
}

async function handleDelete(
  sql: Sql,
  res: VercelResponse,
  slug: string,
  user: BearerUser
) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const deleted =
    await sql`DELETE FROM pages WHERE slug = ${slug} RETURNING id`;
  if (deleted.length === 0) {
    return res.status(404).json({ error: "Page not found" });
  }
  return res.status(204).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  const raw =
    typeof req.query.slug === "string" ? req.query.slug : req.query.slug?.[0];
  const slug = raw?.trim().toLowerCase();
  if (!slug) {
    return res.status(400).json({ error: "Missing page address" });
  }

  try {
    const sql = getSql();
    const user = getBearerUser(req.headers.authorization);

    if (req.method === "GET") {
      return await handleGet(sql, res, slug, user);
    }

    if (req.method === "PATCH") {
      return await handlePatch(sql, req, res, slug, user);
    }

    if (req.method === "DELETE") {
      return await handleDelete(sql, res, slug, user);
    }

    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("pages")) {
      return res.status(503).json({
        error:
          "Database schema is out of date. Run pnpm db:migrate against this deployment.",
      });
    }
    return res.status(500).json({ error: "Request failed" });
  }
}
