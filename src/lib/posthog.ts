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
    // Leaves capture_pageview as 'history_change', which this defaults version
    // selects. That is the right choice here: the app is a client-side router,
    // so route changes must register as pageviews rather than only the first
    // load.
    defaults: '2026-05-30',
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });
}

export default posthog;
