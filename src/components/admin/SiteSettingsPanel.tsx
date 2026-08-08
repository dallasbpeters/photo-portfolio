import { Palette, RotateCcw, Save, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  defaultSiteSettings,
  type ResolvedSiteSettings,
} from "../../../config/siteSettings";
import {
  contrastRatio,
  type FontId,
  SANS_FONTS,
  SERIF_FONTS,
} from "../../../config/theme";
import posthog from "../../lib/posthog";
import { authStorage, settingsApi } from "../../services/portfolioService";
import { siteConfig } from "../../site";
import { useSiteSettings } from "../../theme/SiteSettingsProvider";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const labelClass = "text-[10px] uppercase tracking-widest text-white/90";
const inputClass =
  "min-h-11 text-base bg-black/40 border-white/10 focus:border-white/40 transition-colors";

/** WCAG AA for normal-size body text. */
const AA_NORMAL = 4.5;

type TextFieldKey =
  | "name"
  | "shortName"
  | "heroTitle"
  | "ownerName"
  | "tagline"
  | "instagramUrl"
  | "instagramHandle";

const TEXT_FIELDS: {
  key: TextFieldKey;
  label: string;
  hint?: string;
  type?: string;
}[] = [
  { hint: "Browser tab and install prompt", key: "name", label: "Site name" },
  {
    hint: "Admin header and app launcher",
    key: "shortName",
    label: "Short name",
  },
  { hint: "Top-left of the gallery", key: "heroTitle", label: "Hero wordmark" },
  { hint: "Footer and copyright line", key: "ownerName", label: "Owner name" },
  { hint: "Line under the footer wordmark", key: "tagline", label: "Tagline" },
  {
    hint: "Full https:// link",
    key: "instagramUrl",
    label: "Instagram URL",
    type: "url",
  },
  {
    hint: "Display only, e.g. @yourname",
    key: "instagramHandle",
    label: "Instagram handle",
  },
];

/**
 * Edits the content and theme stored in site_settings.
 *
 * Only the presentation layer is editable here. Canonical domain, CORS origins
 * and the email From address stay in config/sites.ts, so this panel cannot
 * widen CORS, repoint password-reset links, or break transactional email.
 */
