import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardItem } from "../../types.js";
import { runTool } from "./executors.js";
import { blockedReason, withDefaults } from "./registry.js";
import {
  failed,
  type Tool,
  type ToolFailure,
  type ToolOutcome,
  type ToolProgress,
  type ToolSuccess,
} from "./types.js";

/**
 * Running one tool, from a component, without the component learning how.
 *
 * The hook owns three things and no more: the refusal that happens *before* an
 * executor is called, the per-item progress and failure a surface renders, and
 * the abort. Everything else belongs to somebody else — the picker chooses the
 * tool, the executor does the work, and the caller decides where the result
 * goes.
 *
 * ## It does not write to the board, and it cannot
 *
 * There is no API client imported here and no board mutation. A success is
 * handed to `onResult` as a `BoardItemResult` and the caller puts it where its
 * own state lives. That is not fastidiousness: ./history explains that there is
 * currently *no* client write path for `result` at all — the board PATCH drops
 * it on purpose — so a hook that tried to persist would be inventing an
 * endpoint. Keeping the write out means the day that endpoint exists, it is
 * added in one caller rather than unpicked from here.
 *
 * ## State is keyed by item id
 *
 * Not a single `running` boolean. Two items can be running at once — a
 * generation is tens of seconds and nothing stops a second item being started
 * meanwhile — and one flag would light a spinner on both and clear it when the
 * quicker of the two landed. The failure is worse than cosmetic: the surface
 * for the still-running item would go back to enabled and invite a second,
 * paid-for run.
 *
 * ## `runTool` never throws
 *
 * So it is not wrapped in a try/catch. Its contract (see ./types) is that every
 * failure comes back as `{ ok: false, failure }`, and a defensive catch here
 * would imply a second, invisible error channel that callers would then have to
 * be told about.
 */

/** What a surface renders for one item. Absent from the map means idle. */
export interface ToolRunState {
  /** The last failure, until it is cleared or another run starts. */
  failure: ToolFailure | null;
  /** Null before the executor reports anything. */
  progress: ToolProgress | null;
  running: boolean;
  /** Which tool this state is about, so a bar can label its own spinner. */
  toolId: string | null;
}

const IDLE: ToolRunState = {
  failure: null,
  progress: null,
  running: false,
  toolId: null,
};

export interface ToolRunRequest {
  /** Null where there is no board — a preview, a test. Passed straight through. */
  boardId?: string | null;
  /** Whatever a settings surface collected. Registry defaults are applied here. */
  config?: Readonly<Record<string, unknown>>;
  item: Readonly<BoardItem>;
  /** The rendered mask bitmap's URL, already uploaded. Null when there is none. */
  maskUrl?: string | null;
  prompt?: string | null;
  tool: Tool;
}

export interface UseToolRunnerOptions {
  /**
   * How a tool is actually run. `runTool` unless a test says otherwise.
   *
   * Injectable for the same reason `TransformDeps` is: the thing most worth
   * asserting about this hook is that the executor was *not* reached, and that
   * cannot be observed from outside without a stand-in to count calls on.
   */
  execute?: (invocation: Parameters<typeof runTool>[0]) => Promise<ToolOutcome>;
  /** Called for every failure, including a refusal. Optional: state carries it too. */
  onFailure?: (itemId: string, failure: ToolFailure) => void;
  /**
   * The one success path. `success.result` is the new `BoardItemResult` with
   * the new variation appended; the item handed in is untouched.
   */
  onResult: (itemId: string, success: ToolSuccess) => void;
}

export interface ToolRunner {
  /** Aborts the item's run. The executor reports `cancelled`; nothing throws. */
  cancel: (itemId: string) => void;
  /** Dismisses a failure without starting anything. */
  clear: (itemId: string) => void;
  isRunning: (itemId: string) => boolean;
  run: (request: ToolRunRequest) => Promise<ToolOutcome>;
  stateOf: (itemId: string) => ToolRunState;
}

/**
 * The words a run would actually use.
 *
 * Mirrors `promptFrom` in ./aiExecutor — the prompt can arrive as an argument
 * or as the tool's own `prompt` setting, and a check that only looked at the
 * argument would refuse a tool whose panel had filled in the setting.
 */
const promptOf = (
  request: ToolRunRequest,
  config: Readonly<Record<string, unknown>>
): string => {
  const raw = request.prompt ?? config.prompt;
  return typeof raw === "string" ? raw.trim() : "";
};

/** What the item can offer as a source image, resolved as the executors do. */
const hasImageOf = (item: Readonly<BoardItem>): boolean =>
  Boolean(item.result?.url ?? item.imageUrl);

