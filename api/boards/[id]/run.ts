import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  containedBy,
  type GraphItem,
  type GraphWire,
  hasCycle,
  incomingByPort,
} from "../../../config/graph.js";
import { ICON_STYLES, isIconStyle } from "../../../config/iconStyles.js";
import {
  type FalModelInput,
  falModelFor,
  falModelInput,
  isFalModel,
  isRunnableNodeType,
  isVectorModel,
  MAX_BATCH_COUNT,
  type NodeCapability,
  nodeTypeFor,
} from "../../../config/nodeTypes.js";
import { getBearerUser } from "../../_lib/auth.js";
import type { BoardItemRow, BoardWireRow } from "../../_lib/boards.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import { generateImage, isFalConfigured } from "../../_lib/fal.js";
import { inputFingerprint } from "../../_lib/fingerprint.js";
import { parsePublicHttpUrl } from "../../_lib/httpUrl.js";
import { generateIcon, isMagnificConfigured } from "../../_lib/magnific.js";
import { parseJsonBody } from "../../_lib/parseBody.js";
import { getSite } from "../../_lib/site.js";

type Sql = ReturnType<typeof getSql>;

/** An explicit scheme, as api/ai/generate.ts requires for the same reason. */
const HTTP_SCHEME = /^https?:\/\//i;

/**
 * Runs exactly one node on a board.
 *
 * One node per request, and no run state kept between requests, because a
 * single generation already budgets close to two minutes — 120s in
 * api/_lib/fal.ts, 110s in api/_lib/magnific.ts — against a serverless ceiling.
 * A three-node chain could not fit in one call under any timeout the platform
 * allows, so the browser walks the graph in dependency order and calls this
 * once per node. That keeps every run an individually authorised request.
 *
 * Admin-only, and deliberately so: every call spends money on the project's
 * accounts. Publishing a board does not open this — an anonymous caller gets a
 * 401 whether or not the board is public.
 */

interface RunnableItem {
  config: Record<string, unknown>;
  id: string;
  nodeType: string;
  result: { fingerprint?: string; url?: string } | null;
  runState: string | null;
}

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const loadItems = async (sql: Sql, boardId: string) =>
  (await sql`
    SELECT i.id, i.kind, i.body, i.image_url, i.node_type, i.config,
           i.result, i.run_state, i.photo_id,
           p.url AS photo_url
    FROM board_items i
    LEFT JOIN photos p ON p.id = i.photo_id
    WHERE i.board_id = ${boardId}
  `) as BoardItemRow[];

const loadWires = async (sql: Sql, boardId: string) =>
  (await sql`
    SELECT id, source_item_id, source_port, target_item_id, target_port
    FROM board_wires
    WHERE board_id = ${boardId}
  `) as BoardWireRow[];

/**
 * What an item hands to whatever it feeds.
 *
 * A photograph resolves through its join rather than a stored copy, so
 * re-uploading it keeps the graph correct — the same reasoning rowToItemDto
 * already applies for display.
 */
const singleOutputOf = (row: BoardItemRow): string | null => {
  if (row.kind === "photo") {
    return row.photo_url ?? null;
  }
  if (row.kind === "reference") {
    return row.image_url;
  }
  if (row.kind === "note" || row.kind === "text") {
    return row.body;
  }
  // A source node produces its value without ever running, so it is read from
  // its settings rather than from a result it will never have.
  if (!isRunnableNodeType(row.node_type)) {
    const config = asObject(row.config);
    const text = config.text ?? config.prompt;
    return typeof text === "string" && text.trim() ? text : null;
  }
  const result = asObject(row.result);
  return typeof result.url === "string" ? result.url : null;
};

/**
 * Everything an item hands downstream.
 *
 * A list rather than one value, because a frame emits every image sitting on
 * it — one wire out of a frame is a dozen jobs. Everything else contributes at
 * most one, so the list is how both fit the same wire.
 */
const outputsOf = (row: BoardItemRow, rows: BoardItemRow[]): string[] => {
  if (row.kind !== "frame") {
    const single = singleOutputOf(row);
    return single ? [single] : [];
  }
  // Resolved from geometry, exactly as the canvas resolves it — see
  // containedBy for why membership is computed rather than stored.
  return containedBy(toBox(row), rows.map(toBox))
    .map((box) => rows.find((candidate) => candidate.id === box.id))
    .map((contained) => (contained ? singleOutputOf(contained) : null))
    .filter((url): url is string => url !== null);
};

