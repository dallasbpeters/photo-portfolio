-- Non-destructive edits: the first edit (rotate, editor save) keeps a copy of
-- the pre-edit image so it can be restored later.
ALTER TABLE photos ADD COLUMN IF NOT EXISTS original_url text;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS original_width integer;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS original_height integer;
