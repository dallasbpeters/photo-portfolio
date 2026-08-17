import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isVideoUrl } from "../../boards/isVideo";
import { useCollections } from "../../hooks/useCollections";
import { collectionsApi } from "../../services/portfolioService";
import type { Collection, CollectionItem } from "../../types";
import { useConfirm } from "./ConfirmProvider";

/**
 * The collections, and what is in them.
 *
 * A collection is neither the portfolio nor a board: it is material both apps
 * read. Nothing here is published by being here, which is what `photos` could
 * not express — an unpublished photograph reads as a draft, where these are
 * deliberately never on the site. See db/patches/029_collections.sql.
 *
 * One panel rather than a list route and a detail route. A collection is a name
 * and some pictures; opening one is expanding it, not going somewhere, and a
 * second route would mean losing the list to look at a dozen thumbnails.
 */

/** A thumbnail that knows a clip from a picture. */
function AssetTile({
  item,
  onRemove,
}: {
  item: CollectionItem;
  onRemove: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded border border-white/10">
      {isVideoUrl(item.url) || item.kind === "video" ? (
        // Muted, and no autoplay: a grid of a dozen clips all playing at once
        // is unreadable, and the poster frame is enough to recognise one by.
        // `#t=0.1` is what makes that frame appear — asked for frame zero,
        // several browsers show nothing until the video is played.
        <video
          className="aspect-square w-full object-cover"
          muted
          preload="metadata"
          src={`${item.url}#t=0.1`}
        >
          <track kind="captions" />
        </video>
      ) : (
        <img
          alt={item.alt ?? item.title ?? ""}
          className="aspect-square w-full object-cover"
          decoding="async"
          height={200}
          loading="lazy"
          src={item.url}
          width={200}
        />
      )}
      <Button
        aria-label="Remove from collection"
        className="absolute top-1 right-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        onClick={onRemove}
        size="icon-xs"
        tone="danger"
        variant="ghost"
      >
        ×
      </Button>
    </div>
  );
}

/** One collection: its name, its count, and its assets once opened. */
function CollectionCard({
  collection,
  onChanged,
}: {
  collection: Collection;
  onChanged: () => Promise<unknown>;
}) {
  const { confirm } = useConfirm();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CollectionItem[] | null>(null);
  const [name, setName] = useState(collection.name);
  const [renaming, setRenaming] = useState(false);

  /**
   * Loaded when opened, not with the list.
   *
   * The list sends a count rather than the items, so the first look at one has
   * to fetch. Kept locally afterwards: re-reading on every expand would make
   * opening the same collection twice cost twice.
   */
  const expand = async () => {
    setOpen((was) => !was);
    if (items) {
      return;
    }
    try {
      const full = await collectionsApi.get(collection.id);
      setItems(full.items ?? []);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not open the collection"
      );
    }
  };

  const rename = async () => {
    const next = name.trim();
    if (!next || next === collection.name) {
      setRenaming(false);
      setName(collection.name);
      return;
    }
    try {
      await collectionsApi.update(collection.id, { name: next });
      setRenaming(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename it");
    }
  };

  const removeCollection = async () => {
    const ok = await confirm({
      confirmLabel: "Delete",
      description: `"${collection.name}" and its ${collection.itemCount ?? 0} assets will be removed. The pictures themselves are kept — they may be on a board or in another collection.`,
      destructive: true,
      title: "Delete this collection?",
    });
    if (!ok) {
      return;
    }
    try {
      await collectionsApi.remove(collection.id);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete it");
    }
  };

  const removeItem = async (item: CollectionItem) => {
    try {
      await collectionsApi.removeItem(collection.id, item.id);
      setItems((current) => current?.filter((i) => i.id !== item.id) ?? null);
      await onChanged();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not remove the asset"
      );
    }
  };

  return (
    <section className="rounded-lg border border-white/10 bg-white/2">
      <header className="flex items-center gap-2 px-3 py-2">
        {renaming ? (
          <input
            className="min-w-0 flex-1 rounded border border-white/20 bg-white/5 px-2 py-1 text-sm text-white outline-none focus:border-white/50"
            onBlur={() => void rename()}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void rename();
              }
              if (e.key === "Escape") {
                setRenaming(false);
                setName(collection.name);
              }
            }}
            value={name}
          />
        ) : (
          <button
            aria-expanded={open}
            className="min-w-0 flex-1 text-left"
            onClick={() => void expand()}
            type="button"
          >
            <span className="truncate text-sm text-white">
              {collection.name}
            </span>
            <span className="ml-2 text-[10px] text-white/40 tabular-nums">
              {collection.itemCount ?? 0}
            </span>
          </button>
        )}
        <Button onClick={() => setRenaming(true)} size="xs" variant="ghost">
          Rename
        </Button>
        <Button
          onClick={() => void removeCollection()}
          size="xs"
          tone="danger"
          variant="ghost"
        >
          Delete
        </Button>
      </header>

      {open ? (
        <div className="border-white/10 border-t p-3">
          {items === null ? (
            <p className="text-white/40 text-xs">Loading…</p>
          ) : null}
          {items?.length === 0 ? (
            <p className="text-white/40 text-xs">
              Empty. Save something into it from a board.
            </p>
          ) : null}
          {items && items.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {items.map((item) => (
                <AssetTile
                  item={item}
                  key={item.id}
                  onRemove={() => void removeItem(item)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function CollectionsPanel() {
  const { collections, error, isLoading, refresh } = useCollections();
  const [name, setName] = useState("");

  const create = async () => {
    const title = name.trim();
    if (!title) {
      return;
    }
    try {
      await collectionsApi.create(title);
      setName("");
      await refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not create the collection"
      );
    }
  };

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-[10px] text-white/90 uppercase tracking-widest">
          Collections
        </h2>
        <p className="text-white/40 text-xs leading-relaxed">
          Assets kept for use in boards and pages. Nothing here appears on the
          site — that is what the photo library is for.
        </p>
      </header>

      <div className="flex items-center gap-2">
        <input
          aria-label="New collection name"
          className="min-w-0 flex-1 rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void create();
            }
          }}
          placeholder="New collection…"
          value={name}
        />
        <Button
          disabled={name.trim().length === 0}
          onClick={() => void create()}
          size="sm"
        >
          Create
        </Button>
      </div>

      {isLoading ? <p className="text-white/40 text-xs">Loading…</p> : null}
      {error ? (
        <p className="text-red-300 text-xs">Could not load collections.</p>
      ) : null}
      {!isLoading && collections.length === 0 ? (
        <p className="text-white/40 text-xs leading-relaxed">
          No collections yet. Name one above, or save a selection into a new one
          from a board.
        </p>
      ) : null}

      <div className="space-y-2">
        {collections.map((collection) => (
          <CollectionCard
            collection={collection}
            key={collection.id}
            onChanged={refresh}
          />
        ))}
      </div>
    </div>
  );
}
