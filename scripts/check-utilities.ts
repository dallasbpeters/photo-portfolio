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

/*
 * Left alone on purpose.
 *
 * src/components/ui is shadcn. Its utility classes are the upstream API — a
 * caller restyles one of these by passing utilities that `cn()` merges over the
 * defaults — so converting them to BEM would fork the whole directory off
 * upstream permanently and break the way every call site already customises
 * them. The cost is ongoing; the benefit is tidiness in files nobody edits by
 * hand. Excluded by the owner's decision, not by oversight.
 */
const EXCLUDED = ["src/components/ui"];

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
    if (EXCLUDED.some((skip) => full.startsWith(skip))) {
      return [];
    }
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.")
      ? [full]
      : [];
  });

/**
 * Every class this project's own stylesheets define.
 *
 * Collected across all of src rather than per directory. The first version of
 * this looked only beside the file, which was wrong the moment a shared
 * stylesheet moved one level up — every shared class then read as a utility.
 * Where a class is declared is not the question; whether we declare it is.
 */
const declaredClasses = (dir: string): Set<string> => {
  const found = new Set<string>();
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".css")) {
        for (const m of readFileSync(full, "utf8").matchAll(
          /\.(-?[_a-zA-Z][\w-]*)/g
        )) {
          found.add(m[1]);
        }
      }
    }
  };
  walk(dir);
  return found;
};

const OURS = declaredClasses("src");

/**
 * A block whose elements we declare, even if the block needs no rules itself.
 *
 * `<div className="page content-page">` is correct BEM: the root carries the
 * block name that `content-page__*` hangs off, and the block has nothing to
 * declare because `.page` already paints it. Dropping the class to satisfy a
 * checker would leave the root anonymous.
 */
const isOurBlock = (token: string): boolean => {
  for (const declared of OURS) {
    if (
      declared.startsWith(`${token}__`) ||
      declared.startsWith(`${token}--`)
    ) {
      return true;
    }
  }
  return false;
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
      if (PRIMITIVES.has(token) || OURS.has(token) || isOurBlock(token)) {
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
