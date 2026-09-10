/**
 * A note for the one model shape that silently ignores what is wired to it.
 *
 * Its own module because OpNodeView.tsx is at the size ceiling, and because
 * this is a pure function of the model list and the node's config — which
 * makes it testable without a canvas, unlike everything else on the node.
 */

/**
 * What a picture wired into this node will actually do, when the answer is
 * "nothing you would expect".
 *
 * Only for a model whose `input` is "prompt" — a text-to-image endpoint, which
 * takes no picture at all. Six of the enabled models are that shape, and one
 * of them sits near the top of the picker, so wiring a reference into one is
 * an easy mistake and used to be discovered only by running.
 *
 * The run endpoint already refuses a *subject* wired into one of these, with a
 * message naming the model. This is the same fact said before the run rather
 * than after it. An element is deliberately not refused: its style travels as
 * words, so it works here — see api/_lib/elementBrief.ts — and the note says
 * so rather than warning about something that is fine.
 *
 * Null whenever there is nothing to say: no picture wired, a model that takes
 * one, or a list that has not loaded. A node that hid its own settings behind
 * a fetch would make the whole board flash on load.
 */
export const promptOnlyNote = (
  models: readonly { id: string; input: string }[],
  config: Record<string, unknown>,
  imageCount: number
): string | null => {
  if (imageCount === 0) {
    return null;
  }
  const id = typeof config.model === "string" ? config.model : "auto";
  const model = models.find((m) => m.id === id);
  if (model?.input !== "prompt") {
    return null;
  }
  return "This model works from words alone. A wired element still styles it; a wired picture is ignored, and the run is refused rather than billed.";
};

/**
 * That a trained style fires without its token being typed.
 *
 * The token is generated — `mitchkellyz21y` — so nobody is going to remember
 * it, and a LoRA prompted without its trigger returns the base model: an
 * ordinary picture rather than an error, which reads as a training that came
 * out weak. The server has always prepended it (see api/_lib/falBody.ts), but
 * nothing said so, so the only way to know was to ask.
 *
 * Said rather than shown as a field to fill in, because there is nothing to
 * do: typing it changes nothing, and typing it wrong changes nothing either.
 *
 * Null for a model without a LoRA, which is every model the app ships with.
 */
export const loraTriggerNote = (
  models: readonly { id: string; lora?: { trigger: string | null } | null }[],
  config: Record<string, unknown>
): string | null => {
  const id = typeof config.model === "string" ? config.model : "auto";
  const trigger = models.find((m) => m.id === id)?.lora?.trigger?.trim();
  return trigger
    ? `Trained style. "${trigger}" is added to your prompt for you.`
    : null;
};

/**
 * What several wired pictures will do, which is one of two different things.
 *
 * A model that names a single source gets one run per picture: two references
 * wired into a restyle are two things to restyle, and the batch fills the
 * variation strip. A model that takes a *list* gets one run of all of them and
 * blends them. Both are reasonable and they look nothing alike, so the node
 * says which is about to happen rather than letting it be discovered by
 * paying for it — wiring two pictures in to be combined and getting back two
 * separate pictures was exactly that discovery.
 *
 * The rule mirrors falAcceptsImageList on the server, minus the two cases that
 * cannot arise here: a LoRA and a mask both resolve to single-picture
 * endpoints, and the note is suppressed for them below. "auto" is the one that
 * has to be special-cased, because the row itself declares a single image_url
 * and only the endpoint it resolves to — nano-banana's edit model — takes a
 * list.
 *
 * Null with fewer than two pictures, where there is no choice to explain.
 */
export const multiImageNote = (
  models: readonly {
    id: string;
    imageParam: string;
    input: string;
    lora?: { path: string | null } | null;
  }[],
  config: Record<string, unknown>,
  imageCount: number,
  masking = false
): string | null => {
  if (imageCount < 2) {
    return null;
  }
  const id = typeof config.model === "string" ? config.model : "auto";
  const model = models.find((m) => m.id === id);
  if (!model || model.input === "prompt") {
    // A prompt-only model has its own note, which says something stronger.
    return null;
  }
  if (masking) {
    // A mask was drawn over one picture, and the endpoint it sends the run to
    // takes that picture and the mask. There is no room for a second.
    return `A mask applies to one picture, so this is ${imageCount} separate runs — one per picture.`;
  }
  if (model.lora?.path) {
    /*
     * A trained style cannot be told to blend, and saying "pick Auto" here
     * would be telling somebody to throw their style away.
     *
     * fal runs a LoRA on flux-lora, whose endpoints take a single image_url —
     * there is no multi-image endpoint that also loads weights. Blending has
     * to happen before the style is applied, which is two nodes rather than
     * one setting.
     */
    return `A trained style takes one picture at a time, so this is ${imageCount} separate runs. To combine them, blend on an Auto node first and wire that result in here.`;
  }
  return id === "auto" || model.imageParam === "image_urls"
    ? `All ${imageCount} pictures go into one run and are blended together.`
    : `This model takes one picture at a time, so this is ${imageCount} separate runs — one per picture. To blend them, pick Auto, or wire them through a Composite node first.`;
};
