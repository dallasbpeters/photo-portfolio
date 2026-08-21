/**
 * Fails if any Tailwind utility class is left in the markup.
 *
 * Written because grepping for `className="` missed a file that used a template
 * literal, and the miss was reported as a clean directory. This reads every
 * className form — plain string, template literal, string in braces — strips
 * interpolations, and judges each token.
 *
 * A token is allowed when it is a BEM name (`block__element`, `block--modifier`,
 * or a bare block that owns a co-located stylesheet) or one of the app-wide
 * primitives. Everything else is a utility and is reported.
 *
 * Scope is a directory prefix so the sweep can be enforced one directory at a
 * time while the rest of the app is still being converted:
 *   pnpm check:utilities src/boards
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The primitives in src/styles/primitives.css, which are not utilities. */
const PRIMITIVES = new Set([
  "label",
  "page",
  "stack",
  "row",
  "hairline",
  "quiet-link",
  "truncate-line",
]);

const CLASS_ATTR =
  /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/g;
const INTERPOLATION = /\$\{[^}]*\}/g;

const tsxUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name.startsWith(".") ? [] : tsxUnder(full);
    }
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.")
      ? [full]
      : [];
  });

/** A bare block name is fine when a stylesheet next to it defines the block. */
const hasOwnStylesheet = (file: string, token: string): boolean => {
  const dir = path.dirname(file);
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".css"))
      .some((name) =>
        readFileSync(path.join(dir, name), "utf8").includes(`.${token}`)
      );
  } catch {
    return false;
  }
};

const root = process.argv[2] ?? "src";
if (!statSync(root).isDirectory()) {
  throw new Error(`Not a directory: ${root}`);
}

const offences: { file: string; tokens: string[] }[] = [];
for (const file of tsxUnder(root)) {
  const text = readFileSync(file, "utf8");
  const found = new Set<string>();
  for (const match of text.matchAll(CLASS_ATTR)) {
    const raw = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    for (const token of raw.replace(INTERPOLATION, " ").split(/\s+/)) {
      if (!token || token.includes("__") || token.includes("--")) {
        continue;
      }
      if (PRIMITIVES.has(token) || hasOwnStylesheet(file, token)) {
        continue;
      }
      found.add(token);
    }
  }
  if (found.size > 0) {
    offences.push({ file, tokens: [...found].sort() });
  }
}

if (offences.length === 0) {
  console.log(`No utility classes under ${root}.`);
  process.exit(0);
}

const total = offences.reduce((sum, o) => sum + o.tokens.length, 0);
console.error(`${total} utility class(es) in ${offences.length} file(s):\n`);
for (const { file, tokens } of offences) {
  console.error(`  ${file}`);
  console.error(`    ${tokens.join(" ")}`);
}
process.exit(1);
