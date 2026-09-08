import { put } from "@vercel/blob";
import { blobToken } from "./blobToken.js";
import { falKey } from "./fal.js";
import { collectFromQueue, pollQueue, submitToQueue } from "./falQueue.js";

/**
 * Training a LoRA on fal, from a dataset this app built.
 *
 * The step that used to be manual: zip a frame, paste the URL into fal's
 * trainer, wait, download the weights, upload them somewhere public, then add a
 * model row pointing at them. Every part of that is here except the waiting.
 *
 * A run takes roughly twenty minutes, which no serverless function may sit
 * through, so it is deliberately split. `startTraining` submits and returns as
 * soon as fal has accepted the job; `advanceTraining` is called later — as
 * often as anyone likes — and finishes it if fal has. Nothing holds a
 * connection open in between.
 *
 * The weights are copied into our own blob storage rather than linked from
 * fal's. fal's result URLs are not promised to live forever, and a model whose
 * weights disappear generates in the base style, which reads as a LoRA that
 * was never very strong rather than one that is gone.
 */

/** fal's fast Flux LoRA trainer. */
const TRAINER = "fal-ai/flux-lora-fast-training";

/**
 * Style, not subject.
 *
 * `is_style` tells the trainer these pictures share a look rather than a face,
 * which is what a board of references is. It also turns off the subject
 * masking that a portrait trainer wants — segmenting a style into foreground
 * and background is meaningless and costs quality.
 */
const IS_STYLE = true;

/** What a submitted run needs remembered to be collected later. */
export interface TrainingReceipt {
  responseUrl: string;
  statusUrl: string;
}

/**
 * Hands the dataset to fal and returns where to watch it.
 *
 * The trigger word is not optional in practice. fal uses it in place of
 * captions when none are supplied, and a LoRA trained against a token that is
 * never put in a prompt returns the base model — see FalModelDef.lora.
 */
export const startTraining = async (
  datasetUrl: string,
  triggerWord: string
): Promise<TrainingReceipt> => {
  const key = falKey();
  if (!key) {
    throw new Error("fal is not configured on this deployment.");
  }
  return await submitToQueue(key, TRAINER, {
    images_data_url: datasetUrl,
    is_style: IS_STYLE,
    trigger_word: triggerWord,
  });
};

/** Where fal puts a finished file. */
interface TrainedFile {
  url?: unknown;
}

const urlOf = (value: unknown): string | null => {
  const file = (value ?? {}) as TrainedFile;
  return typeof file.url === "string" && file.url ? file.url : null;
};

export type TrainingOutcome =
  | { state: "waiting"; queuePosition: number | null }
  | { state: "ready"; weightsUrl: string }
  | { state: "failed"; error: string };

/**
 * Asks fal whether a run has finished, and brings the weights home if it has.
 *
 * "Waiting" is the answer for anything that is not plainly finished, including
 * a status fal does not recognise: waiting on a job that has stopped costs a
 * few polls, whereas treating an unfinished one as done stores no weights and
 * reads as a training that produced nothing.
 */
export const advanceTraining = async (
  receipt: TrainingReceipt,
  modelId: string
): Promise<TrainingOutcome> => {
  const key = falKey();
  if (!key) {
    return {
      error: "fal is not configured on this deployment.",
      state: "failed",
    };
  }

  let progress: Awaited<ReturnType<typeof pollQueue>>;
  try {
    progress = await pollQueue(key, receipt.statusUrl);
  } catch {
    // A failed poll is not a failed training: fal may be briefly unreachable
    // and the job is still running and still paid for. Kept waiting so the
    // next poll can find it.
    return {
      queuePosition: null,
      state: "waiting",
    };
  }
  if (progress.status !== "COMPLETED") {
    return { queuePosition: progress.queuePosition, state: "waiting" };
  }

  let payload: Record<string, unknown>;
  try {
    payload = await collectFromQueue(key, receipt.responseUrl);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not collect the weights.",
      state: "failed",
    };
  }

  const trained = urlOf(payload.diffusers_lora_file);
  if (!trained) {
    return {
      error: "The training finished but returned no weights file.",
      state: "failed",
    };
  }

  try {
    const weightsUrl = await storeWeights(trained, modelId);
    return { state: "ready", weightsUrl };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not store the weights.",
      state: "failed",
    };
  }
};

/**
 * Copies the trained weights into our own storage.
 *
 * The same move scripts/upload-lora.ts makes by hand, for the same reason: fal
 * loads a LoRA over HTTP, so the file needs a durable public address, and
 * fal's own result URLs are not promised to be one.
 *
 * `addRandomSuffix: false` with the model id as the name, so retraining the
 * same model overwrites rather than accumulating dead weight files nobody will
 * ever find again.
 */
const storeWeights = async (
  falUrl: string,
  modelId: string
): Promise<string> => {
  const res = await fetch(falUrl);
  if (!res.ok) {
    throw new Error(`fal's weights could not be read (${res.status}).`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const safe = modelId.replace(/[^a-z0-9._-]+/gi, "-");
  const blob = await put(`loras/${safe}.safetensors`, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/octet-stream",
    token: blobToken(),
  });
  return blob.url;
};

/**
 * A trigger word fal can key a style to.
 *
 * Lowercase letters only, and unlike a name it is not shown to anyone — it
 * goes into the prompt. Derived from the model's name so the author does not
 * have to invent one, with a short random tail because a token that collides
 * with an ordinary English word is a LoRA that fires on prompts nobody meant
 * to style.
 */
export const triggerWordFor = (name: string): string => {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z]+/g, "")
      .slice(0, 10) || "style";
  const tail = Math.random().toString(36).slice(2, 6);
  return `${base}${tail}`;
};
