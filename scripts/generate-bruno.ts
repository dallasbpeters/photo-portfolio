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
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "bruno");

type Json = Record<string, unknown>;

const doc = JSON.parse(
  await import("node:fs/promises").then((fs) =>
    fs.readFile(path.join(ROOT, "openapi.json"), "utf8")
  )
) as {
  components: { schemas: Record<string, Json> };
  paths: Record<string, Record<string, Json>>;
};

const deref = (schema: Json | undefined, depth = 0): Json | undefined => {
  if (!schema || depth > 6) {
    return schema;
  }
  const ref = schema.$ref as string | undefined;
  if (ref) {
    const name = ref.split("/").pop() ?? "";
    return deref(doc.components.schemas[name], depth + 1);
  }
  return schema;
};

/** A placeholder value for one property, good enough to edit rather than invent. */
const sample = (schema: Json | undefined, depth = 0): unknown => {
  const s = deref(schema, depth);
  if (!s || depth > 5) {
    return null;
  }
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

const file = (
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
    `${method} {\n  url: ${brunoUrl(p)}\n  body: ${hasBody ? "json" : "none"}\n  auth: ${secured ? "bearer" : "none"}\n}`,
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

rmSync(OUT, { force: true, recursive: true });
mkdirSync(OUT, { recursive: true });

writeFileSync(
  path.join(OUT, "bruno.json"),
  `${JSON.stringify(
    { name: "Photo portfolio API", type: "collection", version: "1" },
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
  writeFileSync(
    path.join(OUT, "environments", `${name}.bru`),
    `vars {\n  baseUrl: ${url}\n}\n\nvars:secret [\n  token\n]\n`
  );
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
      file(name, seq, method.toUpperCase(), p, op)
    );
    count += 1;
  }
}

process.stdout.write(
  `bruno/ — ${count} requests across ${seqByFolder.size} folders.\n`
);
