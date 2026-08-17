import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardItem } from "../../types";
import { toolById } from "./registry";
import type { Tool, ToolInvocation, ToolOutcome, ToolSuccess } from "./types";
import {
  type ToolRunner,
  type ToolRunState,
  useToolRunner,
} from "./useToolRunner";

/**
 * What the runner refuses, and what it keeps apart.
 *
 * Both of these fail silently. A refusal that leaks through calls a paid
 * endpoint and the only evidence is the invoice; per-item state that bleeds
 * shows a spinner on the wrong item and — worse — clears the right one's,
 * re-enabling a control for a run that is still in flight.
 */

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

afterEach(() => {
  root?.unmount();
  host?.remove();
  host = null;
  root = null;
});

const item = (id: string, extra: Partial<BoardItem> = {}): BoardItem => ({
  body: null,
  config: null,
  creditName: null,
  creditUrl: null,
  fontSize: null,
  height: 200,
  id,
  imageUrl: "https://example.test/a.png",
  kind: "photo",
  nodeType: null,
  photoId: null,
  result: null,
  runError: null,
  runState: null,
  textStyle: null,
  thumbUrl: null,
  width: 200,
  x: 0,
  y: 0,
  z: 1,
  ...extra,
});

const tool = (id: string): Tool => {
  const found = toolById(id);
  if (!found) {
    throw new Error(`no tool ${id}`);
  }
  return found;
};

const success = (url: string): ToolSuccess => ({
  durationMs: 1,
  ok: true,
  ranAt: "2026-01-01T00:00:00.000Z",
  result: {
    description: null,
    fingerprint: "",
    height: null,
    history: [],
    isVector: null,
    kind: "image",
    ranAt: "2026-01-01T00:00:00.000Z",
    url,
    variations: [],
    width: null,
  },
  toolId: "rotate-right",
  variation: {
    description: null,
    height: null,
    isVector: null,
    url,
    width: null,
  },
});

interface Harness {
  calls: ToolInvocation[];
  results: { itemId: string; url: string }[];
  runner: () => ToolRunner;
  /** Resolves the invocation for this item's in-flight run. */
  settle: (itemId: string, outcome: ToolOutcome) => void;
  snapshot: (itemId: string) => ToolRunState;
}

/**
 * Mounts the hook with a stand-in executor that never resolves on its own.
 *
 * Held open deliberately: "is this item still running while that one finished"
 * is only a question while at least one of them is unfinished.
 */
const mount = async (): Promise<Harness> => {
  const calls: ToolInvocation[] = [];
  const results: { itemId: string; url: string }[] = [];
  const pending = new Map<string, (outcome: ToolOutcome) => void>();
  let current: ToolRunner | null = null;

  function Probe() {
    current = useToolRunner({
      execute: (invocation) => {
        calls.push(invocation);
        return new Promise<ToolOutcome>((resolve) => {
          pending.set(invocation.target.item.id, resolve);
        });
      },
      onResult: (itemId, outcome) =>
        results.push({ itemId, url: outcome.result.url ?? "" }),
    });
    return null;
  }

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(<Probe />);
  await flush();

  return {
    calls,
    results,
    runner: () => {
      if (!current) {
        throw new Error("not mounted");
      }
      return current;
    },
    settle: (itemId, outcome) => pending.get(itemId)?.(outcome),
    snapshot: (itemId) => {
      if (!current) {
        throw new Error("not mounted");
      }
      return current.stateOf(itemId);
    },
  };
};

