/**
 * Parses every generated `.bru` with Bruno's own grammar.
 *
 * The collection shipped completely unusable once: the generator wrote the
 * method block as `POST {` where the grammar wants `post {`, so all seventy-nine
 * requests failed to parse and Bruno showed an empty collection. Nothing caught
 * it, because "it looks like the format" was the only check performed.
 *
 * Parsing with the real parser is the only check worth having — the format has
 * a grammar, so guessing at it is guessing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
// @ts-expect-error — @usebruno/lang ships no type declarations.
import { bruToJsonV2 } from "@usebruno/lang";

const ROOT = path.resolve(import.meta.dirname, "..");
const COLLECTION = path.join(ROOT, "bruno");

const bruFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...bruFiles(full));
    } else if (entry.endsWith(".bru")) {
      out.push(full);
    }
  }
  return out;
};

const failures: string[] = [];
const files = bruFiles(COLLECTION);

for (const file of files) {
  const rel = path.relative(ROOT, file);
  // Environments use a different grammar; the request parser rejects them.
  if (rel.includes(`${path.sep}environments${path.sep}`)) {
    continue;
  }
  try {
    const parsed = bruToJsonV2(readFileSync(file, "utf8")) as {
      http?: { method?: string; url?: string };
      meta?: { name?: string };
    };
    if (!parsed.http?.method) {
      failures.push(`${rel}\n    parsed, but carries no method`);
    } else if (!parsed.http.url) {
      failures.push(`${rel}\n    parsed, but carries no url`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message.split("\n")[0] : String(e);
    failures.push(`${rel}\n    ${message}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(
    `\n${failures.length} of ${files.length} Bruno requests are invalid:\n\n${failures
      .map((f) => `  ${f}`)
      .join("\n\n")}\n\nRegenerate with \`pnpm bruno\`.\n`
  );
  process.exit(1);
}

process.stdout.write(`All ${files.length} Bruno requests parse.\n`);
