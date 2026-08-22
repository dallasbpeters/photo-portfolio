import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  PaintBoardIcon,
  PlusSignIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { BrandKitDoc } from "../../../config/brandKit.js";
import {
  EMPTY_KIT,
  isHexColour,
  kitPromptText,
  MAX_KIT_NAME,
  MAX_PALETTE,
  MAX_TYPEFACES,
  MAX_VOICE,
  sanitizeKitDoc,
} from "../../../config/brandKit.js";
import { useBrandKits } from "../../hooks/useBrandKits";
import { type BrandKit, brandKitsApi } from "../../services/portfolioService";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { useConfirm } from "./ConfirmProvider";
import "../../styles/primitives.css";
import "../../styles/adminChrome.css";
import "./BrandKitsPanel.css";

/**
 * The brand kits: the library, and the one being edited.
 *
 * One screen, because a kit is only judgeable whole. The palette without the
 * voice is a swatch grid, and the voice without the palette is a paragraph
 * nobody can check anything against — which is the failure `config/brandKit.ts`
 * describes when it says a kit is a governing document rather than a moodboard.
 * Its limits were chosen so that every part can be shown at once; this is the
 * screen that was assumed.
 *
 * Editing is local until Save. Every save writes a *version*, so autosaving a
 * keystroke would mint a version per character and make the history useless for
 * the one question it exists to answer.
 */

const PREVIEW_FORMATS = [
  { id: "story", label: "9:16", ratio: "9 / 16" },
  { id: "square", label: "1:1", ratio: "1 / 1" },
  { id: "portrait", label: "4:5", ratio: "4 / 5" },
] as const;

/**
 * A colour's contrast partner, picked by luminance rather than guessed.
 *
 * Rec. 601 luma, which is coarse but is only being asked to choose between black
 * and white. Sliced rather than shifted: the channels are already three pairs of
 * hex digits, so reading them as such says what it means.
 */
const CHANNEL = /[\da-f]{2}/gi;

const readableOn = (hex: string): string => {
  const [r = 0, g = 0, b = 0] = (hex.match(CHANNEL) ?? []).map((pair) =>
    Number.parseInt(pair, 16)
  );
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#000000" : "#ffffff";
};

/**
 * The three colours a preview needs, from however many the kit has.
 *
 * A kit with one colour still has to render, so each falls back rather than the
 * preview disappearing — the point of the preview is to show what an unfinished
 * kit will look like.
 */
const previewColours = (doc: BrandKitDoc) => {
  const byRole = (want: string) =>
    doc.palette.find((entry) => entry.role.toLowerCase().includes(want))?.value;
  const [first, second] = doc.palette.map((entry) => entry.value);
  const ground =
    byRole("surface") ?? byRole("background") ?? first ?? "#101014";
  const accent = byRole("accent") ?? second ?? first ?? "#4ade80";
  return { accent, ground, ink: readableOn(ground) };
};

