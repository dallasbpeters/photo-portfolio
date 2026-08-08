// biome-ignore lint/style/noExportedImports: this module configures the singleton before re-exporting it, so `export from` would skip the init
import posthog from "posthog-js";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST;

const reportMissingConfiguration = (variableName: string) => {
  if (import.meta.env.DEV) {
    throw new Error(
      `${variableName} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variableName} is configured`
    );
  }
};

if (!posthogKey) {
  reportMissingConfiguration("VITE_POSTHOG_KEY");
} else if (posthogHost) {
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
  });
} else {
  reportMissingConfiguration("VITE_POSTHOG_HOST");
}

export default posthog;
