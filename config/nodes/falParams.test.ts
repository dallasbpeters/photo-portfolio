import { describe, expect, it } from "vitest";
import { FAL_PARAM_SUPPORT } from "./falParams.generated.js";
import { applyFalParams } from "./falParams.js";
import { IMAGE_SIZES, SIZE_AS_ASPECT } from "./generation.js";

/**
 * The property under test is one-directional and worth stating plainly: this
 * function may only ever put a field in the body that the named endpoint
 * accepts, with a value inside that field's enum. Every assertion below is a
 * case where a hand-written allowlist got it wrong, and each wrong answer would
 * have been a 422 on a request fal had already billed.
 */

const apply = (
  endpoint: string,
  params: Parameters<typeof applyFalParams>[2]
): Record<string, unknown> => {
  const body: Record<string, unknown> = {};
  applyFalParams(body, endpoint, params);
  return body;
};

describe("applyFalParams", () => {
  it("sends nothing when nothing was chosen", () => {
    // The safety property the whole design rests on: an untouched node behaves
    // exactly as it did before these controls existed.
    expect(apply("fal-ai/flux-lora", undefined)).toEqual({});
    expect(
      apply("fal-ai/flux-lora", {
        outputFormat: "auto",
        quality: "auto",
        size: "auto",
      })
    ).toEqual({});
    expect(
      apply("fal-ai/flux-lora", {
        outputFormat: null,
        quality: null,
        size: null,
      })
    ).toEqual({});
  });

  it("sends nothing at all to an endpoint that takes none of it", () => {
    // The vectoriser was the case a remembered allowlist got wrong: it matched
    // a "fal-ai/recraft" prefix and would have been sent an image_size.
    expect(
      apply("fal-ai/recraft/vectorize", {
        outputFormat: "png",
        quality: "high",
        size: "square",
      })
    ).toEqual({});
    // And an endpoint absent from the table entirely.
    expect(apply("some-lab/unknown-model", { size: "square" })).toEqual({});
  });

  it("uses image_size where the endpoint names it that way", () => {
    expect(apply("fal-ai/flux-lora", { size: "portrait_4_3" })).toEqual({
      image_size: "portrait_4_3",
    });
    expect(apply("fal-ai/ideogram/v3", { size: "square_hd" })).toEqual({
      image_size: "square_hd",
    });
  });

  it("translates to aspect_ratio where that is what the endpoint takes", () => {
    // Kontext and Nano Banana are the two most used models on the board and
    // neither has an image_size. Without the translation, Size did nothing on
    // exactly the endpoints it was most wanted for.
    expect(apply("fal-ai/flux-pro/kontext", { size: "portrait_4_3" })).toEqual({
      aspect_ratio: "3:4",
    });
    expect(
      apply("fal-ai/nano-banana/edit", { size: "landscape_16_9" })
    ).toEqual({ aspect_ratio: "16:9" });
  });

  it("prefers the spelling that can carry a resolution", () => {
    // square_hd collapses to 1:1 as a ratio, losing the "hd". An endpoint with
    // both must therefore get image_size, not aspect_ratio.
    const both = Object.entries(FAL_PARAM_SUPPORT).find(
      ([, fields]) => fields.image_size && fields.aspect_ratio
    );
    if (both) {
      expect(apply(both[0], { size: "square_hd" })).toEqual({
        image_size: "square_hd",
      });
    }
    // And where only the ratio exists, the loss is accepted rather than skipped.
    expect(apply("fal-ai/nano-banana/edit", { size: "square_hd" })).toEqual({
      aspect_ratio: "1:1",
    });
  });

  it("refuses a format the endpoint does not list, not merely a field", () => {
    // The half of the rule that is easy to miss. FLUX takes output_format, but
    // only jpeg or png — so webp must send nothing rather than send webp.
    expect(apply("fal-ai/flux-lora", { outputFormat: "png" })).toEqual({
      output_format: "png",
    });
    expect(apply("fal-ai/flux-lora", { outputFormat: "webp" })).toEqual({});
    // Where webp is listed, it goes.
    expect(apply("fal-ai/nano-banana/edit", { outputFormat: "webp" })).toEqual({
      output_format: "webp",
    });
  });

  it("spells quality as steps, as a word, or not at all", () => {
    // Three endpoints, three answers to one control.
    expect(apply("fal-ai/flux-lora", { quality: "draft" })).toEqual({
      num_inference_steps: 12,
    });
    expect(apply("openai/gpt-image-2", { quality: "draft" })).toEqual({
      quality: "low",
    });
    // Ideogram v3 measures effort neither way, so the control does nothing —
    // which is the correct nothing, rather than a 422.
    expect(apply("fal-ai/ideogram/v3", { quality: "high" })).toEqual({});
  });

  it("applies every parameter together without interfering", () => {
    expect(
      apply("openai/gpt-image-2", {
        outputFormat: "webp",
        quality: "high",
        size: "portrait_16_9",
      })
    ).toEqual({
      image_size: "portrait_16_9",
      output_format: "webp",
      quality: "high",
    });
  });
});

describe("the generated table and the panel's vocabulary", () => {
  it("never emits a value outside the endpoint's own enum", () => {
    // Exhaustive rather than sampled: every endpoint crossed with every size
    // the panel can offer. This is the assertion that catches a refreshed table
    // narrowing an enum out from under a value the panel still lists.
    for (const [endpoint, fields] of Object.entries(FAL_PARAM_SUPPORT)) {
      for (const size of IMAGE_SIZES) {
        const body = apply(endpoint, { size });
        if (typeof body.image_size === "string") {
          expect(fields.image_size, `${endpoint} image_size`).toContain(
            body.image_size
          );
        }
        if (typeof body.aspect_ratio === "string") {
          expect(fields.aspect_ratio, `${endpoint} aspect_ratio`).toContain(
            body.aspect_ratio
          );
        }
      }
    }
  });

  it("has a ratio for every size the panel offers but auto", () => {
    // A missing translation is a control that silently does nothing on half the
    // board, which is the failure this map exists to prevent.
    for (const size of IMAGE_SIZES) {
      if (size !== "auto") {
        expect(SIZE_AS_ASPECT[size], size).toBeTruthy();
      }
    }
  });
});
