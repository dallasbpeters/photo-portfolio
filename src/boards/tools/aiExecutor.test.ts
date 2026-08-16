import { describe, expect, it } from "vitest";
import type { BoardItem } from "../../types";
import { createAiExecutor } from "./aiExecutor";
import { historyOf } from "./history";
import { toolById } from "./registry";
import type { Tool, ToolInvocation } from "./types";

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

describe("aiExecutor", () => {
  const generated = {
    description: "a red square",
    height: 512,
    url: "https://blob.example/generated.png",
    width: 512,
  };

  it("sends the item's image for an edit and appends what came back", async () => {
    const calls: { prompt: string; sourceImageUrl: string | null }[] = [];
    const executor = createAiExecutor({
      generate: (prompt, sourceImageUrl) => {
        calls.push({ prompt, sourceImageUrl });
        return Promise.resolve(generated);
      },
    });

    const outcome = await executor(
      invocation(toolNamed("edit-image"), { prompt: "  make it colder  " })
    );

    if (!outcome.ok) {
      throw new Error(outcome.failure.message);
    }
    expect(calls).toEqual([
      { prompt: "make it colder", sourceImageUrl: ORIGINAL_URL },
    ]);
    expect(historyOf(outcome.result).map((v) => v.url)).toEqual([
      ORIGINAL_URL,
      generated.url,
    ]);
  });

  it("sends no source image for a from-nothing generation", async () => {
    const calls: (string | null)[] = [];
    const executor = createAiExecutor({
      generate: (_prompt, sourceImageUrl) => {
        calls.push(sourceImageUrl);
        return Promise.resolve(generated);
      },
    });
    await executor(
      invocation(toolNamed("generate-image"), { prompt: "a red square" })
    );
    expect(calls).toEqual([null]);
  });

  it("refuses a masked invocation rather than letting the mask be dropped", async () => {
    const executor = createAiExecutor({
      generate: () => Promise.reject(new Error("should not be reached")),
    });
    const outcome = await executor(
      invocation(toolNamed("edit-image"), {
        maskUrl: "https://blob.example/mask.png",
        prompt: "replace the sky",
      })
    );
    if (outcome.ok) {
      throw new Error("expected a failure");
    }
    expect(outcome.failure.code).toBe("unsupported");
  });

  it("explains that a masked tool is blocked on the endpoint, not unbuilt", async () => {
    const executor = createAiExecutor({
      generate: () => Promise.reject(new Error("should not be reached")),
    });
    const outcome = await executor(
      invocation(toolNamed("replace-area"), { prompt: "a bird" })
    );
    if (outcome.ok) {
      throw new Error("expected a failure");
    }
    expect(outcome.failure.code).toBe("unsupported");
    expect(outcome.failure.message).toContain("mask");
  });

  it("passes the endpoint's own words through, since they are already useful", async () => {
    const executor = createAiExecutor({
      generate: () =>
        Promise.reject(
          new Error(
            "Image generation is not configured. Set FAL_API_KEY on the project."
          )
        ),
    });
    const outcome = await executor(
      invocation(toolNamed("edit-image"), { prompt: "warmer" })
    );
    if (outcome.ok) {
      throw new Error("expected a failure");
    }
    expect(outcome.failure.code).toBe("service");
    expect(outcome.failure.message).toContain("FAL_API_KEY");
  });

  it("needs a prompt and says so", async () => {
    const executor = createAiExecutor({
      generate: () => Promise.reject(new Error("should not be reached")),
    });
    const outcome = await executor(invocation(toolNamed("edit-image")));
    if (outcome.ok) {
      throw new Error("expected a failure");
    }
    expect(outcome.failure.code).toBe("missing-input");
  });

  it("reports a cancel while waiting on the model", async () => {
    const controller = new AbortController();
    const executor = createAiExecutor({
      generate: () => new Promise(() => undefined),
    });
    const running = executor(
      invocation(toolNamed("edit-image"), {
        prompt: "warmer",
        signal: controller.signal,
      })
    );
    controller.abort();
    const outcome = await running;
    if (outcome.ok) {
      throw new Error("expected a failure");
    }
    expect(outcome.failure.code).toBe("cancelled");
  });
});
