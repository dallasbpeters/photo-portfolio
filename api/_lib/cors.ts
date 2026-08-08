import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSite } from "./site.js";

const localOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

const allowedOrigins = (): Set<string> => {
  const extras = process.env.CORS_ALLOWED_ORIGINS;
  // Production origins come from the site config, so a new site is one entry in
  // config/sites.ts rather than an edit here.
  const origins = new Set([...localOrigins, ...getSite().origins]);
  if (extras?.trim()) {
    for (const s of extras.split(",")) {
      const trimmed = s.trim();
      if (trimmed) {
        origins.add(trimmed);
      }
    }
  }
  return origins;
};

/**
 * Cross-origin support for local Vite → production API.
 * Call at the top of each handler. Returns true if the request is fully handled (OPTIONS).
 */
export const handleCors = (
  req: VercelRequest,
  res: VercelResponse
): boolean => {
  const origin = req.headers.origin;
  const allowed = allowedOrigins();

  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
};
