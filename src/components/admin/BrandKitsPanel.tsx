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
  inheritedParts,
  isHexColour,
  kitPromptText,
  MAX_KIT_NAME,
  MAX_LOGOS,
  MAX_PALETTE,
  MAX_TYPEFACES,
  MAX_VOICE,
  paletteFromCss,
  resolveKitDoc,
  sanitizeKitDoc,
} from "../../../config/brandKit.js";
import { LOOK_FAMILIES, LOOKS } from "../../editor/presets";
import { useBrandKits } from "../../hooks/useBrandKits";
import {
  type BrandKit,
  brandKitsApi,
  portfolioService,
} from "../../services/portfolioService";
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

/**
 * The grade the brand is finished in.
 *
 * The same 72 looks the photo editor offers, in their eight families, because a
 * brand's grade and a photograph's grade are the same kind of thing and having
 * two catalogues would mean two answers to "what does this brand look like".
 *
 * The kit stores a reference — id and strength — not the look's edit payload.
 * An unknown id resolves to no look rather than a guess, which is why the
 * chosen look is looked up rather than trusted.
 */
function LookPicker({
  doc,
  onChange,
}: {
  doc: BrandKitDoc;
  onChange: (next: BrandKitDoc) => void;
}) {
  const chosen = doc.look
    ? (LOOKS.find((look) => look.id === doc.look?.id) ?? null)
    : null;
  const [family, setFamily] = useState(
    chosen?.family ?? LOOK_FAMILIES[0]?.id ?? "a"
  );
  const inFamily = LOOKS.filter((look) => look.family === family);

  return (
    <div className="stack stack--tight">
      <div className="brand-kit__families">
        {LOOK_FAMILIES.map((entry) => (
          <button
            aria-pressed={entry.id === family}
            className={`brand-kit__family ${
              entry.id === family ? "brand-kit__family--on" : ""
            }`}
            key={entry.id}
            onClick={() => setFamily(entry.id)}
            style={{ background: entry.color }}
            title={`${entry.name} — ${entry.description}`}
            type="button"
          >
            {entry.letter}
          </button>
        ))}
      </div>

      <div className="brand-kit__looks">
        <button
          className={`brand-kit__look ${doc.look ? "" : "brand-kit__look--on"}`}
          onClick={() => onChange({ ...doc, look: null })}
          type="button"
        >
          No look
        </button>
        {inFamily.map((look) => (
          <button
            className={`brand-kit__look ${
              doc.look?.id === look.id ? "brand-kit__look--on" : ""
            }`}
            key={look.id}
            onClick={() =>
              onChange({
                ...doc,
                look: { id: look.id, strength: doc.look?.strength ?? 1 },
              })
            }
            title={look.name}
            type="button"
          >
            {look.code}
          </button>
        ))}
      </div>

      {doc.look ? (
        <label className="brand-kit__strength">
          <span className="admin-note--quiet">
            {chosen ? chosen.name : "Unknown look"} ·{" "}
            {Math.round((doc.look.strength ?? 1) * 100)}%
          </span>
          <input
            aria-label="Look strength"
            max={1}
            min={0}
            onChange={(e) =>
              onChange({
                ...doc,
                look: {
                  id: doc.look?.id ?? "",
                  strength: Number(e.target.value),
                },
              })
            }
            step={0.05}
            type="range"
            value={doc.look.strength ?? 1}
          />
        </label>
      ) : null}
    </div>
  );
}

/**
 * Colours out of a pasted stylesheet.
 *
 * A brand's colours almost always already exist as CSS — a tokens file, a theme
 * block — and retyping six hex codes into six fields is how one of them ends up
 * wrong. Custom property names come across as the colour's name, because
 * `--brand-ink: #101a2b` already knows both halves of a palette entry.
 *
 * Added to the palette rather than replacing it, and deduplicated against what
 * is already there: pasting twice should not double the palette.
 */
