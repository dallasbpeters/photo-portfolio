-- Plain text on a board, distinct from a sticky note.
--
-- A note is a card you write on; text is a label, heading or annotation with no
-- card behind it. Both hold a body, so this only widens the kind check and the
-- shape constraint that pairs each kind with the column it requires.
--
-- Idempotent like every patch: the constraints are dropped by name first, so
-- re-running is safe.

ALTER TABLE board_items DROP CONSTRAINT IF EXISTS board_items_kind_check;
ALTER TABLE board_items DROP CONSTRAINT IF EXISTS board_items_shape;

-- Guarded because every patch replays on every migrate. This one narrows
-- `kind` to the set that existed when it was written, and a later patch widens
-- it again — so on a database that already holds a newer kind, re-adding the
-- narrow constraint would fail on rows that are perfectly valid. Adding it only
-- when the data satisfies it lets the later patch own the wider set, and keeps
-- a fresh database getting the constraint it expects.
DO $$
BEGIN
  ALTER TABLE board_items ADD CONSTRAINT board_items_kind_check CHECK (kind IN ('photo', 'reference', 'note', 'text'));
EXCEPTION
  WHEN check_violation THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE board_items ADD CONSTRAINT board_items_shape CHECK (
    (kind = 'photo' AND photo_id IS NOT NULL)
    OR (kind = 'reference' AND image_url IS NOT NULL)
    OR (kind IN ('note', 'text') AND body IS NOT NULL)
  );
EXCEPTION
  WHEN check_violation THEN NULL;
END $$;
