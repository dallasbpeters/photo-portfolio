import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePhotos } from "../hooks/usePhotos";

/**
 * Choosing a picture already in the library, rather than uploading another.
 *
 * The editor could only ever take a new file, so putting a photograph that was
 * already on the site into a page meant downloading it and uploading it back —
 * which produced a second copy in blob storage, with its own URL, that no
 * longer followed the original when it was replaced.
 *
 * Reads the same SWR entry the gallery and the admin grid use, so opening this
 * costs nothing when the library is already loaded, and a photo added in
 * another tab is here without a refetch.
 */

interface AssetPickerProps {
  /** Hands back the address to insert. The editor decides what to do with it. */
  onChoose: (url: string, alt: string) => void;
  onClose: () => void;
}

export function AssetPicker({ onChoose, onClose }: AssetPickerProps) {
  const { isLoading, photos } = usePhotos();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const found = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return photos;
    }
    // Title and category, because those are what anyone would type. A filename
    // is not searched: it is rarely what the picture is called in anyone's head.
    return photos.filter((photo) =>
      `${photo.title} ${photo.category ?? ""}`.toLowerCase().includes(term)
    );
  }, [photos, query]);

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
        aria-label="Choose a picture"
        aria-modal
        className="relative flex max-h-[80vh] w-full max-w-3xl flex-col gap-3 rounded-lg border border-white/10 bg-neutral-900 p-4 shadow-xl"
        role="dialog"
      >
        <div className="flex items-center gap-2">
          <input
            // The field the dialog opens on: this is a search-first list, and
            // reaching for the mouse to type is the wrong first move.
            autoFocus
            className="min-w-0 flex-1 rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your pictures…"
            type="search"
            value={query}
          />
          <Button onClick={onClose} size="sm" variant="ghost">
            Close
          </Button>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-white/40">Loading…</p>
        ) : null}

        {!isLoading && found.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/40">
            {photos.length === 0
              ? "Nothing in the library yet."
              : "No pictures match that."}
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {found.map((photo) => (
            <button
              className="group relative overflow-hidden rounded border border-white/10 hover:border-white/40"
              key={photo.id}
              onClick={() => {
                // The library's own alt text when it has one — it was written
                // for this picture and is better than the title, which is a
                // label rather than a description of what is in the frame.
                onChoose(photo.url, photo.alt || photo.title);
                onClose();
              }}
              type="button"
            >
              <img
                alt={photo.title}
                className="aspect-square w-full object-cover"
                decoding="async"
                height={200}
                loading="lazy"
                src={photo.url}
                width={200}
              />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-[10px] text-white/80 opacity-0 group-hover:opacity-100">
                {photo.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
