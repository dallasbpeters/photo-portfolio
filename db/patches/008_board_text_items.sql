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

ALTER TABLE board_items
  ADD CONSTRAINT board_items_kind_check
  CHECK (kind IN ('photo', 'reference', 'note', 'text'));

ALTER TABLE board_items
  ADD CONSTRAINT board_items_shape CHECK (
    (kind = 'photo' AND photo_id IS NOT NULL)
    OR (kind = 'reference' AND image_url IS NOT NULL)
    OR (kind IN ('note', 'text') AND body IS NOT NULL)
  );
