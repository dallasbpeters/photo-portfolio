-- Per-item text size for notes and plain text.
--
-- In canvas units, like every other measurement on a board, so text scales with
-- the viewport exactly as the items around it do.
--
-- Nullable: null means "use the default for this kind", which keeps every
-- existing item rendering as it did before this column existed.

ALTER TABLE board_items ADD COLUMN IF NOT EXISTS font_size DOUBLE PRECISION;
