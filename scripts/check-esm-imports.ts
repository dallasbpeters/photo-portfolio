import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every relative import under api/ and db/ must name a file extension.
 *
 * These directories are deployed as serverless functions and run as real ESM,
 * where an extensionless specifier is simply not resolvable. `vercel dev`
 * resolves them anyway, and so do `tsc --noEmit` and vitest — none of them load
 * modules the way the platform does. So the whole suite can pass while every
 * deployed endpoint answers FUNCTION_INVOCATION_FAILED.
 *
 * That is not hypothetical. `drizzle-kit pull` generates `from "./schema"`, it
 * shipped, and it took the models list, the boards, comments and version
 * endpoints down on a green build. This check is the thing that would have
 * caught it before the push.
 *
 * `src/` is deliberately not checked: it is bundled by Vite, where
 * extensionless is the convention throughout.
 *
 * A `.js` specifier pointing at a `.ts` file on disk is correct and expected —
 * that is how TypeScript's NodeNext resolution is written.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

/** Where deployed ESM runs, and so where the rule applies. */
const CHECKED = ["api", "db"];

const SOURCE = /\.(ts|tsx|mts|js|mjs)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".vercel", "meta"]);

/**
 * A relative specifier, from `import`, `export … from`, or `await import()`.
 *
 * Only relative ones: a bare specifier is a package, resolved by node_modules
 * rather than by path, and needs no extension.
 */
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*)["'](\.{1,2}\/[^"']*)["']|\bimport\s+["'](\.{1,2}\/[^"']*)["']/g;

const HAS_EXTENSION = /\.[a-z0-9]+$/i;

const filesUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...filesUnder(path));
    } else if (SOURCE.test(entry)) {
      out.push(path);
    }
  }
  return out;
};

interface Offence {
  file: string;
  line: number;
  specifier: string;
}

const offencesIn = (file: string): Offence[] => {
  const text = readFileSync(file, "utf8");
  const found: Offence[] = [];
  for (const match of text.matchAll(SPECIFIER)) {
    const specifier = match[1] ?? match[2];
    if (!specifier || HAS_EXTENSION.test(specifier)) {
      continue;
    }
    found.push({
      file: relative(ROOT, file),
      // The line the specifier sits on, for a message somebody can act on.
      line: text.slice(0, match.index).split("\n").length,
      specifier,
    });
  }
  return found;
};

const offences = CHECKED.flatMap((dir) => {
  try {
    return filesUnder(join(ROOT, dir)).flatMap(offencesIn);
  } catch {
    // A directory that does not exist is not a failure.
    return [];
  }
});

if (offences.length > 0) {
  console.error(
    "\nRelative imports without a file extension. These resolve under `vercel dev` and fail in production:\n"
  );
  for (const o of offences) {
    console.error(`  ${o.file}:${o.line}  ${o.specifier}  → add .js`);
  }
  console.error(
    "\nUse a .js specifier even when the file on disk is .ts — that is how NodeNext resolution is written.\n"
  );
  process.exit(1);
}

console.log(
  `Every relative import under ${CHECKED.join("/ and ")}/ names an extension.`
);
