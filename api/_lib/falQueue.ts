/**
 * Submitting work that takes minutes rather than seconds.
 *
 * Every other call in api/_lib/fal.ts is synchronous: POST to fal.run, wait,
 * get a picture. That works because an image comes back inside the 120s
 * request timeout. A video does not — a few seconds of footage is one to five
 * minutes of generation — and it fails twice over if attempted that way, first
 * against `REQUEST_TIMEOUT_MS` and then against the serverless function's own
 * ceiling, which no amount of patience on our side can raise.
 *
 * So a video is submitted, not awaited. fal's queue returns a request id
 * immediately; the run is then polled until it finishes. The polling lives in
 * the browser, which is where this app already orchestrates runs — `run.ts`
 * says a run cannot outlive the tab that started it, and that is as true of a
 * queued video as of an immediate image. The alternative, a durable server-side
 * job, would be the first thing in this codebase that survives its request, and
 * it is not worth introducing for one node type.
 *
 * Kept apart from fal.ts because the two have different shapes: everything
 * there returns a result, everything here returns a receipt.
 */

/** fal's queue host. The same model ids as fal.run, a different door. */
const QUEUE_HOST = "https://queue.fal.run";

/** Submitting returns in a moment; only the polling is slow. */
const SUBMIT_TIMEOUT_MS = 30_000;

/** A status check is a small read, and a slow one means the service is unwell. */
const STATUS_TIMEOUT_MS = 20_000;

/**
 * How fal describes a queued run.
 *
 * `IN_QUEUE` and `IN_PROGRESS` are both "not yet"; they are kept apart because
 * a queue position is worth showing and a running job is worth a spinner, and
 * collapsing them would make a two-minute wait indistinguishable from a
 * two-minute queue.
 */
export type QueueStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";

export interface QueueReceipt {
  /** Where to fetch the finished output. */
  responseUrl: string;
  /** What to poll. */
  statusUrl: string;
}

export interface QueueProgress {
  /** Position in the queue, when fal reports one. Null while running. */
  queuePosition: number | null;
  status: QueueStatus;
}

interface QueueSubmitResponse {
  queue_position?: number;
  request_id?: string;
  response_url?: string;
  status?: string;
  status_url?: string;
}

const isStatus = (value: unknown): value is QueueStatus =>
  value === "IN_QUEUE" || value === "IN_PROGRESS" || value === "COMPLETED";

/**
 * A fal error body, which is not one shape.
 *
 * fal answers with `detail` as a string, `detail` as a list of validation
 * objects, or `error`, depending on which layer refused. Reading only one of
 * them is how a refusal becomes "generation failed" with no reason attached.
 */
const detailOf = (body: unknown, status: number): string => {
  const json = (body ?? {}) as {
    detail?: unknown;
    error?: unknown;
  };
  if (typeof json.detail === "string" && json.detail.trim()) {
    return json.detail.trim();
  }
  if (Array.isArray(json.detail)) {
    const parts = json.detail
      .map((entry) => {
        const msg = (entry as { msg?: unknown } | null)?.msg;
        return typeof msg === "string" ? msg : "";
      })
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join("; ");
    }
  }
  if (typeof json.error === "string" && json.error.trim()) {
    return json.error.trim();
  }
  return `HTTP ${status}`;
};

const authHeaders = (key: string): Record<string, string> => ({
  Authorization: `Key ${key}`,
  "Content-Type": "application/json",
});

/**
 * Puts a job on the queue and returns where to watch it.
 *
 * Throws only when the job was never accepted. Once there is a receipt the
 * caller owns it: a failure after this point is a failure of the run, not of
 * the submission, and the two want different handling — one is retryable for
 * free, the other has already cost money.
 */
export const submitToQueue = async (
  key: string,
  model: string,
  body: Record<string, unknown>
): Promise<QueueReceipt> => {
  const res = await fetch(`${QUEUE_HOST}/${model}`, {
    body: JSON.stringify(body),
    headers: authHeaders(key),
    method: "POST",
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as QueueSubmitResponse;
  if (!res.ok) {
    throw new Error(
      `Video generation was refused (${detailOf(json, res.status)})`
    );
  }

  // Built from the request id rather than trusted from the body when fal omits
  // them: the two URLs are documented as derivable, and a receipt without a
  // status URL is a job that has been paid for and cannot be collected.
  const statusUrl =
    json.status_url ??
    (json.request_id
      ? `${QUEUE_HOST}/${model}/requests/${json.request_id}/status`
      : null);
  const responseUrl =
    json.response_url ??
    (json.request_id
      ? `${QUEUE_HOST}/${model}/requests/${json.request_id}`
      : null);

  if (!(statusUrl && responseUrl)) {
    throw new Error("Video generation was accepted but returned no request id");
  }
  return { responseUrl, statusUrl };
};

/** How far along a queued job is. */
export const pollQueue = async (
  key: string,
  statusUrl: string
): Promise<QueueProgress> => {
  const res = await fetch(statusUrl, {
    headers: authHeaders(key),
    signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as QueueSubmitResponse;
  if (!res.ok) {
    throw new Error(
      `Could not check the video (${detailOf(json, res.status)})`
    );
  }
  return {
    queuePosition:
      typeof json.queue_position === "number" ? json.queue_position : null,
    // An unrecognised status is treated as still running rather than as
    // finished: waiting on a job that has stopped costs a few polls, whereas
    // collecting one that has not finished returns nothing and reads as a
    // generation that produced an empty video.
    status: isStatus(json.status) ? json.status : "IN_PROGRESS",
  };
};

/** The finished job's raw payload, for a caller that knows its shape. */
export const collectFromQueue = async (
  key: string,
  responseUrl: string
): Promise<Record<string, unknown>> => {
  const res = await fetch(responseUrl, {
    headers: authHeaders(key),
    signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      `Could not collect the video (${detailOf(json, res.status)})`
    );
  }
  return json;
};

/**
 * The video's address in a finished payload.
 *
 * fal's video endpoints disagree: some answer `{video: {url}}`, some
 * `{videos: [{url}]}`, some put it under `output`. Read narrowly, a working
 * generation looks like an empty result — the money is spent either way, so the
 * shapes are all checked rather than the one the first model happened to use.
 */
export const videoUrlOf = (payload: Record<string, unknown>): string | null => {
  const candidates: unknown[] = [
    (payload.video as { url?: unknown } | undefined)?.url,
    (payload as { url?: unknown }).url,
    ...(Array.isArray(payload.videos)
      ? payload.videos.map((v) => (v as { url?: unknown } | undefined)?.url)
      : []),
    ...(Array.isArray(payload.output)
      ? payload.output.map((v) => (v as { url?: unknown } | undefined)?.url)
      : [(payload.output as { url?: unknown } | undefined)?.url]),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
};
