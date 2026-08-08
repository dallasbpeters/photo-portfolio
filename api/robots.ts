import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSite } from "./_lib/site.js";

/**
 * Generated rather than static so the sitemap URL always names the right
 * domain — one codebase serves several sites.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  const site = getSite();
  const body = [
    "User-agent: *",
    "Allow: /",
    // Nothing under the admin should be indexed, and neither should a
    // one-time reset link if it ever leaked into a referrer.
    "Disallow: /admin",
    "Disallow: /reset-password",
    "",
    `Sitemap: https://${site.domain}/sitemap.xml`,
    "",
  ].join("\n");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).send(body);
}
