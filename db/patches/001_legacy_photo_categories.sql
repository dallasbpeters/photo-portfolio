-- Migrates legacy photos.category TEXT (film|photography) to photos.category_id (FK).
-- Safe to run repeatedly; no-op when category_id already exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'photos' AND column_name = 'category'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'photos' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE photos ADD COLUMN category_id UUID REFERENCES categories (id);
    -- migration-safety: one-time backfill of the column added on the line
    -- above, inside a guard that only fires while the legacy `category`
    -- column still exists. A no-op on every database that has already run it.
    UPDATE photos p SET category_id = c.id FROM categories c WHERE c.slug = p.category;
    ALTER TABLE photos ALTER COLUMN category_id SET NOT NULL;
    ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_category_check;
    DROP INDEX IF EXISTS photos_category_idx;
    -- migration-safety: the legacy column, now copied into category_id above.
    -- Same guard: unreachable once this patch has run.
    ALTER TABLE photos DROP COLUMN category;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS photos_category_id_idx ON photos (category_id);
