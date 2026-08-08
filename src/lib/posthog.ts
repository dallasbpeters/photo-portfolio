// biome-ignore lint/style/noExportedImports: this module configures the singleton before re-exporting it, so `export from` would skip the init
import posthog from "posthog-js";
import { siteConfig } from "../site";

/**
 * Where the PostHog UI lives, as opposed to where events are sent.
 *
 * Behind a reverse proxy these are different hosts, and without ui_host the
 * toolbar and every "open in PostHog" link would point at the proxy, which
 * serves ingestion endpoints rather than the app.
 */
const POSTHOG_APP_HOST = "https://us.posthog.com";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;

/**
 * Events go to this site's own subdomain, which reverse-proxies PostHog. Being
 * first-party is the whole point — a shared vendor host is what tracking
 * blockers match on — so the host has to follow whichever site this bundle was
 * built for rather than being one baked-in value for both.
 *
 * VITE_POSTHOG_HOST still wins when set, which keeps local development pointed
 * straight at PostHog and leaves a way to bypass a misbehaving proxy without
 * shipping a code change.
 */
const posthogHost =
  import.meta.env.VITE_POSTHOG_HOST || siteConfig.analyticsHost;

const reportMissingConfiguration = (variableName: string) => {
  if (import.meta.env.DEV) {
    throw new Error(
      `${variableName} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variableName} is configured`
    );
  }
};

// The host always resolves now that it falls back to the site's proxy, so the
// key is the only piece that can still be missing.
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_exceptions: {
      capture_console_errors: false,
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
    },
    // Leaves capture_pageview as 'history_change', which this defaults version
    // selects. That is the right choice here: the app is a client-side router,
    // so route changes must register as pageviews rather than only the first
    // load.
    defaults: "2026-05-30",
    ui_host: POSTHOG_APP_HOST,
  });
} else {
  reportMissingConfiguration("VITE_POSTHOG_KEY");
}

export default posthog;
