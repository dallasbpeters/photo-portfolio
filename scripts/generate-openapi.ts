/**
 * Builds `openapi.json` from the filesystem plus the schema registry.
 *
 * The route list comes from `api/` rather than a hand-kept document, because a
 * hand-kept list of 57 endpoints is a list that is wrong within a week. Vercel
 * routes by filename, so the filenames *are* the paths:
 *
 *   api/photos/index.ts        ->  /api/photos
 *   api/photos/[id].ts         ->  /api/photos/{id}
 *   api/photos/[id]/reset.ts   ->  /api/photos/{id}/reset
 *
 * Methods are read from each handler's own `req.method` checks. Nothing is
 * imported: several modules call `bootstrapEnv()` or open a database
 * connection at module scope, and generating a document should not need a
 * database. Static reading is enough for the shape of the API.
 *
 * `schemas/routes.ts` then supplies what a filename cannot: request and
 * response bodies, and which endpoints need a token. An endpoint with no entry
 * there is still published — marked as undescribed — so the document covers
 * everything and its gaps are visible rather than implied.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { z } from "zod";
import { ErrorResponse, NAMED_SCHEMAS } from "../schemas/domain";
import { OPERATIONS, type Operation } from "../schemas/routes";

const ROOT = path.resolve(import.meta.dirname, "..");
const API_DIR = path.join(ROOT, "api");
// Both forms, from one build. YAML is what most editors and API clients want
// pasted in and what reads best in review; JSON is what tooling parses without
// a dependency. Neither is written by hand, so they cannot disagree.
const OUT_JSON = path.join(ROOT, "openapi.json");
const OUT_YAML = path.join(ROOT, "openapi.yaml");

const METHODS = ["get", "post", "put", "patch", "delete"] as const;
type Method = (typeof METHODS)[number];

const TS_SUFFIX = /\.ts$/;
const INDEX_SUFFIX = /\/index$/;

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // `_lib` is shared code, not routes.
      if (!entry.name.startsWith("_")) {
        out.push(...walk(full));
      }
    } else if (entry.name.endsWith(".ts") && !entry.name.startsWith("_")) {
      out.push(full);
    }
  }
  return out;
};

/** `api/photos/[id]/reset.ts` -> `/api/photos/{id}/reset` */
const routePath = (file: string): string => {
  const rel = path
    .relative(ROOT, file)
    .replace(TS_SUFFIX, "")
    .replace(INDEX_SUFFIX, "");
  return `/${rel.replace(/\[([^\]]+)\]/g, "{$1}")}`;
};

/**
 * The methods a handler answers.
 *
 * Read from its `req.method === "X"` comparisons and any `Allow` header it
 * sets. A handler that checks nothing responds to everything, which is
 * reported as GET rather than guessed at.
 */
const methodsOf = (source: string): Method[] => {
  const found = new Set<Method>();
  for (const m of source.matchAll(/req\.method\s*===\s*"([A-Z]+)"/g)) {
    const method = m[1]?.toLowerCase() as Method;
    if (METHODS.includes(method)) {
      found.add(method);
    }
  }
  for (const m of source.matchAll(/"Allow",\s*"([^"]+)"/g)) {
    for (const raw of (m[1] ?? "").split(",")) {
      const method = raw.trim().toLowerCase() as Method;
      if (METHODS.includes(method)) {
        found.add(method);
      }
    }
  }
  return found.size > 0 ? [...found] : ["get"];
};

/**
 * Named shapes become components once and are referenced everywhere after.
 *
 * zod can invent names for anything it sees reused, but it invents `__schema0`,
 * which describes nothing. Listing the names explicitly in NAMED_SCHEMAS keeps
 * the document readable, and anything unlisted is inlined at its use site,
 * which is right for a one-off request body.
 */
const byName = new Map<z.ZodType, string>(
  Object.entries(NAMED_SCHEMAS).map(([name, schema]) => [
    schema as z.ZodType,
    name,
  ])
);

const plain = (schema: z.ZodType): Record<string, unknown> => {
  const json = z.toJSONSchema(schema, { io: "output" }) as Record<
    string,
    unknown
  >;
  json.$schema = undefined;
  return JSON.parse(JSON.stringify(json)) as Record<string, unknown>;
};

