import { apiBase, jsonHeaders } from "../services/portfolioService";

/**
 * Running a Video node, which takes minutes rather than seconds.
 *
 * Three calls with the waiting in between, and the waiting is here in the
 * browser — see api/boards/[id]/video.ts for why it cannot be on the server.
 * This is the client half: submit, poll until fal says it is done, collect.
 *
 * Deliberately not part of `useGraphRun`. A board run walks a graph and expects
 * each node to answer within a request; a video answers over several minutes
 * and would hold the whole traversal. Wiring it in would mean teaching that
 * loop to suspend, which is a change to every node's timing to accommodate one.
 */

export interface VideoReceipt {
  responseUrl: string;
  statusUrl: string;
}

export interface VideoProgress {
  queuePosition: number | null;
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";
}

/**
 * How often to ask.
 *
 * Three seconds, not one: a clip takes minutes, so a faster poll is a hundred
 * requests that each answer "not yet" and buy nothing. Slower than about five
 * and the finished video sits there while the node still says it is working.
 */
const POLL_MS = 3000;

/**
 * When to give up waiting.
 *
 * Ten minutes is past the slowest endpoint in the table at its longest
 * duration. Giving up here abandons the *watching*, not the job — fal finishes
 * it either way, and the message says so, because "timed out" reads as "your
 * money is gone" and that is not what happened.
 */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const post = async <T>(
  boardId: string,
  body: Record<string, unknown>,
  fallback: string
): Promise<T> => {
  const res = await fetch(`${apiBase()}/api/boards/${boardId}/video`, {
    body: JSON.stringify(body),
    headers: jsonHeaders(),
    method: "POST",
  });
  if (!res.ok) {
    // Read here rather than through portfolioService's `readPageError`, which
    // is private to that module: a video error is a sentence fal wrote, and it
    // is the only thing that explains why a four-minute wait produced nothing.
    const failure = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(
      typeof failure.error === "string" && failure.error
        ? failure.error
        : fallback
    );
  }
  return (await res.json()) as T;
};

export const submitVideo = (
  boardId: string,
  args: {
    duration: string;
    imageUrl: string;
    model: string;
    prompt: string;
  }
): Promise<VideoReceipt> =>
  post<VideoReceipt>(
    boardId,
    { action: "submit", ...args },
    "Could not start the video"
  );

export const pollVideo = (
  boardId: string,
  statusUrl: string
): Promise<VideoProgress> =>
  post<VideoProgress>(
    boardId,
    { action: "poll", statusUrl },
    "Could not check the video"
  );

export const collectVideo = (
  boardId: string,
  itemId: string,
  responseUrl: string
): Promise<{ result: Record<string, unknown> }> =>
  post(
    boardId,
    { action: "collect", itemId, responseUrl },
    "Could not collect the video"
  );

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });

interface RunOptions {
  onProgress?: (progress: VideoProgress) => void;
  signal?: AbortSignal;
}

/**
 * One poll, then the next — written as recursion rather than a loop.
 *
 * Nothing here can be done in parallel: each poll only makes sense after the
 * wait before it, and the wait only happens because the last poll said "not
 * yet". Recursion says that plainly, one attempt per call, and returns once
 * fal reports COMPLETED.
 */
const pollUntilDone = async (
  boardId: string,
  statusUrl: string,
  deadline: number,
  options: RunOptions
): Promise<void> => {
  await wait(POLL_MS, options.signal);
  const progress = await pollVideo(boardId, statusUrl);
  options.onProgress?.(progress);
  if (progress.status === "COMPLETED") {
    return;
  }
  if (Date.now() > deadline) {
    throw new Error(
      "The video is taking longer than expected. It is still generating at fal — re-run the node in a few minutes to collect it."
    );
  }
  return pollUntilDone(boardId, statusUrl, deadline, options);
};

/**
 * The whole run: submit, wait, collect.
 *
 * `onProgress` fires on every poll so a node can say "queued, 3rd" rather than
 * spinning silently for four minutes — the difference between a slow feature
 * and a broken one, when there is nothing else on screen to look at.
 */
export const runVideo = async (
  boardId: string,
  itemId: string,
  args: { duration: string; imageUrl: string; model: string; prompt: string },
  options: RunOptions = {}
): Promise<Record<string, unknown>> => {
  const receipt = await submitVideo(boardId, args);
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  await pollUntilDone(boardId, receipt.statusUrl, deadline, options);

  const { result } = await collectVideo(boardId, itemId, receipt.responseUrl);
  return result;
};
