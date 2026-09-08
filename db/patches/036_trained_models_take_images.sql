-- A trained style may restyle a picture, not only invent one.
--
-- Rows written by api/models/train.ts before this declared `input: 'prompt'`,
-- which is the shape of a model that takes no picture at all. A LoRA is not
-- that: it has three endpoints on its base — invent from words, restyle a
-- wired picture, repaint part of one under a mask — and endpointFor already
-- chooses between them from what is wired.
--
-- But the run path strips every wired image before that choice is reached when
-- a model says it takes none, so the declaration alone locked every trained
-- style to the first of the three. The weights were never the problem; two
-- thirds of what they could do was unreachable.
--
-- Scoped to rows this app trained, by the id prefix train.ts mints. A model
-- added by hand may genuinely be prompt-only — six of the enabled ones are —
-- and rewriting those would send a picture to an endpoint that has nowhere to
-- put it.

-- migration-safety: widens what two rows accept; loses nothing. `input` is a
-- declaration of shape, not data — the weights, trigger and scale are
-- untouched, and the previous value is recoverable by setting it back. Scoped
-- to trained rows so a hand-added prompt-only model is not rewritten.
UPDATE models
SET input = 'prompt-or-image',
    updated_at = now()
WHERE id LIKE 'trained/%'
  AND lora_path IS NOT NULL
  AND input = 'prompt';
