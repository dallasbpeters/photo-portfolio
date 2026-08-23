import type { BrandKitDoc } from "../../../config/brandKit.js";
import "./BrandKitsPanel.css";

/**
 * What a kit produces, as opposed to what it states.
 *
 * The right-hand column of the editor: the palette as swatches, and the brand
 * mocked into the three formats it will actually be used in. Split out of
 * BrandKitsPanel on size — that file was over the 500-line ceiling and failing
 * CI — and this is the natural seam, because nothing here edits anything. It is
 * handed a resolved document and draws it.
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

export function PalettePreview({ doc }: { doc: BrandKitDoc }) {
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
export function FormatPreviews({
  doc,
  name,
}: {
  doc: BrandKitDoc;
  name: string;
}) {
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
