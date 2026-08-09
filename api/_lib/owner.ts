import type { getBearerUser } from "./auth.js";

/**
 * The single account allowed to manage sites.
 *
 * Site provisioning is not an ordinary admin capability: it creates
 * infrastructure with a token that reaches the whole Vercel account. Every
 * photographer who can sign in to their own admin should not inherit that, so
 * it is gated on one address rather than on being signed in.
 *
 * Overridable by environment so this is not a code change per deployment.
 */
const DEFAULT_OWNER_EMAIL = "dallaspeters@gmail.com";

export const ownerEmail = (): string =>
  process.env.OWNER_EMAIL?.trim().toLowerCase() || DEFAULT_OWNER_EMAIL;

/** True when the signed-in user is the owner. */
export const isOwner = (user: ReturnType<typeof getBearerUser>): boolean =>
  user?.email?.trim().toLowerCase() === ownerEmail();