function CssImport({
  doc,
  onChange,
}: {
  doc: BrandKitDoc;
  onChange: (next: BrandKitDoc) => void;
}) {
  const [css, setCss] = useState("");
  const found = paletteFromCss(css);
  const fresh = found.filter(
    (entry) => !doc.palette.some((existing) => existing.value === entry.value)
  );

  return (
    <div className="stack stack--snug">
      <textarea
        aria-label="CSS to read colours from"
        className="admin-control brand-kit__css"
        onChange={(e) => setCss(e.target.value)}
        placeholder={
          ":root {\n  --brand-ink: #101a2b;\n  --brand-signal: #4ade80;\n}"
        }
        value={css}
      />
      <div className="row row--between">
        <span className="admin-note--quiet">
          {css.trim() === ""
            ? "Paste a tokens file, a theme block, or any rule."
            : `${found.length} found · ${fresh.length} new`}
        </span>
        <Button
          disabled={fresh.length === 0}
          onClick={() => {
            onChange({
              ...doc,
              palette: [...doc.palette, ...fresh].slice(0, MAX_PALETTE),
            });
            setCss("");
          }}
          type="button"
          variant="outline"
        >
          Add {fresh.length || ""} colour{fresh.length === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

/**
 * The logos, uploaded and shown.
 *
 * Uploaded into our own blob storage before the version is written, which patch
 * 031 requires and states the reason for: a logo referenced from someone else's
 * CDN is a logo that 404s on a handoff page months later.
 *
 * Shown on a chequerboard, because a mark is usually transparent and a
 * transparent logo on a flat panel is indistinguishable from a white one.
 */
function LogoEditor({
  doc,
  onChange,
}: {
  doc: BrandKitDoc;
  onChange: (next: BrandKitDoc) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);

  const upload = async (file: File) => {
    setIsUploading(true);
    try {
      const { url } = await portfolioService.uploadImageFile(
        file,
        undefined,
        "brand-kits/logos"
      );
      onChange({
        ...doc,
        logos: [
          ...doc.logos,
          { clearSpace: 0.5, label: file.name, minWidth: 24, rules: "", url },
        ].slice(0, MAX_LOGOS),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload the logo");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="stack stack--tight">
      {doc.logos.length > 0 ? (
        <ul className="brand-kit__logos">
          {doc.logos.map((logo, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a logo's identity here is its place in the list, and two uploads of the same file share a url
            <li className="brand-kit__logo" key={`logo-${index}`}>
              <img
                alt={logo.label}
                className="brand-kit__logo-image"
                height={64}
                src={logo.url}
                width={96}
              />
              <Input
                aria-label="Logo label"
                className="admin-control"
                onChange={(e) =>
                  onChange({
                    ...doc,
                    logos: doc.logos.map((l, i) =>
                      i === index ? { ...l, label: e.target.value } : l
                    ),
                  })
                }
                placeholder="Primary mark"
                value={logo.label}
              />
              <Button
                aria-label={`Remove ${logo.label || "logo"}`}
                onClick={() =>
                  onChange({
                    ...doc,
                    logos: doc.logos.filter((_, i) => i !== index),
                  })
                }
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
      ) : (
        <p className="brand-kit__empty-note">No logo yet.</p>
      )}
      {doc.logos.length < MAX_LOGOS ? (
        <input
          accept="image/png,image/svg+xml,image/webp,image/jpeg"
          aria-label="Upload a logo"
          className="admin-file"
          disabled={isUploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void upload(file);
            }
            e.target.value = "";
          }}
          type="file"
        />
      ) : null}
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
  parentDoc,
}: {
  kit: BrandKit;
  onClose: () => void;
  onSaved: () => void;
  /** The parent's resolved document, when this kit is a sub-brand. */
  parentDoc: BrandKitDoc | null;
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

  /* What the kit means as edited: the parent's parts still showing through
     wherever this one leaves a gap. `resolvedDoc` from the server covers the
     saved state; this recomputes it live against the same rule. */
  const own = sanitizeKitDoc(doc);
  const inheritedFrom = kit.parentId ? parentDoc : null;
  const effective = resolveKitDoc(own, inheritedFrom);
  /* Recomputed from what is on screen, not read off the saved kit: overriding a
     part should stop the panel claiming to inherit it before the save, or the
     line contradicts the fields under it. */
  const inheriting = inheritedParts(own, inheritedFrom);
  const prompt = kitPromptText(effective);

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

        {/*
          A sub-brand's empty parts are not empty in effect — they are the
          parent's. Said out loud, because a palette that looks unset but paints
          the previews is the most confusing state this panel can be in.
        */}
        {kit.parentName ? (
          <p className="brand-kit__inherits">
            A sub-brand of <strong>{kit.parentName}</strong>
            {inheriting.length > 0
              ? ` — taking its ${inheriting.join(", ")}. Fill a part in here to override it.`
              : " — overriding every part."}
          </p>
        ) : null}

        <section className="stack stack--tight">
          <h3 className="admin-caps">Palette</h3>
          <PaletteEditor doc={doc} onChange={setDoc} />
        </section>

        <section className="stack stack--snug">
          <h3 className="admin-caps">Colours from CSS</h3>
          <CssImport doc={doc} onChange={setDoc} />
        </section>

        <section className="stack stack--tight">
          <h3 className="admin-caps">Logos</h3>
          <LogoEditor doc={doc} onChange={setDoc} />
        </section>

        <section className="stack stack--tight">
          <h3 className="admin-caps">Typefaces</h3>
          <TypefaceEditor doc={doc} onChange={setDoc} />
        </section>

        <section className="stack stack--tight">
          <h3 className="admin-caps">Look</h3>
          <LookPicker doc={doc} onChange={setDoc} />
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

      {/*
        Previewed from the *resolved* document, not this kit's own.
        A sub-brand that states nothing still produces its parent's brand, and a
        preview showing an empty palette next to a prompt full of colours is the
        panel contradicting itself. The left column edits what this kit states;
        this column is the outcome.
       */}
      <div className="brand-kit__aside stack stack--mid">
        <section className="stack stack--snug">
          <h3 className="admin-caps">Colours</h3>
          <PalettePreview doc={effective} />
        </section>
        <section className="stack stack--snug">
          <h3 className="admin-caps">In the formats it will be used in</h3>
          <FormatPreviews doc={effective} name={name || "Your brand"} />
        </section>
      </div>
    </div>
  );
}

/**
 * One kit in the library.
 *
 * A brand and a sub-brand use the same card: the only difference is the indent
 * and whether it offers to add a child, which is the parent's business rather
 * than the card's.
 */
function KitCard({
  kit,
  onAddSub,
  onOpen,
  onRemove,
}: {
  kit: BrandKit;
  onAddSub?: () => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="brand-kit__card">
      <button className="brand-kit__open" onClick={onOpen} type="button">
        <span className="brand-kit__card-name">{kit.name}</span>
        <span className="brand-kit__card-meta">
          {kit.version === null
            ? "No version yet"
            : `v${kit.version} · ${kit.resolvedDoc.palette.length} colours`}
          {kit.inherited.length > 0
            ? ` · inherits ${kit.inherited.length}`
            : ""}
        </span>
        <PalettePreview doc={kit.resolvedDoc} />
      </button>
      <div className="brand-kit__card-actions">
        {onAddSub ? (
          <Button
            aria-label={`Add a sub-brand of ${kit.name}`}
            onClick={onAddSub}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={14} />
          </Button>
        ) : null}
        <Button
          aria-label={`Delete ${kit.name}`}
          onClick={onRemove}
          size="icon"
          tone="danger"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} />
        </Button>
      </div>
    </div>
  );
}

export function BrandKitsPanel() {
  const { error, isLoading, kits, refresh } = useBrandKits();
  const { confirm } = useConfirm();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  /** Which brand is having a sub-brand added, if any. */
  const [parentFor, setParentFor] = useState<string | null>(null);
  const [subName, setSubName] = useState("");

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

  const createSub = async (parentId: string) => {
    const name = subName.trim();
    if (!name) {
      toast.error("A sub-brand needs a name");
      return;
    }
    try {
      const kit = await brandKitsApi.create(name, EMPTY_KIT, parentId);
      setSubName("");
      setParentFor(null);
      await refresh();
      setOpenId(kit.id);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not add the sub-brand"
      );
    }
  };

  const remove = async (kit: BrandKit) => {
    const subs = kits.filter((candidate) => candidate.parentId === kit.id);
    const ok = await confirm({
      confirmLabel: "Delete the kit",
      /* The sub-brand count is the part worth stating: they cascade, and a
         sub-brand inherits, so one left behind would be a document with holes
         nothing can fill. */
      description:
        subs.length > 0
          ? `Every version of ${kit.name} goes with it, and so do its ${subs.length} sub-brand${subs.length === 1 ? "" : "s"}. This cannot be undone.`
          : `Every version of ${kit.name} goes with it. This cannot be undone.`,
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
        /* The parent's *resolved* document, which is what a sub-brand inherits
           from — taken from the list rather than fetched, since the list already
           carries every kit's resolution. */
        parentDoc={
          kits.find((candidate) => candidate.id === open.parentId)
            ?.resolvedDoc ?? null
        }
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
        {/*
          A tree rather than a flat list, because a sub-brand read out of context
          is just a kit with a confusing name. Two levels is all there can be —
          the database enforces it, see patch 032.
         */}
        <ul className="brand-kit__list">
          {kits
            .filter((kit) => !kit.parentId)
            .map((parent) => (
              <li key={parent.id}>
                <KitCard
                  kit={parent}
                  onAddSub={() => setParentFor(parent.id)}
                  onOpen={() => setOpenId(parent.id)}
                  onRemove={() => void remove(parent)}
                />
                {parentFor === parent.id ? (
                  <div className="brand-kit__sub-form row row--tight">
                    <Input
                      aria-label={`Name for a sub-brand of ${parent.name}`}
                      autoFocus
                      className="admin-control"
                      maxLength={MAX_KIT_NAME}
                      onChange={(e) => setSubName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void createSub(parent.id);
                        }
                        if (e.key === "Escape") {
                          setParentFor(null);
                        }
                      }}
                      placeholder={`${parent.name} — …`}
                      value={subName}
                    />
                    <Button
                      onClick={() => void createSub(parent.id)}
                      type="button"
                    >
                      Add
                    </Button>
                  </div>
                ) : null}
                {kits.some((kit) => kit.parentId === parent.id) ? (
                  <ul className="brand-kit__subs">
                    {kits
                      .filter((kit) => kit.parentId === parent.id)
                      .map((sub) => (
                        <li key={sub.id}>
                          <KitCard
                            kit={sub}
                            onOpen={() => setOpenId(sub.id)}
                            onRemove={() => void remove(sub)}
                          />
                        </li>
                      ))}
                  </ul>
                ) : null}
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  );
}
