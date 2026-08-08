import bcrypt from "bcryptjs";
import pg from "pg";
import { resolveSite } from "../config/sites";
import { INITIAL_PHOTOS_SEED } from "../src/data/initialPhotos";
import { loadEnv } from "./loadEnv";

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required (set in .env, .env.local, or .env.development.local)"
  );
}

const site = resolveSite(process.env.SITE);
const email = (process.env.DEFAULT_ADMIN_EMAIL || site.defaultAdminEmail)
  .trim()
  .toLowerCase();
const password = process.env.DEFAULT_ADMIN_PASSWORD;
if (!password || password.length < 8) {
  throw new Error(
    "DEFAULT_ADMIN_PASSWORD is required (min 8 characters). Add it to .env or .env.development.local — seed runs in Node and does not use Vite env alone."
  );
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const passwordHash = bcrypt.hashSync(password, 10);
  const userRes = await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [email, passwordHash]
  );
  const userId = userRes.rows[0]?.id;
  if (!userId) {
    throw new Error("Failed to upsert admin user");
  }

  const countRes = await client.query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM photos"
  );
  const existing = Number.parseInt(countRes.rows[0]?.c ?? "0", 10);
  if (existing > 0) {
    console.log(`Skipped photo seed (${existing} rows already present).`);
    console.log(`Admin: ${email}`);
  } else {
    for (const p of INITIAL_PHOTOS_SEED) {
      // biome-ignore lint/performance/noAwaitInLoops: inserted in order so sort_order matches the seed list
      await client.query(
        `INSERT INTO photos (url, title, category_id, sort_order, created_by)
         SELECT $1, $2, c.id, $3, $4
         FROM categories c
         WHERE c.slug = $5`,
        [p.url, p.title, p.order, userId, p.category]
      );
    }
    console.log(`Seeded ${INITIAL_PHOTOS_SEED.length} photos.`);
    console.log(`Admin login: ${email}`);
  }
} finally {
  await client.end();
}
