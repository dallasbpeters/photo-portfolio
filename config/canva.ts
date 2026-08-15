/**
 * Canva Connect integration: sends a board image into a Canva design.
 *
 * The flow: the admin connects their Canva account (OAuth 2.0 with PKCE), then
 * right-clicking an image offers "Send to Canva" — the image is uploaded to
 * their Canva asset library and autofilled into a chosen brand template, which
 * creates a fresh design they can edit. All of it goes through the Connect
 * APIs (api.canva.com).
 *
 * The autofill APIs require a Canva Enterprise organisation, or the paid-plan
 * trial quota while the integration is under development.
 */

import { bootstrapEnv } from "../api/_lib/bootstrapEnv.js";

// The token exchange reads these at module load, and a serverless function can
// evaluate this module before db.ts runs its own bootstrap — so the env files
// are loaded here first, or the client id and secret arrive empty.
bootstrapEnv();

const { CANVA_CLIENT_ID: clientId, CANVA_CLIENT_SECRET: clientSecret } =
  process.env;

export const CANVA_CLIENT_ID = clientId?.trim() ?? "";
export const CANVA_CLIENT_SECRET = clientSecret?.trim() ?? "";
/** Publicly reachable callback, registered in the Canva developer portal. */
export const CANVA_REDIRECT_URI =
  process.env.CANVA_REDIRECT_URI?.trim() ??
  "https://dallaspeters.com/api/canva/callback";

/** Hosts for the OAuth handshake and the REST APIs. */
export const CANVA_AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize";
export const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
export const CANVA_API = "https://api.canva.com/rest/v1";

/** Permissions the integration asks for when the admin connects. */
export const CANVA_SCOPES = [
  "asset:read",
  "asset:write",
  "design:content:write",
  "design:meta:read",
  "brandtemplate:meta:read",
  "brandtemplate:content:read",
].join(" ");

export const isCanvaConfigured = (): boolean =>
  Boolean(CANVA_CLIENT_ID && CANVA_CLIENT_SECRET);
