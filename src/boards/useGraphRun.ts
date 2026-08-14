import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  descendantsOf,
  type GraphItem,
  type GraphWire,
  topologicalOrder,
} from "../../config/graph.js";
import { isRunnableNodeType } from "../../config/nodeTypes.js";
import {
  boardsApi,
  type RunNodeFailure,
  type RunNodeResponse,
} from "../services/portfolioService";
import type { BoardItem, BoardWire } from "../types";

interface UseGraphRunArgs {
  /** Flushes unsaved work first — the server runs the *stored* graph. */
  beforeRun: () => Promise<void>;
  boardId: string;
  items: BoardItem[];
  onPatch: (itemId: string, patch: Partial<BoardItem>) => void;
  wires: BoardWire[];
}

const toGraphItems = (items: BoardItem[]): GraphItem[] =>
  items.map((item) => ({
    id: item.id,
    kind: item.kind,
    nodeType: item.nodeType,
  }));

const toGraphWires = (wires: BoardWire[]): GraphWire[] => wires;

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

/** Where a batch run's failures and discovered size accumulate. */
interface RunContext {
  failed: string[];
  total: number;
}

/**
 * One variation of a batch, or null when it failed.
 *
 * A failure is remembered rather than thrown: each job is an independent paid
 * generation, so a model stumbling on one should not sink the rest. The batch
 * size travels with a failed first job — the only case the size is not already
 * known — so the caller can keep going.
 */
const runOneVariation = async (
  boardId: string,
  itemId: string,
  force: boolean,
  variation: number,
  context: RunContext,
  signal?: AbortSignal
): Promise<RunNodeResponse | null> => {
  try {
    return await boardsApi.runNode(boardId, itemId, {
      force,
      variation,
      ...(signal ? { signal } : {}),
    });
  } catch (e) {
    if (isAbort(e)) {
      throw e;
    }
    context.failed.push(
      e instanceof Error ? e.message : "This image failed to generate"
    );
    const count = (e as RunNodeFailure).variationCount;
    if (typeof count === "number") {
      context.total = count;
    }
    return null;
  }
};

/**
 * Runs a node's batch, variation by variation, until each job has settled.
 *
 * The newest completed image is shown while the next job runs, so a batch of
 * eight visibly fills instead of looking hung for ten minutes. Failed jobs are
 * remembered rather than stopping the run — each is an independent paid
 * generation, and a flaky upstream model on one picture must not cost the rest.
 */
const runBatch = async (
  boardId: string,
  itemId: string,
  force: boolean,
  onPatch: (itemId: string, patch: Partial<BoardItem>) => void,
  signal?: AbortSignal
): Promise<{ failed: string[]; outcome: RunNodeResponse | null }> => {
  const context: RunContext = { failed: [], total: 1 };
  let outcome = await runOneVariation(
    boardId,
    itemId,
    force,
    0,
    context,
    signal
  );
  if (outcome) {
    context.total = outcome.variationCount ?? 1;
    reportSkipped(outcome.skippedVectors ?? 0);
  }
  if (outcome?.skipped !== true) {
    for (let variation = 1; variation < context.total; variation += 1) {
      if (signal?.aborted) {
        break;
      }
      if (outcome) {
        onPatch(itemId, { result: outcome.result });
      }
      // biome-ignore lint/performance/noAwaitInLoops: one generation per request is the whole point — see the note above
      const next = await runOneVariation(
        boardId,
        itemId,
        force,
        variation,
        context,
        signal
      );
      if (next) {
        outcome = next;
      }
    }
  }
  return { failed: context.failed, outcome };
};

/**
 * Says out loud that a batch lost some jobs but kept the rest.
 *
 * The same rule as the skipped-vector count: a run that quietly lost a job
 * looks like it worked, when a node with two of its four pictures is not a
 * success.
 */
const reportBatchFailures = (failed: string[]): void => {
  if (failed.length === 0) {
    return;
  }
  toast.warning(
    failed.length === 1
      ? "One image in the batch failed — the rest came back."
      : `${failed.length} images in the batch failed — the rest came back.`
  );
};

