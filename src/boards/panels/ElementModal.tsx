import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MAX_ELEMENT_IMAGES } from "../../../config/elements.js";
import { Button } from "../../components/ui/button";
import { elementsApi } from "../../services/portfolioService";
import type { Element } from "../../types";
import "../boardChrome.css";
import "./ElementModal.css";

/** Saving a new element out of what is selected on the board. */
interface ElementDraftProps {
  /** The analysis text, when the selection had an Analyse node to take it from. */
  description: string;
  element?: undefined;
  /** Every picture the selection can hand over, in the order it was found. */
  images: string[];
  onCancel: () => void;
  onSaved: (element: Element) => void;
}

/** Editing one that is already in the library. */
interface ElementEditProps {
  description?: undefined;
  /** The element as the library has it; every field here is editable. */
  element: Element;
  images?: undefined;
  onCancel: () => void;
  onSaved: (element: Element) => void;
}

type ElementModalProps = ElementDraftProps | ElementEditProps;

/** The four fields a save carries, already trimmed and capped. */
interface ElementFields {
  cover: string;
  description: string;
  imageUrls: string[];
  name: string;
}

/**
 * Where a save goes: back to the element it came from, or to a new one.
 *
 * The two endpoints disagree about how to say "no cover". An update leaves an
 * empty one out rather than sending it empty, because the endpoint reads any
 * string it is given as an address and refuses one it cannot parse — so on that
 * side "no cover" has to be said by silence.
 */
function persist(
  element: Element | undefined,
  fields: ElementFields
): Promise<Element & { dropped?: number }> {
  if (element) {
    return elementsApi.update(element.id, {
      ...(fields.cover ? { coverUrl: fields.cover } : {}),
      description: fields.description,
      imageUrls: fields.imageUrls,
      name: fields.name,
    });
  }
  return elementsApi.create({
    coverUrl: fields.cover || null,
    description: fields.description,
    imageUrls: fields.imageUrls,
    name: fields.name,
  });
}

/**
 * Never silent about a picture that did not make it: an element that quietly
 * kept four of six references is worse than one that says so.
 */
function reportDropped(dropped: number | undefined) {
  if (!dropped || dropped <= 0) {
    return;
  }
  toast.warning(
    dropped === 1
      ? "One picture could not be copied and was left out."
      : `${dropped} pictures could not be copied and were left out.`
  );
}

/**
 * The pictures, with the key image marked and — when editing — droppable.
 *
 * A draft's set is fixed: it is whatever was selected on the board, and the way
 * to change it is to change the selection. An element in the library has no
 * selection behind it any more, so this is the only place a picture that no
 * longer belongs to the style can leave it.
 */
