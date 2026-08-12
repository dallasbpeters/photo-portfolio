-- Lets a photograph exist in the library without appearing on the site.
--
-- Defaults to true so every photograph already uploaded stays exactly where it
-- is: this adds a way to hide one, and must not hide anything by arriving.
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;

-- The gallery asks for published photographs in sort order on every visit.
CREATE INDEX IF NOT EXISTS photos_published_order_idx
  ON photos (is_published, sort_order, created_at);
