/**
 * Builds a Bruno collection from `openapi.json`.
 *
 * Generated rather than written so the collection cannot fall behind the API —
 * it is regenerated from the same document the handlers are described by, and
 * `bruno/` is disposable. Requests are grouped into folders by tag, which maps
 * to the first path segment, so `photos`, `pages` and `auth` each get one.
 *
 * A body is filled in from the schema when the document describes one, giving
 * an example that already has the right keys instead of an empty brace.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "bruno");

type Json = Record<string, unknown>;

const existingEntries = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir) : [];

const readJson = (filePath: string): Json => {
  if (!existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Json;
  } catch {
    return {};
  }
};

const doc = JSON.parse(
  await import("node:fs/promises").then((fs) =>
    fs.readFile(path.join(ROOT, "openapi.json"), "utf8")
  )
) as {
  components: { schemas: Record<string, Json> };
  paths: Record<string, Record<string, Json>>;
};

// A `$ref` that names no schema resolves to the reference itself, which
// samples as an empty string rather than throwing on a malformed document.
const deref = (schema: Json, depth = 0): Json => {
  if (depth > 6) {
    return schema;
  }
  const ref = schema.$ref as string | undefined;
  if (ref) {
    const name = ref.split("/").pop() ?? "";
    const target = doc.components.schemas[name] as Json | undefined;
    return target ? deref(target, depth + 1) : schema;
  }
  return schema;
};

/** A placeholder value for one property, good enough to edit rather than invent. */
const sample = (schema: Json | undefined, depth = 0): unknown => {
  if (!schema || depth > 5) {
    return null;
  }
  const s = deref(schema, depth);
  if (Array.isArray(s.enum)) {
    return s.enum[0];
  }
  switch (s.type) {
    case "array":
      return [sample(s.items as Json, depth + 1)];
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    case "object": {
      const out: Json = {};
      for (const [k, v] of Object.entries(
        (s.properties ?? {}) as Record<string, Json>
      )) {
        out[k] = sample(v, depth + 1);
      }
      return out;
    }
    default:
      return s.format === "uuid" ? "00000000-0000-0000-0000-000000000000" : "";
  }
};

/** Bruno reads `{{var}}`; path params become collection variables to fill in. */
const brunoUrl = (p: string): string =>
  `{{baseUrl}}${p.replace(/\{([^}]+)\}/g, "{{$1}}")}`;

/** A `docs` block is line-oriented, so text has to collapse onto one line. */
const oneLine = (text: string): string => text.replace(/\r?\n/g, " ").trim();

const requestFile = (
  name: string,
  seq: number,
  method: string,
  p: string,
  op: Json
): string => {
  const bodySchema = (
    (op.requestBody as Json | undefined)?.content as Json | undefined
  )?.["application/json"] as Json | undefined;
  const hasBody = Boolean(bodySchema?.schema);
  const secured = Array.isArray(op.security) && op.security.length > 0;

  const parts = [
    `meta {\n  name: ${name}\n  type: http\n  seq: ${seq}\n}`,
    // Lower case: Bruno's grammar names these blocks `get`, `post`, `patch`.
    // An upper-case `POST {` fails to parse, which made every request in the
    // collection invalid.
    `${method.toLowerCase()} {\n  url: ${brunoUrl(p)}\n  body: ${hasBody ? "json" : "none"}\n  auth: ${secured ? "bearer" : "none"}\n}`,
  ];

  if (secured) {
    parts.push("auth:bearer {\n  token: {{token}}\n}");
  }
  if (hasBody) {
    const body = JSON.stringify(sample(bodySchema?.schema as Json), null, 2)
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n");
    parts.push(`body:json {\n${body}\n}`);
  }
  const summary = oneLine((op.summary as string | undefined) ?? "");
  const description = oneLine((op.description as string | undefined) ?? "");
  if (summary || description) {
    parts.push(
      `docs {\n  ${summary}${description ? `\n\n  ${description}` : ""}\n}`
    );
  }
  return `${parts.join("\n\n")}\n`;
};

// Only the generated request folders are cleared. bruno.json and
// environments/ are left alone: Bruno writes its own settings into the former,
// and wiping the directory wholesale threw those away on every run.
for (const entry of existingEntries(OUT)) {
  if (entry !== "bruno.json" && entry !== "environments") {
    rmSync(path.join(OUT, entry), { force: true, recursive: true });
  }
}
mkdirSync(OUT, { recursive: true });

const brunoJsonPath = path.join(OUT, "bruno.json");
const existing = readJson(brunoJsonPath);
writeFileSync(
  brunoJsonPath,
  `${JSON.stringify(
    {
      ...existing,
      name: "Photo portfolio API",
      type: "collection",
      version: "1",
    },
    null,
    2
  )}\n`
);

// Two environments, matching the two servers in the document. The token is left
// empty on purpose: it is a credential, and this directory is committed.
mkdirSync(path.join(OUT, "environments"), { recursive: true });
for (const [name, url] of [
  ["Local", "http://localhost:3006"],
  ["Production", "https://app.dallaspeters.com"],
] as const) {
  const envFile = path.join(OUT, "environments", `${name}.bru`);
  // Written once. An environment is where a token gets pasted, and
  // regenerating over it would delete that on every `pnpm api:docs`.
  if (!existsSync(envFile)) {
    writeFileSync(
      envFile,
      `vars {\n  baseUrl: ${url}\n}\n\nvars:secret [\n  token\n]\n`
    );
  }
}

const seqByFolder = new Map<string, number>();
let count = 0;

for (const [p, methods] of Object.entries(doc.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    const folder = ((op.tags as string[] | undefined)?.[0] ?? "misc").replace(
      /[^a-z0-9-]/gi,
      ""
    );
    const dir = path.join(OUT, folder);
    mkdirSync(dir, { recursive: true });

    const seq = (seqByFolder.get(folder) ?? 0) + 1;
    seqByFolder.set(folder, seq);

    const name = `${method.toUpperCase()} ${p.replace("/api/", "")}`;
    const safe = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    writeFileSync(
      path.join(dir, `${safe}.bru`),
      requestFile(name, seq, method.toUpperCase(), p, op)
    );
    count += 1;
  }
}

process.stdout.write(
  `bruno/ — ${count} requests across ${seqByFolder.size} folders.\n`
);