describe("useToolRunner — refusing before it spends", () => {
  it("never calls the executor for a tool with no prompt", async () => {
    const harness = await mount();
    const outcome = await harness.runner().run({
      item: item("a"),
      tool: tool("edit-image"),
    });
    await flush();

    expect(harness.calls).toEqual([]);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.failure.code).toBe("missing-input");
  });

  it("never calls the executor for a planned tool", async () => {
    const harness = await mount();
    const outcome = await harness.runner().run({
      item: item("a"),
      prompt: "make it blue",
      tool: tool("crop"),
    });
    await flush();

    expect(harness.calls).toEqual([]);
    expect(outcome.ok ? "" : outcome.failure.code).toBe("unsupported");
  });

  it("never calls the executor for a transform with no image", async () => {
    const harness = await mount();
    await harness.runner().run({
      item: item("a", { imageUrl: null }),
      tool: tool("rotate-right"),
    });
    await flush();

    expect(harness.calls).toEqual([]);
    expect(harness.snapshot("a").failure?.message).toContain("needs an image");
    expect(harness.snapshot("a").running).toBe(false);
  });

  it("takes the prompt from the tool's own setting, not only the argument", async () => {
    // A panel that filled in `config.prompt` has supplied the words; refusing
    // it would make the settings step decorative.
    const harness = await mount();
    harness.runner().run({
      config: { prompt: "warmer" },
      item: item("a"),
      tool: tool("edit-image"),
    });
    await flush();

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.prompt).toBe("warmer");
  });

  it("runs a ready tool, with the registry's defaults applied", async () => {
    const harness = await mount();
    harness.runner().run({ item: item("a"), tool: tool("rotate-right") });
    await flush();

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.config.degrees).toBe(90);
  });
});

describe("useToolRunner — one state per item", () => {
  it("keeps two items running at once without either clearing the other", async () => {
    const harness = await mount();
    harness.runner().run({ item: item("a"), tool: tool("rotate-right") });
    harness.runner().run({ item: item("b"), tool: tool("rotate-left") });
    await flush();

    expect(harness.snapshot("a").running).toBe(true);
    expect(harness.snapshot("b").running).toBe(true);

    harness.settle("a", success("https://example.test/rotated.png"));
    await flush();

    // The one that finished is idle; the one still working is untouched.
    expect(harness.snapshot("a").running).toBe(false);
    expect(harness.snapshot("b").running).toBe(true);
    expect(harness.results).toEqual([
      { itemId: "a", url: "https://example.test/rotated.png" },
    ]);
  });

  it("does not put one item's failure on another", async () => {
    const harness = await mount();
    harness.runner().run({ item: item("a"), tool: tool("rotate-right") });
    harness.runner().run({ item: item("b"), tool: tool("rotate-right") });
    await flush();

    harness.settle("a", {
      failure: { code: "service", message: "The model refused." },
      ok: false,
    });
    await flush();

    expect(harness.snapshot("a").failure?.message).toBe("The model refused.");
    expect(harness.snapshot("b").failure).toBeNull();
    expect(harness.snapshot("b").running).toBe(true);
  });

  it("reports progress against the item it belongs to", async () => {
    const harness = await mount();
    harness.runner().run({ item: item("a"), tool: tool("rotate-right") });
    harness.runner().run({ item: item("b"), tool: tool("rotate-right") });
    await flush();

    harness.calls[0]?.onProgress?.({
      fraction: 0.5,
      message: "Rotating…",
      phase: "running",
    });
    await flush();

    expect(harness.snapshot("a").progress?.message).toBe("Rotating…");
    expect(harness.snapshot("b").progress).toBeNull();
  });

  it("ignores a second run on an item already running", async () => {
    const harness = await mount();
    harness.runner().run({ item: item("a"), tool: tool("rotate-right") });
    await flush();
    const second = await harness
      .runner()
      .run({ item: item("a"), tool: tool("rotate-left") });

    expect(harness.calls).toHaveLength(1);
    expect(second.ok ? "" : second.failure.code).toBe("cancelled");
  });

  it("is idle for an item that has never run anything", async () => {
    const harness = await mount();
    expect(harness.snapshot("nobody")).toEqual({
      failure: null,
      progress: null,
      running: false,
      toolId: null,
    });
  });

  it("clears one item's failure and leaves the other's", async () => {
    const harness = await mount();
    await harness.runner().run({ item: item("a"), tool: tool("edit-image") });
    await harness.runner().run({ item: item("b"), tool: tool("edit-image") });
    await flush();

    harness.runner().clear("a");
    await flush();

    expect(harness.snapshot("a").failure).toBeNull();
    expect(harness.snapshot("b").failure).not.toBeNull();
  });
});

describe("useToolRunner — cancelling", () => {
  it("signals the executor rather than dropping the promise", async () => {
    const harness = await mount();
    harness.runner().run({ item: item("a"), tool: tool("rotate-right") });
    await flush();

    expect(harness.calls[0]?.signal?.aborted).toBe(false);
    harness.runner().cancel("a");
    expect(harness.calls[0]?.signal?.aborted).toBe(true);
  });
});
