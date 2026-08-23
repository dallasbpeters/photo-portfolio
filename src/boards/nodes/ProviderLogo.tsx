import {
  monogramFor,
  type Provider,
  providerFor,
} from "../../../config/providers.js";
import "./ProviderLogo.css";

/**
 * The mark of the lab whose model a node will call.
 *
 * A board of generation nodes is otherwise undifferentiated — every card says
 * "Generate" and nothing about what it is going to spend. The mark is the
 * fastest way to read which nodes agree with each other, and it reads at a zoom
 * where no label on the card is legible.
 *
 * fal publishes these as white tiles with the mark already inset (see
 * scripts/fetch-provider-logos.py), so the asset *is* the tile — this component
 * only clips the corners and holds the size. That is also why there is no
 * background colour here: painting one behind an opaque white square would only
 * show at the rounded corners, as four coloured slivers.
 *
 * Where fal publishes no mark — Recraft, and fal's own utility endpoints — the
 * tile falls back to a monogram on the board's own surface, which is a legible
 * answer rather than a broken image.
 */

/**
 * The square the fetch script writes each tile at — kept in step with TILE_PX
 * in scripts/fetch-provider-logos.py.
 */
const TILE_PX = 128;

export interface ProviderLogoProps {
  /**
   * The model id, from the node's config.
   *
   * The id rather than a resolved provider, so a caller never has to know the
   * mapping — and so "auto" and an unset model both land on the same answer
   * without the caller special-casing either.
   */
  modelId: string | null | undefined;
  /**
   * How big, in board spacing units.
   *
   * A number rather than a size token because both callers want a different
   * one and neither is a step on a ladder: the node header's tile is sized to
   * the two lines of text beside it, the panel's to its own row.
   */
  units?: number;
}

export function ProviderLogo({ modelId, units = 10 }: ProviderLogoProps) {
  const provider: Provider | null = providerFor(modelId);
  // An id no rule claims: show the monogram of the id's own first segment,
  // which for "some-lab/some-model" is the vendor. Better than a question mark
  // and better than nothing — a row added in the admin before a rule exists for
  // it should still look like something.
  const name = provider?.name ?? modelId?.split("/")[0] ?? "Model";
  const style = {
    "--provider-logo-size": `calc(var(--spacing) * ${units})`,
  } as React.CSSProperties;

  if (provider?.logo) {
    return (
      <img
        alt={name}
        className="provider-logo"
        decoding="async"
        // The intrinsic square the fetch script writes (its TILE_PX), so the
        // browser reserves a square box before the file arrives. What actually
        // shows is the CSS tile, sized from --provider-logo-size.
        height={TILE_PX}
        // Eager, deliberately: these are a few kilobytes each, already on the
        // page's own origin, and a node header that pops its mark in after the
        // card has drawn reads as the card being broken.
        loading="eager"
        src={provider.logo}
        style={style}
        title={name}
        width={TILE_PX}
      />
    );
  }

  return (
    <span
      aria-label={name}
      className="provider-logo provider-logo--monogram"
      role="img"
      style={style}
      title={name}
    >
      {monogramFor(name)}
    </span>
  );
}
