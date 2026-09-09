-- A trained style presses less hard than fal's default.
--
-- Every trained row was written with lora_scale = 1, which is fal's own
-- default and the one value no hand-tuned style on this board uses: the six
-- curated LoRAs sit between 0.8 and 0.9.
--
-- Training from a frame means training on few pictures that already look
-- alike, and a style LoRA like that overfits. At scale 1 it presses hard enough
-- to pull an image-to-image run back towards what it memorised — so wiring one
-- of the training pictures into its own style reproduces that picture almost
-- exactly, which reads as the style ignoring the prompt and copying the input.
--
-- The node's Restyle setting cannot fix it, because it is the other lever: it
-- decides how much of the picture is repainted, not how hard the weights press
-- while it happens. Repainting more of an image with weights that have
-- memorised it arrives back at the same place.
--
-- The value belongs to the weights rather than to a node — how overfit a given
-- LoRA is, is a fact about that LoRA — so it stays a column, editable per
-- style in the Models panel. See DEFAULT_TRAINED_SCALE in config/nodes/limits.ts,
-- which api/models/train.ts now writes for anything trained after this.

-- migration-safety: changes one number on trained rows only, and only where it
-- is still the untouched default of 1. A style somebody has already tuned is
-- left alone, the weights and trigger are untouched, and the previous value is
-- recoverable by setting it back to 1 in the Models panel.
UPDATE models
SET lora_scale = 0.85,
    updated_at = now()
WHERE id LIKE 'trained/%'
  AND lora_path IS NOT NULL
  AND lora_scale = 1;
