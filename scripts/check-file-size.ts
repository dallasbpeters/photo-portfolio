/**
 * Enforces a 500-line ceiling on source files.
 *
 * Fifteen files were already over the line when this was introduced, several at
 * three or four times it, so a flat limit would have failed every build until
 * a very large refactor landed. Instead this is a ratchet:
 *
 *   - a file not in the baseline may not exceed MAX_LINES
 *   - a file in the baseline may not grow beyond the size recorded there
 *   - a baseline file that drops under MAX_LINES must leave the baseline, so
 *     the exemption cannot be reclaimed later
 *
 * The effect is that the limit applies in full to everything written from now
 * on, and the existing offenders can only move one way.
 *
 * Run `pnpm check:size --update` after legitimately shrinking a file to record
 * its new size.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const MAX_LINES = 500;

const ROOT = path.resolve(import.meta.dirname, "..");
const BASELINE_PATH = path.join(ROOT, "file-size-baseline.json");
const SCANNED = ["src", "api", "config", "scripts"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
/** Generated, vendored, or otherwise not ours to split. */
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", ".codegraph"]);

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
};

const lineCount = (file: string): number =>
  readFileSync(file, "utf8").split("\n").length;

const readBaseline = (): Record<string, number> => {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Record<
      string,
      number
    >;
  } catch {
    return {};
  }
};

const collect = (): Map<string, number> => {
  const sizes = new Map<string, number>();
  for (const dir of SCANNED) {
    const abs = path.join(ROOT, dir);
    try {
      statSync(abs);
    } catch {
      continue;
    }
    for (const file of sourceFiles(abs)) {
      sizes.set(path.relative(ROOT, file), lineCount(file));
    }
  }
  return sizes;
};

const sizes = collect();
const baseline = readBaseline();

if (process.argv.includes("--update")) {
  const next: Record<string, number> = {};
  for (const [file, count] of [...sizes].sort()) {
    if (count > MAX_LINES) {
      next[file] = count;
    }
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  process.stdout.write(
    `Recorded ${Object.keys(next).length} files over ${MAX_LINES} lines.\n`
  );
  process.exit(0);
}

const tooBig: string[] = [];
const grown: string[] = [];
const improved: string[] = [];

for (const [file, count] of sizes) {
  const allowed = baseline[file];
  if (allowed === undefined) {
    if (count > MAX_LINES) {
      tooBig.push(`  ${file} — ${count} lines (limit ${MAX_LINES})`);
    }
  } else if (count > allowed) {
    grown.push(`  ${file} — ${count} lines, was ${allowed}`);
  } else if (count <= MAX_LINES) {
    improved.push(`  ${file} — now ${count} lines`);
  }
}

if (tooBig.length > 0) {
  process.stderr.write(
    `\nFiles over the ${MAX_LINES}-line limit:\n${tooBig.join("\n")}\n\nSplit them, or record the size with \`pnpm check:size --update\` if it is genuinely unavoidable.\n`
  );
}
if (grown.length > 0) {
  process.stderr.write(
    `\nAlready over the limit and growing — these may only shrink:\n${grown.join("\n")}\n`
  );
}
if (improved.length > 0) {
  process.stderr.write(
    `\nNow under the limit. Run \`pnpm check:size --update\` to drop the exemption:\n${improved.join("\n")}\n`
  );
}

if (tooBig.length > 0 || grown.length > 0 || improved.length > 0) {
  process.exit(1);
}

process.stdout.write(
  `All ${sizes.size} source files within ${MAX_LINES} lines (${Object.keys(baseline).length} grandfathered).\n`
);
