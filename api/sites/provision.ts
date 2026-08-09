import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { sanitizeText } from "../_lib/httpUrl.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import {
  addDomain,
  createProject,
  type EnvVar,
  isVercelConfigured,
  listProjects,
  setEnvVars,
} from "../_lib/vercelApi.js";

/** Vercel project names: lowercase letters, digits and hyphens. */
const PROJECT_NAME = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;

const ALL_TARGETS: EnvVar["target"] = ["production", "preview", "development"];

/**
 * Stands up a new site as its own Vercel project.
 *
 * A new portfolio is this same repository with a different SITE, so the project
 * points at the same repo and the site's identity travels as SITE_*
 * environment variables — which is what lets a site exist without being added
 * to config/sites.ts and released.
 *
 * Deliberately additive: this creates and configures, and there is no delete
 * here or in the API client. A Vercel token cannot be scoped to a single
 * project, so the token behind this can reach every project on the account.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isVercelConfigured()) {
    return res.status(503).json({
      error:
        "Provisioning is not configured. Set VERCEL_TOKEN (and VERCEL_TEAM_ID if the sites live under a team).",
    });
  }

  try {
    // Listing is how the admin shows what already exists, and is the only
    // read this endpoint performs.
    if (req.method === "GET") {
      const projects = await listProjects();
      return res.status(200).json({
        projects: projects.map((p) => ({
          framework: p.framework ?? null,
          id: p.id,
          name: p.name,
        })),
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = parseJsonBody(req.body);
    const name = sanitizeText(
      typeof body.name === "string" ? body.name : ""
    ).toLowerCase();
    const siteKey = sanitizeText(
      typeof body.siteKey === "string" ? body.siteKey : ""
    ).toLowerCase();
    const repo = sanitizeText(typeof body.repo === "string" ? body.repo : "");
    const domain = sanitizeText(
      typeof body.domain === "string" ? body.domain : ""
    );

    if (!PROJECT_NAME.test(name)) {
      return res.status(400).json({
        error:
          "Project name must be lowercase letters, digits and hyphens, and start and end with one.",
      });
    }
    if (!siteKey) {
      return res.status(400).json({ error: "A site key is required" });
    }
    if (!repo.includes("/")) {
      return res
        .status(400)
        .json({ error: "Repository must look like owner/name" });
    }

    const project = await createProject({ name, repo });

    // The site's whole identity, so the deployment knows what it is without a
    // code change. Anything omitted falls back to the compiled defaults.
    const text = (key: string): string =>
      typeof body[key] === "string" ? sanitizeText(body[key] as string) : "";

    const vars: EnvVar[] = [
      { key: "SITE", target: ALL_TARGETS, value: siteKey },
      { key: "VITE_SITE", target: ALL_TARGETS, value: siteKey },
    ];
    const optional: [string, string][] = [
      ["SITE_NAME", text("siteName")],
      ["SITE_SHORT_NAME", text("shortName")],
      ["SITE_DOMAIN", domain],
      ["SITE_ORIGINS", domain ? `https://${domain},https://www.${domain}` : ""],
      ["SITE_EMAIL_FROM", text("emailFrom")],
      ["SITE_OWNER_NAME", text("ownerName")],
      ["SITE_HERO_TITLE", text("heroTitle")],
      ["SITE_TAGLINE", text("tagline")],
    ];
    for (const [key, value] of optional) {
      if (value) {
        vars.push({ key, target: ALL_TARGETS, value });
      }
    }

    await setEnvVars(project.id, vars);

    if (domain) {
      await addDomain(project.id, domain);
    }

    return res.status(201).json({
      id: project.id,
      name: project.name,
      // Said plainly rather than implied: the project exists, but a portfolio
      // is not usable until it has its own database and blob store, and
      // neither can be created from here.
      remaining: [
        "Create a database and set DATABASE_URL, then run pnpm db:migrate against it",
        "Create a blob store and set BLOB_READ_WRITE_TOKEN",
        "Set JWT_SECRET, and RESEND_API_KEY if password reset is wanted",
        "Deploy the project once the variables are in place",
      ],
    });
  } catch (e) {
    console.error(e);
    return res.status(502).json({
      error: e instanceof Error ? e.message : "Provisioning failed",
    });
  }
}
