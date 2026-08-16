import { describe, expect, it } from "vitest";
import type { BoardItem, BoardItemResult } from "../../types";

import { appendVariation, historyOf, originalOf } from "./history";
import { toolById } from "./registry";
import { createTransformExecutor } from "./transformExecutor";
import {
  failed,
  succeeded,
  type Tool,
  type ToolExecutor,
  type ToolInvocation,
  type ToolProgress,
} from "./types";

const ORIGINAL_URL = "https://blob.example/original.jpg";

const item = (over: Partial<BoardItem> = {}): BoardItem => ({
  body: null,
  config: null,
  creditName: null,
  creditUrl: null,
  fontSize: null,
  height: 200,
  id: "item-1",
  imageUrl: ORIGINAL_URL,
  kind: "photo",
  nodeType: null,
  photoId: null,
  result: null,
  runError: null,
  runState: null,
  thumbUrl: null,
  width: 300,
  x: 0,
  y: 0,
  z: 1,
  ...over,
});

const invocation = (
  tool: Tool,
  over: Partial<ToolInvocation> = {}
): ToolInvocation => ({
  config: {},
  maskUrl: null,
  prompt: null,
  target: { boardId: "board-1", item: item() },
  tool,
  ...over,
});

const toolNamed = (id: string): Tool => {
  const tool = toolById(id);
  if (!tool) {
    throw new Error(`${id} must be registered`);
  }
  return tool;
};

/**
 * A tool's worth of behaviour with none of its work.
 *
 * The contract is what three surfaces depend on, and it has to hold for an
 * executor nobody has written yet as much as for the two that exist. Testing it
 * against a fake is the only way to say that out loud.
 */
const fakeExecutor =
  (behaviour: "succeed" | "fail" | "cancel"): ToolExecutor =>
  async (call) => {
    call.onProgress?.({
      fraction: 0,
      message: "Starting…",
      phase: "preparing",
    });
    await Promise.resolve();
    call.onProgress?.({ fraction: 0.5, message: "Working…", phase: "running" });

    if (behaviour === "fail") {
      return failed("service", "The model refused this description.", {
        hint: "Try describing it differently.",
      });
    }
    if (behaviour === "cancel") {
      return failed("cancelled", "Cancelled before it finished.");
    }

    call.onProgress?.({ fraction: 1, message: "Done", phase: "storing" });
    const ranAt = "2026-08-16T00:00:00.000Z";
    const variation = {
      description: null,
      height: 100,
      isVector: null,
      url: "https://blob.example/new.jpg",
      width: 100,
    };
    return {
      durationMs: 12,
      ok: true,
      ranAt,
      result: appendVariation(call.target.item.result, variation, {
        itemImageUrl: call.target.item.imageUrl,
        ranAt,
      }),
      toolId: call.tool.id,
      variation,
    };
  };

describe("the executor contract", () => {
  it("reports progress through the phases before it finishes", async () => {
    const seen: ToolProgress[] = [];
    const outcome = await fakeExecutor("succeed")(
      invocation(toolNamed("rotate-right"), {
        onProgress: (progress) => seen.push(progress),
      })
    );

    expect(outcome.ok).toBe(true);
    expect(seen.map((p) => p.phase)).toEqual([
      "preparing",
      "running",
      "storing",
    ]);
    // Every report says something a person could read, and the fraction is
    // either a real number or an honest null.
    for (const progress of seen) {
      expect(progress.message.length).toBeGreaterThan(0);
      expect(
        progress.fraction === null || Number.isFinite(progress.fraction)
      ).toBe(true);
    }
  });

  it("surfaces a failure as a value, with a code and something to act on", async () => {
    const outcome = await fakeExecutor("fail")(
      invocation(toolNamed("edit-image"))
    );

    expect(succeeded(outcome)).toBe(false);
    if (outcome.ok) {
      throw new Error("expected a failure");
    }
    expect(outcome.failure.code).toBe("service");
    expect(outcome.failure.message).toBe("The model refused this description.");
    expect(outcome.failure.hint).toBeTruthy();
  });

  it("distinguishes a cancel from an error, so the bar can stay quiet", async () => {
    const outcome = await fakeExecutor("cancel")(
      invocation(toolNamed("edit-image"))
    );
    if (outcome.ok) {
      throw new Error("expected a failure");
    }
    expect(outcome.failure.code).toBe("cancelled");
  });

  it("leaves the item it was handed completely untouched", async () => {
    const target = item();
    const before = structuredClone(target);
    const outcome = await fakeExecutor("succeed")(
      invocation(toolNamed("rotate-right"), {
        target: { boardId: "board-1", item: target },
      })
    );

    expect(target).toEqual(before);
    expect(target.result).toBeNull();
    expect(target.imageUrl).toBe(ORIGINAL_URL);
    // The new result is a separate object the caller may or may not adopt.
    if (!outcome.ok) {
      throw new Error("expected success");
    }
    expect(outcome.result).not.toBe(target.result);
  });

  it("keeps the original recoverable from the result it produces", async () => {
    const outcome = await fakeExecutor("succeed")(
      invocation(toolNamed("rotate-right"))
    );
    if (!outcome.ok) {
      throw new Error("expected success");
    }
    // History seeded with the item's own image, then the new one appended.
    expect(historyOf(outcome.result).map((v) => v.url)).toEqual([
      ORIGINAL_URL,
      "https://blob.example/new.jpg",
    ]);
    expect(originalOf(outcome.result, null)?.url).toBe(ORIGINAL_URL);
    expect(outcome.result.url).toBe("https://blob.example/new.jpg");
  });
});

