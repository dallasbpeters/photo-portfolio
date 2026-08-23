import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  PlusSignIcon,
} from "@hugeicons-pro/core-stroke-standard";
import type { BrandKit } from "../../services/brandKitService";
import { Button } from "../ui/button";
import { PalettePreview } from "./BrandKitPreviews";
import "./BrandKitsPanel.css";

/**
 * One kit in the library, as a card.
 *
 * The last thing out of BrandKitsPanel, which was over the 500-line ceiling. A
 * card is a summary and a way in — it neither edits a document nor knows how one
 * is saved, which is the whole of what the panel around it does.
 */

export function KitCard({
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
