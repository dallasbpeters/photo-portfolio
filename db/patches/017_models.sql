-- Models: the fal.ai endpoints a Generate node may ask for, editable from the
-- admin instead of in code.
--
-- They used to be a constant, FAL_MODELS in config/nodeTypes.ts, which made
-- adding a model a code change and a redeploy. The list is now rows: the admin
-- adds one with the exact fal id, the node offers it, the API accepts it, and
-- an unknown value still falls back to "auto" rather than reaching fal.
--
-- "auto" is the default and the safety net, so it is protected twice — it is
-- seeded here and the constraint below pins its semantics, and the API refuses
-- to delete it or to edit those semantics.
--
-- Idempotent like every patch.

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  -- What the model consumes. One of prompt / image / prompt-and-image /
  -- prompt-or-image; see FalModelInput in config/nodeTypes.ts.
  input TEXT NOT NULL,
  -- What the endpoint calls its source image. Orthogonal to `input`: these
  -- endpoints disagree about the parameter's name as well as its necessity.
  image_param TEXT NOT NULL DEFAULT 'image_url',
  -- True when the model returns vector art rather than a raster. It decides
  -- what a result claims to be, which is not cosmetic.
  vector BOOLEAN NOT NULL DEFAULT FALSE,
  -- A LoRA's own base endpoint, when it is not Flux. See FalLora.
  lora_endpoint TEXT,
  -- The same base, applied to a picture rather than a blank canvas.
  lora_image_endpoint TEXT,
  -- URL to a safetensors file, ours or Hugging Face's. NULL means not a LoRA.
  lora_path TEXT,
  lora_scale REAL,
  -- The token the weights were trained against, prepended to the prompt.
  lora_trigger TEXT,
  -- Hidden models are not offered and not run: an id only the admin sees is a
  -- model being tested, not one that is missing.
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- The order the picker shows them in. "auto" stays first by virtue of 0.
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- An unlabelled model cannot be picked out of the picker, and one that says it
-- consumes nothing is a row that will mis-validate every run that uses it.
ALTER TABLE models DROP CONSTRAINT IF EXISTS models_label;
ALTER TABLE models
  ADD CONSTRAINT models_label CHECK (length(btrim(label)) > 0);

ALTER TABLE models DROP CONSTRAINT IF EXISTS models_input;
ALTER TABLE models
  ADD CONSTRAINT models_input
  CHECK (input IN ('prompt', 'image', 'prompt-and-image', 'prompt-or-image'));

ALTER TABLE models DROP CONSTRAINT IF EXISTS models_image_param;
ALTER TABLE models
  ADD CONSTRAINT models_image_param
  CHECK (image_param IN ('image_url', 'image_urls'));

-- The default model's shape is what the API's "auto" behaviour is built on;
-- letting it be edited would make the fallback mean something different from
-- what the rest of the system assumes it means.
ALTER TABLE models DROP CONSTRAINT IF EXISTS models_auto_shape;
ALTER TABLE models
  ADD CONSTRAINT models_auto_shape
  CHECK (
    id <> 'auto'
    OR (input = 'prompt-or-image' AND image_param = 'image_url' AND vector = FALSE)
  );

CREATE INDEX IF NOT EXISTS models_enabled_order_idx
  ON models (enabled, sort_order, id);

-- The list that used to be the FAL_MODELS constant. Seeded with ON CONFLICT so
-- a model removed here is an edit to the data, not something a re-run of this
-- patch would bring back.
INSERT INTO models
  (id, label, input, image_param, vector, lora_endpoint, lora_image_endpoint,
   lora_path, lora_scale, lora_trigger, sort_order)
