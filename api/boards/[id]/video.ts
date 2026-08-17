import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../../_lib/auth.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import {
  collectFromQueue,
  pollQueue,
  submitToQueue,
  videoUrlOf,
} from "../../_lib/falQueue.js";
import { parsePublicHttpUrl } from "../../_lib/httpUrl.js";
import { loadModelRows } from "../../_lib/models.js";
import { parseJsonBody } from "../../_lib/parseBody.js";
import { persistGenerated } from "../../_lib/persistGenerated.js";

/**
 * Animating a still, in three requests instead of one.
 *
 * Its own endpoint rather than a branch inside run.ts, because a video does not
 * fit that shape at all: run.ts submits, waits and answers with a picture, and
 * a clip takes one to five minutes — past fal's request timeout and past the
 * serverless function's own ceiling, neither of which we can raise. So the work
 * is split at the two points where waiting would otherwise happen.
 *
 *   POST { action: "submit" }  → a receipt, in a second or two
 *   POST { action: "poll" }    → how far along, as often as the browser likes
 *   POST { action: "collect" } → the finished clip, copied into blob storage
 *
 * The waiting itself lives in the browser, which is where this app already
 * orchestrates runs: run.ts says a run cannot outlive the tab that started it,
 * and that is as true of a queued video. The receipt is handed back to the
 * client rather than stored, so nothing here has to be reconciled if the tab
 * goes away mid-clip — the job finishes at fal, unclaimed, and is simply not
 * collected. That costs the generation, which is the honest price of a design
 * with no durable jobs, and it is the same price a closed tab already pays for
 * an image.
 */

/** Mirrors run.ts, so a video cannot grow a node's history without bound. */
const MAX_HISTORY = 40;

interface StoredResult {
  history?: unknown[];
  url?: string;
}

const falKey = (): string | null => process.env.FAL_API_KEY?.trim() || null;

const failed = (res: VercelResponse, e: unknown, fallback: string) => {
  console.error(e);
  return res
    .status(502)
    .json({ error: e instanceof Error ? e.message : fallback });
};

/**
 * The body a video endpoint expects.
 *
 * The picture's field name comes from the model row, not from an assumption.
 * It was an assumption at first — "every video endpoint takes image_url" —
 * and it was wrong: Kling v3 calls it `start_image_url` while Kling v2.5 calls
 * it `image_url`, so one family disagrees with itself across a version bump.
 * That is precisely what `image_param` is for, and skipping it produced a 422
 * naming a field nobody had heard of.
 */
const bodyFor = (
  imageParam: string,
  imageUrl: string,
  prompt: string,
  duration: string
): Record<string, unknown> => ({
  [imageParam || "image_url"]: imageUrl,
  prompt,
  // A string, because every schema that takes it declares an enum of strings —
  // "5", "10" — and a number is rejected after the request has been made.
  ...(duration ? { duration } : {}),
});

/**
 * Submits the job and hands back where to watch it.
 *
 * The model is checked against the table first. A Generate node's model reaching
 * here would be submitted to a queue that does not serve it, and fal would
 * answer with a 404 naming an endpoint the user never chose.
 */
const submit = async (
  res: VercelResponse,
  key: string,
  sql: ReturnType<typeof getSql>,
  body: {
    duration?: unknown;
    imageUrl?: unknown;
    model?: unknown;
    prompt?: unknown;
  }
) => {
  const imageUrl =
    typeof body.imageUrl === "string"
      ? parsePublicHttpUrl(body.imageUrl)
      : null;
  if (!imageUrl) {
    return res
      .status(400)
      .json({ error: "A video needs a picture to animate." });
  }

  const model = typeof body.model === "string" ? body.model : "";
  const rows = await loadModelRows(sql);
  const known = rows.find((row) => row.id === model);
  if (!known) {
    return res.status(400).json({ error: "That model is not one we know." });
  }
  if (known.output !== "video") {
    return res.status(400).json({
      error: `${known.label} makes pictures, not video. Choose a video model.`,
    });
  }
  if (known.enabled === false) {
    return res
      .status(400)
      .json({ error: `${known.label} is switched off in Models.` });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const duration = typeof body.duration === "string" ? body.duration : "";

  try {
    const receipt = await submitToQueue(
      key,
      model,
      bodyFor(known.image_param, imageUrl, prompt, duration)
    );
    return res.status(200).json(receipt);
  } catch (e) {
    return failed(res, e, "Could not start the video");
  }
};

/**
 * The finished clip, copied into blob storage and written onto the node.
 *
 * Copied rather than linked for the same reason every generated image is: fal
 * serves from a scratch host, so a board pointing at that URL would quietly
 * lose its video. A clip is much larger than a picture, which makes the copy
 * slower but no less necessary.
 */
const collect = async (
  res: VercelResponse,
  key: string,
  boardId: string,
  body: { itemId?: unknown; responseUrl?: unknown }
) => {
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const responseUrl =
    typeof body.responseUrl === "string" ? body.responseUrl : "";
  if (!(itemId && responseUrl)) {
    return res
      .status(400)
      .json({ error: "An item and a receipt are required" });
  }

  let url: string;
  try {
    const payload = await collectFromQueue(key, responseUrl);
    const found = videoUrlOf(payload);
    if (!found) {
      // The job reported itself finished and carried no video. Distinguished
      // from a failure because the money is already spent either way, and
      // "finished with nothing" is worth saying differently from "refused".
      return res
        .status(502)
        .json({ error: "The video finished but returned nothing." });
    }
    url = await persistGenerated(found, "boards/video");
  } catch (e) {
    return failed(res, e, "Could not collect the video");
  }

  const sql = getSql();
  const rows = (await sql`
    SELECT result FROM board_items
    WHERE id = ${itemId} AND board_id = ${boardId}
  `) as { result: unknown }[];
  const stored = (rows[0]?.result ?? null) as StoredResult | null;

  const variation = {
    description: null,
    height: null,
    isVector: false,
    kind: "video",
    url,
    width: null,
  };
  const history = [...(stored?.history ?? []), variation].slice(-MAX_HISTORY);
  const result = {
    history,
    // A video is not an image, and saying so here is what lets the node render
    // a <video> without inspecting the file extension.
    kind: "video",
    ranAt: new Date().toISOString(),
    url,
    variations: [variation],
  };

  await sql`
    UPDATE board_items
    SET result = ${JSON.stringify(result)}::jsonb,
        run_state = 'succeeded',
        run_error = NULL
    WHERE id = ${itemId} AND board_id = ${boardId}
  `;
  return res.status(200).json({ result });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const key = falKey();
  if (!key) {
    return res
      .status(503)
      .json({ error: "Video generation is not configured. Set FAL_API_KEY." });
  }

  const raw = req.query.id;
  const boardId = Array.isArray(raw) ? raw[0] : raw;
  if (!boardId) {
    return res.status(400).json({ error: "A board is required" });
  }

  const body = parseJsonBody(req.body) as Record<string, unknown>;
  switch (body.action) {
    case "submit":
      return submit(res, key, getSql(), body);
    case "poll": {
      const statusUrl =
        typeof body.statusUrl === "string" ? body.statusUrl : "";
      if (!statusUrl) {
        return res.status(400).json({ error: "A receipt is required" });
      }
      try {
        return res.status(200).json(await pollQueue(key, statusUrl));
      } catch (e) {
        return failed(res, e, "Could not check the video");
      }
    }
    case "collect":
      return collect(res, key, boardId, body);
    default:
      return res.status(400).json({ error: "Unknown action" });
  }
}
