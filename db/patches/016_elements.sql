-- Elements: a named handful of pictures, plus what they have in common.
--
-- A style you have already found, kept so it can be used again. Half a dozen
-- references that share a look, an Analyse node's reading of them, and a name
-- — reusable on any board without those pictures having to be on the canvas.
--
-- Deliberately not a board. A board is a place you work; an element is a
-- conclusion you reached there and want to carry elsewhere, so it outlives the
-- board that produced it and is not deleted with one.
--
-- The images are stored as a JSONB array of URLs rather than as rows. They are
-- ordered, always read together, never queried individually, and bounded at a
-- handful — every property that makes a child table cost more than it returns.
--
-- Idempotent like every patch.

CREATE TABLE IF NOT EXISTS elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- What the pictures have in common, in words: an Analyse node's output, or
  -- typed. This is what travels into a prompt, so it is the element's substance
  -- rather than a description of it.
  description TEXT,
  -- The one shown in the panel. Kept beside the list rather than assumed to be
  -- the first, so re-ordering the images does not silently restyle the library.
  cover_url TEXT,
  -- Ordered URLs. See above for why this is not a table.
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- An element with no name cannot be picked out of a list, and one with no
-- pictures is not a style — it is an empty row that will look like a bug.
ALTER TABLE elements DROP CONSTRAINT IF EXISTS elements_named;
ALTER TABLE elements
  ADD CONSTRAINT elements_named CHECK (length(btrim(name)) > 0);

ALTER TABLE elements DROP CONSTRAINT IF EXISTS elements_images_array;
ALTER TABLE elements
  ADD CONSTRAINT elements_images_array
  CHECK (jsonb_typeof(image_urls) = 'array');

-- The panel lists them most recently touched first, which is the order anyone
-- wants a library of things they are actively building.
CREATE INDEX IF NOT EXISTS elements_updated_idx ON elements (updated_at DESC);
