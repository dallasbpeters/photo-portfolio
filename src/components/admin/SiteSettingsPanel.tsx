import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { Palette, RotateCcw, Save, TriangleAlert } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { authStorage, settingsApi } from '../../services/portfolioService';
import { useSiteSettings } from '../../theme/SiteSettingsProvider';
import { siteConfig } from '../../site';
import { defaultSiteSettings, type ResolvedSiteSettings } from '../../../config/siteSettings';
import { contrastRatio, SANS_FONTS, SERIF_FONTS, type FontId } from '../../../config/theme';

const labelClass = 'text-[10px] uppercase tracking-widest text-white/40';
const inputClass =
  'min-h-11 text-base bg-black/40 border-white/10 focus:border-white/40 transition-colors';

/** WCAG AA for normal-size body text. */
const AA_NORMAL = 4.5;

type TextFieldKey =
  | 'name'
  | 'shortName'
  | 'heroTitle'
  | 'ownerName'
  | 'tagline'
  | 'instagramUrl'
  | 'instagramHandle';

const TEXT_FIELDS: { key: TextFieldKey; label: string; hint?: string; type?: string }[] = [
  { key: 'name', label: 'Site name', hint: 'Browser tab and install prompt' },
  { key: 'shortName', label: 'Short name', hint: 'Admin header and app launcher' },
  { key: 'heroTitle', label: 'Hero wordmark', hint: 'Top-left of the gallery' },
  { key: 'ownerName', label: 'Owner name', hint: 'Footer and copyright line' },
  { key: 'tagline', label: 'Tagline', hint: 'Line under the footer wordmark' },
  { key: 'instagramUrl', label: 'Instagram URL', hint: 'Full https:// link', type: 'url' },
  { key: 'instagramHandle', label: 'Instagram handle', hint: 'Display only, e.g. @yourname' },
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

  const setTheme = (key: keyof ResolvedSiteSettings['theme'], value: string) =>
    setDraft((d) => ({ ...d, theme: { ...d.theme, [key]: value } }));

  const bodyContrast = contrastRatio(draft.theme.foreground, draft.theme.background);
  const accentContrast = contrastRatio(draft.theme.accent, draft.theme.background);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const token = authStorage.getToken();
    if (!token) {
      toast.error('Sign in again to save settings');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await settingsApi.update(draft, token);
      // Apply immediately so the admin sees the theme they just chose.
      setSettings(saved);
      setDraft(saved);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(defaultSiteSettings(siteConfig));
    toast.message('Reset to defaults — save to apply');
  };

  return (
    <Card className="bg-white/[0.02] border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-light uppercase tracking-[0.2em] text-white/70">
          <Palette size={16} aria-hidden />
          Site settings
        </CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2">
            {TEXT_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`setting-${field.key}`} className={labelClass}>
                  {field.label}
                </Label>
                <Input
                  id={`setting-${field.key}`}
                  type={field.type ?? 'text'}
                  value={draft[field.key]}
                  onChange={(e) => setField(field.key, e.target.value)}
                  maxLength={200}
                  className={inputClass}
                />
                {field.hint && <p className="text-[10px] text-white/25">{field.hint}</p>}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <h3 className={labelClass}>Colors</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  { key: 'background', label: 'Background' },
                  { key: 'foreground', label: 'Text' },
                  { key: 'accent', label: 'Accent' },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`color-${key}`} className={labelClass}>
                    {label}
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`color-${key}`}
                      type="color"
                      value={draft.theme[key]}
                      onChange={(e) => setTheme(key, e.target.value)}
                      className="size-11 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent"
                      aria-label={`${label} color`}
                    />
                    <Input
                      value={draft.theme[key]}
                      onChange={(e) => setTheme(key, e.target.value)}
                      spellCheck={false}
                      className={`${inputClass} font-mono`}
                      aria-label={`${label} hex value`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Nothing here can leave the site unstyled, but it can leave it
                unreadable — so say so before it ships. */}
            {(bodyContrast < AA_NORMAL || accentContrast < 3) && (
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-300/80">
                <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden />
                <span>
                  {bodyContrast < AA_NORMAL && (
                    <>
                      Text on background is {bodyContrast.toFixed(1)}:1 — below the {AA_NORMAL}:1
                      WCAG AA minimum.{' '}
                    </>
                  )}
                  {accentContrast < 3 && (
                    <>Accent on background is {accentContrast.toFixed(1)}:1 and may be hard to read.</>
                  )}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-4">
            <h3 className={labelClass}>Fonts</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  { key: 'sansFont', label: 'Sans', options: SANS_FONTS },
                  { key: 'serifFont', label: 'Serif', options: SERIF_FONTS },
                ] as const
              ).map(({ key, label, options }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`font-${key}`} className={labelClass}>
                    {label}
                  </Label>
                  <select
                    id={`font-${key}`}
                    value={draft.theme[key]}
                    onChange={(e) => setTheme(key, e.target.value as FontId)}
                    className="min-h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-base text-white transition-colors focus:border-white/40"
                  >
                    {options.map((font) => (
                      <option key={font.id} value={font.id} className="bg-black">
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded border border-white/10 p-6 space-y-2"
            style={{ background: draft.theme.background, color: draft.theme.foreground }}
          >
            <p className="text-[10px] uppercase tracking-[0.3em] opacity-40">Preview</p>
            <p
              className="text-2xl font-bold uppercase tracking-widest"
              style={{ color: draft.theme.accent }}
            >
              {draft.heroTitle || 'Hero wordmark'}
            </p>
            <p className="text-sm opacity-70">{draft.tagline || 'Tagline'}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              disabled={isSaving}
              variant="outline"
              className="min-h-12 flex items-center gap-2 border-white/20 hover:bg-white hover:text-black transition-all duration-500 uppercase tracking-widest text-[10px] px-8"
            >
              <Save size={16} aria-hidden />
              {isSaving ? 'Saving…' : 'Save settings'}
            </Button>
            <Button
              type="button"
              onClick={handleReset}
              variant="ghost"
              className="min-h-12 flex items-center gap-2 text-white/40 hover:text-white uppercase tracking-widest text-[10px]"
            >
              <RotateCcw size={16} aria-hidden />
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
