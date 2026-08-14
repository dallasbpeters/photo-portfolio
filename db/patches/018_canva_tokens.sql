-- Canva Connect: the admin's OAuth tokens, and the in-flight authorisation
-- handshakes waiting for their callback.
--
-- The token is stored per admin because it acts on behalf of whoever connected.
-- The oauth_states table exists because the code_verifier is generated on the
-- server and must survive the round trip to Canva and back — it cannot travel
-- in the redirect (the callback is a GET), so it is parked under a random
-- state and looked up when the browser returns.
--
-- Idempotent like every patch.

CREATE TABLE IF NOT EXISTS canva_tokens (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  -- When the access token stops being accepted; refreshed just before use.
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canva_oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