function PictureGrid({
  cover,
  onDrop,
  onPick,
  urls,
}: {
  cover: string;
  /** Absent for a draft, which cannot lose pictures here. */
  onDrop?: (url: string) => void;
  onPick: (url: string) => void;
  urls: string[];
}) {
  return (
    <div className="element-modal__grid">
      {urls.map((url) => (
        <div className="element-modal__cell" key={url}>
          <button
            aria-label={
              url === cover ? "The key image" : "Make this the key image"
            }
            className={`element-modal__tile ${
              url === cover ? "element-modal__tile--key" : ""
            }`}
            onClick={() => onPick(url)}
            type="button"
          >
            <img
              alt=""
              className="element-modal__image"
              draggable={false}
              height={112}
              src={url}
              width={112}
            />
            {url === cover ? (
              <span className="element-modal__tile-label">Key image</span>
            ) : null}
          </button>
          {/* A sibling of the tile rather than a child of it: the tile is
              already a button, and the last picture keeps no remove at all —
              an element with none is refused, and rightly. The tray carries
              the backdrop so the button stays a plain variant. */}
          {onDrop && urls.length > 1 ? (
            <div className="element-modal__remove">
              <Button
                aria-label="Remove this picture from the element"
                onClick={() => onDrop(url)}
                size="icon-sm"
                tone="danger"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} />
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Naming a style before it is kept — and re-naming it afterwards.
 *
 * One modal for both because they are one job. An element is a name, some
 * words, a set of pictures and a key image; whether those are being decided for
 * the first time or reconsidered a week later changes what the Save button
 * calls, and nothing else. A separate editor would have been the same four
 * fields with a second, drifting opinion about how they look.
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
  element,
  images,
  onCancel,
  onSaved,
}: ElementModalProps) {
  const [name, setName] = useState(element?.name ?? "");
  const [words, setWords] = useState(element?.description ?? description ?? "");
  // Held in state rather than read from the props each render because an edit
  // can thin the set: a draft's pictures never move, an element's do.
  const [pictures, setPictures] = useState<string[]>(
    element?.imageUrls ?? images ?? []
  );
  const [cover, setCover] = useState(
    element?.coverUrl ?? images?.[0] ?? pictures[0] ?? ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  // The endpoint keeps the first MAX_ELEMENT_IMAGES of whatever it is handed,
  // so a larger selection is told what will be left out before it is saved
  // rather than after. An element already in the library is within the cap by
  // construction, so this only ever speaks for a draft.
  const dropping = Math.max(0, pictures.length - MAX_ELEMENT_IMAGES);

  // The key image leads, so a selection larger than the limit cannot lose the
  // one picture that was chosen to stand for the element — the endpoint keeps
  // the first MAX_ELEMENT_IMAGES it is handed and drops the rest.
  const kept = (
    cover ? [cover, ...pictures.filter((url) => url !== cover)] : pictures
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

  /**
   * Drops a picture from the element being edited.
   *
   * Dropping the key image promotes whatever is left, so the element is never
   * briefly coverless — and the last picture cannot go at all, because an
   * element with none has nothing to show and nothing to hand down a wire.
   */
  const drop = (url: string) => {
    const left = pictures.filter((one) => one !== url);
    if (left.length === 0) {
      return;
    }
    setPictures(left);
    if (url === cover) {
      setCover(left[0]);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      const saved = await persist(element, {
        cover,
        description: words.trim(),
        imageUrls: kept,
        name: trimmed,
      });
      reportDropped(saved.dropped);
      toast.success(
        element
          ? `Saved “${saved.name}”`
          : `Saved “${saved.name}” to your elements`
      );
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
    <div className="modal-layer element-modal__layer">
      <button
        aria-label="Cancel"
        className="modal-scrim modal-scrim--heavy"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />

      <div className="modal-panel modal-panel--column element-modal">
        <header className="element-modal__header">
          <h2 className="element-modal__title">
            {element ? "Edit this element" : "Save as an element"}
          </h2>
          <p className="element-modal__note">
            {pictures.length === 1
              ? "One picture, kept for reuse on any board."
              : `${pictures.length} pictures, kept for reuse on any board.`}{" "}
            Click one to make it the key image.
            {/* Where an edit lands is worth saying, because it is not only
                here: a run reads the library row, so new words reach boards
                that were built before them. What is already drawn on a canvas
                is the copy the node was placed with and does not move. */}
            {element
              ? " The library is what a run reads, so an edit reaches every board that uses this element."
              : null}
          </p>
          {/* Said before saving rather than discovered afterwards. An element
              is a style, not an archive, and a selection can easily be a whole
              frame — so the cap is reached by ordinary use. */}
          {dropping > 0 ? (
            <p className="element-modal__warning">
              An element holds {MAX_ELEMENT_IMAGES}. The first{" "}
              {MAX_ELEMENT_IMAGES} will be kept, starting with the key image;
              the other {dropping} will not.
            </p>
          ) : null}
        </header>

        <div className="element-modal__body">
          <PictureGrid
            cover={cover}
            onDrop={element ? drop : undefined}
            onPick={setCover}
            urls={pictures}
          />

          <label className="element-modal__field-group">
            <span className="panel-label">Name</span>
            <input
              className="element-modal__field"
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

          <label className="element-modal__field-group element-modal__field-group--tight">
            <span className="panel-label">What they have in common</span>
            <textarea
              className="element-modal__field element-modal__field--prose"
              maxLength={2000}
              onChange={(e) => setWords(e.target.value)}
              placeholder="muted greens, soft overcast light, shallow depth of field, 35mm…"
              value={words}
            />
            <span className="element-modal__field-hint">
              These words travel down the wire into the prompt of whatever this
              element feeds. An Analyse node's reading is the usual source.
            </span>
          </label>
        </div>

        <footer className="element-modal__footer">
          <Button onClick={onCancel} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={isSaving || !name.trim()}
            onClick={() => void save()}
            size="sm"
            type="button"
            variant="default"
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
