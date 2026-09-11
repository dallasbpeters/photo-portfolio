import { describe, expect, it } from "vitest";
import {
  loraTriggerNote,
  multiImageNote,
  promptOnlyNote,
} from "./promptOnlyNote";

/**
 * The node's warning about a picture wired into a model that takes none.
 *
 * Worth testing because it is the case that used to be discovered only by
 * running: six of the enabled models are text-to-image, and a reference wired
 * into one is refused at run time rather than on the canvas.
 */

const MODELS = [
  { id: "auto", input: "prompt-or-image" },
  { id: "fal-ai/nano-banana-pro", input: "prompt" },
  { id: "fal-ai/flux-2", input: "prompt-and-image" },
];

describe("the note about a model that takes no picture", () => {
  it("warns when a picture is wired into a prompt-only model", () => {
    const note = promptOnlyNote(MODELS, { model: "fal-ai/nano-banana-pro" }, 1);
    expect(note).toContain("works from words alone");
  });

  it("says an element still styles it, since it travels as words", () => {
    const note = promptOnlyNote(MODELS, { model: "fal-ai/nano-banana-pro" }, 1);
    // The element is deliberately not the thing being warned about: its style
    // reaches a text-only model, and warning about it would be wrong.
    expect(note).toContain("element still styles it");
  });

  it("stays quiet when nothing is wired", () => {
    expect(
      promptOnlyNote(MODELS, { model: "fal-ai/nano-banana-pro" }, 0)
    ).toBeNull();
  });

  it("stays quiet for a model that takes a picture", () => {
    expect(promptOnlyNote(MODELS, { model: "fal-ai/flux-2" }, 2)).toBeNull();
    expect(promptOnlyNote(MODELS, { model: "auto" }, 2)).toBeNull();
  });

  it("treats an absent model setting as Auto", () => {
    // A node that has never been given a model runs on the default, which
    // takes a picture — so there is nothing to warn about.
    expect(promptOnlyNote(MODELS, {}, 2)).toBeNull();
  });

  it("stays quiet while the model list is still loading", () => {
    // Empty on first render and on a published board, where the fetch is
    // refused. A note that appeared a beat after the node did would read as
    // something having just gone wrong.
    expect(
      promptOnlyNote([], { model: "fal-ai/nano-banana-pro" }, 2)
    ).toBeNull();
  });
});

describe("the note about a trained style's token", () => {
  const TRAINED = [
    { id: "auto", lora: null },
    { id: "trained/x", lora: { trigger: "mitchkellyz21y" } },
    { id: "trained/blank", lora: { trigger: "   " } },
  ];

  it("says the token is added for you, and names it", () => {
    const note = loraTriggerNote(TRAINED, { model: "trained/x" });
    expect(note).toContain("mitchkellyz21y");
    expect(note).toContain("added to your prompt for you");
  });

  it("stays quiet for a model with no LoRA", () => {
    expect(loraTriggerNote(TRAINED, { model: "auto" })).toBeNull();
    expect(loraTriggerNote(TRAINED, {})).toBeNull();
  });

  it("stays quiet for a LoRA whose trigger is blank", () => {
    // A trigger of spaces is a row that would return the base model whatever
    // was prompted; promising it works would be worse than saying nothing.
    expect(loraTriggerNote(TRAINED, { model: "trained/blank" })).toBeNull();
  });

  it("stays quiet while the model list is loading", () => {
    expect(loraTriggerNote([], { model: "trained/x" })).toBeNull();
  });
});

describe("multiImageNote", () => {
  const models = [
    { id: "auto", imageParam: "image_url", input: "prompt-or-image" },
    {
      id: "fal-ai/nano-banana/edit",
      imageParam: "image_urls",
      input: "prompt-and-image",
    },
    {
      id: "fal-ai/flux-pro/kontext",
      imageParam: "image_url",
      input: "prompt-and-image",
    },
    { id: "fal-ai/nano-banana-pro", imageParam: "image_url", input: "prompt" },
    {
      id: "lora/logo-design",
      imageParam: "image_url",
      input: "prompt-or-image",
      lora: { path: "https://ours/l.safetensors" },
    },
  ];

  it("says nothing about a single picture", () => {
    expect(multiImageNote(models, { model: "auto" }, 1)).toBeNull();
    expect(multiImageNote(models, { model: "auto" }, 0)).toBeNull();
  });

  it("says a batch is a batch when nothing asked for a blend", () => {
    // The default, and what every board built before the setting existed
    // carries. Saying "blended together" here is the wrong half of the bug
    // that made twenty runs into one.
    const note = multiImageNote(models, { model: "auto" }, 3);
    expect(note).toContain("3 separate runs");
    expect(note).not.toContain("blended together");
  });

  it("promises a blend on auto once it is chosen", () => {
    // The row itself declares one image_url; only the endpoint it resolves to
    // takes a list, which is why auto is special-cased.
    expect(multiImageNote(models, { multiImage: "blend" }, 3)).toContain(
      "blended together"
    );
    expect(
      multiImageNote(models, { model: "auto", multiImage: "blend" }, 2)
    ).toContain("blended together");
  });

  it("promises a blend on a model that takes a list outright", () => {
    expect(
      multiImageNote(
        models,
        { model: "fal-ai/nano-banana/edit", multiImage: "blend" },
        2
      )
    ).toContain("blended together");
  });

  it("warns that a single-source model runs each picture separately", () => {
    const note = multiImageNote(
      models,
      { model: "fal-ai/flux-pro/kontext" },
      2
    );
    expect(note).toContain("2 separate runs");
    expect(note).toContain("Composite");
  });

  it("tells a trained style to blend elsewhere first", () => {
    // Not "pick Auto", which would mean throwing the style away: fal has no
    // endpoint that loads weights and takes more than one picture.
    const note = multiImageNote(models, { model: "lora/logo-design" }, 2);
    expect(note).toContain("trained style");
    expect(note).toContain("Auto node first");
    expect(note).not.toContain("blended together");
  });

  it("says a mask leaves room for one picture", () => {
    const note = multiImageNote(
      models,
      { model: "fal-ai/nano-banana/edit" },
      2,
      true
    );
    expect(note).toContain("separate runs");
    expect(note).not.toContain("blended together");
  });

  it("leaves a prompt-only model to its own, stronger note", () => {
    expect(
      multiImageNote(models, { model: "fal-ai/nano-banana-pro" }, 2)
    ).toBeNull();
  });
});
