import { HugeiconsIcon } from "@hugeicons/react";
import { Album02Icon } from "@hugeicons-pro/core-stroke-standard";
import { useState } from "react";
import { toast } from "sonner";
import { useCollections } from "../../hooks/useCollections";
import { collectionsApi } from "../../services/portfolioService";
import { isVideoUrl } from "../io/isVideo";
import "../boardChrome.css";
import "./CollectionPanel.css";

/**
 * Choosing where a selection is kept.
 *
 * Its own file because it is the only panel in the canvas menu that talks to the
 * network — the others rearrange what the board already holds — and because the
 * create-then-add path needs state that would not survive being inlined.
 *
 * A collection is not the portfolio. A picture saved here does not appear on the
 * site, gain a category or need publishing; it is material both apps can reach.
 * See db/patches/029_collections.sql.
 */

interface CollectionPanelProps {
  /** Every asset the selection carries, already resolved to addresses. */
  assets: { height?: number | null; url: string; width?: number | null }[];
  onClose: () => void;
}

export function CollectionPanel({ assets, onClose }: CollectionPanelProps) {
  const { collections, isLoading, refresh } = useCollections();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * Adds every asset to one collection.
   *
   * Sequential rather than concurrent: a save is one small write each, the sets
   * are a handful, and a fan-out would hit the item cap in an order nobody chose
   * — the message would then name a random one of them as the straw that broke
   * it. Failures are counted rather than thrown on, so nine saved assets are not
   * lost to a tenth that was already there.
   */
  const saveInto = async (collectionId: string) => {
    setBusy(true);
    let saved = 0;
    let failed = 0;
    for (const asset of assets) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one write each, and the order is the user's
        await collectionsApi.addItem(collectionId, {
          height: asset.height ?? null,
          kind: isVideoUrl(asset.url) ? "video" : "image",
          url: asset.url,
          width: asset.width ?? null,
        });
        saved += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    await refresh();

    if (saved === 0) {
      toast.error("Nothing could be saved to that collection");
    } else {
      toast.success(
        failed > 0
          ? `Saved ${saved}, and ${failed} could not be`
          : `Saved ${saved === 1 ? "it" : saved} to the collection`
      );
    }
    onClose();
  };

  const createAndSave = async () => {
    const title = name.trim();
    if (!title) {
      return;
    }
    setBusy(true);
    try {
      const created = await collectionsApi.create(title);
      // Deliberately not awaited inside the try: the collection exists now, and
      // a failed save should report itself rather than read as a failed create.
      setBusy(false);
      await saveInto(created.id);
    } catch (e) {
      setBusy(false);
      toast.error(
        e instanceof Error ? e.message : "Could not create the collection"
      );
    }
  };

  const count = assets.length;

  return (
    <div className="collection-panel">
      <div className="collection-panel__header">
        <HugeiconsIcon
          aria-hidden
          className="collection-panel__icon"
          icon={Album02Icon}
          size={14}
        />
        <span className="collection-panel__title">
          Save {count === 1 ? "it" : `${count}`} to…
        </span>
      </div>

      <div className="collection-panel__list">
        {isLoading ? (
          <p className="collection-panel__message">Loading…</p>
        ) : null}
        {!isLoading && collections.length === 0 ? (
          <p className="collection-panel__message collection-panel__message--wrapped">
            No collections yet. Name one below.
          </p>
        ) : null}
        {collections.map((collection) => (
          <button
            className="collection-panel__option"
            disabled={busy}
            key={collection.id}
            onClick={() => void saveInto(collection.id)}
            type="button"
          >
            <span className="collection-panel__name">{collection.name}</span>
            <span className="collection-panel__count">
              {collection.itemCount ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="collection-panel__create">
        <input
          // Focused only when there is nothing to choose from: with collections
          // listed above, stealing focus would put the caret in "new" when the
          // likely intent is picking one that exists.
          aria-label="New collection name"
          autoFocus={collections.length === 0}
          className="collection-panel__create-field"
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void createAndSave();
            }
          }}
          placeholder="New collection…"
          value={name}
        />
        <button
          className="panel-button panel-button--tinted"
          disabled={busy || name.trim().length === 0}
          onClick={() => void createAndSave()}
          type="button"
        >
          Add
        </button>
      </div>
    </div>
  );
}
