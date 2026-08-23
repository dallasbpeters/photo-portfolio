import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  PlusSignIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { useState } from "react";
import { toast } from "sonner";
import type { BrandKitDoc } from "../../../config/brandKit.js";
import {
  isHexColour,
  MAX_LOGOS,
  MAX_PALETTE,
  MAX_TYPEFACES,
  paletteFromCss,
} from "../../../config/brandKit.js";
import { LOOK_FAMILIES, LOOKS } from "../../editor/presets";
import { portfolioService } from "../../services/portfolioService";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import "./BrandKitsPanel.css";

/**
 * The parts of a kit somebody types into: look, colours, logos, typefaces.
 *
 * Split out of BrandKitsPanel, which was over the 500-line ceiling and failing
 * CI. The seam is editing: everything here takes a document and a setter and
 * changes one part of it, and none of it knows about loading, saving, versions or
 * the library — which is what KitEditor and the panel are about.
 */

export function LookPicker({
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
            {Math.round(doc.look.strength * 100)}%
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
            value={doc.look.strength}
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
export function CssImport({
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
export function LogoEditor({
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
export function PaletteEditor({
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

export function TypefaceEditor({
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
