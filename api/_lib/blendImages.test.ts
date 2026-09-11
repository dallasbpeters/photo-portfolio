import { describe, expect, it } from "vitest";
import type { FalModelDef } from "../../config/falModels.js";
import {
  MULTI_IMAGE_BLEND,
  MULTI_IMAGE_SEPARATE,
  wantsBlend,
} from "../../config/nodes/generate.js";
import { type JobShape, jobsFor } from "./elementStyle.js";
import { bodyFor } from "./falBody.js";
import { falAcceptsImageList } from "./falEndpoint.js";

/**
 * Two pictures wired into one node, and what becomes of the second one.
 *
 * Wiring two references into a Generate node and getting back two separate
 * pictures — each ignoring the other — was the behaviour, everywhere. It is
 * right for a model that takes one picture: two references are two things to
 * restyle, and the batch is what the variation strip shows. It is exactly
 * wrong for nano-banana's edit model and the two like it, which take a list
 * and combine what is in it.
 *
 * Neither half of this fails loudly. A run that fans out when it should blend
 * bills twice and returns the wrong thing; a list built from one URL is a
 * request fal accepts and charges for.
 */

const shape = (fields: Partial<JobShape> = {}): JobShape => ({
  blends: false,
  briefs: [],
  capability: "fal.image",
  config: {},
  elementImages: [],
  lists: {},
  masks: new Map(),
  shape: "prompt-or-image",
  typedPrompt: "a poster",
  values: {},
  ...fields,
});

const two = ["https://ours/a.jpg", "https://ours/b.jpg"];

describe("two pictures into one node", () => {
  it("runs each picture separately unless a blend was asked for", () => {
    /*
     * The regression this file exists for.
     *
     * Wiring a frame of references into a Generate node is how a batch is run
     * here — one run per picture, filling the variation strip. Blending was
     * added automatically, so every one of those batches silently became a
     * single run: a board that made twenty pictures made one, and nothing on
     * the node said why. `blends` now takes the node's word as well as the
     * endpoint's, and this is the case that had no test at all.
     */
    const jobs = jobsFor(shape({ values: { image: two } }));
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.image)).toEqual(two);
  });

  it("runs each of twenty separately, which is what a frame wires in", () => {
    const many = Array.from({ length: 20 }, (_, i) => `https://ours/${i}.jpg`);
    expect(jobsFor(shape({ values: { image: many } }))).toHaveLength(20);
  });

  it("makes one run of both where the endpoint blends", () => {
    const jobs = jobsFor(shape({ blends: true, values: { image: two } }));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].image).toBe(two[0]);
    expect(jobs[0].blendWith).toEqual([two[1]]);
  });

  it("still makes one run each where it does not", () => {
    const jobs = jobsFor(shape({ values: { image: two } }));
    expect(jobs.map((job) => job.image)).toEqual(two);
    expect(jobs.every((job) => job.blendWith.length === 0)).toBe(true);
  });

  it("leaves a single picture alone either way", () => {
    for (const blends of [true, false]) {
      const jobs = jobsFor(shape({ blends, values: { image: [two[0]] } }));
      expect(jobs).toHaveLength(1);
      expect(jobs[0].blendWith).toEqual([]);
    }
  });

  it("blends every subject, not just two", () => {
    const three = [...two, "https://ours/c.jpg"];
    const jobs = jobsFor(shape({ blends: true, values: { image: three } }));
    expect(jobs).toHaveLength(1);
    expect([jobs[0].image, ...jobs[0].blendWith]).toEqual(three);
  });

  it("does not blend an element's cover into the subject", () => {
    // A cover arrives on the image port like any other picture and is taken
    // back out: the style travels as words. Blending it in would put the
    // reference itself into the picture, which is the bug elements already had.
    const jobs = jobsFor(
      shape({
        blends: true,
        elementImages: [two[1]],
        values: { image: two },
      })
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].image).toBe(two[0]);
    expect(jobs[0].blendWith).toEqual([]);
  });

  it("sends no picture at all to a prompt-only model", () => {
    const jobs = jobsFor(
      shape({ blends: true, shape: "prompt", values: { image: two } })
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].image).toBeNull();
    expect(jobs[0].blendWith).toEqual([]);
  });
});

