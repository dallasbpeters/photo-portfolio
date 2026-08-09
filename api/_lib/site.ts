import {
  applySiteOverrides,
  resolveSite,
  type SiteConfig,
} from "../../config/sites.js";
import { bootstrapEnv } from "./bootstrapEnv.js";

bootstrapEnv();

/**
 * The site these serverless functions serve. Unlike the browser bundle this is
 * read at runtime, so `SITE` is a plain Vercel env var (no VITE_ prefix).
 */
export const getSite = (): SiteConfig =>
  applySiteOverrides(resolveSite(process.env.SITE), process.env);

export type { SiteConfig } from "../../config/sites.js";
