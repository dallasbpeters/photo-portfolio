import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  type FalModelDef,
  falModelInput,
  isFalModel,
} from "../../../config/falModels.js";
import { hasCycle } from "../../../config/graph.js";
import { nodeTypeFor } from "../../../config/nodeTypes.js";
import { getBearerUser } from "../../_lib/auth.js";
import type { BoardItemRow, BoardWireRow } from "../../_lib/boards.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import { withElements } from "../../_lib/elementBrief.js";
import {
  elementStyleOf,
  jobsFor,
  withElementWords,
} from "../../_lib/elementStyle.js";
import { loadModelDefs } from "../../_lib/models.js";
import { parseJsonBody } from "../../_lib/parseBody.js";
import { produce, unconfiguredProvider } from "./run/capabilities.js";
import { fingerprintFor } from "./run/fingerprint.js";
import {
  maskByUrl,
  promptFor,
  type RunnableItem,
  resolveInputs,
} from "./run/inputs.js";
import { unmetRequirement, validatedJobs } from "./run/refusals.js";
import {
  type Prepared,
  refuse,
  reply,
  type Sql,
  saveFailure,
  setRunning,
} from "./run/replies.js";
import { buildResult, stampProvenance } from "./run/results.js";
import { asObject, toGraphItems, toGraphWires } from "./run/rows.js";

/**
 * Runs exactly one node on a board.
 *
 * One node per request, no state between them: a single generation budgets
 * close to two minutes (120s in api/_lib/fal.ts, 110s in magnific.ts) against
 * a serverless ceiling, so a chain fits in no call the platform allows. The
 * browser walks the graph in order and calls this once per node.
 *
 * Admin-only, deliberately: every call spends money. Publishing a board does
 * not open this — an anonymous caller gets a 401 either way.
 */

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

/** One image in a node's result. Mirrors BoardItemVariation in src/types.ts. */

