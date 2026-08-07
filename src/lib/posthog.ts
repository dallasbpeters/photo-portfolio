import posthog from 'posthog-js';

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST;

const reportMissingConfiguration = (variableName: string) => {
  if (import.meta.env.DEV) {
    throw new Error(
      `${variableName} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variableName} is configured`,
    );
  }
};

if (!posthogKey) {
  reportMissingConfiguration('VITE_POSTHOG_KEY');
} else if (!posthogHost) {
  reportMissingConfiguration('VITE_POSTHOG_HOST');
} else {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: '2026-05-30',
    // Set explicitly rather than inherited from `defaults`, which resolves this
    // to 'history_change' and left both live sites recording no pageviews at
    // all. Verified against production: ingestion accepted events over fetch
    // while the SDK sent none on load or on history change.
    capture_pageview: true,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });
}

export default posthog;
