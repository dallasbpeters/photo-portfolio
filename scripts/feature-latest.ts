import pg from "pg";

const connectionString = process.env.TARGET_DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("TARGET_DATABASE_URL required");
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  const result = await client.query(
    "SELECT id, title, created_at FROM photos WHERE is_published ORDER BY created_at DESC LIMIT 5"
  );
  console.log("Latest 5 published photos:");
  console.table(result.rows);

  const ids = result.rows.map((r) => r.id);
  if (ids.length > 0) {
    await client.query(
      "UPDATE photos SET is_featured = TRUE WHERE id = ANY($1)",
      [ids]
    );
    console.log(`Set is_featured=TRUE for ${ids.length} photos`);
  }
} finally {
  await client.end();
}
