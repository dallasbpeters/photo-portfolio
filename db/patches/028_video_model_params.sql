-- Correcting two things the seed got wrong about video endpoints.
--
-- Both were found by reading fal's own OpenAPI schemas rather than by trying a
-- generation, which matters: a wrong body is rejected by the queue with a 422
-- that names a field, and the seed would otherwise have looked correct until
-- someone waited four minutes for nothing.
--
-- 1. Kling v3 calls its source picture `start_image_url`, not `image_url`.
--    Every other endpoint in the table uses `image_url`, and Kling's own v2.5
--    does too — so this is one family disagreeing with itself across a version
--    bump, which is exactly what the image_param column exists to record.
--
-- 2. VEED Fabric is a lipsync model. Its schema requires `audio_url` and
--    `resolution` alongside the image, so it can never succeed from a Video
--    node, which has neither to give. Switched off rather than deleted: an
--    admin may want it back when there is somewhere to supply the audio, and
--    removing rows is what this project's migration rules forbid outright.

-- The constraint that allows `start_image_url` lives in 017 with the rest of the
-- models schema, not here. It was added here first, which broke every later
-- `db:migrate`: patches all re-run, so 017 kept re-adding the narrower list and
-- failing against the rows this patch had written. One definition, in the patch
-- that owns the table.

-- migration-safety: both statements below rewrite two columns on rows this
-- project seeded four patches ago and nobody else writes. No user content is
-- touched: image_param is a protocol detail read only when building a request,
-- and enabled is the switch the admin panel already toggles. Scoped by id to
-- the exact rows the seed created.
UPDATE models
SET image_param = 'start_image_url'
WHERE id IN (
  'fal-ai/kling-video/v3/standard/image-to-video',
  'fal-ai/kling-video/v3/pro/image-to-video'
);

-- migration-safety: see above — the same seeded rows, and the same reasoning.
UPDATE models
SET enabled = FALSE
WHERE id IN ('veed/fabric-1.0', 'veed/fabric-1.0/fast');
