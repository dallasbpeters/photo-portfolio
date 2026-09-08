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
