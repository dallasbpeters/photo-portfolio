/**
 * A deliberately small slice of the Vercel REST API.
 *
 * The CLI cannot be shelled out to from a serverless function, so provisioning
 * talks to the API directly.
 *
 * Only the calls needed to stand a site up are here, and nothing destructive is
 * exposed. A Vercel token is scoped to an account or a team and never to a
 * single project, so the token behind this can reach every project on the
 * account — including ones that have nothing to do with these sites. Adding a
 * delete here would put those one bug away from being removed.
 */

const API = "https://api.vercel.com";

export interface VercelProject {
  createdAt?: number;
  framework?: string | null;
  id: string;
  /** Git repository the project deploys from, when it has one. */
  link?: { org?: string; repo?: string; type?: string } | null;
  name: string;
}

/**
 * The repository whose projects this application manages.
 *
 * Every site is a deployment of this same repo, so the repo is what separates
 * "a site" from the unrelated projects that share the account. Resolved from
 * the environment rather than hardcoded so a fork does not have to edit code.
 */
export const managedRepo = (): string | null => {
  const explicit = process.env.SITES_REPO?.trim();
  if (explicit) {
    return explicit;
  }
  const owner = process.env.VERCEL_GIT_REPO_OWNER?.trim();
  const slug = process.env.VERCEL_GIT_REPO_SLUG?.trim();
  return owner && slug ? `${owner}/${slug}` : null;
};

/** True when a project deploys from the repository this app manages. */
export const isManagedProject = (
  project: VercelProject,
  repo: string
): boolean => {
  const { link } = project;
  if (!(link?.org && link.repo)) {
    return false;
  }
  return `${link.org}/${link.repo}`.toLowerCase() === repo.toLowerCase();
};

export interface EnvVar {
  key: string;
  /** Vercel's own naming: which environments the value applies to. */
  target: ("production" | "preview" | "development")[];
  value: string;
}

const token = (): string | null => process.env.VERCEL_TOKEN?.trim() || null;

export const isVercelConfigured = (): boolean => token() !== null;

/** Team scope, when the sites live under a team rather than a personal account. */
const teamId = (): string | null => process.env.VERCEL_TEAM_ID?.trim() || null;

const request = async <T>(
  path: string,
  init?: { body?: unknown; method?: string }
): Promise<T> => {
  const key = token();
  if (!key) {
    throw new Error("VERCEL_TOKEN is not set");
  }

  // Built with URL so the team scope appends correctly whether or not the path
  // already carries a query string.
  const url = new URL(path, API);
  const team = teamId();
  if (team) {
    url.searchParams.set("teamId", team);
  }

  const res = await fetch(url, {
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    method: init?.method ?? "GET",
  });

  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      json.error?.message ?? `Vercel API request failed (${res.status})`
    );
  }
  return json;
};

export const listProjects = async (): Promise<VercelProject[]> => {
  const data = await request<{ projects: VercelProject[] }>(
    "/v9/projects?limit=100"
  );
  return data.projects;
};

/**
 * Creates a project wired to the same repository this site is built from.
 *
 * A new portfolio is the same codebase with a different SITE, so it is deployed
 * from the same repo rather than a copy — which is what keeps every site fixed
 * by one change rather than one per site.
 */
export const createProject = async (input: {
  name: string;
  repo: string;
}): Promise<VercelProject> =>
  await request<VercelProject>("/v11/projects", {
    body: {
      framework: "vite",
      gitRepository: { repo: input.repo, type: "github" },
      name: input.name,
    },
    method: "POST",
  });

export const setEnvVars = async (
  projectId: string,
  vars: EnvVar[]
): Promise<void> => {
  await request(
    `/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true`,
    {
      body: vars.map((v) => ({
        key: v.key,
        target: v.target,
        type: "encrypted",
        value: v.value,
      })),
      method: "POST",
    }
  );
};

export const addDomain = async (
  projectId: string,
  domain: string
): Promise<void> => {
  await request(`/v10/projects/${encodeURIComponent(projectId)}/domains`, {
    body: { name: domain },
    method: "POST",
  });
};
