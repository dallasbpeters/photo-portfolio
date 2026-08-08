import { NeonDbError } from "@neondatabase/serverless";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import { fetchUnsplashDailyPhoto } from "../_lib/unsplashDaily.js";

const utcDateString = (): string => new Date().toISOString().slice(0, 10);

const MAX_JOURNAL_CHARS = 20_000;

interface ChallengeRow {
  alt_text: string | null;
  challenge_date: string;
  image_thumb_url: string | null;
  image_url: string;
  photographer_name: string | null;
  photographer_username: string | null;
  unsplash_html_link: string | null;
  unsplash_photo_id: string | null;
}

interface JournalRow {
  body: string;
  updated_at: string | Date;
}

const rowToChallengeJson = (row: ChallengeRow) => ({
  altText: row.alt_text,
  challengeDate: String(row.challenge_date).slice(0, 10),
  imageThumbUrl: row.image_thumb_url,
  imageUrl: row.image_url,
  photographerName: row.photographer_name,
  photographerUsername: row.photographer_username,
  unsplashHtmlLink: row.unsplash_html_link,
  unsplashPhotoId: row.unsplash_photo_id,
});

const respondWithChallengeAndJournal = async (
  sql: ReturnType<typeof getSql>,
  user: { userId: string; email: string },
  dateStr: string,
  res: VercelResponse,
  status: number
): Promise<void> => {
  const rows = (await sql`
    SELECT challenge_date, image_url, image_thumb_url, photographer_name, photographer_username,
      unsplash_photo_id, unsplash_html_link, alt_text
    FROM daily_challenges
    WHERE challenge_date = ${dateStr}::date
    LIMIT 1
  `) as ChallengeRow[];
  const challenge = rows[0];
  if (!challenge) {
    res.status(500).json({ error: "Could not load daily challenge" });
    return;
  }
  const journalRows = (await sql`
    SELECT body, updated_at
    FROM challenge_journal_entries
    WHERE user_id = ${user.userId}::uuid AND challenge_date = ${dateStr}::date
    LIMIT 1
  `) as JournalRow[];
  const j = journalRows[0];
  const journal = j
    ? { body: j.body, updatedAt: new Date(j.updated_at).toISOString() }
    : null;
  res.status(status).json({
    challenge: rowToChallengeJson(challenge),
    journal,
  });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sql = getSql();
  const dateStr = utcDateString();

  try {
    if (req.method === "GET") {
      let rows = (await sql`
        SELECT challenge_date, image_url, image_thumb_url, photographer_name, photographer_username,
          unsplash_photo_id, unsplash_html_link, alt_text
        FROM daily_challenges
        WHERE challenge_date = ${dateStr}::date
        LIMIT 1
      `) as ChallengeRow[];

      if (rows.length === 0) {
        const photo = await fetchUnsplashDailyPhoto("initial");
        await sql`
          INSERT INTO daily_challenges (
            challenge_date, image_url, image_thumb_url, photographer_name, photographer_username,
            unsplash_photo_id, unsplash_html_link, alt_text
          )
          VALUES (
            ${dateStr}::date,
            ${photo.imageUrl},
            ${photo.imageThumbUrl},
            ${photo.photographerName},
            ${photo.photographerUsername},
            ${photo.unsplashPhotoId},
            ${photo.unsplashHtmlLink},
            ${photo.altText}
          )
          ON CONFLICT (challenge_date) DO NOTHING
        `;
        rows = (await sql`
          SELECT challenge_date, image_url, image_thumb_url, photographer_name, photographer_username,
            unsplash_photo_id, unsplash_html_link, alt_text
          FROM daily_challenges
          WHERE challenge_date = ${dateStr}::date
          LIMIT 1
        `) as ChallengeRow[];
      }

      const challenge = rows[0];
      if (!challenge) {
        return res
          .status(500)
          .json({ error: "Could not load daily challenge" });
      }

      const journalRows = (await sql`
        SELECT body, updated_at
        FROM challenge_journal_entries
        WHERE user_id = ${user.userId}::uuid AND challenge_date = ${dateStr}::date
        LIMIT 1
      `) as JournalRow[];

      const j = journalRows[0];
      const journal = j
        ? {
            body: j.body,
            updatedAt: new Date(j.updated_at).toISOString(),
          }
        : null;

      return res.status(200).json({
        challenge: rowToChallengeJson(challenge),
        journal,
      });
    }

    if (req.method === "POST") {
      const photo = await fetchUnsplashDailyPhoto("refresh");
      await sql`
        INSERT INTO daily_challenges (
          challenge_date, image_url, image_thumb_url, photographer_name, photographer_username,
          unsplash_photo_id, unsplash_html_link, alt_text
        )
        VALUES (
          ${dateStr}::date,
          ${photo.imageUrl},
          ${photo.imageThumbUrl},
          ${photo.photographerName},
          ${photo.photographerUsername},
          ${photo.unsplashPhotoId},
          ${photo.unsplashHtmlLink},
          ${photo.altText}
        )
        ON CONFLICT (challenge_date) DO UPDATE SET
          image_url = EXCLUDED.image_url,
          image_thumb_url = EXCLUDED.image_thumb_url,
          photographer_name = EXCLUDED.photographer_name,
          photographer_username = EXCLUDED.photographer_username,
          unsplash_photo_id = EXCLUDED.unsplash_photo_id,
          unsplash_html_link = EXCLUDED.unsplash_html_link,
          alt_text = EXCLUDED.alt_text
      `;
      await respondWithChallengeAndJournal(sql, user, dateStr, res, 200);
      return;
    }

    if (req.method === "PUT") {
      const body = parseJsonBody(req.body);
      const raw =
        typeof body.body === "string"
          ? body.body
          : typeof body.thoughts === "string"
            ? body.thoughts
            : "";
      const text = raw.replace(/\0/g, "");
      if (text.length > MAX_JOURNAL_CHARS) {
        return res.status(400).json({
          error: `Journal is too long (max ${MAX_JOURNAL_CHARS} characters)`,
        });
      }

      const dayRows = (await sql`
        SELECT challenge_date FROM daily_challenges WHERE challenge_date = ${dateStr}::date LIMIT 1
      `) as { challenge_date: string }[];
      if (dayRows.length === 0) {
        return res
          .status(409)
          .json({ error: "No challenge for today yet. Refresh the page." });
      }

      await sql`
        INSERT INTO challenge_journal_entries (user_id, challenge_date, body, updated_at)
        VALUES (${user.userId}::uuid, ${dateStr}::date, ${text}, now())
        ON CONFLICT (user_id, challenge_date)
        DO UPDATE SET body = EXCLUDED.body, updated_at = now()
      `;

      const out = (await sql`
        SELECT body, updated_at
        FROM challenge_journal_entries
        WHERE user_id = ${user.userId}::uuid AND challenge_date = ${dateStr}::date
        LIMIT 1
      `) as JournalRow[];

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

    res.setHeader("Allow", "GET, POST, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    if (
      e instanceof NeonDbError &&
      (e.code === "42P01" || e.code === "42703")
    ) {
      return res.status(503).json({
        error:
          "Daily challenge tables are missing. Run pnpm db:migrate on this database.",
      });
    }
    return res.status(500).json({ error: "Request failed" });
  }
}
