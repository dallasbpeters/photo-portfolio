/**
 * The credential every blob write is made with, passed rather than inferred.
 *
 * `@vercel/blob` will resolve a credential on its own, and what it resolves is
 * not stable: given no explicit token it falls back to OIDC, and locally that
 * fails with "OIDC is enabled for this project, but not for the development
 * environment" — which reads as a project misconfiguration rather than as a
 * missing variable, and sent a real debugging session looking at the Vercel
 * dashboard instead of at the environment.
 *
 * Naming the token at the call site removes the fallback. When it is present the
 * SDK uses it and never reaches for OIDC; when it is absent the error says so,
 * which is the true problem in that case.
 *
 * Undefined rather than an empty string when unset: the SDK treats undefined as
 * "not given" and resolves as it always did, so production — where the platform
 * injects the variable — behaves exactly as before.
 */
export const blobToken = (): string | undefined =>
  process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
