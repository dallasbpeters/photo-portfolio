-- Adobe Lightroom sync: the admin's OAuth tokens, the in-flight handshakes, and
-- the record of which Lightroom asset became which photo.
--
-- Tokens are per admin because they act on behalf of whoever connected, exactly
-- as canva_tokens does. The states table exists for the same reason too: the
-- callback is a GET, so the PKCE verifier cannot travel with it and is parked
-- under a random state until the browser comes back.
--
-- The third table is the one Canva did not need. An import is a *copy* — the
-- bytes are downloaded from Adobe and stored in our own blob host — so without a
-- record of what has already been copied, re-opening an album offers to import
-- the same fifty pictures again, and pressing the button makes fifty duplicates.
-- Keyed on the asset id Adobe gives us, which is stable across renames and
-- re-edits, so "already imported" survives the photograph being retitled at
-- either end.
--
-- Idempotent like every patch.

CREATE TABLE IF NOT EXISTS lightroom_tokens (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  -- Nullable, unlike Canva's. A refresh token only arrives when the
  -- `offline_access` scope was granted, and an integration that Adobe has not
  -- entitled for it still authorises fine — it simply expires in a day. Storing
  -- NULL rather than refusing the connection means the integration degrades to
  -- "reconnect daily" instead of "does not work".
  refresh_token TEXT,
  -- When the access token stops being accepted; refreshed just before use.
  expires_at TIMESTAMPTZ NOT NULL,
  -- The catalogue id, cached at connect time. Every asset and album path is
  -- nested under it and it never changes for an account, so re-fetching it on
  -- every request would be a round trip to learn something already known.
  catalog_id TEXT,
  -- Who this is, for the panel to show. Adobe's account endpoint returns it and
  -- an admin with two Adobe logins needs to know which one is connected.
  account_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lightroom_oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What has already been copied, in each direction.
CREATE TABLE IF NOT EXISTS lightroom_assets (
  -- Adobe's asset id. The primary key, so importing twice cannot make two rows
  -- even if two requests race — the insert is ON CONFLICT DO NOTHING.
  asset_id TEXT PRIMARY KEY,
  -- The photo it became. Nullable and ON DELETE SET NULL: deleting the
  -- photograph should not lose the knowledge that this asset was once imported,
  -- or re-opening the album would offer it again as if it were new.
  photo_id UUID REFERENCES photos (id) ON DELETE SET NULL,
  catalog_id TEXT NOT NULL,
  -- 'import' for Adobe -> here, 'export' for here -> Adobe. One asset can only
  -- be one of the two: an exported picture's asset id is created by us, and an
  -- imported one's belongs to Adobe.
  direction TEXT NOT NULL DEFAULT 'import',
  -- Which rendition was taken, so a later "re-import at full size" can tell
  -- what it already has.
  rendition TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lightroom_assets
  DROP CONSTRAINT IF EXISTS lightroom_assets_direction;
ALTER TABLE lightroom_assets
  ADD CONSTRAINT lightroom_assets_direction
  CHECK (direction IN ('import', 'export'));

-- The panel's question is always "what in this album is already here", so the
-- index is on the catalogue rather than on the photo.
CREATE INDEX IF NOT EXISTS lightroom_assets_catalog_idx
  ON lightroom_assets (catalog_id);

CREATE INDEX IF NOT EXISTS lightroom_assets_photo_idx
  ON lightroom_assets (photo_id) WHERE photo_id IS NOT NULL;
