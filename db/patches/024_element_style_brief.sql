-- How the model sees an element's style, in its own words.
--
-- An element is a handful of pictures that share a look. Sending those pictures
-- to an image model alongside the picture being restyled does not work: an edit
-- endpoint treats every entry in `image_urls` as an equal input, so with one
-- subject and six references the subject is one seventh of what the model sees
-- and the style references read as things to draw rather than ways to draw.
--
-- So the pictures are read once, by the vision model, into a single reusable
-- prompt describing what they have in common. A generation then sends exactly
-- one picture — the subject — with that brief in the prompt. There is nothing
-- left to confuse, and it works on the many endpoints that accept only one
-- image, which previously had to refuse the run outright.
--
-- Idempotent like every patch. Schema only: no row is read or written here, and
-- an element with no brief yet simply has it written on first use.

ALTER TABLE elements ADD COLUMN IF NOT EXISTS style_brief TEXT;

-- What the brief was derived from: the description and the picture list, stored
-- verbatim. Without it there is no way to know a cached brief has gone stale,
-- and editing an element would keep generating in the style it used to have.
-- Compared rather than parsed, so the recipe can change without a migration.
ALTER TABLE elements ADD COLUMN IF NOT EXISTS style_brief_key TEXT;

COMMENT ON COLUMN elements.style_brief IS
  'Vision-model reading of the element''s pictures as one reusable prompt.';
COMMENT ON COLUMN elements.style_brief_key IS
  'The description and image list the brief was derived from, for staleness.';
