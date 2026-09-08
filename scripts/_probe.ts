import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`
  SELECT id, label, enabled, training_status, training_error,
         lora_path IS NOT NULL AS has_weights,
         training_started_at,
         round(extract(epoch from (now() - training_started_at))/60) AS mins_ago
  FROM models
  WHERE training_status IS NOT NULL OR id LIKE 'trained/%'
  ORDER BY training_started_at DESC NULLS LAST`);
console.log(`PROBE ${r.rows.length} trained/training rows`);
for (const x of r.rows) {
  console.log(
    `PROBE ${x.label} | status=${x.training_status} | enabled=${x.enabled} | weights=${x.has_weights} | ${x.mins_ago}m ago | err=${x.training_error ?? "none"}`
  );
}
await c.end();
