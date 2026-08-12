import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  descendantsOf,
  type GraphItem,
  type GraphWire,
  topologicalOrder,
} from "../../config/graph.js";
import { boardsApi } from "../services/portfolioService";
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

interface StepArgs {
  doomed: Set<string>;
  graphWires: GraphWire[];
  id: string;
  isOp: boolean;
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
  isOp,
  onPatch,
  runOne,
}: StepArgs): Promise<boolean> => {
  if (!isOp) {
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
   */
  const runOne = useCallback(
    async (itemId: string, force: boolean, signal?: AbortSignal) => {
      onPatch(itemId, { runError: null, runState: "running" });

      let variation = 0;
      let total = 1;
      let outcome = await boardsApi.runNode(boardId, itemId, {
        force,
        variation,
        ...(signal ? { signal } : {}),
      });
      total = outcome.variationCount ?? 1;

      reportSkipped(outcome.skippedVectors ?? 0);

      // Nothing more to do when the whole node was skipped as unchanged —
      // re-asking for each variation would spend money proving the same thing.
      if (!outcome.skipped) {
        for (variation = 1; variation < total; variation += 1) {
          if (signal?.aborted) {
            break;
          }
          // Shown as it fills rather than at the end, so a batch of eight is
          // visibly progressing instead of looking hung for ten minutes.
          onPatch(itemId, { result: outcome.result });
          // biome-ignore lint/performance/noAwaitInLoops: one generation per request is the whole point — see the note above
          outcome = await boardsApi.runNode(boardId, itemId, {
            force,
            variation,
            ...(signal ? { signal } : {}),
          });
        }
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
      await beforeRun();
      // Registered here as well as in runBoard, so cancel() reaches a node run
      // too. Without it a batch of eight started from a node's own button had
      // no way to be stopped, and the Stop control on the node did nothing.
      const controller = new AbortController();
      abort.current = controller;
      setIsRunning(true);
      try {
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
    setError(null);
    const graphItems = toGraphItems(items);
    const graphWires = toGraphWires(wires);

    const ordered = topologicalOrder(graphItems, graphWires);
    if (!ordered.order) {
      setError("Those connections form a loop, which cannot run.");
      return;
    }

    await beforeRun();

    const controller = new AbortController();
    abort.current = controller;
    setIsRunning(true);

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
          isOp: byId.get(id)?.kind === "op",
          onPatch,
          runOne: (nodeId) => runOne(nodeId, false, controller.signal),
        });
        if (!carryOn) {
          break;
        }
      }
    } finally {
      setIsRunning(false);
      abort.current = null;
    }
  }, [beforeRun, items, onPatch, runOne, wires]);

  return { cancel, error, isRunning, runBoard, runNode };
}
