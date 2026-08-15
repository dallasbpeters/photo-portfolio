-- Lets a photograph appear in the homepage hero slideshow.
--
-- Defaults to false so existing photographs are not featured by default.
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

-- The homepage queries for featured + published photographs.
CREATE INDEX IF NOT EXISTS photos_featured_published_idx
  ON photos (is_featured, is_published, sort_order, created_at);