interface StepArgs {
  doomed: Set<string>;
  graphWires: GraphWire[];
  id: string;
  isRunnable: boolean;
  onPatch: (itemId: string, patch: Partial<BoardItem>) => void;
  runOne: (itemId: string) => Promise<unknown>;
}

/**
 * Runs one node in a board run. Returns false when the whole run should stop.
 *
 * A node failing is not a reason to stop: the rest of the board may be entirely
 * independent of it. Only an abort ends the run. Everything downstream of the
 * failure is marked instead, and never asked for.
 */
const runStep = async ({
  doomed,
  graphWires,
  id,
  isRunnable,
  onPatch,
  runOne,
}: StepArgs): Promise<boolean> => {
  if (!isRunnable) {
    return true;
  }
  if (doomed.has(id)) {
    // Marked without a request being sent: a failure upstream must not spend
    // money on the nodes that depended on it.
    onPatch(id, { runState: "skipped" });
    return true;
  }
  try {
    await runOne(id);
  } catch (e) {
    if (isAbort(e)) {
      return false;
    }
    const message = e instanceof Error ? e.message : "Could not run this node";
    onPatch(id, { runError: message, runState: "failed" });
    for (const downstream of descendantsOf(graphWires, id)) {
      doomed.add(downstream);
    }
  }
  return true;
};

/**
 * Runs a board's nodes in dependency order, from the browser.
 *
 * Orchestration lives here rather than on the server because a single
 * generation already budgets close to two minutes against a serverless ceiling,
 * so a graph cannot execute inside one request. One request per node, issued
 * from the page that is watching them, gives instant per-node feedback with no
 * polling channel and no job store.
 *
 * The cost, stated plainly: closing the tab abandons whatever has not started.
 * Nothing already paid for is lost, because each node's result is committed by
 * its own request before the next one begins.
 */
/**
 * Says out loud what a batch quietly declined to run.
 *
 * A frame carrying one vectorised logo among its stickers runs the stickers and
 * drops the vector; the same goes for a picture whose address cannot be
 * fetched. Either way a batch that silently does fewer jobs than you asked for
 * is worse than one that fails outright.
 */
const reportSkipped = (dropped: number): void => {
  if (dropped <= 0) {
    return;
  }
  toast.warning(
    dropped === 1
      ? "One image was skipped — a vector, or an address that cannot be read."
      : `${dropped} images were skipped — vectors, or addresses that cannot be read.`
  );
};

