import { NeonDbError } from "@neondatabase/serverless";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { parsePublicHttpUrl, sanitizeText } from "../_lib/httpUrl.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import { PHOTO_COLUMNS, type PhotoRow, rowToDto } from "../_lib/photos.js";

const isDev =
  process.env.VERCEL_ENV === "development" ||
  (process.env.NODE_ENV !== "production" && !process.env.VERCEL_ENV);

const mapDbError = (
  e: NeonDbError
): { status: number; error: string } | null => {
  const code = e.code;
  if (code === "42P01" || code === "42703") {
    return {
      error:
        "Database schema is missing or out of date. Run migrations (pnpm db:migrate) against the database used by this deployment.",
      status: 503,
    };
  }
  if (code === "23503") {
    if (e.constraint?.includes("created_by")) {
      return {
        error:
          "Your session no longer matches the database. Sign out and sign in again.",
        status: 401,
      };
    }
    return { error: "Invalid category or user reference.", status: 400 };
  }
  if (code === "22001") {
    return {
      error:
        "That URL or title is too long. Try a shorter image link or upload the file instead.",
      status: 400,
    };
  }
  if (code === "22P02") {
    return {
      error: "Invalid data sent to the server. Check category and try again.",
      status: 400,
    };
  }
  return null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  try {
    const sql = getSql();

    if (req.method === "GET") {
      const rows = (await sql`
        SELECT ${sql.unsafe(PHOTO_COLUMNS)}
        FROM photos p
        INNER JOIN categories c ON c.id = p.category_id
        ORDER BY p.sort_order ASC, p.created_at ASC
      `) as PhotoRow[];
      return res.status(200).json(rows.map(rowToDto));
    }

    if (req.method === "POST") {
      const user = getBearerUser(req.headers.authorization);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = parseJsonBody(req.body);
      const rawUrl = typeof body.url === "string" ? body.url : "";
      const url = parsePublicHttpUrl(rawUrl);
      const title =
        typeof body.title === "string" ? sanitizeText(body.title) : "";
      const categoryId =
        typeof body.categoryId === "string"
          ? sanitizeText(body.categoryId)
          : "";

      if (!url) {
        return res.status(400).json({
          error:
            "Invalid image URL. Use a full https:// link (e.g. from Unsplash).",
        });
      }
      if (!(title && categoryId)) {
        return res
          .status(400)
          .json({ error: "Invalid url, title, or categoryId" });
      }

      const catOk =
        await sql`SELECT id FROM categories WHERE id = ${categoryId} LIMIT 1`;
      if (catOk.length === 0) {
        return res.status(400).json({ error: "Unknown category" });
      }

      // Shift all existing photos up so the new one lands at position 0
      await sql`UPDATE photos SET sort_order = sort_order + 1`;

      const alt =
        typeof body.alt === "string"
          ? sanitizeText(body.alt).slice(0, 300)
          : null;
      const width = Number.isFinite(Number(body.width))
        ? Number(body.width)
        : null;
      const height = Number.isFinite(Number(body.height))
        ? Number(body.height)
        : null;
      // Guard the inline placeholder: it travels in every photo list response.
      const lqipRaw = typeof body.lqip === "string" ? body.lqip : "";
      const lqip =
        lqipRaw.startsWith("data:image/") && lqipRaw.length <= 4000
          ? lqipRaw
          : null;
      const exif =
        body.exif && typeof body.exif === "object"
          ? JSON.stringify(body.exif).slice(0, 4000)
          : null;

      const inserted = (await sql.query(
        `INSERT INTO photos (url, title, category_id, sort_order, created_by, alt, width, height, lqip, exif)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         RETURNING id`,
        [url, title, categoryId, 0, user.userId, alt, width, height, lqip, exif]
      )) as { id: string }[];

      const newId = inserted[0]?.id;
      if (!newId) {
        return res.status(500).json({ error: "Insert failed" });
      }

      const rows = (await sql`
        SELECT ${sql.unsafe(PHOTO_COLUMNS)}
        FROM photos p
        INNER JOIN categories c ON c.id = p.category_id
        WHERE p.id = ${newId}
        LIMIT 1
      `) as PhotoRow[];

      const row = rows[0];
      if (!row) {
        return res.status(500).json({ error: "Insert failed" });
      }
      return res.status(201).json(rowToDto(row));
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "";
    if (
      message.includes("Missing database URL") ||
      message.includes("DATABASE_URL")
    ) {
      return res.status(503).json({
        error:
          "Database is not configured for this deployment. Add DATABASE_URL or connect Neon/Postgres on Vercel.",
      });
    }
    if (e instanceof NeonDbError) {
      const mapped = mapDbError(e);
      if (mapped) {
        return res.status(mapped.status).json({ error: mapped.error });
      }
    }
    return res.status(500).json({
      error: "Request failed",
      ...(isDev && message ? { debug: message } : {}),
    });
  }
}