VALUES
  ('auto', 'Auto', 'prompt-or-image', 'image_url', FALSE, NULL, NULL, NULL, NULL, NULL, 0),
  ('fal-ai/nano-banana-pro', 'Nano Banana Pro', 'prompt', 'image_url', FALSE, NULL, NULL, NULL, NULL, NULL, 1),
  ('fal-ai/nano-banana/edit', 'Nano Banana Edit', 'prompt-and-image', 'image_urls', FALSE, NULL, NULL, NULL, NULL, NULL, 2),
  ('fal-ai/recraft/v4.1/text-to-vector', 'Recraft v4.1 · Vector', 'prompt', 'image_url', TRUE, NULL, NULL, NULL, NULL, NULL, 3),
  ('fal-ai/ideogram/v3', 'Ideogram v3 · Palette', 'prompt-or-image', 'image_url', FALSE, NULL, NULL, NULL, NULL, NULL, 4),
  ('ideogram/v4/instant', 'Ideogram v4 Instant', 'prompt', 'image_url', FALSE, NULL, NULL, NULL, NULL, NULL, 5),
  ('ideogram/v4/image-to-image', 'Ideogram v4 Image-to-Image', 'prompt-and-image', 'image_url', FALSE, NULL, NULL, NULL, NULL, NULL, 6),
  ('fal-ai/recraft/v4/pro/text-to-vector', 'Recraft v4 Pro · Vector', 'prompt', 'image_url', TRUE, NULL, NULL, NULL, NULL, NULL, 7),
  ('fal-ai/flux-pro/kontext', 'Mockup · place in a scene', 'prompt-and-image', 'image_url', FALSE, NULL, NULL, NULL, NULL, NULL, 8),
  ('fal-ai/flux-pro/kontext/max', 'Mockup · place in a scene (max)', 'prompt-and-image', 'image_url', FALSE, NULL, NULL, NULL, NULL, NULL, 9),
  ('fal-ai/recraft/vectorize', 'Recraft · Vectorize', 'image', 'image_url', TRUE, NULL, NULL, NULL, NULL, NULL, 10),
  ('fal-ai/birefnet/v2', 'Remove background', 'image', 'image_url', FALSE, NULL, NULL, NULL, NULL, NULL, 11),
  ('fal-ai/imageutils/rembg', 'Remove background · fast', 'image', 'image_url', FALSE, NULL, NULL, NULL, NULL, NULL, 12),
  ('lora/rolemodel-style', 'RoleModel style', 'prompt-or-image', 'image_url', FALSE, NULL, NULL, 'https://ftxhendy6jwk0sx5.public.blob.vercel-storage.com/boards/loras/rmstyle-v1.safetensors', 1, 'rmstyle', 13),
  ('lora/rolemodel-design', 'RoleModel design', 'prompt-or-image', 'image_url', FALSE, NULL, NULL, 'https://ftxhendy6jwk0sx5.public.blob.vercel-storage.com/boards/loras/rmdesign-v1.safetensors', 1, 'rmdesign', 14),
  ('lora/text-poster', 'Typography poster', 'prompt-or-image', 'image_url', FALSE, NULL, NULL, 'https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-Text-Poster/resolve/main/FLUX-dev-lora-Text-Poster.safetensors', 0.9, 'text poster', 15),
  ('lora/logo-design', 'Logo / mark', 'prompt-or-image', 'image_url', FALSE, NULL, NULL, 'https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-Logo-Design/resolve/main/FLUX-dev-lora-Logo-Design.safetensors', 0.8, 'wablogo, logo, Minimalist', 16),
  ('lora/telegram-sticker', 'Sticker (Telegram)', 'prompt-or-image', 'image_url', FALSE, NULL, NULL, 'https://ftxhendy6jwk0sx5.public.blob.vercel-storage.com/loras/telegram-sticker-flux.safetensors', 0.9, 'telesticker, sticker art, white outline', 17),
  ('lora/bubblegum-sticker', 'Bubblegum sticker', 'prompt-or-image', 'image_url', FALSE, 'fal-ai/krea-2/turbo', 'fal-ai/krea-2/turbo/image-to-image', 'https://huggingface.co/ilkerzgi/krea-2-bubblegum-pop-sticker-lora/resolve/main/bubblegum-pop-sticker.safetensors', 0.9, 'bubblegum pop sticker style', 18)
ON CONFLICT (id) DO NOTHING;