export function useGraphRun({
  beforeRun,
  boardId,
  items,
  onPatch,
  wires,
}: UseGraphRunArgs) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Guards re-entry: without it a run whose preparation takes a moment (masks
  // and composites are rendered in beforeRun) leaves the button showing "Run"
  // and repeated clicks queue duplicate generations — each a paid request.
  const runningRef = useRef<boolean>(false);

  /** Aborts the request in flight and stops the executor starting another. */
  const cancel = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
  }, []);

  /**
   * Runs one node to completion, variation by variation.
   *
   * A batch is several paid generations, and each one has to be its own request
   * for the same reason each node does: one generation already fills most of a
   * function's time budget. The first response reports how many there are, so
   * the count comes from the server rather than being recomputed here from
   * settings the server may have clamped.
   *
   * A failed variation does not stop the rest. These are independent paid
   * generations, and an upstream model that stumbles on one job should not cost
   * the other fifteen — a run of a frame full of images is exactly the case
   * where one stubborn picture used to sink the whole batch. The failures are
   * counted and reported when the run settles; the node is only marked failed
   * when every job failed.
   */
  const runOne = useCallback(
    async (itemId: string, force: boolean, signal?: AbortSignal) => {
      onPatch(itemId, { runError: null, runState: "running" });

      const { failed, outcome } = await runBatch(
        boardId,
        itemId,
        force,
        onPatch,
        signal
      );
      reportBatchFailures(failed);

      // Nothing survived: the node is genuinely broken this run.
      if (!outcome) {
        throw new Error(failed[0] ?? "This node could not run");
      }

      onPatch(itemId, {
        result: outcome.result,
        runError: outcome.runError,
        runState: outcome.runState,
      });
      return outcome;
    },
    [boardId, onPatch]
  );

  /** A single node, run on its own from the node's own control. */
  const runNode = useCallback(
    async (itemId: string, force: boolean) => {
      if (runningRef.current === true) {
        return;
      }
      runningRef.current = true;
      // Running before the preparation below: a node run renders masks and
      // composites in beforeRun, which can take a moment — the button has to
      // read as busy immediately, or a click looks like nothing happened and
      // gets repeated (each repeat being a fresh paid generation).
      setIsRunning(true);
      const controller = new AbortController();
      abort.current = controller;
      try {
        await beforeRun();
        await runOne(itemId, force, controller.signal);
      } catch (e) {
        // An abort is a choice, not a failure. Marking the node failed would
        // leave a red error on something the person deliberately stopped.
        if (controller.signal.aborted) {
          onPatch(itemId, { runError: null, runState: "idle" });
        } else {
          const message =
            e instanceof Error ? e.message : "Could not run this node";
          onPatch(itemId, { runError: message, runState: "failed" });
        }
      } finally {
        runningRef.current = false;
        setIsRunning(false);
        if (abort.current === controller) {
          abort.current = null;
        }
      }
    },
    [beforeRun, onPatch, runOne]
  );

  /**
   * Every node on the board, in dependency order.
   *
   * Sequential rather than parallel across independent branches. Two nodes at
   * once would halve the wall clock and double the peak spend, and these are
   * rate-limited third-party services being driven by one person watching the
   * screen — the wall clock is not the scarce thing.
   */
  const runBoard = useCallback(async () => {
    if (runningRef.current === true) {
      return;
    }
    setError(null);
    const graphItems = toGraphItems(items);
    const graphWires = toGraphWires(wires);

    const ordered = topologicalOrder(graphItems, graphWires);
    if (!ordered.order) {
      setError("Those connections form a loop, which cannot run.");
      return;
    }

    // Busy before the preparation, so a board whose run takes a moment to
    // start does not invite repeated clicks.
    runningRef.current = true;
    setIsRunning(true);
    const controller = new AbortController();
    abort.current = controller;

    try {
      await beforeRun();
    } catch {
      runningRef.current = false;
      setIsRunning(false);
      abort.current = null;
      return;
    }

    // Everything downstream of a failure, accumulated as failures happen. A
    // node in here is marked skipped without a request being sent, so one
    // failure never spends money on the nodes that depended on it.
    const doomed = new Set<string>();
    const byId = new Map(items.map((item) => [item.id, item]));

    try {
      for (const id of ordered.order) {
        if (controller.signal.aborted) {
          break;
        }
        // biome-ignore lint/performance/noAwaitInLoops: dependency order is the point — a node cannot start before the one feeding it has finished
        const carryOn = await runStep({
          doomed,
          graphWires,
          id,
          // A source node — Prompt, Join, Iterate, Palette — holds a value
          // rather than producing one, and the run endpoint rightly refuses to
          // run one. Asking anyway was worse than pointless: the refusal came
          // back as a failure, which marked a perfectly good Prompt node red
          // *and* doomed everything it fed, so the one Generate node the board
          // existed for was skipped without a request ever being sent. The
          // board says which items can run, so ask it rather than paying a
          // round trip to be told no. Frames and photographs have no node type
          // at all, which is the same answer.
          isRunnable: isRunnableNodeType(byId.get(id)?.nodeType),
          onPatch,
          runOne: (nodeId) => runOne(nodeId, false, controller.signal),
        });
        if (!carryOn) {
          break;
        }
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
      abort.current = null;
    }
  }, [beforeRun, items, onPatch, runOne, wires]);

  return { cancel, error, isRunning, runBoard, runNode };
}
