/**
 * Adobe Lightroom sync: the cloud catalogue, both directions.
 *
 * Import first — browse the albums in a Lightroom account and pull assets into
 * the photo library — then export, pushing generated and edited images back into
 * an album so AI output lands in the same culling workflow as everything else.
 *
 * **This integration is gated by Adobe, not only by a key.** The Lightroom APIs
 * are, in Adobe's words, "available only to entitled partner applications that
 * have authenticated the customer". Registering an integration gets a client id
 * and secret; reaching a real customer catalogue additionally requires Adobe to
 * entitle the application, and long-lived refresh tokens require asking them
 * directly. So everything here is written to sit dormant until credentials
 * exist, exactly as the fal and Magnific integrations do: `isLightroomConfigured`
 * is false, every route answers 503 with a plain reason, and the admin panel says
 * so rather than offering a button that cannot work.
 *
 * The credentials themselves are in api/_lib/lightroomEnv.ts — this module stays
 * free of `process` and the filesystem so it can be read by the browser and
 * tested alongside the rest of config/.
 *
 * Scopes are worth reading twice. `lr_partner_apis` reaches the catalogue and
 * `lr_partner_rendition_apis` reaches the pictures — an integration with the
 * first and not the second can list an album and fetch nothing in it, which
 * looks like a broken import rather than a missing scope. `offline_access` is
 * what yields a refresh token; without it the connection dies in 24 hours and
 * the admin has to reconnect daily.
 */

/**
 * Adobe IMS, which is the identity system rather than Lightroom itself.
 *
 * v2 authorize against v3 token is the current pairing and they are not
 * interchangeable — a v2 token call answers with an error that says nothing
 * about the version being wrong.
 */
export const ADOBE_AUTHORIZE_URL =
  "https://ims-na1.adobelogin.com/ims/authorize/v2";
export const ADOBE_TOKEN_URL = "https://ims-na1.adobelogin.com/ims/token/v3";

/** The Lightroom services host. Every path below is versioned `/v2/…`. */
export const LIGHTROOM_API = "https://lr.adobe.io";

export const LIGHTROOM_SCOPES = [
  "openid",
  "AdobeID",
  // The catalogue: account, albums, asset metadata.
  "lr_partner_apis",
  // The pixels. Without this an album lists and every picture in it 403s.
  "lr_partner_rendition_apis",
  // Yields a refresh token. Without it the connection lasts a day.
  "offline_access",
].join(",");

/**
 * Which rendition to pull when importing.
 *
 * `2048` rather than `fullsize` by default: fullsize is the full-resolution
 * render and a hundred-asset album of those is a great deal of transfer and
 * storage for pictures that will be shown on a web page. The master — the
 * original raw or JPEG — is a separate endpoint again, and is what to reach for
 * when an import is meant to be an archive rather than a portfolio.
 */
export const LIGHTROOM_RENDITIONS = [
  "thumbnail2x",
  "640",
  "1280",
  "2048",
  "fullsize",
] as const;

export type LightroomRendition = (typeof LIGHTROOM_RENDITIONS)[number];

export const LIGHTROOM_IMPORT_RENDITION: LightroomRendition = "2048";

/** The thumbnail the admin's picker shows. Small, because it shows a gridful. */
export const LIGHTROOM_THUMB_RENDITION: LightroomRendition = "640";

/**
 * How many assets one import request may carry.
 *
 * Each one is a download from Adobe and an upload to blob storage, run inside a
 * single serverless invocation with a wall-clock limit. Fifty is comfortably
 * inside it and keeps a mis-click from starting a thousand transfers; the panel
 * pages through a large album rather than sending it all at once.
 */
export const LIGHTROOM_IMPORT_MAX = 50;

/** How many assets one album listing asks Adobe for. Their own cap is 100. */
export const LIGHTROOM_PAGE_SIZE = 100;
