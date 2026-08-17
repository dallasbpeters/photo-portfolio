import { HugeiconsIcon } from "@hugeicons/react";
import { Album02Icon } from "@hugeicons-pro/core-stroke-standard";
import { useState } from "react";
import { toast } from "sonner";
import { useCollections } from "../hooks/useCollections";
import { collectionsApi } from "../services/portfolioService";
import { isVideoUrl } from "./isVideo";

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
    <div className="flex max-h-72 flex-col">
      <div className="flex items-center gap-2 border-board-ink/10 border-b px-3 py-2">
        <HugeiconsIcon
          aria-hidden
          className="text-board-ink/50"
          icon={Album02Icon}
          size={14}
        />
        <span className="text-[10px] text-board-ink/50 uppercase tracking-[0.16em]">
          Save {count === 1 ? "it" : `${count}`} to…
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <p className="px-3 py-2 text-[11px] text-board-ink/40">Loading…</p>
        ) : null}
        {!isLoading && collections.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-board-ink/40 leading-relaxed">
            No collections yet. Name one below.
          </p>
        ) : null}
        {collections.map((collection) => (
          <button
            className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-[12px] text-board-ink hover:bg-board-ink/8 disabled:opacity-40"
            disabled={busy}
            key={collection.id}
            onClick={() => void saveInto(collection.id)}
            type="button"
          >
            <span className="truncate">{collection.name}</span>
            <span className="shrink-0 text-[10px] text-board-ink/35 tabular-nums">
              {collection.itemCount ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 border-board-ink/10 border-t px-3 py-2">
        <input
          // Focused only when there is nothing to choose from: with collections
          // listed above, stealing focus would put the caret in "new" when the
          // likely intent is picking one that exists.
          aria-label="New collection name"
          autoFocus={collections.length === 0}
          className="min-w-0 flex-1 rounded border border-board-ink/15 bg-board-surface/40 px-2 py-1 text-[12px] text-board-ink outline-none placeholder:text-board-ink/30 focus:border-board-ink/45"
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
          className="rounded bg-board-ink/15 px-2 py-1 text-[11px] text-board-ink hover:bg-board-ink/25 disabled:opacity-40"
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
