-- Editable site content and theme, one row per site.
--
-- Only the presentation and content layer lives here. Identity and security
-- values (CORS origins, canonical domain, email From address) stay in
-- config/sites.ts on purpose: an admin panel must not be able to widen CORS,
-- repoint password-reset links, or send from an unverified domain.
--
-- Every column is nullable — NULL means "use the built-in default from
-- config/sites.ts", so an empty row is a valid, working site.

CREATE TABLE IF NOT EXISTS site_settings (
  site_key TEXT PRIMARY KEY,
  name TEXT,
  short_name TEXT,
  hero_title TEXT,
  owner_name TEXT,
  tagline TEXT,
  instagram_url TEXT,
  instagram_handle TEXT,
  theme JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users (id) ON DELETE SET NULL
);
