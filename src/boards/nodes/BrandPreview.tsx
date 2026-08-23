import { kitPromptText } from "../../../config/brandKit.js";
import { useBrandKits } from "../../hooks/useBrandKits";
import "./BrandPreview.css";

/**
 * What a Brand node is about to send down its wire.
 *
 * The same argument BrandKitsPanel makes about its own preview, one level out: a
 * brand kit that silently shapes a generation in ways nobody can read is the
 * "guidelines nobody applies" problem in a new costume. On the board that
 * matters more, not less — the node is a name and a dropdown, and without this
 * there is no way to tell a kit with six colours from an empty one, or to notice
 * that the wire has been carrying nothing for an hour.
 *
 * Read from the *resolved* document, so a sub-brand shows what it actually
 * contributes with its parent folded in — which is what the run will send. The
 * swatch row and the quoted line are the two halves people check: the colours at
 * a glance, and the words when they are wondering why a generation drifted.
 */

export interface BrandPreviewProps {
  /** The chosen kit's id, from the node's config. */
  brandKitId: unknown;
  /** The chosen logo's URL, or absent for none. */
  logoUrl?: unknown;
  /**
   * Picks the logo to stamp, or clears it.
   *
   * Absent on a published board, where there is nothing to choose.
   */
  onPickLogo?: (url: string | null) => void;
}

export function BrandPreview({
  brandKitId,
  logoUrl,
  onPickLogo,
}: BrandPreviewProps) {
  const { isLoading, kits } = useBrandKits();
  const id = typeof brandKitId === "string" ? brandKitId : "";
  const kit = id ? kits.find((candidate) => candidate.id === id) : undefined;

  // Nothing chosen: the picker below already says to choose one, and a second
  // notice saying the same thing is noise on a node this small.
  if (!id) {
    return null;
  }
  if (isLoading && !kit) {
    return <p className="brand-preview__note">Loading the kit…</p>;
  }
  if (!kit) {
    /* Deleted from the library, which is a real state rather than an error: the
       run contributes nothing, and saying so here is the only place it shows. */
    return (
      <p className="brand-preview__note brand-preview__note--warn">
        This kit is no longer in the library. The wire carries nothing.
      </p>
    );
  }

  const doc = kit.resolvedDoc;
  const prompt = kitPromptText(doc);
  const chosen = typeof logoUrl === "string" ? logoUrl : null;

  return (
    <div className="brand-preview">
      {doc.palette.length > 0 ? (
        <div className="brand-preview__swatches">
          {doc.palette.map((entry, index) => (
            <span
              className="brand-preview__swatch"
              // Keyed by position: a palette entry has no identity but where it
              // sits, and two entries may hold the same colour.
              // biome-ignore lint/suspicious/noArrayIndexKey: position is the identity here
              key={index}
              style={{ background: entry.value }}
              title={
                entry.name ? `${entry.name} · ${entry.value}` : entry.value
              }
            />
          ))}
        </div>
      ) : null}

      {/*
        The kit's marks, chosen by clicking one.
        
        Pictures rather than a dropdown, because "Logo 2" is a worse way to
        choose between images than the images. The chosen one is stamped onto
        whatever this node's Generate makes — composited, not described, so it
        arrives exactly as drawn. See stampLogo.
      */}
      {doc.logos.length > 0 && onPickLogo ? (
        <div className="brand-preview__logos">
          {doc.logos.map((logo) => (
            <button
              className={`brand-preview__logo ${
                chosen === logo.url ? "brand-preview__logo--on" : ""
              }`}
              key={logo.url}
              // Clicking the chosen one clears it: stamping is opt-in, and a
              // brand wired in for its colours alone should not gain a logo
              // that cannot be removed.
              onClick={() => onPickLogo(chosen === logo.url ? null : logo.url)}
              onPointerDown={(event) => event.stopPropagation()}
              title={
                logo.label
                  ? `${logo.label}${logo.rules ? ` — ${logo.rules}` : ""}`
                  : "Logo"
              }
              type="button"
            >
              <img alt={logo.label || "Logo"} src={logo.url} />
            </button>
          ))}
        </div>
      ) : null}

      {chosen ? (
        <p className="brand-preview__note">
          This logo is composited onto the picture after it is generated, so it
          arrives exactly as drawn. Position and size are in the panel.
        </p>
      ) : null}

      {/* Quoted, not summarised. This is the text that will be joined into the
          prompt, and a paraphrase of it would be one more thing to keep true. */}
      <p className="brand-preview__prompt">
        {prompt || "This kit states nothing yet, so the wire carries nothing."}
      </p>

      {kit.parentName ? (
        <p className="brand-preview__note">
          Inherits from {kit.parentName}
          {kit.inherited.length > 0 ? `: ${kit.inherited.join(", ")}` : null}
        </p>
      ) : null}
    </div>
  );
}
