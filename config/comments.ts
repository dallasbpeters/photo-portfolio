/**
 * Board comments: bound on what a visitor may say, and where new ones go.
 *
 * Shared by the endpoints that validate and the client that has to say so
 * before anything is sent — the same reasoning as config/elements.ts. Kept
 * free of `process.env` because the client imports it.
 */

export const MAX_COMMENT_NAME = 60;
export const MAX_COMMENT_BODY = 1000;
