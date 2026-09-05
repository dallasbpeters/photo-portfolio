"use strict";
/**
 * The one door between the site and the desktop shell.
 *
 * Runs in the page's process with the sandbox on, so it can reach only what
 * `contextBridge` exposes here. The page checks for `window.photosDesktop` to
 * know it is inside the app and to route Google sign-in through the system
 * browser instead of a popup Google would refuse.
 *
 * CommonJS on purpose: a sandboxed preload cannot be an ES module.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("photosDesktop", {
  /** Drops the stored Google tokens so the next request asks for consent. */
  forgetGoogleToken: () => ipcRenderer.invoke("google:forget"),
  /**
   * An access token for `scope`, obtained through the system browser.
   * Resolves to `{ access_token, expires_in }` like Google Identity Services.
   */
  requestGoogleToken: (scope) => ipcRenderer.invoke("google:token", scope),
});
