import { next, rewrite } from "@vercel/edge";

/**
 * Routes link-unfurlers and search crawlers to the metadata shell.
 *
 * This has to be middleware rather than a vercel.json rewrite: rewrites are
 * only consulted when nothing in the filesystem matches, and "/" resolves to
 * index.html first, so a rewrite on "/" never fires. Middleware runs ahead of
 * the filesystem.
 *
 * Everyone else is passed straight through, so a real visitor still gets the
 * static file from the CDN with nothing added to the critical path.
 */
export const config = {
  // Skip assets and the API outright — matching them would put an edge
  // invocation in front of every image request.
  matcher: ["/((?!api/|assets/|sites/|_vercel/|.*\\.[a-zA-Z0-9]+$).*)"],
};

const CRAWLER =
  /(bot|crawler|spider|facebookexternalhit|slackbot|twitterbot|whatsapp|telegram|discord|linkedin|embedly|pinterest|redditbot|applebot|bingpreview|preview|unfurl|quora|vkshare|skypeuripreview|nuzzel|google-inspectiontool)/i;

/** Routes the shell never needs to describe. */
const PRIVATE_PATHS = /^\/(admin|reset-password)(\/|$)/;

export default function middleware(request: Request) {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!CRAWLER.test(userAgent)) {
    return next();
  }

  const url = new URL(request.url);
  if (PRIVATE_PATHS.test(url.pathname)) {
    return next();
  }

  const target = new URL("/api/shell", url.origin);
  target.searchParams.set("path", url.pathname);
  return rewrite(target);
}
