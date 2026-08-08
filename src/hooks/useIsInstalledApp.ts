import { useEffect, useState } from "react";

/**
 * Display modes a launched-from-home-screen app can report. `browser` is the
 * ordinary tab and is deliberately absent — that is the case we want to be
 * false, since a tab has an address bar.
 */
const INSTALLED_MODES = [
  "standalone",
  "minimal-ui",
  "fullscreen",
  "window-controls-overlay",
] as const;

/** iOS Safari predates the display-mode media query and sets this instead. */
const isIosStandalone = (): boolean =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const detect = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    INSTALLED_MODES.some(
      (mode) => window.matchMedia(`(display-mode: ${mode})`).matches
    ) || isIosStandalone()
  );
};

/**
 * True when the page is running as an installed app rather than in a browser
 * tab.
 *
 * Used to reveal affordances that only make sense without an address bar. An
 * installed app cannot be navigated by typing a URL, so anything not linked
 * from the interface is simply unreachable — while in a normal tab that same
 * link would be visible to every visitor for no reason.
 */
export const useIsInstalledApp = (): boolean => {
  const [isInstalled, setIsInstalled] = useState(detect);

  useEffect(() => {
    // A desktop PWA can move between windowed and tabbed modes while running,
    // so this is worth tracking rather than sampling once at mount.
    const queries = INSTALLED_MODES.map((mode) =>
      window.matchMedia(`(display-mode: ${mode})`)
    );
    const update = () => setIsInstalled(detect());

    for (const query of queries) {
      query.addEventListener("change", update);
    }
    return () => {
      for (const query of queries) {
        query.removeEventListener("change", update);
      }
    };
  }, []);

  return isInstalled;
};