const components: Record<string, unknown> = {};
for (const [name, schema] of Object.entries(NAMED_SCHEMAS)) {
  components[name] = plain(schema as z.ZodType);
}

const toSchema = (schema: z.ZodType): unknown => {
  const name = byName.get(schema);
  if (name) {
    return { $ref: `#/components/schemas/${name}` };
  }
  // An array of a named shape is common enough to be worth referencing too.
  const def = (
    schema as { _zod?: { def?: { type?: string; element?: unknown } } }
  )._zod?.def;
  if (def?.type === "array") {
    const inner = byName.get(def.element as z.ZodType);
    if (inner) {
      return {
        items: { $ref: `#/components/schemas/${inner}` },
        type: "array",
      };
    }
  }
  return plain(schema);
};

const jsonBody = (schema: z.ZodType) => ({
  content: { "application/json": { schema: toSchema(schema) } },
});

const tagOf = (p: string): string => p.split("/")[2] ?? "misc";

const operation = (method: Method, p: string, spec: Operation | undefined) => {
  const params = [...p.matchAll(/\{([^}]+)\}/g)].map((m) => ({
    in: "path",
    name: m[1],
    required: true,
    schema: { type: "string" },
  }));

  const responses: Record<string, unknown> = {
    "4XX": { description: "Request rejected", ...jsonBody(ErrorResponse) },
    "5XX": { description: "Server error", ...jsonBody(ErrorResponse) },
    "200": spec?.response
      ? { description: "Success", ...jsonBody(spec.response) }
      : { description: "Success" },
  };
  if (spec?.auth) {
    responses["401"] = {
      description: "Missing or invalid token",
      ...jsonBody(ErrorResponse),
    };
  }

  return {
    description:
      spec?.description ??
      (spec
        ? undefined
        : "Not yet described in schemas/routes.ts — path and method were read from the handler."),
    operationId: `${method}${p.replace(/[/{}]/g, "_")}`,
    parameters: params.length > 0 ? params : undefined,
    requestBody: spec?.body
      ? { required: true, ...jsonBody(spec.body) }
      : undefined,
    responses,
    // An empty array is not the same as omitting this: it states the
    // endpoint is deliberately public, which is what most of these are.
    security: spec?.auth ? [{ bearerAuth: [] }] : [],
    summary: spec?.summary ?? `${method.toUpperCase()} ${p}`,
    tags: [tagOf(p)],
    "x-undocumented": spec ? undefined : true,
  };
};

const paths: Record<string, Record<string, unknown>> = {};
let described = 0;
let total = 0;

// Code-unit order, matching the default `Array#sort` this replaces.
const byCodeUnit = (a: string, b: string) => {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
};

for (const file of walk(API_DIR).sort(byCodeUnit)) {
  const p = routePath(file);
  const source = readFileSync(file, "utf8");
  paths[p] ??= {};
  for (const method of methodsOf(source)) {
    const spec = OPERATIONS[`${method.toUpperCase()} ${p}`];
    total += 1;
    if (spec) {
      described += 1;
    }
    paths[p][method] = operation(method, p, spec);
  }
}

const document = {
  components: {
    schemas: components,
    securitySchemes: {
      bearerAuth: { bearerFormat: "JWT", scheme: "bearer", type: "http" },
    },
  },
  info: {
    description:
      "Generated from the handlers in `api/` and the schemas in `schemas/`. Do not edit by hand — run `pnpm openapi`.",
    title: "Photo portfolio API",
    version: "1.0.0",
  },
  openapi: "3.1.0",
  paths,
  servers: [
    { description: "Local", url: "http://localhost:3006" },
    { description: "Production", url: "https://app.dallaspeters.com" },
  ],
};

writeFileSync(OUT_JSON, `${JSON.stringify(document, null, 2)}\n`);
writeFileSync(
  OUT_YAML,
  stringify(document, { aliasDuplicateObjects: false, lineWidth: 0 })
);
process.stdout.write(
  `openapi.json + openapi.yaml — ${Object.keys(paths).length} paths, ${total} operations, ${described} with described bodies (${total - described} to go).\n`
);
