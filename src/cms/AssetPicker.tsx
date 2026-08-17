import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { isVideoUrl } from "../boards/isVideo";
import { useCollections } from "../hooks/useCollections";
import { usePhotos } from "../hooks/usePhotos";
import { collectionsApi } from "../services/portfolioService";
import type { CollectionItem } from "../types";

/**
 * Choosing an asset that already exists, rather than uploading another.
 *
 * Two sources, because the site has two kinds of picture. The photo library is
 * the portfolio — published work, with categories and credits. A collection is
 * material: whatever a board generated, kept for use without appearing on the
 * site. The page editor is the one place that wants both, and before this it
 * could reach neither: putting a picture already on the site into a page meant
 * downloading and re-uploading it, which made a second copy in blob storage that
 * no longer followed the original when it was replaced.
 *
 * Both sources read the SWR entries their own panels use, so opening this costs
 * nothing when either is already loaded, and anything added elsewhere is here
 * without a refetch.
 */

interface AssetPickerProps {
  /**
   * Hands back the address, a description, and what it is.
   *
   * `kind` is what decides between an image node and a video node — a clip
   * inserted as an image is a broken icon, the mistake the board made until
   * ItemMedia learned to tell them apart.
   */
  onChoose: (url: string, alt: string, kind: "image" | "video") => void;
  onClose: () => void;
}

type Source = "photos" | "collections";

/** One tile. A clip shows its first frame rather than a broken image. */
function Tile({
  alt,
  kind,
  onPick,
  title,
  url,
}: {
  alt: string;
  kind: "image" | "video";
  onPick: () => void;
  title: string;
  url: string;
}) {
  return (
    <button
      className="group relative overflow-hidden rounded border border-white/10 hover:border-white/40"
      onClick={onPick}
      type="button"
    >
      {kind === "video" ? (
        // `#t=0.1` is what makes a frame appear: asked for frame zero, several
        // browsers render nothing until the clip is played.
        <video
          className="aspect-square w-full object-cover"
          muted
          preload="metadata"
          src={`${url}#t=0.1`}
        >
          <track kind="captions" />
        </video>
      ) : (
        <img
          alt={alt}
          className="aspect-square w-full object-cover"
          decoding="async"
          height={200}
          loading="lazy"
          src={url}
          width={200}
        />
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-[10px] text-white/80 opacity-0 group-hover:opacity-100">
        {title}
      </span>
    </button>
  );
}

/** What an item is, trusting the stored kind before the address. */
const kindOf = (item: CollectionItem): "image" | "video" =>
  item.kind === "video" || isVideoUrl(item.url) ? "video" : "image";

export function AssetPicker({ onChoose, onClose }: AssetPickerProps) {
  const [source, setSource] = useState<Source>("photos");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);

  const { photos } = usePhotos();
  const { collections } = useCollections();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The list sends a count rather than its items, so opening one fetches. The
  // flag guards a late answer: switching collections quickly would otherwise let
  // the slower request land last and show the wrong contents.
  useEffect(() => {
    if (!openId) {
      setItems([]);
      return;
    }
    let live = true;
    void collectionsApi.get(openId).then((full) => {
      if (live) {
        setItems(full.items ?? []);
      }
    });
    return () => {
      live = false;
    };
  }, [openId]);

  const term = query.trim().toLowerCase();

  const foundPhotos = useMemo(
    () =>
      term
        ? photos.filter((photo) =>
            `${photo.title} ${photo.category ?? ""}`
              .toLowerCase()
              .includes(term)
          )
        : photos,
    [photos, term]
  );

  const foundItems = useMemo(
    () =>
      term
        ? items.filter((item) =>
            `${item.title ?? ""} ${item.alt ?? ""}`.toLowerCase().includes(term)
          )
        : items,
    [items, term]
  );

  const tab = (id: Source, label: string) => (
    <Button
      aria-pressed={source === id}
      onClick={() => setSource(id)}
      size="xs"
      variant={source === id ? "selected" : "ghost"}
    >
      {label}
    </Button>
  );

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-6">
      {/* The backdrop dismisses; Escape above is the keyboard equivalent. */}
      <div
        aria-hidden
        className="absolute inset-0"
        onClick={onClose}
        onKeyDown={undefined}
      />
      <div
        aria-label="Choose an asset"
        aria-modal
        className="relative flex max-h-[80vh] w-full max-w-3xl flex-col gap-3 rounded-lg border border-white/10 bg-neutral-900 p-4 shadow-xl"
        role="dialog"
      >
        <div className="flex items-center gap-2">
          {tab("photos", "Your photos")}
          {tab("collections", "Collections")}
          <div className="flex-1" />
          <Button onClick={onClose} size="sm" variant="ghost">
            Close
          </Button>
        </div>

        <input
          className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            source === "photos" ? "Search your pictures…" : "Search assets…"
          }
          type="search"
          value={query}
        />

        {source === "collections" ? (
          <div className="flex flex-wrap gap-1.5">
            {collections.length === 0 ? (
              <p className="text-white/40 text-xs">
                No collections yet. Save something into one from a board.
              </p>
            ) : null}
            {collections.map((collection) => (
              <Button
                aria-pressed={openId === collection.id}
                key={collection.id}
                onClick={() => setOpenId(collection.id)}
                size="xs"
                variant={openId === collection.id ? "selected" : "outline"}
              >
                {collection.name} · {collection.itemCount ?? 0}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {source === "photos"
            ? foundPhotos.map((photo) => (
                <Tile
                  alt={photo.alt || photo.title}
                  key={photo.id}
                  kind="image"
                  onPick={() => {
                    onChoose(photo.url, photo.alt || photo.title, "image");
                    // Closed here rather than by the caller: picking is the end
                    // of this dialog's job, and leaving it open over the page
                    // hides the insertion it just made.
                    onClose();
                  }}
                  title={photo.title}
                  url={photo.url}
                />
              ))
            : foundItems.map((item) => (
                <Tile
                  alt={item.alt ?? item.title ?? ""}
                  key={item.id}
                  kind={kindOf(item)}
                  onPick={() => {
                    onChoose(
                      item.url,
                      item.alt ?? item.title ?? "",
                      kindOf(item)
                    );
                    onClose();
                  }}
                  title={item.title ?? ""}
                  url={item.url}
                />
              ))}
        </div>

        {source === "collections" && openId && foundItems.length === 0 ? (
          <p className="py-4 text-center text-sm text-white/40">
            Nothing here yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
