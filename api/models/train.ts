import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { sanitizeText } from "../_lib/httpUrl.js";
import { startTraining, triggerWordFor } from "../_lib/loraTraining.js";
import { modelSelection } from "../_lib/modelStore.js";
import { rowToModelDto } from "../_lib/models.js";
import { getDb, schema } from "../_lib/orm.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/**
 * Starts training a style, and answers as soon as fal has taken the job.
 *
 * A training run takes minutes, which is past what a serverless function may
 * wait for — so this does not wait. It hands fal the
 * dataset, writes a model row marked `training`, and returns. The row is what
 * carries the job: /api/models/training finishes it later, and the Models panel
 * shows it in the meantime.
 *
 * Disabled on arrival, deliberately. A model in the picker whose weights have
 * not landed generates in the base style, which reads as a LoRA that came out
 * weak rather than one that is not ready.
 *
 * The dataset URL comes from api/boards/[id]/dataset — the caller builds the
 * zip first, so this endpoint knows nothing about boards or frames and can
 * train on any archive.
 */

/** Long enough for a descriptive name, short enough for the picker. */
const MAX_NAME = 60;

/** fal loads weights over HTTP; anything else cannot be trained from. */
const HTTPS_URL = /^https:\/\//i;

/** A trigger word is a bare lowercase token: it goes straight into a prompt. */
const TRIGGER_WORD = /^[a-z][a-z0-9]{2,23}$/;

/**
 * The id a trained model gets.
 *
 * Prefixed so it is obvious in the Models panel which rows this app trained
 * and which were added by hand, and so a trained style can never collide with
 * a real fal endpoint id.
 */
const idFor = (trigger: string): string => `trained/${trigger}`;

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

  const body = parseJsonBody(req.body);
  const datasetUrl =
    typeof body.datasetUrl === "string" ? body.datasetUrl.trim() : "";
  const name =
    typeof body.name === "string"
      ? sanitizeText(body.name).slice(0, MAX_NAME)
      : "";

  if (!HTTPS_URL.test(datasetUrl)) {
    return res.status(400).json({ error: "A dataset URL is required." });
  }
  if (!name) {
    return res.status(400).json({ error: "Give the style a name." });
  }

  // Derived rather than asked for: a trigger word is a token that goes into
  // the prompt, not something anyone wants to invent. See triggerWordFor.
  const trigger =
    typeof body.triggerWord === "string" && TRIGGER_WORD.test(body.triggerWord)
      ? body.triggerWord
      : triggerWordFor(name);
  const id = idFor(trigger);

  const db = getDb();
  const existing = await db
    .select({ id: schema.models.id })
    .from(schema.models)
    .where(eq(schema.models.id, id))
    .limit(1);
  if (existing.length > 0) {
    return res
      .status(409)
      .json({ error: "A style with that trigger word already exists." });
  }

  let receipt: Awaited<ReturnType<typeof startTraining>>;
  try {
    receipt = await startTraining(datasetUrl, trigger);
  } catch (e) {
    // Nothing has been written, so nothing needs undoing: a refused submission
    // is retryable for free, which is exactly why the row is created after it
    // rather than before.
    return res.status(502).json({
      error: e instanceof Error ? e.message : "fal refused the training job.",
    });
  }

  const [row] = await db
    .insert(schema.models)
    .values({
      enabled: false,
      id,
      imageParam: "image_url",
      /*
       * Words, and a picture if one happens to be wired.
       *
       * Not "prompt". A LoRA has three endpoints on its base — invent from
       * words, restyle a wired picture, or repaint part of one under a mask —
       * and `endpointFor` already picks between them from what is wired. But
       * the run path strips every image before that choice is reached when a
       * model declares it takes none, so `input: "prompt"` quietly locked a
       * trained style to the first of the three. The weights were fine; two
       * thirds of what they could do was simply unreachable.
       */
      input: "prompt-or-image",
      label: name,
      // The LoRA's own fields, minus the weights, which do not exist yet.
      loraScale: 1,
      loraTrigger: trigger,
      output: "image",
      // Last in the picker until someone moves it: a new style is not more
      // important than the models already there.
      sortOrder: 999,
      trainingResponseUrl: receipt.responseUrl,
      // A Date now, matching the column's mode — see db/schema.ts, where
      // every timestamp returns one so both drivers agree.
      trainingStartedAt: new Date(),
      trainingStatus: "training",
      trainingStatusUrl: receipt.statusUrl,
      vector: false,
    })
    .returning(modelSelection);

  return res.status(202).json(rowToModelDto(row));
}
