/**
 * Which lab built the model a node is about to call.
 *
 * A node header showing only "Generate" says nothing about what it is going to
 * spend money on — every generation node looks identical whether it is calling
 * Google's editor, a Recraft vectoriser or a LoRA on FLUX. The lab's mark is
 * the fastest way to read a board: you can see at a glance which nodes agree.
 *
 * **Matched by prefix, in order, rather than enumerated per model.** Models are
 * data — rows in the `models` table, edited from /admin/models — so a table of
 * every id would be a second copy of that list, free to disagree with it and
 * guaranteed to go stale the first time a row is added. A rule per vendor keeps
 * a new endpoint from the same lab working with no change here.
 *
 * The marks themselves are in public/providers/, fetched by
 * scripts/fetch-provider-logos.py from the lab registry fal embeds in its model
 * pages. `slug` is fal's own slug so the two line up; where fal publishes no
 * mark for a lab, `logo` is null and the tile falls back to a monogram.
 *
 * Kept in config/ next to models.ts, dependency-free and free of browser and
 * Node globals, so the API and the canvas can both read it.
 */

/** A lab, as a node header shows it. */
export interface Provider {
  /**
   * The mark's path under public/, or null where fal publishes none.
   *
   * Null is a real answer rather than a missing one: fal has no mark for
   * Recraft or for its own utility endpoints, and a monogram is what those get.
   */
  logo: string | null;
  /** Shown beside the mark, and as its alt text. */
  name: string;
  /** fal's slug for the lab, which is also the logo's filename. */
  slug: string;
}

/**
 * One rule: a model-id prefix, and the lab it belongs to.
 *
 * Order matters. The list is scanned top to bottom and the first match wins, so
 * a specific rule must precede the general one it is an exception to — the
 * bubblegum LoRA runs on Krea's endpoint and so has to be matched before the
 * `lora/` rule that sends everything else to Black Forest Labs.
 */
interface ProviderRule {
  prefix: string;
  provider: Provider;
}

const lab = (slug: string, name: string, hasLogo = true): Provider => ({
  logo: hasLogo ? `/providers/${slug}.png` : null,
  name,
  slug,
});

const ALIBABA = lab("alibaba", "Alibaba");
const BFL = lab("black-forest-labs", "Black Forest Labs");
const BYTEDANCE = lab("bytedance", "Bytedance");
const GOOGLE = lab("google", "Google");
const IDEOGRAM = lab("ideogram", "Ideogram");
const KLING = lab("kling", "Kling");
const KREA = lab("krea", "Krea");
const MINIMAX = lab("minimax", "Minimax");
const OPENAI = lab("openai", "OpenAI");
const PIXVERSE = lab("pixverse", "Pixverse");
const VEED = lab("veed", "Veed");
const XAI = lab("xai", "xAI");

/** fal publishes no mark for these, so they wear a monogram. */
const RECRAFT = lab("recraft", "Recraft", false);
const FAL = lab("fal", "fal.ai", false);

/**
 * What the board shows before a model has been chosen.
 *
 * "auto" is not a lab at all — it is our own rule that picks an endpoint by
 * whether a picture is wired in, so the header cannot honestly claim a vendor
 * until the run resolves one.
 */
export const AUTO_PROVIDER: Provider = {
  logo: null,
  name: "Auto",
  slug: "auto",
};

const RULES: readonly ProviderRule[] = [
  // Exceptions first — see ProviderRule on why order is load-bearing.
  { prefix: "lora/bubblegum-sticker", provider: KREA },
  { prefix: "krea/", provider: KREA },
  // Every other LoRA style is weights loaded onto FLUX, not its own endpoint.
  { prefix: "lora/", provider: BFL },

  { prefix: "fal-ai/nano-banana", provider: GOOGLE },
  { prefix: "fal-ai/veo", provider: GOOGLE },
  { prefix: "fal-ai/gemini", provider: GOOGLE },
  { prefix: "fal-ai/imagen", provider: GOOGLE },

  { prefix: "openai/", provider: OPENAI },
  { prefix: "fal-ai/gpt-image", provider: OPENAI },

  { prefix: "fal-ai/flux", provider: BFL },
  { prefix: "fal-ai/recraft", provider: RECRAFT },

  { prefix: "fal-ai/ideogram", provider: IDEOGRAM },
  { prefix: "ideogram/", provider: IDEOGRAM },

  { prefix: "fal-ai/kling-video", provider: KLING },
  { prefix: "kling/", provider: KLING },

  { prefix: "bytedance/", provider: BYTEDANCE },
  { prefix: "fal-ai/seedream", provider: BYTEDANCE },
  { prefix: "fal-ai/seedance", provider: BYTEDANCE },

  { prefix: "fal-ai/wan", provider: ALIBABA },
  { prefix: "alibaba/", provider: ALIBABA },
  { prefix: "fal-ai/qwen", provider: ALIBABA },
  { prefix: "fal-ai/z-image", provider: ALIBABA },

  { prefix: "veed/", provider: VEED },
  { prefix: "minimax/", provider: MINIMAX },
  { prefix: "fal-ai/minimax", provider: MINIMAX },
  { prefix: "fal-ai/pixverse", provider: PIXVERSE },
  { prefix: "xai/", provider: XAI },

  // Last, and deliberately broadest: fal's own utility endpoints — background
  // removal, upscaling, the image utils. Anything still unmatched under
  // `fal-ai/` is one of theirs, so this doubles as the fallback for a row added
  // in the admin before a rule exists for its vendor.
  { prefix: "fal-ai/", provider: FAL },
];

/**
 * The lab behind a model id.
 *
 * Returns AUTO_PROVIDER for "auto" and for an empty id, and null for an id no
 * rule claims — a caller showing a header decides for itself whether to draw a
 * monogram from the model's own name or nothing at all, which is a presentation
 * question rather than one this table should answer.
 */
export const providerFor = (
  modelId: string | null | undefined
): Provider | null => {
  if (!modelId) {
    return AUTO_PROVIDER;
  }
  const id = modelId.trim().toLowerCase();
  if (id === "" || id === "auto") {
    return AUTO_PROVIDER;
  }
  return RULES.find((rule) => id.startsWith(rule.prefix))?.provider ?? null;
};

/**
 * The letters a tile shows when there is no mark to show.
 *
 * Initials of the words in the name, so "Black Forest Labs" reads BFL and
 * "Recraft" reads RE — a single letter is too easy to confuse across a board
 * with a dozen nodes on it, and more than three stops being a monogram.
 */
const WORD_SEPARATOR = /[\s.]+/u;

export const monogramFor = (name: string): string => {
  const words = name.split(WORD_SEPARATOR).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return words
    .slice(0, 3)
    .map((word) => word[0].toUpperCase())
    .join("");
};