const toBox = (row: BoardItemRow) => ({
  height: num(row.height),
  id: row.id,
  kind: row.kind,
  width: num(row.width),
  x: num(row.x),
  y: num(row.y),
});

/** Geometry arrives from the driver as strings often enough to coerce here. */
const num = (value: number | string): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toGraphItems = (rows: BoardItemRow[]): GraphItem[] =>
  rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    nodeType: row.node_type ?? null,
  }));

const toGraphWires = (rows: BoardWireRow[]): GraphWire[] =>
  rows.map((row) => ({
    id: row.id,
    sourceItemId: row.source_item_id,
    sourcePort: row.source_port,
    targetItemId: row.target_item_id,
    targetPort: row.target_port,
  }));

interface ResolvedInputs {
  /** Missing required port, if any — reported without spending anything. */
  missingPort: string | null;
  /**
   * Every value wired to each port, in wire order.
   *
   * Undefined for a port nothing feeds — not an empty array. A total index
   * signature would claim every port key is present and make the callers'
   * guards look redundant when they are not.
   */
  values: Record<string, string[] | undefined>;
}

/**
 * Reads each input port's value out of the stored graph.
 *
 * Deliberately not taken from the request. This resolves a URL that is then
 * handed to a third party to go and fetch, and trusting the caller for it would
 * reopen exactly the hole api/ai/generate.ts closes by insisting on an explicit
 * scheme before forwarding anything.
 */
const resolveInputs = (
  item: RunnableItem,
  rows: BoardItemRow[],
  wires: BoardWireRow[]
): ResolvedInputs => {
  const type = nodeTypeFor(item.nodeType);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const incoming = incomingByPort(toGraphWires(wires), item.id);

  const values: Record<string, string[] | undefined> = {};
  let missingPort: string | null = null;

  for (const port of type?.inputs ?? []) {
    const resolved: string[] = [];
    for (const wire of incoming.get(port.key) ?? []) {
      const source = byId.get(wire.sourceItemId);
      // A wire from a node that has not run yet resolves to nothing. Those are
      // dropped rather than treated as jobs, so a half-built graph runs the
      // part that is ready instead of failing whole.
      resolved.push(...(source ? outputsOf(source, rows) : []));
    }
    // A single-value input keeps only the last wire, matching what the canvas
    // does when a new wire is dropped on an occupied port.
    values[port.key] = port.arity === "many" ? resolved : resolved.slice(-1);
    if (port.required && resolved.length === 0 && !missingPort) {
      missingPort = port.key;
    }
  }

  return { missingPort, values };
};

/**
 * A wired prompt beats a typed one.
 *
 * Wiring is the more deliberate act — you went and connected something — and
 * the node says on its face that the typed field is unused while a wire is
 * attached, so the precedence is visible rather than surprising.
 */
const promptFor = (
  item: RunnableItem,
  values: Record<string, string[] | undefined>
): string => {
  const wired = values.prompt?.[0]?.trim();
  if (wired) {
    return wired;
  }
  // A Prompt node keeps its text under `text`; Generate and Icon under
  // `prompt`. Both are read so either can be the typed fallback.
  const typed = item.config.prompt ?? item.config.text;
  return typeof typed === "string" ? typed.trim() : "";
};

/**
 * How many runs this node's settings and wiring describe.
 *
 * One per wired image, times the variation count — so three references at two
 * variations is six. With no image wired at all it is still `count` runs, each
 * invented from the prompt alone.
 */
const jobsFor = (
  item: RunnableItem,
  values: Record<string, string[] | undefined>,
  shape: FalModelInput
): (string | null)[] => {
  const raw = Number(item.config.count);
  const count = Number.isFinite(raw)
    ? Math.min(Math.max(Math.trunc(raw), 1), MAX_BATCH_COUNT)
    : 1;
  // A prompt-only model has no use for wired images, so fanning out over them
  // would bill the same prompt several times for identical results.
  const wired = shape === "prompt" ? [] : (values.image ?? []);
  const images: (string | null)[] = wired.length > 0 ? wired : [null];

  const jobs: (string | null)[] = [];
  for (const image of images) {
    for (let n = 0; n < count; n += 1) {
      jobs.push(image);
    }
  }
  return jobs;
};