describe("the request body for a blend", () => {
  const build = (
    param: NonNullable<FalModelDef["imageParam"]>,
    blendWith: string[]
  ) =>
    bodyFor(
      null,
      "prompt-or-image",
      "a poster",
      two[0],
      undefined,
      param,
      blendWith
    );

  it("puts every picture in the list, subject first", () => {
    // Order is kept because these endpoints read the list as written: the
    // first picture is the one being edited and the rest are what to bring
    // into it.
    expect(build("image_urls", [two[1]]).image_urls).toEqual(two);
  });

  it("sends one picture to an endpoint that names a single source", () => {
    const body = build("image_url", [two[1]]);
    expect(body.image_url).toBe(two[0]);
    expect(body.image_urls).toBeUndefined();
  });

  it("still sends a one-picture list when there is nothing to blend", () => {
    expect(build("image_urls", []).image_urls).toEqual([two[0]]);
  });
});

const model = (fields: Partial<FalModelDef> & { id: string }): FalModelDef =>
  ({
    enabled: true,
    imageParam: "image_url",
    input: "prompt-or-image",
    label: fields.id,
    output: "image",
    ...fields,
  }) as FalModelDef;

const MODELS: FalModelDef[] = [
  model({ id: "auto" }),
  model({ id: "fal-ai/nano-banana/edit", imageParam: "image_urls" }),
  model({ id: "fal-ai/nano-banana-pro", input: "prompt" }),
  model({ id: "fal-ai/flux-pro/kontext", input: "prompt-and-image" }),
  model({
    id: "lora/logo-design",
    lora: {
      path: "https://ours/l.safetensors",
      scale: 0.8,
      trigger: "wablogo",
    },
  }),
];

const accepts = (fields: {
  hasSourceImage?: boolean;
  masking?: boolean;
  requestedModel: string | null;
}) =>
  falAcceptsImageList({
    hasSourceImage: fields.hasSourceImage ?? true,
    masking: fields.masking ?? false,
    models: MODELS,
    requestedModel: fields.requestedModel,
  });

describe("which endpoints blend", () => {
  it("says yes for auto with a picture, which lands on the edit model", () => {
    // The commonest wiring on the board, and the reason this has to read the
    // resolved endpoint: the `auto` row itself declares a single image_url.
    expect(accepts({ requestedModel: "auto" })).toBe(true);
    expect(accepts({ requestedModel: null })).toBe(true);
  });

  it("says yes for the edit model named outright", () => {
    expect(accepts({ requestedModel: "fal-ai/nano-banana/edit" })).toBe(true);
  });

  it("says no for auto with nothing wired, which invents instead", () => {
    expect(accepts({ hasSourceImage: false, requestedModel: "auto" })).toBe(
      false
    );
  });

  it("says no for a model that names one source", () => {
    expect(accepts({ requestedModel: "fal-ai/flux-pro/kontext" })).toBe(false);
  });

  it("says no for a LoRA, whose endpoints all take one picture", () => {
    expect(accepts({ requestedModel: "lora/logo-design" })).toBe(false);
  });

  it("says no under a mask, which goes to an inpainting endpoint", () => {
    // Even on the edit model: the mask override rewrites the body to a single
    // image_url, so a list built here would be thrown away.
    expect(
      accepts({ masking: true, requestedModel: "fal-ai/nano-banana/edit" })
    ).toBe(false);
  });
});

describe("what the node asked for", () => {
  it("only blends when it was chosen", () => {
    expect(wantsBlend({ multiImage: MULTI_IMAGE_BLEND })).toBe(true);
    expect(wantsBlend({ multiImage: MULTI_IMAGE_SEPARATE })).toBe(false);
  });

  it("treats a node that predates the setting as separate", () => {
    // Every board built before this existed carries no such key, and every one
    // of them was built expecting a batch. Defaulting the other way is the
    // bug this whole change is undoing.
    expect(wantsBlend({})).toBe(false);
    expect(wantsBlend({ multiImage: undefined })).toBe(false);
  });

  it("ignores a value it does not recognise", () => {
    expect(wantsBlend({ multiImage: "yes" })).toBe(false);
    expect(wantsBlend({ multiImage: true })).toBe(false);
  });
});