/**
 * Why this model cannot run on this wiring, or null when it can.
 *
 * Checked here rather than left to fal, which only reports a mismatched body
 * after the call has been billed. Each model declares what it consumes, so an
 * unwired vectoriser or a promptless generation is refused for free.
 */

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
  force: boolean,
  models: readonly FalModelDef[]
): Promise<Prepared> => {
  const row = rows.find((candidate) => candidate.id === itemId);
  if (row?.kind !== "op" || !row.node_type) {
    // Not recorded: there is either no such row, or one that is not a node of
    // ours, and writing a run failure onto a photograph would be a worse lie
    // than the silence.
    return reply(404, { error: "Node not found on this board" });
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

  const { lists, missingPort, values } = resolveInputs(item, rows, wireRows);
  if (missingPort) {
    return refuse(422, {
      error: `This node needs its ${missingPort} input before it can run.`,
      missingPort,
    });
  }

  // An explicit model is checked against the loaded list rather than
  // forwarded: the value reaches fal, and an unknown id is a request that fails
  // after it has been paid for. An unrecognised choice falls back to "auto".
  const model = isFalModel(models, item.config.model)
    ? (item.config.model as string)
    : null;
  const shape = falModelInput(models, model ?? "auto");

  const prompt = promptFor(item, values);
  const element = elementStyleOf(item.id, rows, wireRows);

  const masks = maskByUrl(rows);
  const masked = (values.image ?? []).some((url) => masks.has(url));
  /*
   * What was wired in, minus the elements. A cover arrives on the image port
   * like any other picture and every rule below asks "is there an image?", so
   * a node with only a style wired looked fully wired — and an edit model
   * handed that cover returned it. Subtracted before the refusals, not in
   * jobsFor, which runs after them.
   */
  const covers = new Set(element.images);
  const subjects = (values.image ?? []).filter((url) => !covers.has(url));
  const unmet = unmetRequirement(
    shape,
    model,
    // The composed prompt, so a node whose only words come from a wired element
    // is not refused for having none.
    withElementWords(prompt, element.words),
    { ...values, image: subjects },
    masked,
    type.capability,
    models
  );
  if (unmet) {
    return refuse(422, unmet);
  }

  const unconfigured = unconfiguredProvider(type.capability);
  if (unconfigured) {
    return unconfigured;
  }

  // Every wired image becomes a job, validated before forwarding: these URLs go
  // to a third party to fetch. Analyse is the exception — its job is to look
  // and say what it sees, so style words would hand it its own answer.
  //
  // The brief wins over the description. A description seeded from a Describe
  // node set to "subject" reads "a digital painting of a person's head and
  // shoulders", which appended to a restyle prompt tells the model to draw that
  // person. A brief cannot: read under `focus: "style"`, it may not name a
  // subject. `jobsFor` has already placed the briefs, so the description is
  // only the fallback for an element not yet read.
  const styleWords = element.briefs.length > 0 ? [] : element.words;
  const wordsForJobs = type.capability === "fal.describe" ? [] : styleWords;
  const { dropped, jobs } = validatedJobs(
    // Every job carries the wired elements' words, whether its prompt was typed
    // on the node or arrived down a wire. Applied here rather than inside
    // jobsFor because it is true of every prompt that function can produce, and
    // a Prompt node wired in alongside an element is the ordinary arrangement —
    // appending only to the typed fallback would drop the style in exactly the
    // case elements exist for.
    jobsFor({
      briefs: element.briefs,
      capability: type.capability,
      config: item.config,
      elementImages: element.images,
      lists,
      masks,
      shape,
      typedPrompt: prompt,
      values,
    }).map((job) => ({
      ...job,
      prompt: withElementWords(job.prompt, wordsForJobs),
    }))
  );
  // Refused only when nothing survived. A batch reduced to nothing has no work
  // left to do, whereas one that lost a single unusable address still has
  // nineteen pictures to get on with.
  if (jobs.length === 0) {
    return refuse(422, {
      error: "A wired image is not a public http(s) URL",
    });
  }

  // Nothing has changed since the stored result, so producing it again would
  // cost money to arrive at the same images. A batch is only skipped once every
  // variation is present — a run cancelled halfway resumes rather than being
  // treated as finished.
  const fingerprint = await fingerprintFor(item, values, element);
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
    return reply(200, {
      itemId,
      result: item.result,
      runError: null,
      runState: "succeeded",
      skipped: true,
      skippedVectors: dropped,
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
      skippedVectors: dropped,
      sourceImageUrls: values.image ?? [],
    },
    record: null,
    status: null,
  };
};

/**
 * What the request is asking for, or a reason it cannot be read.
 *
 * Pulled out of the handler because validating a request and performing one are
 * different jobs, and doing both in one function had grown past what a reader
 * can hold — the batching added a third thing to check.
 */
const readRequest = (
  req: VercelRequest
):
  | { boardId: string; force: boolean; itemId: string; variation: number }
  | string => {
  const raw = req.query.id;
  const boardId = Array.isArray(raw) ? raw[0] : raw;
  if (!boardId) {
    return "A board id is required";
  }
  const body = parseJsonBody(req.body);
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) {
    return "An item id is required";
  }
  // Which variation of a batch to produce. One per request, because four
  // variations at two minutes each could no more fit in one function call than
  // a four-node chain could — the same ceiling, the same answer.
  const variation = Number.isFinite(Number(body.variation))
    ? Math.max(0, Math.trunc(Number(body.variation)))
    : 0;
  return { boardId, force: body.force === true, itemId, variation };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const asked = readRequest(req);
  if (typeof asked === "string") {
    return res.status(400).json({ error: asked });
  }
  const { boardId, force, itemId, variation } = asked;

  const sql = getSql();

  try {
    const [rows, wireRows, models] = await Promise.all([
      loadItems(sql, boardId).then((items) => withElements(sql, items)),
      loadWires(sql, boardId),
      loadModelDefs(sql),
    ]);

    const prepared = await prepare(rows, wireRows, itemId, force, models);
    if (prepared.ready === null) {
      // Written before the response, so the node explains itself on reload and
      // a mis-wired board can be found by querying rather than by clicking.
      if (prepared.record) {
        await saveFailure(sql, itemId, prepared.record);
      }
      return res.status(prepared.status).json(prepared.body);
    }
    const {
      capability,
      fingerprint,
      item,
      jobs,
      model,
      prompt,
      skippedVectors,
      sourceImageUrls,
    } = prepared.ready;

    if (variation >= jobs.length) {
      const error = "That variation is past the end of this batch.";
      await saveFailure(sql, itemId, error);
      return res.status(422).json({ error });
    }

    await setRunning(sql, itemId);

    try {
      const produced = await produce(capability, models, {
        item,
        model,
        // Per variation, because an Iterate node upstream gives each run its
        // own prompt — the node's own text is only the fallback.
        prompt: jobs[variation]?.prompt ?? prompt,
        sourceImageUrl: jobs[variation]?.image ?? null,
        sourceImageUrls,
        sourceMaskUrl: jobs[variation]?.mask ?? null,
        variation,
      });

      const previous = asObject(item.result);

      const result = buildResult(
        produced,
        previous,
        fingerprint,
        variation,
        jobs.length,
        // FR-006. Recorded from what was actually sent rather than from what the
        // node holds: an Iterate node upstream rewrites the prompt per run, and
        // a stamp naming the typed one would describe a job nobody ran.
        stampProvenance({
          inputs: [
            jobs[variation]?.image,
            jobs[variation]?.mask,
            ...sourceImageUrls,
          ].filter((url): url is string => typeof url === "string"),
          model,
          prompt: jobs[variation]?.prompt ?? prompt ?? null,
          settings: item.config,
        })
      );

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
        skippedVectors,
        variationCount: jobs.length,
      });
    } catch (e) {
      console.error(e);
      const message =
        e instanceof Error ? e.message : "Could not run this node";
      // Recorded, so the failure survives a reload and the node explains itself
      // rather than merely looking un-run.
      await saveFailure(sql, itemId, message);
      // The batch size travels with the error: a client whose *first* job just
      // failed still has to know how many jobs the run describes, or it cannot
      // continue with the rest of them.
      return res
        .status(502)
        .json({ error: message, variationCount: jobs.length });
    }
  } catch (e) {
    console.error(e);
    // The message, not a shrug. Everything before the inner try — resolving the
    // board's rows, reading the elements they point at, ordering the graph —
    // fails here, and answering "Could not run this node" to a missing column
    // or an unorderable graph sends whoever is looking at the node to read the
    // server log, which on a deployed build they cannot do.
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Could not run this node",
    });
  }
}
