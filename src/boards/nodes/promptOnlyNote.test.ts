import { describe, expect, it } from "vitest";
import { promptOnlyNote } from "./promptOnlyNote";

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
