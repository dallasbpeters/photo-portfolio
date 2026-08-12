import type { IconStyle } from "../../config/iconStyles.js";
import { persistGenerated } from "./persistGenerated.js";

/**
 * Icon generation through Magnific's text-to-icon API.
 *
 * The work happens in two steps, which is the API's own shape rather than a
 * choice made here: a *preview* task draws the icon, and a *render* task turns
 * that preview into a file in a given format. Rendering only accepts preview
 * tasks — the one-shot endpoint produces a task marked FINAL that can never be
 * re-rendered, so its format is fixed at creation and a format that fails costs
 * the whole drawing.
 *
 * Splitting them is what makes vectorisation survivable. SVG is asked for
 * first, because a board zooms and a raster glyph turns to mush at 300%. When
 * the vectoriser is unavailable — it fails upstream often enough to plan for —
 * the same preview is rendered again as PNG rather than throwing away a drawing
 * that has already been paid for.
 */
const BASE = "https://api.magnific.com/v1/ai/text-to-icon";

export interface GeneratedIcon {
  /** True when the vectoriser ran; false when this fell back to a raster. */
  isVector: boolean;
  /** Durable Blob URL — never Magnific's signed, expiring CDN link. */
  url: string;
}

interface IconTask {
  error?: string | null;
  generated?: string[];
  status?: string;
  task_id?: string;
}

const magnificKey = (): string | null =>
  process.env.MAGNIFIC_API_KEY?.trim() || null;

export const isMagnificConfigured = (): boolean => magnificKey() !== null;

/**
 * How long the whole drawing may take, and how often to ask.
 *
 * One budget across every step rather than one each: a preview, a failed SVG
 * render and a PNG render still have to fit inside a single function call.
 */
const POLL_INTERVAL_MS = 2000;
const TOTAL_TIMEOUT_MS = 110_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const request = async (
  path: string,
  init?: { body?: unknown; method?: string }
): Promise<IconTask> => {
  const key = magnificKey();
  if (!key) {
    throw new Error("Icon generation is not configured");
  }

  const res = await fetch(`${BASE}${path}`, {
    // Always sends a body on POST: the render endpoints reject a request with
    // no Content-Length outright, before they look at anything else.
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    headers: {
      "Content-Type": "application/json",
      "x-magnific-api-key": key,
    },
    method: init?.method ?? "GET",
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: IconTask;
    message?: string;
  };

  if (!res.ok) {
    // The API reports problems in `message`; a bare status tells the admin
    // nothing they can act on.
    const detail =
      typeof json.message === "string" ? json.message : `status ${res.status}`;
    throw new Error(`Icon generation failed (${detail})`);
  }

  return json.data ?? {};
};

/** The upstream vectoriser's failure, which is worth telling apart. */
const isVectorisationFailure = (task: IconTask): boolean =>
  (task.error ?? "").toLowerCase().includes("vectorization");

/**
 * Waits for a task to finish. Returns it whether it succeeded or failed —
 * failure is a result here, since an unusable SVG is answered by rendering a
 * PNG rather than by giving up.
 */
const settle = async (task: IconTask, deadline: number): Promise<IconTask> => {
  const taskId = task.task_id;
  if (!taskId) {
    throw new Error("The API accepted the prompt but returned no task");
  }

  let current = task;
  while (current.status !== "COMPLETED" && current.status !== "FAILED") {
    if (Date.now() > deadline) {
      throw new Error("The icon took too long to draw. Try again.");
    }
    // biome-ignore lint/performance/noAwaitInLoops: polling is the point — each request depends on the last one's answer
    await sleep(POLL_INTERVAL_MS);
    current = await request(`/${encodeURIComponent(taskId)}`);
  }
  return current;
};

const renderAs = (
  taskId: string,
  format: "svg" | "png",
  webhookUrl: string
): Promise<IconTask> =>
  request(`/${encodeURIComponent(taskId)}/render/${format}`, {
    body: { webhook_url: webhookUrl },
    method: "POST",
  });

/**
 * Draws an icon and stores it.
 *
 * `webhookUrl` is required by every endpoint here even though nothing waits on
 * it — this polls instead, because a webhook cannot reach a development machine
 * and an admin should not have to deploy to try an icon out.
 */
export const generateIcon = async (
  prompt: string,
  style: IconStyle,
  webhookUrl: string
): Promise<GeneratedIcon> => {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;

  const preview = await settle(
    await request("/preview", {
      body: { prompt, style, webhook_url: webhookUrl },
      method: "POST",
    }),
    deadline
  );
  if (preview.status === "FAILED") {
    throw new Error(preview.error?.trim() || "Could not draw that icon");
  }
  const previewId = preview.task_id as string;

  let isVector = true;
  let render = await settle(
    await renderAs(previewId, "svg", webhookUrl),
    deadline
  );

  if (render.status === "FAILED") {
    // Anything other than the vectoriser is a real failure: re-rendering the
    // same preview would only fail the same way.
    if (!isVectorisationFailure(render)) {
      throw new Error(render.error?.trim() || "Could not draw that icon");
    }
    isVector = false;
    render = await settle(
      await renderAs(previewId, "png", webhookUrl),
      deadline
    );
    if (render.status === "FAILED") {
      throw new Error(render.error?.trim() || "Could not draw that icon");
    }
  }

  const source = render.generated?.[0];
  if (!source) {
    throw new Error("The icon finished without producing a file");
  }

  return { isVector, url: await persistGenerated(source, "boards/icons") };
};
