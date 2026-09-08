import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { advanceTraining } from "../_lib/loraTraining.js";
import { modelSelection } from "../_lib/modelStore.js";
import { rowToModelDto } from "../_lib/models.js";
import { getDb, schema } from "../_lib/orm.js";

/**
 * Finishes any training run fal has finished, and reports on the rest.
 *
 * The other half of api/models/train.ts. A run takes minutes, past what a
 * serverless function may wait through, so nothing is holding the job — this
 * is called instead, as often as anyone likes, and each call advances whatever
 * is ready.
 *
 * Called by the Models panel rather than by a timer. That is the screen where
 * somebody is waiting, so it is the screen that should be asking; and it means
 * a training survives the app being closed, because the next visit collects it.
 * The cost of nobody looking is a run that sits collected-but-unwritten at fal
 * until somebody does, which loses nothing.
 *
 * Idempotent on purpose. Two panels open, or a double-click, must not turn one
 * training into two model rows or two blob uploads.
 *
 * POST rather than GET despite reading like a status check: it writes when a
 * run has landed, and a GET that stores weights and enables a model is a GET
 * that a browser prefetch could fire.
 */

/**
 * When a run is presumed lost.
 *
 * fal's fast trainer takes minutes; two hours is far outside that and
 * still well inside "somebody left it overnight". Without a bound a job fal
 * silently dropped stays `training` forever, and the row sits in the panel
 * looking like it is about to work.
 */
const ABANDON_AFTER_MS = 2 * 60 * 60 * 1000;

const startedTooLongAgo = (startedAt: Date | string | null): boolean => {
  if (!startedAt) {
    return false;
  }
  const started =
    startedAt instanceof Date
      ? startedAt.getTime()
      : new Date(startedAt).getTime();
  return Number.isFinite(started) && Date.now() - started > ABANDON_AFTER_MS;
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

  const db = getDb();
  const pending = await db
    .select({
      id: schema.models.id,
      label: schema.models.label,
      responseUrl: schema.models.trainingResponseUrl,
      startedAt: schema.models.trainingStartedAt,
      statusUrl: schema.models.trainingStatusUrl,
    })
    .from(schema.models)
    .where(eq(schema.models.trainingStatus, "training"));

  if (pending.length === 0) {
    return res.status(200).json({ finished: [], training: 0 });
  }

  const finished: unknown[] = [];
  let stillTraining = 0;

  for (const row of pending) {
    // A row whose receipt is missing cannot be collected, and polling it every
    // few seconds forever is worse than saying so once.
    if (!(row.statusUrl && row.responseUrl)) {
      // biome-ignore lint/performance/noAwaitInLoops: one row at a time, and there is rarely more than one — a fleet of polls fired at fal at once is how a rate limit is found
      await db
        .update(schema.models)
        .set({
          trainingError: "The training receipt was lost; start it again.",
          trainingStatus: "failed",
        })
        .where(eq(schema.models.id, row.id));
      continue;
    }

    const outcome = await advanceTraining(
      { responseUrl: row.responseUrl, statusUrl: row.statusUrl },
      row.id
    );

    if (outcome.state === "waiting") {
      if (startedTooLongAgo(row.startedAt)) {
        await db
          .update(schema.models)
          .set({
            trainingError:
              "fal never finished this training. Start it again, or check the run on fal.",
            trainingStatus: "failed",
          })
          .where(eq(schema.models.id, row.id));
        continue;
      }
      stillTraining += 1;
      continue;
    }

    if (outcome.state === "failed") {
      await db
        .update(schema.models)
        .set({ trainingError: outcome.error, trainingStatus: "failed" })
        .where(eq(schema.models.id, row.id));
      continue;
    }

    // Ready: the weights are in our storage, so the row becomes an ordinary
    // usable model. Enabled here and not before — a model in the picker with
    // no weights generates in the base style, which reads as a LoRA that came
    // out weak rather than one that was not finished.
    const [saved] = await db
      .update(schema.models)
      .set({
        enabled: true,
        loraPath: outcome.weightsUrl,
        trainingError: null,
        trainingStatus: "ready",
      })
      .where(eq(schema.models.id, row.id))
      .returning(modelSelection);
    if (saved) {
      finished.push(rowToModelDto(saved));
    }
  }

  return res.status(200).json({ finished, training: stillTraining });
}
