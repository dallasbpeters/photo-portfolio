-- What a model makes: a picture, or a clip.
--
-- The models table already says what an endpoint *consumes* (`input`) and what
-- it calls its source image (`image_param`). It has never had to say what comes
-- back, because everything came back as an image.
--
-- A video endpoint breaks that. It is reached through a different door — fal's
-- queue rather than fal.run, because a clip takes minutes and neither the
-- request timeout nor the serverless ceiling will wait — and it returns an mp4
-- where every other row returns a picture. A Generate node offered a video model
-- would submit to the wrong endpoint and, if it somehow succeeded, hand an mp4
-- to something expecting an image.
--
-- So the node's model picker filters on this, and the run path dispatches on it.
-- Defaulting to 'image' is what makes the patch safe on a table that is already
-- full: every existing row keeps meaning exactly what it meant before.
--
-- Idempotent like every patch, and schema only: no row is read or written here.
-- The video endpoints themselves are added through the admin's Models panel
-- rather than seeded, because their exact fal ids change with fal's catalogue
-- and a wrong id is a run that fails after it has been paid for.

ALTER TABLE models ADD COLUMN IF NOT EXISTS output TEXT NOT NULL DEFAULT 'image';

ALTER TABLE models DROP CONSTRAINT IF EXISTS models_output_check;
ALTER TABLE models
  ADD CONSTRAINT models_output_check CHECK (output IN ('image', 'video'));

COMMENT ON COLUMN models.output IS
  'What the endpoint returns: image (fal.run, synchronous) or video (fal queue, polled).';
