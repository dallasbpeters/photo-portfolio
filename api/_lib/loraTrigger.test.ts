import { describe, expect, it } from "vitest";
import { bodyFor } from "./falBody.js";

/**
 * That a trained style fires without anyone having to remember its token.
 *
 * A LoRA is trained against a trigger word, and a prompt that omits it returns
 * the base model — an ordinary picture, not an error. So the failure looks like
 * a training that came out weak rather than a word that was left out, and the
 * only way to tell is to know the token. The tokens are generated
 * (`mitchkellyz21y`), so nobody is going to.
 *
 * Prepending it is therefore load-bearing, and worth a test: if this quietly
 * stopped, every trained style in the app would go back to producing base-model
 * output and nothing would say why.
 */

const LORA = {
  endpoint: undefined,
  imageEndpoint: undefined,
  path: "https://ours/weights.safetensors",
  scale: 1,
  trigger: "mitchkellyz21y",
};

const body = (prompt: string, lora = LORA) =>
  bodyFor(lora, "prompt", prompt, null, "image_url") as {
    loras?: { path: string; scale: number }[];
    prompt?: string;
  };

describe("a trained style's trigger word", () => {
  it("is put in front of the prompt, so nobody has to type it", () => {
    expect(body("a book cover").prompt).toBe("mitchkellyz21y, a book cover");
  });

  it("is not repeated when it was typed anyway", () => {
    // Said twice, a model reads as emphasis nobody asked for.
    expect(body("mitchkellyz21y, a book cover").prompt).toBe(
      "mitchkellyz21y, a book cover"
    );
  });

  it("is matched whatever the case", () => {
    expect(body("A cover in MITCHKELLYZ21Y style").prompt).toBe(
      "A cover in MITCHKELLYZ21Y style"
    );
  });

  it("travels with the weights, not instead of them", () => {
    const out = body("a book cover");
    expect(out.loras).toEqual([
      { path: "https://ours/weights.safetensors", scale: 1 },
    ]);
  });

  it("is absent from a model that has no LoRA", () => {
    const plain = bodyFor(
      null,
      "prompt",
      "a book cover",
      null,
      "image_url"
    ) as {
      loras?: unknown;
      prompt?: string;
    };
    expect(plain.prompt).toBe("a book cover");
    expect(plain.loras).toBeUndefined();
  });
});