export function SiteSettingsPanel() {
  const { settings, setSettings } = useSiteSettings();
  const [draft, setDraft] = useState<ResolvedSiteSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync when the provider finishes its initial fetch, but never while the
  // user is mid-edit with unsaved changes.
  useEffect(() => {
    setDraft((current) => (isDirty(current, settings) ? current : settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const setField = (key: TextFieldKey, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setTheme = (key: keyof ResolvedSiteSettings["theme"], value: string) =>
    setDraft((d) => ({ ...d, theme: { ...d.theme, [key]: value } }));

  const bodyContrast = contrastRatio(
    draft.theme.foreground,
    draft.theme.background
  );
  const accentContrast = contrastRatio(
    draft.theme.accent,
    draft.theme.background
  );

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const token = authStorage.getToken();
    if (!token) {
      toast.error("Sign in again to save settings");
      return;
    }

    setIsSaving(true);
    try {
      const saved = await settingsApi.update(draft, token);
      // Apply immediately so the admin sees the theme they just chose.
      setSettings(saved);
      setDraft(saved);
      posthog.capture("site_settings_updated");
      toast.success("Settings saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save settings"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(defaultSiteSettings(siteConfig));
    toast.message("Reset to defaults — save to apply");
  };

  return (
    <Card className="border-white/10 bg-white/[0.02]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-light text-sm text-white/70 uppercase tracking-[0.2em]">
          <Palette aria-hidden size={16} />
          Site settings
        </CardTitle>
      </CardHeader>

      <CardContent>
        <form className="space-y-8" onSubmit={(e) => void handleSubmit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            {TEXT_FIELDS.map((field) => (
              <div className="space-y-2" key={field.key}>
                <Label className={labelClass} htmlFor={`setting-${field.key}`}>
                  {field.label}
                </Label>
                <Input
                  className={inputClass}
                  id={`setting-${field.key}`}
                  maxLength={200}
                  onChange={(e) => setField(field.key, e.target.value)}
                  type={field.type ?? "text"}
                  value={draft[field.key]}
                />
                {field.hint ? (
                  <p className="text-[10px] text-white/25">{field.hint}</p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <h3 className={labelClass}>Colors</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  { key: "background", label: "Background" },
                  { key: "foreground", label: "Text" },
                  { key: "accent", label: "Accent" },
                ] as const
              ).map(({ key, label }) => (
                <div className="space-y-2" key={key}>
                  <Label className={labelClass} htmlFor={`color-${key}`}>
                    {label}
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={`${label} color`}
                      className="size-11 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent"
                      id={`color-${key}`}
                      onChange={(e) => setTheme(key, e.target.value)}
                      type="color"
                      value={draft.theme[key]}
                    />
                    <Input
                      aria-label={`${label} hex value`}
                      className={`${inputClass} font-mono`}
                      onChange={(e) => setTheme(key, e.target.value)}
                      spellCheck={false}
                      value={draft.theme[key]}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Nothing here can leave the site unstyled, but it can leave it
                unreadable — so say so before it ships. */}
            {bodyContrast < AA_NORMAL || accentContrast < 3 ? (
              <p className="flex items-start gap-2 text-[11px] text-amber-300/80 leading-relaxed">
                <TriangleAlert
                  aria-hidden
                  className="mt-px shrink-0"
                  size={14}
                />
                <span>
                  {bodyContrast < AA_NORMAL ? (
                    <>
                      Text on background is {bodyContrast.toFixed(1)}:1 — below
                      the {AA_NORMAL}:1 WCAG AA minimum.{" "}
                    </>
                  ) : null}
                  {accentContrast < 3 ? (
                    <>
                      Accent on background is {accentContrast.toFixed(1)}:1 and
                      may be hard to read.
                    </>
                  ) : null}
                </span>
              </p>
            ) : null}
          </div>

          <div className="space-y-4">
            <h3 className={labelClass}>Fonts</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  { key: "sansFont", label: "Sans", options: SANS_FONTS },
                  { key: "serifFont", label: "Serif", options: SERIF_FONTS },
                ] as const
              ).map(({ key, label, options }) => (
                <div className="space-y-2" key={key}>
                  <Label className={labelClass} htmlFor={`font-${key}`}>
                    {label}
                  </Label>
                  <select
                    className="min-h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-base text-white transition-colors focus:border-white/40"
                    id={`font-${key}`}
                    onChange={(e) => setTheme(key, e.target.value as FontId)}
                    value={draft.theme[key]}
                  >
                    {options.map((font) => (
                      <option
                        className="bg-black"
                        key={font.id}
                        value={font.id}
                      >
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div
            className="space-y-2 rounded border border-white/10 p-6"
            style={{
              background: draft.theme.background,
              color: draft.theme.foreground,
            }}
          >
            <p className="text-[10px] uppercase tracking-[0.3em] opacity-40">
              Preview
            </p>
            <p
              className="font-bold text-2xl uppercase tracking-widest"
              style={{ color: draft.theme.accent }}
            >
              {draft.heroTitle || "Hero wordmark"}
            </p>
            <p className="text-sm opacity-70">{draft.tagline || "Tagline"}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              className="flex min-h-12 items-center gap-2 border-white/20 px-8 text-[10px] uppercase tracking-widest transition-all duration-500 hover:bg-white hover:text-black"
              disabled={isSaving}
              type="submit"
              variant="outline"
            >
              <Save aria-hidden size={16} />
              {isSaving ? "Saving…" : "Save settings"}
            </Button>
            <Button
              className="flex min-h-12 items-center gap-2 text-[10px] text-white/90 uppercase tracking-widest hover:text-white"
              onClick={handleReset}
              type="button"
              variant="ghost"
            >
              <RotateCcw aria-hidden size={16} />
              Reset to defaults
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const isDirty = (a: ResolvedSiteSettings, b: ResolvedSiteSettings): boolean =>
  JSON.stringify(a) !== JSON.stringify(b);