/** One image in a node's result. Mirrors BoardItemVariation in src/types.ts. */
interface Variation {
  description: string | null;
  height: number | null;
  isVector: boolean | null;
  url: string;
  width: number | null;
}

interface Produced {
  description: string | null;
  height: number | null;
  /** Null when the concept does not apply — every raster generator. */
  isVector: boolean | null;
  url: string;
  width: number | null;
}

/**
 * Dispatches to the generator a node type declares.
 *
 * The only place a node type turns into a third-party call. Adding a node type
 * is therefore an entry in config/nodeTypes.ts plus one branch here — no schema
 * change, no change to the wire model, and nothing at all in the canvas.
 *
 * Both generators already copy their output into blob storage before returning,
 * so a result is durable by the time it reaches this function.
 */
const produce = async (
  capability: NodeCapability,
  args: {
    item: RunnableItem;
    /** "auto" (or absent) keeps fal.ts's own image-present switch. */
    model: string | null;
    prompt: string;
    sourceImageUrl: string | null;
  }
): Promise<Produced> => {
  if (capability === "magnific.icon") {
    const style = isIconStyle(args.item.config.style)
      ? args.item.config.style
      : ICON_STYLES[0];
    // Required by every Magnific endpoint even though this polls for the
    // result, so it points at our own sink — exactly as api/ai/icon.ts does.
    const site = getSite();
    const icon = await generateIcon(
      args.prompt,
      style,
      `https://${site.domain}/api/ai/icon-webhook`
    );
    return {
      description: null,
      height: null,
      isVector: icon.isVector,
      url: icon.url,
      width: null,
    };
  }

  const image = await generateImage(
    args.prompt,
    args.sourceImageUrl,
    args.model
  );
  return {
    description: image.description,
    height: image.height,
    // Taken from the model's own entry rather than guessed from the file: the
    // node shows a "came back as a raster" warning, and an SVG mislabelled as
    // raster would raise it for no reason.
    isVector: isVectorModel(args.model) ? true : null,
    url: image.url,
    width: image.width,
  };
};

const setRunning = (sql: Sql, itemId: string) =>
  sql`
    UPDATE board_items
    SET run_state = 'running', run_error = NULL
    WHERE id = ${itemId}
  `;

const saveFailure = (sql: Sql, itemId: string, message: string) =>
  sql`
    UPDATE board_items
    SET run_state = 'failed', run_error = ${message}
    WHERE id = ${itemId}
  `;

/**
 * Why this model cannot run on this wiring, or null when it can.
 *
 * Checked here rather than left to fal, which only reports a mismatched body
 * after the call has been billed. Each model declares what it consumes, so an
 * unwired vectoriser or a promptless generation is refused for free.
 */
const unmetRequirement = (
  shape: FalModelInput,
  model: string | null,
  prompt: string,
  values: Record<string, string[] | undefined>
): Record<string, unknown> | null => {
  if (shape === "image") {
    if ((values.image?.length ?? 0) === 0) {
      const label = falModelFor(model)?.label ?? "This model";
      return {
        error: `${label} traces an existing image; wire one into it.`,
        missingPort: "image",
      };
    }
    // A vectoriser has no prompt to want.
    return null;
  }
  if (!prompt) {
    return {
      error: "This node needs a prompt, wired in or typed on the node.",
      missingPort: "prompt",
    };
  }
  return null;
};

/**
 * The job list with every URL checked, or null if one is not forwardable.
 *
 * Validated even though these are usually our own blob URLs: they are handed to
 * a third party to go and fetch, which is the same reason api/ai/generate.ts
 * insists on an explicit scheme rather than helpfully adding one.
 */
const validatedJobs = (raw: (string | null)[]): (string | null)[] | null => {
  const jobs: (string | null)[] = [];
  for (const entry of raw) {
    if (entry === null) {
      jobs.push(null);
      continue;
    }
    const url = HTTP_SCHEME.test(entry) ? parsePublicHttpUrl(entry) : null;
    if (!url) {
      return null;
    }
    jobs.push(url);
  }
  return jobs;
};

