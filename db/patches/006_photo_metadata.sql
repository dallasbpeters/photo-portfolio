-- Per-photo metadata: accessibility, layout stability, and camera data.
--
-- All nullable. Photos added before this patch keep working with every field
-- empty, and the UI falls back to the title where alt text is missing.

ALTER TABLE photos ADD COLUMN IF NOT EXISTS alt TEXT;

-- Intrinsic pixel size, so the grid can reserve the right box before the image
-- arrives. Without these the layout shifts as each photo loads.
ALTER TABLE photos ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS height INTEGER;

-- Tiny inline preview (a ~20px WebP as a data URI) shown blurred until the real
-- image decodes. Kept small enough to travel in the photo list payload.
ALTER TABLE photos ADD COLUMN IF NOT EXISTS lqip TEXT;

-- Camera data read from the file at upload: make, model, lens, focal length,
-- aperture, shutter, ISO, taken-at.
ALTER TABLE photos ADD COLUMN IF NOT EXISTS exif JSONB;
