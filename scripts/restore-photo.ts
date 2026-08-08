/**
 * Re-uploads an original image and restores its portfolio row.
 *
 * Used to replace a photo whose stored file was damaged — e.g. the IMG.LY
 * watermark baked in by unlicensed CE.SDK exports. Bytes go straight from disk
 * to Blob, bypassing any editor, so the stored file is exactly the original.
 *
 * Title, category and sort order are taken from watermarked-photos-backup.json
 * so the restored photo lands back where it was.
 *
 *   TARGET_DATABASE_URL='postgres://…' \
 *   BLOB_RW_TOKEN='vercel_blob_rw_…' \
 *   pnpm tsx scripts/restore-photo.ts "Dusk" /path/to/original.jpg
 */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { put } from "@vercel/blob";
import pg from "pg";

const [title, filePath] = process.argv.slice(2);
if (!(title && filePath)) {
  throw new Error(
    'Usage: pnpm tsx scripts/restore-photo.ts "<title>" <path-to-image>'
  );
}

const connectionString = process.env.TARGET_DATABASE_URL?.trim();
const blobToken = process.env.BLOB_RW_TOKEN?.trim();
if (!connectionString) {
  throw new Error("TARGET_DATABASE_URL is required");
}
if (!blobToken) {
  throw new Error("BLOB_RW_TOKEN is required");
}

const CONTENT_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const ext = extname(filePath).toLowerCase();
const contentType = CONTENT_TYPES[ext];
if (!contentType) {
  throw new Error(`Unsupported image type: ${ext || "(none)"}`);
}

interface BackupRow {
  category_slug: string;
  created_by: string | null;
  sort_order: number;
  title: string;
}

const backup = JSON.parse(
  readFileSync("watermarked-photos-backup.json", "utf8")
) as BackupRow[];
const original = backup.find((r) => r.title === title);
if (!original) {
  throw new Error(
    `No backup entry titled "${title}". Available: ${backup.map((r) => r.title).join(", ")}`
  );
}

const bytes = readFileSync(filePath);
console.log(
  `Uploading ${basename(filePath)} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)…`
);

const blob = await put(
  `portfolio/restored/${Date.now()}-${basename(filePath)}`,
  bytes,
  {
    access: "public",
    addRandomSuffix: true,
    contentType,
    token: blobToken,
  }
);
console.log(`Uploaded: ${blob.url}`);

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const { rows } = await client.query(
    `INSERT INTO photos (url, title, category_id, sort_order, created_by)
     SELECT $1, $2, c.id, $3, $4 FROM categories c WHERE c.slug = $5
     RETURNING id`,
    [
      blob.url,
      original.title,
      original.sort_order,
      original.created_by,
      original.category_slug,
    ]
  );
  if (rows.length === 0) {
    throw new Error(
      `Category "${original.category_slug}" no longer exists — restore it first.`
    );
  }
  console.log(
    `Restored "${original.title}" into ${original.category_slug} at position ${original.sort_order}.`
  );
} finally {
  await client.end();
}
