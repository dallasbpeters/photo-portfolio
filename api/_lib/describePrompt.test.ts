import { describe, expect, it } from "vitest";
import { describePrompt } from "./describePrompt.js";

/**
 * The words sent with a picture, now that two providers send them.
 *
 * Extracted when the vision call moved to Claude, which is exactly when a
 * duplicated instruction would start to drift. The `focus: "style"` line is
 * the one that matters most: without it a restyle draws the reference's
 * subject instead of yours, and that failure looks like a bad style rather
 * than a missing sentence.
 */

describe("describePrompt", () => {
  it("asks what several pictures have in common", () => {
    const text = describePrompt(["a.jpg", "b.jpg"], "");
    expect(text).toContain("share a visual style");
    expect(text).toContain("Ignore anything true of only one of them");
  });

  it("asks about the one picture when there is one", () => {
    const text = describePrompt(["a.jpg"], "");
    expect(text).toContain("Describe this image");
    expect(text).not.toContain("share a visual style");
  });

  it("appends an instruction rather than replacing the ask", () => {
    // The instruction says what to pay attention to; the sentence before it is
    // what makes the answer a prompt rather than a paragraph about a picture.
    const text = describePrompt(["a.jpg"], "the halftone grain");
    expect(text).toContain("Describe this image");
    expect(text).toContain("Pay particular attention to: the halftone grain");
  });

  it("says nothing extra when there is no instruction", () => {
    expect(describePrompt(["a.jpg"], "  ")).not.toContain("particular");
  });
});

describe("describeSystemPrompt", () => {
  it("forbids naming the subject when reading a style", async () => {
    // The sentence the whole element feature rests on. Without it a restyle
    // draws the reference's person instead of the one you wired in.
    const { describeSystemPrompt } = await import("./describePrompt.js");
    const style = describeSystemPrompt("style");
    expect(style).toContain("Never mention the specific subject");
  });

  it("lets a subject reading name one", async () => {
    const { describeSystemPrompt } = await import("./describePrompt.js");
    expect(describeSystemPrompt("subject")).toContain("Describe the subject");
  });

  it("falls back to style for a focus it does not know", async () => {
    // The safe direction: a reading that names a subject by accident is the
    // failure, so an unknown focus gets the strictest instruction.
    const { describeSystemPrompt } = await import("./describePrompt.js");
    expect(describeSystemPrompt("nonsense")).toContain(
      "Never mention the specific subject"
    );
  });
});
