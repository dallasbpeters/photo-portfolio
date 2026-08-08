import { flushSync } from 'react-dom';

/**
 * Runs a state update inside a view transition when the browser supports one.
 *
 * flushSync is required: startViewTransition snapshots the DOM when the
 * callback returns, so a React update still sitting in the queue would be
 * captured as "before" in both frames and nothing would animate.
 *
 * Falls back to a plain call everywhere else, and skips entirely when the
 * visitor prefers reduced motion.
 */
export const startViewTransition = (update: () => void): void => {
  const supported =
    typeof document !== 'undefined' &&
    typeof (document as Document & { startViewTransition?: unknown }).startViewTransition ===
      'function';

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (!supported || reducedMotion) {
    update();
    return;
  }

  (
    document as Document & { startViewTransition: (cb: () => void) => unknown }
  ).startViewTransition(() => flushSync(update));
};
