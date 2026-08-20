import { describe, expect, it } from "vitest";
import { browserRendered } from "./browserRendered.js";

/**
 * Which of a shader's renders a run hands back.
 *
 * A shader fans out into one variation per wired picture, and the browser draws
 * one file for each before the run starts. Reading a single URL handed the same
 * picture back for every variation, so a Batch of ten came out as ten copies of
 * the first — the node accepted the batch and quietly ignored all but one of it.
 */

const NOT_RENDERED = /not been rendered/i;

const MISSING = "This shader has not been rendered yet";

const shader = (config: Record<string, unknown>, variation: number) =>
  browserRendered(config, "renderUrl", MISSING, variation, "renderUrls");

describe("a shader run picks its own variation", () => {
  it("hands back the render for that position", () => {
    const config = {
      renderUrls: [
        "https://example.test/a.png",
        "https://example.test/b.png",
        "https://example.test/c.png",
      ],
    };
    const second = shader(config, 1);
    expect(second).toMatchObject({ url: "https://example.test/b.png" });
  });

  it("gives each variation a different picture", () => {
    // The failure this replaces: ten variations, one picture, ten times.
    const config = {
      renderUrls: ["https://example.test/a.png", "https://example.test/b.png"],
    };
    const urls = [shader(config, 0), shader(config, 1)];
    const seen = new Set(urls.map((u) => (u as { url: string }).url));
    expect(seen.size).toBe(2);
  });

  it("falls back to the single URL for a board saved before batches", () => {
    const first = shader({ renderUrl: "https://example.test/old.png" }, 0);
    expect(first).toMatchObject({ url: "https://example.test/old.png" });
  });

  it("refuses a variation the browser never drew", () => {
    // Better than silently repeating the first: a run that reports success for
    // a picture that does not exist is worse than one that says so.
    expect(() =>
      shader({ renderUrls: ["https://example.test/a.png"] }, 3)
    ).toThrow(NOT_RENDERED);
  });

  it("refuses when nothing has been rendered at all", () => {
    expect(() => shader({}, 0)).toThrow(NOT_RENDERED);
  });
});
