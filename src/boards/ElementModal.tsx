import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MAX_ELEMENT_IMAGES } from "../../config/elements.js";
import { elementsApi } from "../services/portfolioService";
import type { Element } from "../types";

interface ElementModalProps {
  /** The analysis text, when the selection had an Analyse node to take it from. */
  description: string;
  /** Every picture the selection can hand over, in the order it was found. */
  images: string[];
  onCancel: () => void;
  onSaved: (element: Element) => void;
}

/**
 * Naming a style before it is kept.
 *
 * Deliberately not the shadcn Dialog. That is built on `bg-background`, which
 * SiteSettingsProvider pins to the site's branded near-black on every page — so
 * on a board set to light it would open as a dark slab in the middle of a light
 * surface. This is board chrome, so it is painted in board colours.
 *
 * The pictures are shown rather than counted because choosing the key image is
 * part of naming the thing: it is what the panel will show and what the node
 * will hand down a wire, so it wants to be the one that says "this is the look"
 * rather than whichever happened to be selected first.
 */
export function ElementModal({
  description,
  images,
  onCancel,
  onSaved,
}: ElementModalProps) {
  const [name, setName] = useState("");
  const [words, setWords] = useState(description);
  const [cover, setCover] = useState(images[0] ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  // The endpoint keeps the first MAX_ELEMENT_IMAGES of whatever it is handed,
  // so a larger selection is told what will be left out before it is saved
  // rather than after.
  const dropping = Math.max(0, images.length - MAX_ELEMENT_IMAGES);

  // The key image leads, so a selection larger than the limit cannot lose the
  // one picture that was chosen to stand for the element — the endpoint keeps
  // the first MAX_ELEMENT_IMAGES it is handed and drops the rest.
  const kept = (
    cover ? [cover, ...images.filter((url) => url !== cover)] : images
  ).slice(0, MAX_ELEMENT_IMAGES);

  useEffect(() => {
    field.current?.focus();
  }, []);

  // Escape closes it. Listened for on the document rather than on the panel so
  // it works wherever the focus has wandered to, not only inside the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      const saved = await elementsApi.create({
        coverUrl: cover || null,
        description: words.trim(),
        imageUrls: kept,
        name: trimmed,
      });
      // Never silent about a picture that did not make it: an element that
      // quietly kept four of six references is worse than one that says so.
      if (saved.dropped && saved.dropped > 0) {
        toast.warning(
          saved.dropped === 1
            ? "One picture could not be copied and was left out."
            : `${saved.dropped} pictures could not be copied and were left out.`
        );
      }
      toast.success(`Saved “${saved.name}” to your elements`);
      onSaved(saved);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not save that element"
      );
      // Left open on failure, with everything still typed in it. Closing would
      // throw away a name and a description that took thought to write.
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <button
        aria-label="Cancel"
        className="absolute inset-0 cursor-default bg-board-surface/70 backdrop-blur-sm"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />

      <div className="relative flex max-h-full w-[min(92vw,44rem)] flex-col overflow-hidden rounded-xl border border-board-ink/15 bg-board-panel shadow-2xl">
        <header className="shrink-0 border-board-ink/10 border-b px-4 py-3">
          <h2 className="text-[11px] text-board-ink uppercase tracking-[0.18em]">
            Save as an element
          </h2>
          <p className="mt-1 text-[11px] text-board-ink/45 leading-relaxed">
            {images.length === 1
              ? "One picture, kept for reuse on any board."
              : `${images.length} pictures, kept for reuse on any board.`}{" "}
            Click one to make it the key image.
          </p>
          {/* Said before saving rather than discovered afterwards. An element
              is a style, not an archive, and a selection can easily be a whole
              frame — so the cap is reached by ordinary use. */}
          {dropping > 0 ? (
            <p className="mt-1 text-[11px] text-amber-500 leading-relaxed dark:text-amber-300/80">
              An element holds {MAX_ELEMENT_IMAGES}. The first{" "}
              {MAX_ELEMENT_IMAGES} will be kept, starting with the key image;
              the other {dropping} will not.
            </p>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
            {images.map((url) => (
              <button
                aria-label={
                  url === cover ? "The key image" : "Make this the key image"
                }
                className={`relative aspect-square overflow-hidden rounded-lg border transition-colors ${
                  url === cover
                    ? "border-board-ink/70"
                    : "border-board-ink/10 hover:border-board-ink/40"
                }`}
                key={url}
                onClick={() => setCover(url)}
                type="button"
              >
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                  height={112}
                  src={url}
                  width={112}
                />
                {url === cover ? (
                  <span className="absolute inset-x-0 bottom-0 bg-board-surface/70 py-0.5 text-[9px] text-board-ink uppercase tracking-[0.16em] backdrop-blur-sm">
                    Key image
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-[9px] text-board-ink/35 uppercase tracking-[0.18em]">
              Name
            </span>
            <input
              className="w-full rounded border border-board-ink/15 bg-board-surface/30 px-2 py-1.5 text-[13px] text-board-ink outline-none focus:border-board-ink/45"
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
              placeholder="Neon noir, muted 35mm, cut-paper…"
              ref={field}
              value={name}
            />
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-[9px] text-board-ink/35 uppercase tracking-[0.18em]">
              What they have in common
            </span>
            <textarea
              className="h-24 w-full resize-none rounded border border-board-ink/15 bg-board-surface/30 px-2 py-1.5 text-[12px] text-board-ink leading-relaxed outline-none focus:border-board-ink/45"
              maxLength={2000}
              onChange={(e) => setWords(e.target.value)}
              placeholder="muted greens, soft overcast light, shallow depth of field, 35mm…"
              value={words}
            />
            <span className="mt-1 block text-[10px] text-board-ink/40 leading-relaxed">
              These words travel down the wire into the prompt of whatever this
              element feeds. An Analyse node's reading is the usual source.
            </span>
          </label>
        </div>

        <footer className="flex shrink-0 justify-end gap-1.5 border-board-ink/10 border-t px-4 py-3">
          <button
            className="rounded px-2.5 py-1.5 text-[11px] text-board-ink/50 uppercase tracking-[0.16em] hover:text-board-ink"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded bg-board-ink/15 px-3 py-1.5 text-[11px] text-board-ink uppercase tracking-[0.16em] hover:bg-board-ink/25 disabled:opacity-40"
            disabled={isSaving || !name.trim()}
            onClick={() => void save()}
            type="button"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
