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
  const [challenge] = rows;
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
  const [j] = journalRows;
  const journal = j
    ? { body: j.body, updatedAt: new Date(j.updated_at).toISOString() }
    : null;
  res.status(status).json({
    challenge: rowToChallengeJson(challenge),
    journal,
  });
};

const journalTextFromBody = (body: Record<string, unknown>): string => {
  if (typeof body.body === "string") {
    return body.body;
  }
  if (typeof body.thoughts === "string") {
    return body.thoughts;
  }
  return "";
};

const handleGet = async (
  sql: ReturnType<typeof getSql>,
  user: { userId: string; email: string },
  dateStr: string,
  res: VercelResponse
): Promise<void> => {
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

  const [challenge] = rows;
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

  const [j] = journalRows;
  const journal = j
    ? {
        body: j.body,
        updatedAt: new Date(j.updated_at).toISOString(),
      }
    : null;

  res.status(200).json({
    challenge: rowToChallengeJson(challenge),
    journal,
  });
};

const handlePost = async (
  sql: ReturnType<typeof getSql>,
  user: { userId: string; email: string },
  dateStr: string,
  res: VercelResponse
): Promise<void> => {
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
};

const handlePut = async (
  sql: ReturnType<typeof getSql>,
  user: { userId: string; email: string },
  dateStr: string,
  req: VercelRequest,
  res: VercelResponse
): Promise<void> => {
  const body = parseJsonBody(req.body);
  const text = journalTextFromBody(body).replace(/\0/g, "");
  if (text.length > MAX_JOURNAL_CHARS) {
    res.status(400).json({
      error: `Journal is too long (max ${MAX_JOURNAL_CHARS} characters)`,
    });
    return;
  }

  const dayRows = (await sql`
    SELECT challenge_date FROM daily_challenges WHERE challenge_date = ${dateStr}::date LIMIT 1
  `) as { challenge_date: string }[];
  if (dayRows.length === 0) {
    res
      .status(409)
      .json({ error: "No challenge for today yet. Refresh the page." });
    return;
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

  const [row] = out;
  if (!row) {
    res.status(500).json({ error: "Save failed" });
    return;
  }

  res.status(200).json({
    journal: {
      body: row.body,
      updatedAt: new Date(row.updated_at).toISOString(),
    },
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
      await handleGet(sql, user, dateStr, res);
      return;
    }

    if (req.method === "POST") {
      await handlePost(sql, user, dateStr, res);
      return;
    }

    if (req.method === "PUT") {
      await handlePut(sql, user, dateStr, req, res);
      return;
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
