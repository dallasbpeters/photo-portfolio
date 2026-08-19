import { describe, expect, it } from "vitest";
import { unmetRequirement } from "./refusals.js";

/**
 * What a run refuses before it spends anything.
 *
 * The case worth pinning is the one that shipped broken: a node whose inputs
 * are pictures, checked against rules written for nodes whose input is words.
 * The Halftone node asked for an image, was given one, and was still turned
 * away with "this node needs a prompt" — a message about a field it does not
 * have, for a run that costs nothing and calls no model. It looked from the
 * board exactly like a node that did nothing at all.
 */

const NO_MODELS = [] as const;

describe("unmetRequirement", () => {
  it("lets a browser-rendered shader through without a prompt", () => {
    expect(
      unmetRequirement(
        "image",
        null,
        "",
        { image: ["https://example.com/a.jpg"] },
        false,
        "board.shader",
        NO_MODELS
      )
    ).toBeNull();
  });

  it("lets a composite through the same way", () => {
    // The rule these two share is the capability, not the node type.
    expect(
      unmetRequirement(
        "image",
        null,
        "",
        { image: ["https://example.com/a.jpg"] },
        false,
        "board.composite",
        NO_MODELS
      )
    ).toBeNull();
  });

  it("still asks a generator for its prompt", () => {
    // The bypass is narrow. A node that really does need words must still say
    // so, or a run is dispatched and billed for an empty prompt.
    const refusal = unmetRequirement(
      "prompt",
      null,
      "",
      {},
      false,
      "fal.image",
      NO_MODELS
    );
    expect(refusal?.missingPort).toBe("prompt");
  });
});