describe("history is append-only", () => {
  const existing = (): BoardItemResult => ({
    description: null,
    fingerprint: "abc",
    height: 10,
    history: [
      { description: null, height: 10, isVector: null, url: "v1", width: 10 },
      { description: null, height: 10, isVector: null, url: "v2", width: 10 },
    ],
    isVector: null,
    kind: "image",
    ranAt: "2026-01-01T00:00:00.000Z",
    url: "v2",
    variations: [],
    width: 10,
  });

  const fresh = {
    description: null,
    height: 20,
    isVector: null,
    url: "v3",
    width: 20,
  };

  it("appends without mutating the result it was given", () => {
    const previous = existing();
    const snapshot = structuredClone(previous);
    const next = appendVariation(previous, fresh, {
      ranAt: "2026-08-16T00:00:00.000Z",
    });

    expect(previous).toEqual(snapshot);
    expect(previous.history).toHaveLength(2);
    expect(next.history?.map((v) => v.url)).toEqual(["v1", "v2", "v3"]);
    expect(next).not.toBe(previous);
    expect(next.history).not.toBe(previous.history);
  });

  it("caps the history rather than growing forever", () => {
    let result = existing();
    for (let i = 0; i < 60; i += 1) {
      result = appendVariation(
        result,
        { ...fresh, url: `x${i}` },
        { ranAt: "2026-08-16T00:00:00.000Z" }
      );
    }
    expect(result.history).toHaveLength(40);
    // The newest survives; the oldest is what falls off the front.
    expect(result.history?.at(-1)?.url).toBe("x59");
    expect(result.history?.map((v) => v.url)).not.toContain("v1");
  });

  it("falls back to variations for a result stored before history existed", () => {
    const legacy = {
      ...existing(),
      history: undefined,
      variations: [
        {
          description: null,
          height: 10,
          isVector: null,
          url: "old",
          width: 10,
        },
      ],
    };
    expect(historyOf(legacy).map((v) => v.url)).toEqual(["old"]);
  });
});

// ── The real executors, with their slow edges faked ──────────────────────────

/** A solid 4x2 image, so a quarter turn is visible in the dimensions alone. */
const testImage = (
  width: number,
  height: number
): Promise<HTMLImageElement> => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("no 2d context");
  }
  context.fillStyle = "#c8102e";
  context.fillRect(0, 0, width, height);
  const url = canvas.toDataURL("image/png");
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("could not build the test image"));
    image.src = url;
  });
};

describe("transformExecutor", () => {
  it("rotates a real image and stores the result as a new entry", async () => {
    const stored: Blob[] = [];
    const executor = createTransformExecutor({
      loadImage: () => testImage(4, 2),
      persist: (blob) => {
        stored.push(blob);
        return Promise.resolve("https://blob.example/rotated.png");
      },
    });

    const seen: ToolProgress[] = [];
    const outcome = await executor(
      invocation(toolNamed("rotate-right"), {
        config: { degrees: 90 },
        onProgress: (progress) => seen.push(progress),
      })
    );

    if (!outcome.ok) {
      throw new Error(outcome.failure.message);
    }
    // A quarter turn swaps the axes. This is the assertion that would have
    // caught the transposition bug the export path already carries a test for.
    expect(outcome.variation.width).toBe(2);
    expect(outcome.variation.height).toBe(4);
    expect(outcome.variation.url).toBe("https://blob.example/rotated.png");
    expect(stored).toHaveLength(1);
    expect(seen.map((p) => p.phase)).toEqual([
      "preparing",
      "running",
      "storing",
      "storing",
    ]);
    // Non-destructive: the original is entry zero.
    expect(historyOf(outcome.result).map((v) => v.url)).toEqual([
      ORIGINAL_URL,
      "https://blob.example/rotated.png",
    ]);
  });

  it("refuses an item with no image instead of failing later", async () => {
    const executor = createTransformExecutor({
      loadImage: () => Promise.reject(new Error("should not be reached")),
    });
    const outcome = await executor(
      invocation(toolNamed("rotate-right"), {
        target: { boardId: null, item: item({ imageUrl: null }) },
      })
    );
    if (outcome.ok) {
      throw new Error("expected a failure");
    }
    expect(outcome.failure.code).toBe("missing-input");
  });

  it("reports an unreadable image as retryable rather than throwing", async () => {
    const executor = createTransformExecutor({
      loadImage: () => Promise.reject(new Error("404")),
    });
    const outcome = await executor(invocation(toolNamed("rotate-right")));
    if (outcome.ok) {
      throw new Error("expected a failure");
    }
    expect(outcome.failure.code).toBe("network");
    expect(outcome.failure.hint).toBeTruthy();
  });

  it("refuses a tool it has no implementation for", async () => {
    const executor = createTransformExecutor({
      loadImage: () => testImage(4, 2),
      persist: () => Promise.resolve("https://blob.example/x.png"),
    });
    const outcome = await executor(invocation(toolNamed("crop")));
    if (outcome.ok) {
      throw new Error("expected a failure");
    }
    expect(outcome.failure.code).toBe("unsupported");
  });

  it("stops on an abort raised before the work starts", async () => {
    const controller = new AbortController();
    controller.abort();
    const executor = createTransformExecutor({
      loadImage: () => testImage(4, 2),
      persist: () => Promise.resolve("https://blob.example/x.png"),
    });
    const outcome = await executor(
      invocation(toolNamed("rotate-right"), { signal: controller.signal })
    );
    if (outcome.ok) {
      throw new Error("expected a failure");
    }
    expect(outcome.failure.code).toBe("cancelled");
  });
});
