-- The image-to-video endpoints a Video node can choose from.
--
-- Seeded rather than left to be typed, because a model id is a long path with
-- a version in the middle — `fal-ai/kling-video/v3/pro/image-to-video` — and a
-- transposed segment is a run that fails on submission with a 404 that names
-- nothing useful.
--
-- Every id here was read from fal's own catalogue rather than remembered, which
-- matters more than it sounds: the versions moved a long way while this was
-- being written, and the ones that came to mind — Kling 1.6, Veo 3, Wan 2.1 —
-- are all superseded.
--
-- Image-to-video only. The node requires a picture to animate, so a
-- text-to-video endpoint listed here would be offered, chosen, and then refused
-- for the missing image it was never going to accept. Reference-to-video is
-- also left out: it takes several stills and means something different.
--
-- `input` is 'prompt-and-image' for all of them: every one needs the picture,
-- and every one takes a prompt describing what should happen in the shot.
--
-- Not exhaustive, deliberately. fal lists dozens; this is a spread across the
-- houses whose output is worth comparing, cheapest-first within each. More are
-- added through the admin's Models panel, which is also where these are
-- disabled when fal retires a version.
--
-- Idempotent: ON CONFLICT DO NOTHING, so re-running changes nothing and an
-- endpoint an admin has since edited or disabled is left exactly as they left
-- it. Schema-only in the sense the checker means — it writes no user data and
-- reads none.

INSERT INTO models (id, label, input, image_param, output, vector, enabled, sort_order)
VALUES
  -- Kling: the most widely used, and the v3 tiers differ in price not shape.
  ('fal-ai/kling-video/v3/standard/image-to-video', 'Kling v3 Standard', 'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 100),
  ('fal-ai/kling-video/v3/pro/image-to-video',      'Kling v3 Pro',      'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 101),
  ('fal-ai/kling-video/v2.5-turbo/pro/image-to-video', 'Kling v2.5 Turbo Pro', 'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 102),

  -- Google. The lite and fast tiers exist because Veo is the expensive one.
  ('fal-ai/veo3.1/image-to-video',      'Veo 3.1',      'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 110),
  ('fal-ai/veo3.1/fast/image-to-video', 'Veo 3.1 Fast', 'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 111),
  ('fal-ai/veo3.1/lite/image-to-video', 'Veo 3.1 Lite', 'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 112),

  -- ByteDance Seedance, which reasons about the whole shot at once and holds
  -- a subject's identity across it better than most.
  ('bytedance/seedance-2.5/image-to-video',      'Seedance 2.5',      'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 120),
  ('bytedance/seedance-2.0/fast/image-to-video', 'Seedance 2.0 Fast', 'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 121),

  -- Alibaba's Wan, and Krea's fine-tune of it.
  ('fal-ai/wan/v2.7/image-to-video', 'Wan 2.7',       'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 130),
  ('alibaba/happy-horse/image-to-video', 'Happy Horse', 'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 131),

  -- VEED Fabric, which animates a still portrait into a talking one.
  ('veed/fabric-1.0',      'VEED Fabric 1.0',      'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 140),
  ('veed/fabric-1.0/fast', 'VEED Fabric 1.0 Fast', 'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 141),

  -- MiniMax and PixVerse, for range.
  ('minimax/h3/image-to-video',          'MiniMax H3', 'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 150),
  ('fal-ai/pixverse/v6/image-to-video',  'PixVerse V6', 'prompt-and-image', 'image_url', 'video', FALSE, TRUE, 151)
ON CONFLICT (id) DO NOTHING;
