import type { FalModelInput } from "../../../config/nodeTypes";
import type { AiModel } from "../../types";

/**
 * How a model row reads in the list.
 *
 * Shared between the panel and the row rather than duplicated: both describe
 * the same model, and two descriptions that drift apart would say different
 * things about one endpoint on the same screen.
 */

const INPUT_LABELS: Record<FalModelInput, string> = {
  image: "Image only",
  prompt: "Prompt only",
  "prompt-and-image": "Prompt and image (both)",
  "prompt-or-image": "Prompt or image",
};

/** Falls back to the raw value: a shape added to the table but not here should
 * still be legible rather than blank. */
export const inputLabel = (input: string): string =>
  INPUT_LABELS[input as FalModelInput] ?? input;

export const loraSummary = (model: AiModel): string | null => {
  if (!model.lora) {
    return null;
  }
  const base = model.lora.endpoint ?? "Flux";
  return `LoRA · ${base} · ${model.lora.scale ?? 1}`;
};
