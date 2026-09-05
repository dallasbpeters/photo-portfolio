/**
 * What the desktop shell exposes to the page — see electron/preload.cjs.
 *
 * Present only when the site runs inside the Photos desktop app. Everywhere
 * else `window.photosDesktop` is undefined and the page behaves as a website.
 */
interface PhotosDesktop {
  /** Drops the stored Google tokens so the next request asks for consent. */
  forgetGoogleToken: () => Promise<void>;
  /**
   * An access token for `scope`, obtained through the system browser rather
   * than a popup, because Google refuses to sign in inside an embedded window.
   */
  requestGoogleToken: (
    scope: string
  ) => Promise<{ access_token: string; expires_in: number }>;
}

interface Window {
  photosDesktop?: PhotosDesktop;
}
