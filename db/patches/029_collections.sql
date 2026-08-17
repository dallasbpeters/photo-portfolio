-- Collections: assets kept for use, without being published.
--
-- The portfolio and the boards are two different things. `photos` is the
-- portfolio — what the site shows, with categories, EXIF, a published flag and a
-- place in a gallery. A picture a board generated is none of that: it is
-- material. Putting it in `photos` to make it reusable meant either publishing
-- it or leaving a permanent draft in the gallery's admin, and both are lies
-- about what it is.
--
-- So a collection is a third place, and the only one both apps read. A board
-- saves into it; the page editor picks out of it; the gallery never sees it.
--
-- Unlike `elements`, whose pictures are a JSONB list because they are a handful
-- read together as one style, a collection's items are rows: there may be
-- hundreds, they are added and removed one at a time, they are paged through,
-- and each carries its own dimensions and title. Every property that makes a
-- child table earn its keep.
--
-- Idempotent like every patch.

CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- What it is for, in a sentence. Optional: a well-named collection usually
  -- needs none, and a required field would be filled with the name again.
  description TEXT,
  -- The item shown on the collection's card. A URL rather than a foreign key,
  -- so removing the item it points at cannot orphan the row — the card falls
  -- back to the first item instead.
  cover_url TEXT,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A collection with no name cannot be picked out of a list.
ALTER TABLE collections DROP CONSTRAINT IF EXISTS collections_named;
ALTER TABLE collections
  ADD CONSTRAINT collections_named CHECK (length(btrim(name)) > 0);

CREATE TABLE IF NOT EXISTS collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Deleting a collection takes its items with it. They exist only as its
  -- contents; the blobs they point at are untouched and may be in others.
  collection_id UUID NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  -- 'video' is what makes the page editor render a clip rather than an <img>.
  -- Stored rather than guessed from the extension: a signed or proxied URL may
  -- carry none, and an mp4 in an <img> is a broken icon for a working asset.
  kind TEXT NOT NULL DEFAULT 'image',
  title TEXT,
  -- Written where it is known so a page can reserve the space before the file
  -- arrives. Null is honest for anything adopted from elsewhere.
  alt TEXT,
  width INTEGER,
  height INTEGER,
  -- Hand-ordered within the collection, like models and board items are: the
  -- order pictures are compared in is a decision, not an accident of when each
  -- was added.
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE collection_items DROP CONSTRAINT IF EXISTS collection_items_kind;
ALTER TABLE collection_items
  ADD CONSTRAINT collection_items_kind CHECK (kind IN ('image', 'video'));

-- The same asset twice in one collection is a duplicate, not a decision. It may
-- legitimately appear in several collections, so the constraint is per
-- collection rather than global.
CREATE UNIQUE INDEX IF NOT EXISTS collection_items_unique
  ON collection_items (collection_id, url);

-- Every read is "the items of this collection, in order".
CREATE INDEX IF NOT EXISTS collection_items_by_collection
  ON collection_items (collection_id, sort_order, created_at);

-- The panel lists them most recently touched first, as the elements list does.
CREATE INDEX IF NOT EXISTS collections_by_updated
  ON collections (updated_at DESC);

COMMENT ON TABLE collections IS
  'Reusable assets shared between the boards and the page editor. Not the portfolio: nothing here is published by being here.';
