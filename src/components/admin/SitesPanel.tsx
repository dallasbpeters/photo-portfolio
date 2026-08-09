import { Globe, Plus } from "iconoir-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type ProvisionResult,
  type SetupResult,
  siteSetupApi,
  sitesApi,
  type VercelProjectSummary,
} from "../../services/portfolioService";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/** The server refuses non-owners with 403; the service surfaces it as text. */
const FORBIDDEN = /forbidden/i;

/**
 * Credentials that can be supplied per site.
 *
 * Left blank, each is inherited from this deployment — which is the normal
 * case. They are here for the site that needs its own account, and for a
 * deployment that does not hold one to pass on.
 */
const CREDENTIAL_FIELDS: { hint: string; key: string; label: string }[] = [
  {
    hint: "Without this the Google sign-in button does not render",
    key: "VITE_GOOGLE_CLIENT_ID",
    label: "Google client ID (browser)",
  },
  {
    hint: "Same OAuth client; checked server-side",
    key: "GOOGLE_CLIENT_ID",
    label: "Google client ID (server)",
  },
  { hint: "Password reset email", key: "RESEND_API_KEY", label: "Resend key" },
  {
    hint: "Public project token",
    key: "VITE_POSTHOG_KEY",
    label: "PostHog key",
  },
];

/** Every site is this same repository with a different SITE. */
const DEFAULT_REPO = "dallasbpeters/photo-portfolio";

const labelClass = "text-[10px] uppercase tracking-widest text-white/90";
const inputClass =
  "min-h-11 text-base bg-black/40 border-white/10 focus:border-white/40 transition-colors";

interface Field {
  hint?: string;
  key: keyof FormState;
  label: string;
  required?: boolean;
}

interface FormState {
  domain: string;
  emailFrom: string;
  heroTitle: string;
  name: string;
  ownerName: string;
  repo: string;
  shortName: string;
  siteKey: string;
  siteName: string;
  tagline: string;
}

const FIELDS: Field[] = [
  {
    hint: "Vercel project name — lowercase, hyphens",
    key: "name",
    label: "Project name",
    required: true,
  },
  {
    hint: "The SITE value this deployment runs as",
    key: "siteKey",
    label: "Site key",
    required: true,
  },
  { hint: "owner/name on GitHub", key: "repo", label: "Repository" },
  { hint: "Apex domain, no scheme", key: "domain", label: "Domain" },
  {
    hint: "Browser title and install prompt",
    key: "siteName",
    label: "Site name",
  },
  { hint: "Under ~12 characters", key: "shortName", label: "Short name" },
  {
    hint: "Photographer's display name",
    key: "ownerName",
    label: "Owner name",
  },
  { hint: "Wordmark on the gallery", key: "heroTitle", label: "Hero wordmark" },
  { hint: "Line under the footer wordmark", key: "tagline", label: "Tagline" },
  {
    hint: "Domain must be verified in Resend",
    key: "emailFrom",
    label: "Email from",
  },
];

const EMPTY: FormState = {
  domain: "",
  emailFrom: "",
  heroTitle: "",
  name: "",
  ownerName: "",
  repo: DEFAULT_REPO,
  shortName: "",
  siteKey: "",
  siteName: "",
  tagline: "",
};

/**
 * The label for a site's setup toggle.
 *
 * A ready site says "Configure": there is nothing left to finish, but its
 * credentials can still be changed.
 */
function setupLabel(project: VercelProjectSummary, openId: string | null) {
  if (project.id === openId) {
    return "Cancel";
  }
  return project.missing.length === 0 ? "Configure" : "Finish setup";
}

/**
 * Creates a new site as its own Vercel project.
 *
 * Only additive: there is no delete here, because a Vercel token cannot be
 * scoped below a team and would reach every project on the account.
 */
