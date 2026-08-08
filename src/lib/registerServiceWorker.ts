/**
 * Registers the service worker in production only.
 *
 * Chrome will not offer installation without one that handles fetch. Skipped in
 * development, where a cached shell would mask edits behind stale HTML.
 */
export const registerServiceWorker = (): void => {
  if (import.meta.env.DEV) {
    return;
  }
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  // Registering after load keeps it off the critical path for first paint.
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // A failed registration only costs offline support and installability;
      // the site itself is unaffected, so there is nothing to surface.
    });
  });
};
