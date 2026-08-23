-- The Adobe integration's own credentials, entered in the admin rather than
-- deployed.
--
-- These started as environment variables, which was wrong for what they are.
-- FAL_API_KEY is a key *this project* owns and pays for — one value, set once by
-- whoever deploys. An Adobe integration is registered by whoever owns the
-- Lightroom account, its redirect URI has to match the deployment it is used
-- from, and it is obtained through an approval process that finishes long after
-- the code ships. Making that a redeploy meant the person who can get the
-- credential could not enter it.
--
-- One row, enforced rather than assumed: these belong to the application, not to
-- a site or a user, and a second row would be a second integration with no way
-- to say which is live.
--
-- **The secret is stored as given.** It has to be — an OAuth client secret is
-- presented to Adobe on every token exchange, so unlike a password it cannot be
-- kept as a hash. That makes this row worth the same care as the OAuth tokens
-- beside it in patch 033: the database is the trust boundary, the API never
-- returns the secret to a browser, and anyone preferring a deployment secret can
-- still set ADOBE_CLIENT_SECRET, which is used when this row has none.
--
-- Idempotent like every patch.

CREATE TABLE IF NOT EXISTS lightroom_credentials (
  -- One row. The CHECK is what makes "the credentials" a meaningful phrase.
  id INTEGER PRIMARY KEY DEFAULT 1,
  client_id TEXT,
  client_secret TEXT,
  -- Registered at Adobe and must match exactly, so it is editable: the same
  -- integration is used from localhost while developing and from the live
  -- domain afterwards, and Adobe rejects a mismatch without saying which part
  -- disagreed.
  redirect_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Who last changed them. ON DELETE SET NULL: removing an admin must not take
  -- the integration with them.
  updated_by UUID REFERENCES users (id) ON DELETE SET NULL
);

ALTER TABLE lightroom_credentials
  DROP CONSTRAINT IF EXISTS lightroom_credentials_single_row;
ALTER TABLE lightroom_credentials
  ADD CONSTRAINT lightroom_credentials_single_row CHECK (id = 1);
