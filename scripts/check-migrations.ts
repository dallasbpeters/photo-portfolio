/**
 * Keeps migrations to schema, never data.
 *
 * These run against live databases — the Vercel build command applies them on
 * every deploy, and the other two sites are migrated by hand against
 * production. So a patch that edits rows is a patch that edits real
 * photographs, with no review step between writing it and it running.
 *
 * Forbidden outright, because they destroy data that cannot be recovered from
 * the schema: DELETE, TRUNCATE, DROP TABLE, DROP COLUMN.
 *
 * Allowed:
 *   - any CREATE / ALTER that adds
 *   - DROP INDEX and DROP CONSTRAINT, which hold no data of their own
 *   - INSERT, but only with ON CONFLICT, so re-running cannot duplicate and a
 *     row edited afterwards is not silently restored
 *
 * Anything else needs an explicit marker on the line before it:
 *
 *   -- migration-safety: <why this is safe>
 *
 * which forces the reason to be written down next to the statement rather than
 * remembered.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILES = [
  path.join(ROOT, "db/schema.sql"),
  ...readdirSync(path.join(ROOT, "db/patches"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(ROOT, "db/patches", f)),
];

const MARKER = /--\s*migration-safety:/i;

/** Statements that remove data. No marker excuses these. */
const DESTRUCTIVE =
  /^\s*(DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|DROP\s+DATABASE|DROP\s+SCHEMA)\b/i;
const DROP_COLUMN = /\bDROP\s+COLUMN\b/i;

/** Statements that change existing rows. A marker may permit these. */
const MUTATING = /^\s*(UPDATE)\b/i;
const INSERT = /^\s*INSERT\s+INTO\b/i;
const ON_CONFLICT = /ON\s+CONFLICT/i;

interface Problem {
  file: string;
  line: number;
  text: string;
  why: string;
}

const problems: Problem[] = [];
const waived: { file: string; line: number; text: string }[] = [];

for (const file of FILES) {
  const rel = path.relative(ROOT, file);
  const lines = readFileSync(file, "utf8").split("\n");

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("--")) {
      return;
    }
    // Scan back over the contiguous comment block above the statement. A
    // justification worth writing is usually more than one line, so requiring
    // the marker to sit immediately above would push it into a terse
    // one-liner — the opposite of the point.
    const marked =
      MARKER.test(raw) ||
      (() => {
        for (let k = i - 1; k >= 0; k -= 1) {
          const prev = (lines[k] ?? "").trim();
          if (prev === "") {
            continue;
          }
          if (!prev.startsWith("--")) {
            return false;
          }
          if (MARKER.test(prev)) {
            return true;
          }
        }
        return false;
      })();
    const at = { file: rel, line: i + 1, text: line.slice(0, 90) };

    if (DESTRUCTIVE.test(line) || DROP_COLUMN.test(line)) {
      if (marked) {
        // Permitted, but counted: removing a column is sometimes genuinely
        // right, and an absolute ban would only be worked around. Requiring
        // the reason inline puts it in front of whoever reviews the patch.
        waived.push(at);
      } else {
        problems.push({
          ...at,
          why: "destroys data — add `-- migration-safety: <why>` if this is genuinely intended",
        });
      }
      return;
    }
    if (MUTATING.test(line) && !marked) {
      problems.push({
        ...at,
        why: "edits existing rows; add `-- migration-safety: <why>` above it",
      });
      return;
    }
    if (INSERT.test(line)) {
      // ON CONFLICT may be several lines below, at the end of a VALUES list.
      const rest = lines.slice(i, i + 80).join("\n");
      const statement = rest.split(";")[0] ?? "";
      if (!(ON_CONFLICT.test(statement) || marked)) {
        problems.push({
          ...at,
          why: "INSERT without ON CONFLICT — a re-run would duplicate these rows",
        });
      }
    }
  });
}

if (problems.length > 0) {
  process.stderr.write(
    `\nMigrations must change schema, not data:\n\n${problems
      .map((p) => `  ${p.file}:${p.line}\n    ${p.text}\n    ${p.why}\n`)
      .join("\n")}\n`
  );
  process.exit(1);
}

const waiverReport =
  waived.length > 0
    ? `\n${waived.length} destructive statement(s) explicitly waived:\n${waived
        .map((w) => `  ${w.file}:${w.line}  ${w.text}`)
        .join("\n")}\n`
    : "";

process.stdout.write(
  `${waiverReport}\nAll ${FILES.length} migration files are schema-only.\n`
);