/** Either a response to send as-is, or everything the run needs. */
type Prepared =
  | { body: Record<string, unknown>; ready: null; status: number }
  | {
      body: null;
      ready: {
        capability: NodeCapability;
        fingerprint: string;
        item: RunnableItem;
        /** One entry per variation: the image it reworks, or null to invent. */
        jobs: (string | null)[];
        model: string | null;
        prompt: string;
      };
      status: null;
    };

const refuse = (status: number, body: Record<string, unknown>): Prepared => ({
  body,
  ready: null,
  status,
});

/**
 * Everything that can refuse a run, in the order that costs least.
 *
 * Separated from the handler so each is one flat check rather than another
 * level of nesting, and so the order — cheapest and most certain first, the
 * expensive third-party call last — is visible at a glance.
 */
const prepare = async (
  rows: BoardItemRow[],
  wireRows: BoardWireRow[],
  itemId: string,
  force: boolean
): Promise<Prepared> => {
  const row = rows.find((candidate) => candidate.id === itemId);
  if (row?.kind !== "op" || !row.node_type) {
    return refuse(404, { error: "Node not found on this board" });
  }

  const type = nodeTypeFor(row.node_type);
  if (!type) {
    return refuse(404, { error: "Unknown node type" });
  }
  // A Prompt node holds a value rather than producing one. Asking to run it is
  // a client bug, not a user error, so it is refused rather than quietly
  // succeeding as a no-op.
  if (!type.capability) {
    return refuse(422, {
      error: `A ${type.label} node holds its value; there is nothing to run.`,
    });
  }

  // Checked again here, not only on save: a graph that cannot be ordered cannot
  // be run, and finding that out before spending anything is free.
  if (hasCycle(toGraphItems(rows), toGraphWires(wireRows))) {
    return refuse(400, { error: "This board's connections form a loop." });
  }

  const item: RunnableItem = {
    config: asObject(row.config),
    id: row.id,
    nodeType: row.node_type,
    result: asObject(row.result),
    runState: row.run_state ?? null,
  };

  const { missingPort, values } = resolveInputs(item, rows, wireRows);
  if (missingPort) {
    return refuse(422, {
      error: `This node needs its ${missingPort} input before it can run.`,
      missingPort,
    });
  }

  // An explicit model is checked against the allowlist rather than forwarded:
  // the value reaches fal, and an unknown id is a request that fails after it
  // has been paid for. An unrecognised choice falls back to "auto".
  const model = isFalModel(item.config.model)
    ? (item.config.model as string)
    : null;
  const shape = falModelInput(model ?? "auto");

  const prompt = promptFor(item, values);
  const unmet = unmetRequirement(shape, model, prompt, values);
  if (unmet) {
    return refuse(422, unmet);
  }

  const needsFal = type.capability === "fal.image";
  if (needsFal && !isFalConfigured()) {
    return refuse(503, {
      error:
        "Image generation is not configured. Set FAL_API_KEY on the project.",
    });
  }
  if (!(needsFal || isMagnificConfigured())) {
    return refuse(503, {
      error:
        "Icon generation is not configured. Set MAGNIFIC_API_KEY on the project.",
    });
  }

  // Every wired image becomes a job, each validated before being forwarded:
  // these URLs are handed to a third party to go and fetch.
  const jobs = validatedJobs(jobsFor(item, values, shape));
  if (jobs === null) {
    return refuse(422, {
      error: "A wired image is not a public http(s) URL",
    });
  }

  // Nothing has changed since the stored result, so producing it again would
  // cost money to arrive at the same images. A batch is only skipped once every
  // variation is present — a run cancelled halfway resumes rather than being
  // treated as finished.
  const fingerprint = await inputFingerprint({
    config: item.config,
    // Joined per port: the fingerprint only has to change when the inputs do,
    // and a stable string does that as well as an array while keeping the
    // canonical form simple.
    inputs: Object.fromEntries(
      Object.entries(values).map(([key, list]) => [
        key,
        (list ?? []).join("\u0000"),
      ])
    ),
    nodeType: item.nodeType,
  });
  const stored = asObject(item.result);
  const done = Array.isArray(stored.variations)
    ? (stored.variations as unknown[]).filter(Boolean).length
    : 0;
  if (
    !force &&
    item.runState === "succeeded" &&
    stored.fingerprint === fingerprint &&
    done >= jobs.length
  ) {
    return refuse(200, {
      itemId,
      result: item.result,
      runError: null,
      runState: "succeeded",
      skipped: true,
      variationCount: jobs.length,
    });
  }

  return {
    body: null,
    ready: {
      capability: type.capability,
      fingerprint,
      item,
      jobs,
      model,
      prompt,
    },
    status: null,
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const raw = req.query.id;
  const boardId = Array.isArray(raw) ? raw[0] : raw;
  if (!boardId) {
    return res.status(400).json({ error: "A board id is required" });
  }

  const body = parseJsonBody(req.body);
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const force = body.force === true;
  // Which variation of a batch to produce. One per request, because four
  // variations at two minutes each could no more fit in one function call than
  // a four-node chain could — the same ceiling, the same answer.
  const variation = Number.isFinite(Number(body.variation))
    ? Math.max(0, Math.trunc(Number(body.variation)))
    : 0;
  if (!itemId) {
    return res.status(400).json({ error: "An item id is required" });
  }

  const sql = getSql();

  try {
    const [rows, wireRows] = await Promise.all([
      loadItems(sql, boardId),
      loadWires(sql, boardId),
    ]);

    const prepared = await prepare(rows, wireRows, itemId, force);
    if (prepared.ready === null) {
      return res.status(prepared.status).json(prepared.body);
    }
    const { capability, fingerprint, item, jobs, model, prompt } =
      prepared.ready;

    if (variation >= jobs.length) {
      return res
        .status(422)
        .json({ error: "That variation is past the end of this batch." });
    }

    await setRunning(sql, itemId);

    try {
      const produced = await produce(capability, {
        item,
        model,
        prompt,
        sourceImageUrl: jobs[variation] ?? null,
      });

      // Variations accumulate into one result rather than replacing it, so a
      // batch fills in as it goes and a part-finished run still shows what it
      // has. A stale array from an earlier, differently-shaped run is discarded
      // — the fingerprint moving is what says the old images no longer belong.
      const previous = asObject(item.result);
      // Sparse on purpose: a cancelled and resumed run can fill variation 3
      // before 1, so the gaps are real and the type says so.
      const kept: (Variation | undefined)[] =
        previous.fingerprint === fingerprint &&
        Array.isArray(previous.variations)
          ? (previous.variations as (Variation | undefined)[]).slice(
              0,
              jobs.length
            )
          : [];
      const variations: (Variation | undefined)[] = [...kept];
      variations[variation] = {
        description: produced.description,
        height: produced.height,
        isVector: produced.isVector,
        url: produced.url,
        width: produced.width,
      };

      // The first filled slot, found by hand: the array is sparse, and the
      // narrowing on find() reads as though the result could never be missing.
      let primaryUrl = produced.url;
      for (const filled of variations) {
        if (filled) {
          primaryUrl = filled.url;
          break;
        }
      }

      const result = {
        description: produced.description,
        fingerprint,
        height: produced.height,
        isVector: produced.isVector,
        kind: "image" as const,
        ranAt: new Date().toISOString(),
        // The first image is what a wire carries downstream: a wire moves one
        // image, so the rest of a batch is for looking at, not for feeding on.
        url: primaryUrl,
        variations,
        width: produced.width,
      };

      await sql`
        UPDATE board_items
        SET result = ${JSON.stringify(result)}::jsonb,
            run_state = 'succeeded',
            run_error = NULL
        WHERE id = ${itemId}
      `;

      return res.status(200).json({
        itemId,
        result,
        runError: null,
        runState: "succeeded",
        skipped: false,
        variationCount: jobs.length,
      });
    } catch (e) {
      console.error(e);
      const message =
        e instanceof Error ? e.message : "Could not run this node";
      // Recorded, so the failure survives a reload and the node explains itself
      // rather than merely looking un-run.
      await saveFailure(sql, itemId, message);
      return res.status(502).json({ error: message });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not run this node" });
  }
}