export function SitesPanel() {
  const [projects, setProjects] = useState<VercelProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  /**
   * Whether this account may manage sites.
   *
   * Not decided here: the panel asks the server and hides itself if refused, so
   * there is one rule in one place. Duplicating the owner's address into the
   * bundle would be a second rule that could disagree with the first.
   */
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [setupFor, setSetupFor] = useState<string | null>(null);
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);

  const runSetup = async (projectId: string) => {
    setIsSettingUp(true);
    setSetupResult(null);
    try {
      const outcome = await siteSetupApi.run(
        projectId,
        databaseUrl.trim() || undefined,
        credentials
      );
      setSetupResult(outcome);
      setDatabaseUrl("");
      setCredentials({});
      toast.success("Setup finished");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setIsSettingUp(false);
    }
  };

  const load = useCallback(async () => {
    try {
      setProjects(await sitesApi.listProjects());
      setIsAllowed(true);
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load projects";
      if (FORBIDDEN.test(message)) {
        setIsAllowed(false);
        return;
      }
      setIsAllowed(true);
      // Shown inline rather than as a toast: without a token this panel simply
      // cannot work, and that is worth stating where it is.
      setError(message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setResult(null);
    try {
      const created = await sitesApi.create({
        domain: form.domain || undefined,
        emailFrom: form.emailFrom || undefined,
        heroTitle: form.heroTitle || undefined,
        name: form.name,
        ownerName: form.ownerName || undefined,
        repo: form.repo,
        shortName: form.shortName || undefined,
        siteKey: form.siteKey,
        siteName: form.siteName || undefined,
        tagline: form.tagline || undefined,
      });
      setResult(created);
      setForm(EMPTY);
      setIsOpen(false);
      toast.success(`Created ${created.name}`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create site");
    } finally {
      setIsCreating(false);
    }
  };

  // Nothing is rendered until the answer is known, so the panel does not appear
  // and then vanish for everyone who is not the owner.
  if (isAllowed !== true) {
    return null;
  }

  return (
    <Card className="border-white/10 bg-white/2">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 font-light text-sm text-white/90 uppercase tracking-[0.2em]">
          <Globe aria-hidden height={16} width={16} />
          Sites
        </CardTitle>
        <Button
          className="min-h-11 border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
          onClick={() => setIsOpen((v) => !v)}
          type="button"
          variant="outline"
        >
          <Plus aria-hidden height={14} width={14} />
          New site
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        {error ? (
          <p className="text-[12px] text-amber-300/80 leading-relaxed">
            {error}
          </p>
        ) : null}

        {projects.length === 0 && !error ? (
          <p className="text-[12px] text-white/60 leading-relaxed">
            No sites created here yet. Sites that predate this panel are not
            listed — it shows projects deployed from this repository.
          </p>
        ) : null}

        {projects.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <li
                className="rounded border border-white/10 bg-black/30 px-3 py-2"
                key={project.id}
              >
                <p className="truncate text-[13px] text-white/90">
                  {project.name}
                </p>
                <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">
                  {project.framework ?? "no framework"}
                </p>
                {/* A ready site keeps the panel reachable. Hiding it once
                    nothing was missing meant a credential could never be
                    changed afterwards — the Google client id being the one
                    that actually needed changing. */}
                {project.missing.length === 0 ? (
                  <p className="mt-2 text-[10px] text-emerald-300/70 uppercase tracking-[0.18em]">
                    Ready
                  </p>
                ) : (
                  <p className="mt-2 text-[10px] text-white/40">
                    Missing: {project.missing.join(", ")}
                  </p>
                )}
                <button
                  className="mt-1 block text-[10px] text-white/50 uppercase tracking-[0.18em] hover:text-white"
                  onClick={() =>
                    setSetupFor((current) =>
                      current === project.id ? null : project.id
                    )
                  }
                  type="button"
                >
                  {setupLabel(project, setupFor)}
                </button>

                {setupFor === project.id ? (
                  <div className="mt-2 space-y-2">
                    <Input
                      className={inputClass}
                      onChange={(e) => setDatabaseUrl(e.target.value)}
                      placeholder="postgres://… (optional)"
                      value={databaseUrl}
                    />

                    {CREDENTIAL_FIELDS.map((field) => (
                      <div className="space-y-1" key={field.key}>
                        <Input
                          aria-label={field.label}
                          className={inputClass}
                          onChange={(e) =>
                            setCredentials((current) => ({
                              ...current,
                              [field.key]: e.target.value,
                            }))
                          }
                          placeholder={`${field.label} (optional)`}
                          // Typed secrets should not sit on screen in the clear.
                          type="password"
                          value={credentials[field.key] ?? ""}
                        />
                        <p className="text-[10px] text-white/40">
                          {field.hint}
                        </p>
                      </div>
                    ))}

                    <p className="text-[10px] text-white/40 leading-relaxed">
                      Leave blank to inherit this site's values.
                    </p>
                    <Button
                      className="min-h-11 w-full border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
                      disabled={isSettingUp}
                      onClick={() => void runSetup(project.id)}
                      type="button"
                      variant="outline"
                    >
                      {isSettingUp ? "Working…" : "Create storage & secrets"}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {isOpen ? (
          <form className="space-y-4" onSubmit={(e) => void submit(e)}>
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <div className="space-y-2" key={field.key}>
                  <Label className={labelClass} htmlFor={`site-${field.key}`}>
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  <Input
                    className={inputClass}
                    id={`site-${field.key}`}
                    onChange={(e) => set(field.key, e.target.value)}
                    required={field.required}
                    value={form[field.key]}
                  />
                  {field.hint ? (
                    <p className="text-[10px] text-white/60">{field.hint}</p>
                  ) : null}
                </div>
              ))}
            </div>

            <Button
              className="min-h-11 border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
              disabled={isCreating}
              type="submit"
              variant="outline"
            >
              {isCreating ? "Creating…" : "Create project"}
            </Button>
          </form>
        ) : null}

        {setupResult ? (
          <div className="space-y-2 rounded border border-white/10 bg-black/40 p-3">
            {setupResult.done.map((step) => (
              <p
                className="text-[11px] text-white/70 leading-relaxed"
                key={step}
              >
                ✓ {step}
              </p>
            ))}
            {setupResult.remaining.map((step) => (
              <p
                className="text-[11px] text-white/50 leading-relaxed"
                key={step}
              >
                • {step}
              </p>
            ))}
          </div>
        ) : null}

        {result ? (
          <div className="space-y-2 rounded border border-white/10 bg-black/40 p-3">
            <p className="text-[12px] text-white/90">
              Created <strong>{result.name}</strong>. Still to do:
            </p>
            <ul className="space-y-1">
              {result.remaining.map((step) => (
                <li
                  className="text-[11px] text-white/60 leading-relaxed"
                  key={step}
                >
                  • {step}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
