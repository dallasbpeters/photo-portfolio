-- How a board's text is set: family, weight, colour, alignment and the rest.
--
-- One JSONB column rather than a column per property. The full reasoning lives
-- beside the code that reads and writes it, in config/textStyle.ts; the short
-- version is that these nine values are always read as a whole when a board
-- opens and written as a whole when the toolbar moves. Nothing filters, sorts
-- or aggregates on them, so the queryability a column would buy is a query
-- nobody has — while the cost, a migration per property, would be paid every
-- time the toolbar gained a control. A CHECK constraint would also have to
-- name the font list, which lives in config/theme.ts and changes with a deploy
-- rather than with a patch. The API's `normalizeTextStyle` is the constraint
-- instead: it allowlists every key and clamps every number, in both directions,
-- so a row written by hand is read back as filtered as one written by a save.
--
-- `font_size` deliberately stays in its own column. It is already there and
-- already holds values, and moving it into here would mean a patch that edits
-- rows — which scripts/check-migrations.ts refuses, correctly.
--
-- Idempotent like every patch, and schema only: no row is read or written. An
-- item with no style yet has NULL here, which config/textStyle.ts resolves to
-- exactly what the canvas drew before this column existed.

ALTER TABLE board_items ADD COLUMN IF NOT EXISTS text_style JSONB;

COMMENT ON COLUMN board_items.text_style IS
  'Font family, weight, colour, alignment, line-height, letter-spacing, italic and transform for a text or note item. NULL means the defaults for the kind.';
