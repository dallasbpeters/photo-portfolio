import { NeonDbError } from "@neondatabase/serverless";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/** ISO calendar date, the only shape the journal accepts. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_JOURNAL_CHARS = 20_000;

interface HistoryRow {
  alt_text: string | null;
  challenge_date: string;
  image_thumb_url: string | null;
  image_url: string;
  journal_body: string | null;
  journal_updated_at: string | Date | null;
  photographer_name: string | null;
  photographer_username: string | null;
  unsplash_html_link: string | null;
}

type Sql = ReturnType<typeof getSql>;

const toDateStr = (val: unknown): string => {
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  return String(val).slice(0, 10);
};

/** Pull the ISO date out of a request body, or null when it is unusable. */
const readDate = (body: ReturnType<typeof parseJsonBody>): string | null => {
  const dateStr = typeof body.date === "string" ? body.date.slice(0, 10) : null;
  return dateStr && ISO_DATE.test(dateStr) ? dateStr : null;
};

async function handleGet(sql: Sql, userId: string, res: VercelResponse) {
  const rows = (await sql`
    SELECT
      dc.challenge_date,
      dc.image_url,
      dc.image_thumb_url,
      dc.photographer_name,
      dc.photographer_username,
      dc.unsplash_html_link,
      dc.alt_text,
      cje.body  AS journal_body,
      cje.updated_at AS journal_updated_at
    FROM daily_challenges dc
    LEFT JOIN challenge_journal_entries cje
      ON cje.challenge_date = dc.challenge_date
      AND cje.user_id = ${userId}::uuid
    ORDER BY dc.challenge_date DESC
    LIMIT 365
  `) as HistoryRow[];

  const entries = rows.map((r) => ({
    challenge: {
      altText: r.alt_text,
      challengeDate: toDateStr(r.challenge_date),
      imageThumbUrl: r.image_thumb_url,
      imageUrl: r.image_url,
      photographerName: r.photographer_name,
      photographerUsername: r.photographer_username,
      unsplashHtmlLink: r.unsplash_html_link,
    },
    journal:
      r.journal_body === null
        ? null
        : {
            body: r.journal_body,
            updatedAt: new Date(r.journal_updated_at ?? 0).toISOString(),
          },
  }));

  return res.status(200).json({ entries });
}

async function handlePut(
  sql: Sql,
  userId: string,
  req: VercelRequest,
  res: VercelResponse
) {
  const body = parseJsonBody(req.body);
  const dateStr = readDate(body);
  if (!dateStr) {
    return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
  }

  const dayRows = (await sql`
    SELECT challenge_date FROM daily_challenges WHERE challenge_date = ${dateStr}::date LIMIT 1
  `) as { challenge_date: string }[];
  if (dayRows.length === 0) {
    return res.status(404).json({ error: "No challenge found for that date." });
  }

  const raw = typeof body.body === "string" ? body.body : "";
  const text = raw.replace(/\0/g, "").slice(0, MAX_JOURNAL_CHARS);

  await sql`
    INSERT INTO challenge_journal_entries (user_id, challenge_date, body, updated_at)
    VALUES (${userId}::uuid, ${dateStr}::date, ${text}, now())
    ON CONFLICT (user_id, challenge_date)
    DO UPDATE SET body = EXCLUDED.body, updated_at = now()
  `;

  const out = (await sql`
    SELECT body, updated_at FROM challenge_journal_entries
    WHERE user_id = ${userId}::uuid AND challenge_date = ${dateStr}::date
    LIMIT 1
  `) as { body: string; updated_at: string | Date }[];

  const [row] = out;
  if (!row) {
    return res.status(500).json({ error: "Save failed" });
  }

  return res.status(200).json({
    journal: {
      body: row.body,
      updatedAt: new Date(row.updated_at).toISOString(),
    },
  });
}

async function handleDelete(
  sql: Sql,
  userId: string,
  req: VercelRequest,
  res: VercelResponse
) {
  const dateStr = readDate(parseJsonBody(req.body));
  if (!dateStr) {
    return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
  }

  await sql`
    DELETE FROM challenge_journal_entries
    WHERE user_id = ${userId}::uuid AND challenge_date = ${dateStr}::date
  `;

  return res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sql = getSql();

  try {
    if (req.method === "GET") {
      return await handleGet(sql, user.userId, res);
    }

    if (req.method === "PUT") {
      return await handlePut(sql, user.userId, req, res);
    }

    if (req.method === "DELETE") {
      return await handleDelete(sql, user.userId, req, res);
    }

    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    if (
      e instanceof NeonDbError &&
      (e.code === "42P01" || e.code === "42703")
    ) {
      return res.status(503).json({
        error: "Daily challenge tables are missing. Run pnpm db:migrate.",
      });
    }
    return res.status(500).json({ error: "Request failed" });
  }
}