function PalettePreview({ doc }: { doc: BrandKitDoc }) {
  if (doc.palette.length === 0) {
    return <p className="brand-kit__empty-note">No colours yet.</p>;
  }
  return (
    <ul className="brand-kit__swatches">
      {doc.palette.map((entry, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a palette entry has no identity but its place in the list — two colours may be the same value with the same name, and keying on content gave two new entries the identical key "#000000-", which React reconciled into a stale extra swatch
        <li key={`swatch-${index}`}>
          <span
            className="brand-kit__swatch"
            style={{ background: entry.value }}
            title={`${entry.name || entry.value} · ${entry.role || "no role"}`}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * The kit applied to the shapes it will actually be used in.
 *
 * Judged by output rather than by swatch: a palette that reads well as five
 * rectangles can still put unreadable type on its own ground, and this is where
 * that shows. The wordmark is the kit's first logo when it has one and its name
 * when it does not.
 */
function FormatPreviews({ doc, name }: { doc: BrandKitDoc; name: string }) {
  const { accent, ground, ink } = previewColours(doc);
  const wordmark = doc.logos[0]?.url ?? null;
  const face = doc.typefaces[0]?.name;
  return (
    <div className="brand-kit__previews">
      {PREVIEW_FORMATS.map((format) => (
        <figure className="brand-kit__preview" key={format.id}>
          <span className="brand-kit__preview-chip">{format.label}</span>
          <div
            className="brand-kit__preview-frame"
            style={{
              aspectRatio: format.ratio,
              background: ground,
              color: ink,
              fontFamily: face ? `"${face}", var(--font-sans)` : undefined,
            }}
          >
            {wordmark ? (
              <img
                alt=""
                className="brand-kit__preview-logo"
                height={64}
                src={wordmark}
                width={160}
              />
            ) : (
              <span className="brand-kit__preview-wordmark">{name}</span>
            )}
            <span className="brand-kit__preview-headline">
              Made for your mornings
            </span>
            <span
              className="brand-kit__preview-cta"
              style={{ background: accent, color: readableOn(accent) }}
            >
              Shop now
            </span>
          </div>
        </figure>
      ))}
    </div>
  );
}

/** One colour row: what it is, what it is for, and the colour itself. */
function PaletteEditor({
  doc,
  onChange,
}: {
  doc: BrandKitDoc;
  onChange: (next: BrandKitDoc) => void;
}) {
  const set = (index: number, patch: Partial<BrandKitDoc["palette"][number]>) =>
    onChange({
      ...doc,
      palette: doc.palette.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry
      ),
    });
  return (
    <div className="stack stack--tight">
      {doc.palette.map((entry, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a palette entry has no identity but its position — two colours may share a value and a name, and keying on content collapsed two new entries into one
        <div className="brand-kit__row" key={`palette-${index}`}>
          <input
            aria-label="Colour"
            className="brand-kit__colour"
            onChange={(e) => set(index, { value: e.target.value })}
            type="color"
            value={isHexColour(entry.value) ? entry.value : "#000000"}
          />
          <Input
            aria-label="Colour name"
            className="admin-control"
            onChange={(e) => set(index, { name: e.target.value })}
            placeholder="Ink"
            value={entry.name}
          />
          <Input
            aria-label="What it is for"
            className="admin-control"
            onChange={(e) => set(index, { role: e.target.value })}
            placeholder="text, surface, accent…"
            value={entry.role}
          />
          <Button
            aria-label={`Remove ${entry.name || entry.value}`}
            onClick={() =>
              onChange({
                ...doc,
                palette: doc.palette.filter((_, i) => i !== index),
              })
            }
            size="icon"
            tone="danger"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} />
          </Button>
        </div>
      ))}
      {doc.palette.length < MAX_PALETTE ? (
        <Button
          onClick={() =>
            onChange({
              ...doc,
              palette: [
                ...doc.palette,
                { name: "", role: "", value: "#000000" },
              ],
            })
          }
          type="button"
          variant="outline"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={14} />
          Add colour
        </Button>
      ) : (
        <p className="brand-kit__empty-note">
          {MAX_PALETTE} colours is the most a kit can constrain anything with.
        </p>
      )}
    </div>
  );
}

function TypefaceEditor({
  doc,
  onChange,
}: {
  doc: BrandKitDoc;
  onChange: (next: BrandKitDoc) => void;
}) {
  return (
    <div className="stack stack--tight">
      {doc.typefaces.map((entry, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: as above — a typeface's identity here is the row it occupies
        <div className="brand-kit__row" key={`face-${index}`}>
          <span
            className="brand-kit__specimen"
            style={{ fontFamily: `"${entry.name}", var(--font-sans)` }}
          >
            Aa
          </span>
          <Input
            aria-label="Typeface"
            className="admin-control"
            onChange={(e) =>
              onChange({
                ...doc,
                typefaces: doc.typefaces.map((f, i) =>
                  i === index ? { ...f, name: e.target.value } : f
                ),
              })
            }
            placeholder="Geist"
            value={entry.name}
          />
          <Input
            aria-label="What it is for"
            className="admin-control"
            onChange={(e) =>
              onChange({
                ...doc,
                typefaces: doc.typefaces.map((f, i) =>
                  i === index ? { ...f, role: e.target.value } : f
                ),
              })
            }
            placeholder="display, ui…"
            value={entry.role}
          />
          <Button
            aria-label={`Remove ${entry.name || "typeface"}`}
            onClick={() =>
              onChange({
                ...doc,
                typefaces: doc.typefaces.filter((_, i) => i !== index),
              })
            }
            size="icon"
            tone="danger"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} />
          </Button>
        </div>
      ))}
      {doc.typefaces.length < MAX_TYPEFACES ? (
        <Button
          onClick={() =>
            onChange({
              ...doc,
              typefaces: [
                ...doc.typefaces,
                { name: "", role: "", weights: [] },
              ],
            })
          }
          type="button"
          variant="outline"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={14} />
          Add typeface
        </Button>
      ) : null}
    </div>
  );
}

/** The kit being edited, beside what it produces. */
function KitEditor({
  kit,
  onClose,
  onSaved,
}: {
  kit: BrandKit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [doc, setDoc] = useState<BrandKitDoc>(kit.doc);
  const [name, setName] = useState(kit.name);
  const [isSaving, setIsSaving] = useState(false);

  // A different kit in the same slot is a different document.
  useEffect(() => {
    setDoc(kit.doc);
    setName(kit.name);
  }, [kit.doc, kit.name]);

  const isDirty =
    JSON.stringify(sanitizeKitDoc(doc)) !== JSON.stringify(kit.doc) ||
    name.trim() !== kit.name;

  const save = async () => {
    setIsSaving(true);
    try {
      if (name.trim() && name.trim() !== kit.name) {
        await brandKitsApi.rename(kit.id, name.trim());
      }
      await brandKitsApi.save(kit.id, sanitizeKitDoc(doc));
      toast.success("Kit saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the kit");
    } finally {
      setIsSaving(false);
    }
  };

  const prompt = kitPromptText(sanitizeKitDoc(doc));

  return (
    <div className="brand-kit">
      <div className="brand-kit__editor stack stack--mid">
        <div className="row row--between">
          <Input
            aria-label="Kit name"
            className="admin-control brand-kit__name"
            maxLength={MAX_KIT_NAME}
            onChange={(e) => setName(e.target.value)}
            value={name}
          />
          <span className="admin-note--quiet">
            {kit.version === null
              ? "No version yet"
              : `v${kit.version} of ${kit.versionCount}`}
          </span>
        </div>

        <section className="stack stack--tight">
          <h3 className="admin-caps">Palette</h3>
          <PaletteEditor doc={doc} onChange={setDoc} />
        </section>

        <section className="stack stack--tight">
          <h3 className="admin-caps">Typefaces</h3>
          <TypefaceEditor doc={doc} onChange={setDoc} />
        </section>

        <section className="stack stack--snug">
          <h3 className="admin-caps">Voice</h3>
          <textarea
            aria-label="Voice"
            className="admin-control brand-kit__voice"
            maxLength={MAX_VOICE}
            onChange={(e) => setDoc({ ...doc, voice: e.target.value })}
            placeholder="Plain, unfussy, never salesy. Short sentences."
            value={doc.voice}
          />
          <p className="brand-kit__count">
            {doc.voice.length} / {MAX_VOICE}
          </p>
        </section>

        {/*
          What the kit actually contributes to a generation, quoted back.
          A kit that shapes a picture in ways nobody can read is the
          "guidelines nobody applies" problem wearing a new costume — the
          reasoning kitPromptText already carries.
        */}
        <section className="stack stack--snug">
          <h3 className="admin-caps">What this sends to a model</h3>
          <p className="brand-kit__prompt">
            {prompt || "Nothing yet — add a colour or a line of voice."}
          </p>
        </section>

        <div className="row row--between">
          <Button onClick={onClose} type="button" variant="ghost">
            Back to kits
          </Button>
          <Button
            disabled={!isDirty || isSaving}
            onClick={() => void save()}
            type="button"
          >
            {isSaving ? "Saving…" : "Save a new version"}
          </Button>
        </div>
      </div>

      <div className="brand-kit__aside stack stack--mid">
        <section className="stack stack--snug">
          <h3 className="admin-caps">Colours</h3>
          <PalettePreview doc={sanitizeKitDoc(doc)} />
        </section>
        <section className="stack stack--snug">
          <h3 className="admin-caps">In the formats it will be used in</h3>
          <FormatPreviews
            doc={sanitizeKitDoc(doc)}
            name={name || "Your brand"}
          />
        </section>
      </div>
    </div>
  );
}

export function BrandKitsPanel() {
  const { error, isLoading, kits, refresh } = useBrandKits();
  const { confirm } = useConfirm();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const open = kits.find((kit) => kit.id === openId) ?? null;

  const create = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("A kit needs a name");
      return;
    }
    try {
      const kit = await brandKitsApi.create(name, EMPTY_KIT);
      setNewName("");
      await refresh();
      setOpenId(kit.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the kit");
    }
  }, [newName, refresh]);

  const remove = async (kit: BrandKit) => {
    const ok = await confirm({
      confirmLabel: "Delete the kit",
      description: `Every version of ${kit.name} goes with it. This cannot be undone.`,
      destructive: true,
      title: "Delete this brand kit?",
    });
    if (!ok) {
      return;
    }
    try {
      await brandKitsApi.remove(kit.id);
      if (openId === kit.id) {
        setOpenId(null);
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the kit");
    }
  };

  if (open) {
    return (
      <KitEditor
        kit={open}
        onClose={() => setOpenId(null)}
        onSaved={() => void refresh()}
      />
    );
  }

  return (
    <Card className="admin-card">
      <CardHeader className="row row--between row--mid">
        <CardTitle className="admin-heading">
          <HugeiconsIcon icon={PaintBoardIcon} size={16} />
          Brand kits
        </CardTitle>
        <div className="row row--tight">
          <Input
            aria-label="New kit name"
            className="admin-control"
            maxLength={MAX_KIT_NAME}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void create();
              }
            }}
            placeholder="New kit…"
            value={newName}
          />
          <Button onClick={() => void create()} type="button">
            <HugeiconsIcon icon={PlusSignIcon} size={14} />
            New kit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="stack stack--mid">
        {error ? (
          <p className="admin-empty">Could not load brand kits.</p>
        ) : null}
        {isLoading ? <p className="admin-empty">Loading…</p> : null}
        {!(isLoading || error) && kits.length === 0 ? (
          <p className="admin-empty">
            No kits yet. A kit is an identity written down so it can be checked
            rather than remembered.
          </p>
        ) : null}
        <ul className="brand-kit__list">
          {kits.map((kit) => (
            <li className="brand-kit__card" key={kit.id}>
              <button
                className="brand-kit__open"
                onClick={() => setOpenId(kit.id)}
                type="button"
              >
                <span className="brand-kit__card-name">{kit.name}</span>
                <span className="brand-kit__card-meta">
                  {kit.version === null
                    ? "No version yet"
                    : `v${kit.version} · ${kit.doc.palette.length} colours`}
                </span>
                <PalettePreview doc={kit.doc} />
              </button>
              <Button
                aria-label={`Delete ${kit.name}`}
                onClick={() => void remove(kit)}
                size="icon"
                tone="danger"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
