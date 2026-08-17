import { describe, expect, it } from "vitest";
import {
  MODEL_IMAGE_PARAMS,
  MODEL_INPUTS,
  MODEL_OUTPUTS,
} from "../../config/models.js";
import {
  isModelImageParam,
  isModelInput,
  readModelFields,
  rowToModelDef,
} from "./models.js";

/**
 * What a model row is allowed to say it consumes.
 *
 * The vocabulary is written down in four places that must agree: the check
 * constraints in db/patches/017_models.sql, `MODEL_INPUTS` here, the
 * `FalModelInput` union, and the branches that dispatch on it. A value legal in
 * one and unknown to another is not a type error — `rowToModelDef` is
 * deliberately defensive and quietly substitutes a default — so a row would be
 * saved happily and then run as something else entirely.
 */

const row = (over: Record<string, unknown> = {}) =>
  ({
    enabled: true,
    id: "fal-ai/some/endpoint",
    image_param: "image_url",
    input: "prompt-or-image",
    label: "Some endpoint",
    lora_path: null,
    output: "image",
    sort_order: 1,
    vector: false,
    ...over,
  }) as never;

describe("the model input vocabulary", () => {
  it("accepts a clip-consuming shape", () => {
    // The reason this exists: background removal, upscaling and interpolation
    // rework a clip rather than making one from a still.
    expect(isModelInput("video")).toBe(true);
    expect(isModelInput("prompt-and-video")).toBe(true);
  });

  it("still refuses a shape nothing dispatches on", () => {
    expect(isModelInput("prompt-and-audio")).toBe(false);
    expect(isModelInput("")).toBe(false);
  });

  it("knows video_url is a parameter name a row may hold", () => {
    expect(isModelImageParam("video_url")).toBe(true);
    // Already legal in the table since Kling v3, and until now missing from
    // this list — which meant the admin panel refused to save a row it had
    // itself been given.
    expect(isModelImageParam("start_image_url")).toBe(true);
  });
});

describe("rowToModelDef", () => {
  it("keeps the parameter name the row actually stores", () => {
    // It used to collapse anything that was not `image_urls` to undefined,
    // which resolves to `image_url` — the exact field Kling v3's schema
    // rejects, and the failure db/patches/028 was written to correct.
    expect(rowToModelDef(row({ image_param: "video_url" })).imageParam).toBe(
      "video_url"
    );
    expect(
      rowToModelDef(row({ image_param: "start_image_url" })).imageParam
    ).toBe("start_image_url");
  });

  it("falls back rather than trusting a name nothing would recognise", () => {
    // A row predating the column, or one that slipped past the check: it should
    // behave like every row always has instead of naming a field fal has never
    // heard of.
    expect(rowToModelDef(row({ image_param: "clip_uri" })).imageParam).toBe(
      undefined
    );
  });

  it("carries a video shape through instead of defaulting it away", () => {
    expect(rowToModelDef(row({ input: "video" })).input).toBe("video");
  });
});

describe("the vocabulary lists", () => {
  it("offers every input shape the union declares", () => {
    // The admin panel's picker renders straight from this list, so a shape
    // missing here is a shape no one can choose however well the run path
    // handles it.
    expect([...MODEL_INPUTS]).toContain("video");
    expect([...MODEL_INPUTS]).toContain("prompt-and-video");
  });

  it("offers every parameter name the table permits", () => {
    expect([...MODEL_IMAGE_PARAMS]).toEqual([
      "image_url",
      "image_urls",
      "start_image_url",
      "video_url",
    ]);
  });
});

describe("what a model says it returns", () => {
  /**
   * The column that decides which door a run goes through, and the one the
   * admin could not set. `output` defaulted to 'image', nothing wrote it, and
   * both SQL statements left it out of their RETURNING — so a video endpoint
   * added by hand was refused by the Video node with "makes pictures, not
   * video", quoting the row that had just been created for it.
   */
  const fields = (body: Record<string, unknown>) =>
    readModelFields(
      { id: "fal-ai/x", input: "video", label: "X", ...body },
      true
    );

  it("keeps a video endpoint's own answer", () => {
    const patch = fields({ output: "video" });
    expect(typeof patch).not.toBe("string");
    expect(typeof patch === "string" ? null : patch.output).toBe("video");
  });

  it("defaults a new model to image, as the column always has", () => {
    const patch = fields({});
    expect(typeof patch === "string" ? null : patch.output).toBe("image");
  });

  it("refuses anything that is neither", () => {
    // The check constraint permits exactly two values; a third would be written
    // and then rejected by Postgres with a message about a constraint name.
    expect(typeof fields({ output: "audio" })).toBe("string");
  });

  it("offers both to the picker", () => {
    expect([...MODEL_OUTPUTS]).toEqual(["image", "video"]);
  });
});