export const useToolRunner = ({
  execute = runTool,
  onFailure,
  onResult,
}: UseToolRunnerOptions): ToolRunner => {
  const [states, setStates] = useState<Record<string, ToolRunState>>({});

  /**
   * One controller per running item, and a token per run.
   *
   * The token is what stops a cancelled run's late resolution from stamping
   * its `cancelled` failure over the state of the run that replaced it. Refs
   * rather than state: neither is rendered, and writing them must not schedule
   * a render.
   */
  const controllers = useRef(new Map<string, AbortController>());
  const tokens = useRef(new Map<string, number>());
  const nextToken = useRef(0);
  /** Aborted when the hook unmounts, so a late run stops writing state. */
  const lifetime = useRef<AbortController | null>(null);

  useEffect(() => {
    const mounted = new AbortController();
    lifetime.current = mounted;
    return () => {
      mounted.abort();
      for (const controller of controllers.current.values()) {
        controller.abort();
      }
      controllers.current.clear();
    };
  }, []);

  const patch = useCallback((itemId: string, next: Partial<ToolRunState>) => {
    if (lifetime.current?.signal.aborted) {
      return;
    }
    setStates((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] ?? IDLE), ...next },
    }));
  }, []);

  /** Held in a ref, so a caller can pass inline arrow functions. */
  const handlers = useRef({ execute, onFailure, onResult });
  handlers.current = { execute, onFailure, onResult };

  const run = useCallback(
    async (request: ToolRunRequest): Promise<ToolOutcome> => {
      const { item, tool } = request;
      const config = withDefaults(tool, request.config ?? {});
      const prompt = promptOf(request, config);
      const maskUrl = request.maskUrl ?? null;

      /*
       * The refusal, before anything is spent.
       *
       * `blockedReason` is the same check the picker draws its disabled rows
       * from, run again here because a surface is not the only caller — a
       * keyboard shortcut or a chat can reach this directly — and because the
       * target can have changed between the row being drawn and it being
       * clicked. An AI tool that gets past this point costs real money, so the
       * executor is never handed an invocation it would only reject.
       */
      const reason = blockedReason(tool, {
        hasImage: hasImageOf(item),
        hasMask: maskUrl !== null,
        hasPrompt: prompt.length > 0,
      });
      if (reason) {
        const outcome = failed(
          tool.status === "planned" ? "unsupported" : "missing-input",
          reason
        );
        patch(item.id, {
          failure: outcome.failure,
          progress: null,
          running: false,
          toolId: tool.id,
        });
        handlers.current.onFailure?.(item.id, outcome.failure);
        return outcome;
      }

      /*
       * A second run on an item already running is ignored, not queued.
       *
       * Reported as `cancelled` because that is the one code surfaces are told
       * to say nothing about — which is exactly right for the double-click that
       * causes this. There is no "busy" code in ToolFailureCode; see the note
       * in the report.
       */
      if (controllers.current.has(item.id)) {
        return failed("cancelled", `${tool.label} is already running here.`);
      }

      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      nextToken.current += 1;
      const token = nextToken.current;
      tokens.current.set(item.id, token);

      patch(item.id, {
        failure: null,
        progress: null,
        running: true,
        toolId: tool.id,
      });

      // No try/catch: runTool does not throw. See the header.
      const outcome = await handlers.current.execute({
        config,
        maskUrl,
        onProgress: (progress: ToolProgress) => {
          if (tokens.current.get(item.id) === token) {
            patch(item.id, { progress });
          }
        },
        prompt: prompt || null,
        signal: controller.signal,
        target: { boardId: request.boardId ?? null, item },
        tool,
      });

      if (controllers.current.get(item.id) === controller) {
        controllers.current.delete(item.id);
      }

      // A run that was superseded reports to nobody: its state slot belongs to
      // whatever replaced it, and its result is for an item that has moved on.
      if (tokens.current.get(item.id) !== token) {
        return outcome;
      }

      if (outcome.ok) {
        patch(item.id, {
          failure: null,
          progress: null,
          running: false,
          toolId: tool.id,
        });
        handlers.current.onResult(item.id, outcome);
        return outcome;
      }

      patch(item.id, {
        failure: outcome.failure,
        progress: null,
        running: false,
        toolId: tool.id,
      });
      handlers.current.onFailure?.(item.id, outcome.failure);
      return outcome;
    },
    [patch]
  );

  const cancel = useCallback((itemId: string) => {
    controllers.current.get(itemId)?.abort();
  }, []);

  const clear = useCallback(
    (itemId: string) => {
      patch(itemId, { failure: null });
    },
    [patch]
  );

  const stateOf = useCallback(
    (itemId: string): ToolRunState => states[itemId] ?? IDLE,
    [states]
  );

  const isRunning = useCallback(
    (itemId: string): boolean => states[itemId]?.running ?? false,
    [states]
  );

  return { cancel, clear, isRunning, run, stateOf };
};
