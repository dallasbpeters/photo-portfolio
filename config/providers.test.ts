import { describe, expect, it } from "vitest";
import { AUTO_PROVIDER, monogramFor, providerFor } from "./providers.js";

/**
 * The rules are matched in order and the order is load-bearing, so most of what
 * is worth testing here is precedence: that a specific rule still beats the
 * general one it is an exception to. Those are the assertions that break when
 * somebody appends a rule to the end of the list rather than placing it.
 */

describe("providerFor", () => {
  it("treats auto, empty and absent as the same non-answer", () => {
    expect(providerFor("auto")).toBe(AUTO_PROVIDER);
    expect(providerFor("AUTO")).toBe(AUTO_PROVIDER);
    expect(providerFor("")).toBe(AUTO_PROVIDER);
    expect(providerFor("   ")).toBe(AUTO_PROVIDER);
    expect(providerFor(null)).toBe(AUTO_PROVIDER);
    expect(providerFor(undefined)).toBe(AUTO_PROVIDER);
  });

  it("names the lab behind every model the board ships with", () => {
    // The rows seeded by db/patches/017_models.sql and 027_video_models.sql.
    const expected: Record<string, string> = {
      "alibaba/happy-horse/image-to-video": "Alibaba",
      "bytedance/seedance-2.5/image-to-video": "Bytedance",
      "fal-ai/birefnet/v2": "fal.ai",
      "fal-ai/flux-pro/kontext": "Black Forest Labs",
      "fal-ai/flux-pro/kontext/max": "Black Forest Labs",
      "fal-ai/ideogram/v3": "Ideogram",
      "fal-ai/imageutils/rembg": "fal.ai",
      "fal-ai/kling-video/v3/pro/image-to-video": "Kling",
      "fal-ai/nano-banana-pro": "Google",
      "fal-ai/nano-banana/edit": "Google",
      "fal-ai/pixverse/v6/image-to-video": "Pixverse",
      "fal-ai/recraft/v4.1/text-to-vector": "Recraft",
      "fal-ai/recraft/vectorize": "Recraft",
      "fal-ai/veo3.1/image-to-video": "Google",
      "fal-ai/wan/v2.7/image-to-video": "Alibaba",
      "ideogram/v4/instant": "Ideogram",
      "minimax/h3/image-to-video": "Minimax",
      "veed/fabric-1.0": "Veed",
    };
    for (const [id, name] of Object.entries(expected)) {
      expect(providerFor(id)?.name, id).toBe(name);
    }
  });

  it("sends the bubblegum LoRA to Krea and every other LoRA to FLUX", () => {
    // Precedence: the bubblegum rule sits above the general `lora/` one because
    // that style runs on Krea's endpoint rather than on fal-ai/flux-lora.
    expect(providerFor("lora/bubblegum-sticker")?.name).toBe("Krea");
    expect(providerFor("lora/rolemodel-style")?.name).toBe("Black Forest Labs");
    expect(providerFor("lora/logo-design")?.name).toBe("Black Forest Labs");
  });

  it("keeps fal's own catch-all below the vendor rules", () => {
    // `fal-ai/` is the broadest rule and is last, so a vendor hosted under it
    // must still resolve to that vendor rather than to fal.
    expect(providerFor("fal-ai/nano-banana/edit")?.name).toBe("Google");
    expect(providerFor("fal-ai/flux/dev")?.name).toBe("Black Forest Labs");
    // Only what no vendor rule claims falls through.
    expect(providerFor("fal-ai/some-new-utility")?.name).toBe("fal.ai");
  });

  it("returns null for an id no rule claims", () => {
    // A row added in the admin for a vendor with no rule yet. Null rather than
    // a wrong guess, so the caller can fall back to the id's own first segment.
    expect(providerFor("brand-new-lab/some-model")).toBeNull();
  });

  it("is case-insensitive and tolerates surrounding space", () => {
    expect(providerFor("  FAL-AI/Nano-Banana/Edit  ")?.name).toBe("Google");
  });

  it("gives a logo path only where a mark was published", () => {
    expect(providerFor("fal-ai/nano-banana/edit")?.logo).toBe(
      "/providers/google.png"
    );
    // fal publishes no mark for these two, so the tile falls back to a monogram.
    expect(providerFor("fal-ai/recraft/vectorize")?.logo).toBeNull();
    expect(providerFor("fal-ai/birefnet/v2")?.logo).toBeNull();
    expect(AUTO_PROVIDER.logo).toBeNull();
  });
});

describe("monogramFor", () => {
  it("takes initials from a multi-word name", () => {
    expect(monogramFor("Black Forest Labs")).toBe("BFL");
  });

  it("takes two letters from a single word", () => {
    // A single letter is too easy to confuse across a board of a dozen nodes.
    expect(monogramFor("Recraft")).toBe("RE");
  });

  it("stops at three letters", () => {
    expect(monogramFor("One Two Three Four Five")).toBe("OTT");
  });

  it("splits on dots, so a domain does not become one word", () => {
    expect(monogramFor("fal.ai")).toBe("FA");
  });

  it("says something for a name with nothing in it", () => {
    expect(monogramFor("")).toBe("?");
    expect(monogramFor("   ")).toBe("?");
  });
});
