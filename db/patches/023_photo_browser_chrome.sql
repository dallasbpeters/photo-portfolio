-- Optional browser chrome around a photo in the lightbox.
--
-- Some images are full-page screenshots rather than photographs. Framing those
-- in a title bar tells a viewer what they are looking at, and lets a tall
-- screenshot scroll inside the frame instead of being shrunk to fit.
--
-- Both columns are nullable: NULL means "an ordinary photograph", which is what
-- every existing row is.

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS show_chrome BOOLEAN;

-- The address rendered in the title bar. Display only — it is never linked or
-- fetched, so it does not have to be a resolvable URL.
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS chrome_url TEXT;
