-- Admin-editable toggle for the animated dither backdrop.
--
-- Nullable like every other column in site_settings: NULL means "use the
-- built-in default from config/sites.ts", so sites that never touch the toggle
-- keep whatever their compiled config says.

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS show_shader BOOLEAN;
