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
          AND cje.user_id = ${user.userId}::uuid
        ORDER BY dc.challenge_date DESC
        LIMIT 365
      `) as HistoryRow[];

      const toDateStr = (val: unknown): string => {
        if (val instanceof Date) {
          return val.toISOString().slice(0, 10);
        }
        const s = String(val);
        return s.includes("T") ? s.slice(0, 10) : s.slice(0, 10);
      };

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
                updatedAt: new Date(r.journal_updated_at!).toISOString(),
              },
      }));

      return res.status(200).json({ entries });
    }

    if (req.method === "PUT") {
      const body = parseJsonBody(req.body);
      const dateStr =
        typeof body.date === "string" ? body.date.slice(0, 10) : null;
      if (!(dateStr && ISO_DATE.test(dateStr))) {
        return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
      }

      const dayRows = (await sql`
        SELECT challenge_date FROM daily_challenges WHERE challenge_date = ${dateStr}::date LIMIT 1
      `) as { challenge_date: string }[];
      if (dayRows.length === 0) {
        return res
          .status(404)
          .json({ error: "No challenge found for that date." });
      }

      const raw = typeof body.body === "string" ? body.body : "";
      const text = raw.replace(/\0/g, "").slice(0, MAX_JOURNAL_CHARS);

      await sql`
        INSERT INTO challenge_journal_entries (user_id, challenge_date, body, updated_at)
        VALUES (${user.userId}::uuid, ${dateStr}::date, ${text}, now())
        ON CONFLICT (user_id, challenge_date)
        DO UPDATE SET body = EXCLUDED.body, updated_at = now()
      `;

      const out = (await sql`
        SELECT body, updated_at FROM challenge_journal_entries
        WHERE user_id = ${user.userId}::uuid AND challenge_date = ${dateStr}::date
        LIMIT 1
      `) as { body: string; updated_at: string | Date }[];

      const row = out[0];
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

    if (req.method === "DELETE") {
      const body = parseJsonBody(req.body);
      const dateStr =
        typeof body.date === "string" ? body.date.slice(0, 10) : null;
      if (!(dateStr && ISO_DATE.test(dateStr))) {
        return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
      }

      await sql`
        DELETE FROM challenge_journal_entries
        WHERE user_id = ${user.userId}::uuid AND challenge_date = ${dateStr}::date
      `;

      return res.status(200).json({ ok: true });
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
