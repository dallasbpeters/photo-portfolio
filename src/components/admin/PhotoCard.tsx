import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  EyeIcon,
  EyeOffIcon,
  FileEditIcon,
  PencilEdit01Icon,
  RotateLeft01Icon,
  RotateRight01Icon,
  StarIcon,
  StarOffIcon,
} from "@hugeicons-pro/core-stroke-standard";
import type { PhotoSelectionResult } from "../../hooks/usePhotoSelection";
import type { Photo } from "../../types";
import { OptimizedImage } from "../OptimizedImage";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";

interface PhotoCardProps {
  isDragging: boolean;
  isNew: boolean;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragStart: () => void;
  onEditDetails: (photo: Photo) => void;
  onEditImage: (photo: Photo) => void;
  onReset: (photo: Photo) => void;
  onRotate: (photo: Photo) => void;
  onToggleFeatured: (photo: Photo) => void;
  onTogglePublished: (photo: Photo) => void;
  photo: Photo;
  selection: PhotoSelectionResult;
}

export const PhotoCard = ({
  isDragging,
  isNew,
  onDragEnd,
  onDragOver,
  onDragStart,
  onEditDetails,
  onEditImage,
  onReset,
  onRotate,
  onToggleFeatured,
  onTogglePublished,
  photo,
  selection,
}: PhotoCardProps) => {
  const selected = selection.selectedIds.includes(photo.id);
  return (
    // Only a drag source, never a button: it wraps the checkbox and the edit
    // controls, so a real button here would nest interactive elements, and
    // there is no keyboard reorder for a focus stop to operate.
    //
    // Reordering by keyboard is the Order field in Edit details, which sets a
    // position directly — so dragging is a shortcut for people who can, not
    // the only way in.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: HTML5 drag needs its handlers on the dragged element itself
    // biome-ignore lint/a11y/noStaticElementInteractions: as above — the keyboard path is the Order field
    <div
      className={`group relative aspect-3/4 rounded-lg p-0.5 transition-opacity ${isNew ? "animate-photo-enter" : ""} ${isDragging ? "opacity-40" : ""}`}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        // Both are needed: without preventDefault the browser refuses the drop
        // and animates the card snapping back to where it started.
        e.preventDefault();
        onDragOver();
      }}
      onDragStart={onDragStart}
      onDrop={(e) => e.preventDefault()}
    >
      <div
        aria-hidden
        className="absolute inset-0 animate-gradient-spin rounded-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "conic-gradient(from calc(var(--gradient-angle) + 335deg), transparent 0deg, oklch(89.62% 0.16 184.25deg) 30deg, oklch(88.7% 0.25 138.31deg) 60deg, transparent 100deg, transparent 360deg)",
          filter: "blur(10px)",
        }}
      />
      <div
        className={`relative h-full overflow-hidden rounded-md border bg-black/40 transition-colors ${
          selected ? "border-white/40" : "border-white/10"
        }`}
      >
        <OptimizedImage
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
          sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw"
          src={photo.url}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-black via-black/50 to-black/20"
        />

        <label
          className="absolute top-1 left-1 z-10 flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md"
          htmlFor={`select-photo-${photo.id}`}
        >
          <Checkbox
            aria-label={`Select ${photo.title}`}
            checked={selected}
            className="h-5 w-5"
            id={`select-photo-${photo.id}`}
            onChange={() => selection.toggle(photo.id)}
          />
        </label>

        <div className="absolute top-1 right-0.5 z-10 flex flex-col gap-0.5">
          <Button
            aria-label={`Edit title and category for ${photo.title}`}
            onClick={() => onEditDetails(photo)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={FileEditIcon} size={18} />
          </Button>
          <Button
            aria-label={`Open image editor for ${photo.title}`}
            onClick={() => onEditImage(photo)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={PencilEdit01Icon} size={18} />
          </Button>
          <Button
            aria-label={`Rotate ${photo.title} 90 degrees`}
            onClick={() => onRotate(photo)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={RotateRight01Icon} size={18} />
          </Button>
          <Button
            aria-label={
              photo.isFeatured
                ? `Remove ${photo.title} from homepage slideshow`
                : `Add ${photo.title} to homepage slideshow`
            }
            aria-pressed={photo.isFeatured}
            onClick={() => onToggleFeatured(photo)}
            onDragStart={(e) => e.stopPropagation()}
            size="icon"
            tone="accent"
            type="button"
            variant="ghost"
          >
            {photo.isFeatured ? (
              <HugeiconsIcon icon={StarIcon} size={18} />
            ) : (
              <HugeiconsIcon icon={StarOffIcon} size={18} />
            )}
          </Button>
          {photo.originalUrl ? (
            <Button
              aria-label={`Restore ${photo.title} to its original`}
              onClick={() => onReset(photo)}
              size="icon"
              title="Restore the original image"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={RotateLeft01Icon} size={18} />
            </Button>
          ) : null}
          <Button
            aria-label={
              photo.isPublished
                ? `Hide ${photo.title} from the site`
                : `Show ${photo.title} on the site`
            }
            aria-pressed={!photo.isPublished}
            onClick={() => onTogglePublished(photo)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              icon={photo.isPublished ? EyeIcon : EyeOffIcon}
              size={18}
            />
          </Button>
          <Button
            aria-label={`Delete ${photo.title}`}
            onClick={() => void selection.deletePhoto(photo.id)}
            size="icon"
            tone="danger"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Delete02Icon} size={18} />
          </Button>
        </div>

        <div className="absolute right-0 bottom-0 left-0 z-10 p-2 pt-6">
          <p className="line-clamp-2 font-light text-[10px] text-white uppercase leading-tight tracking-wider drop-shadow-md">
            {photo.title}
          </p>
          <p className="mt-0.5 truncate text-[9px] text-white/75 uppercase tracking-wider drop-shadow">
            {photo.categoryLabel}
          </p>
          <p className="mt-0.5 font-mono text-[9px] text-white/55 drop-shadow">
            #{photo.order}
          </p>
          {photo.isPublished ? null : (
            <p className="mt-1 inline-flex items-center gap-1 rounded-sm bg-amber-400/15 px-1.5 py-0.5 text-[9px] text-amber-200 uppercase tracking-wider">
              <HugeiconsIcon icon={EyeOffIcon} size={10} />
              Hidden
            </p>
          )}
          {photo.isFeatured ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded-sm bg-amber-400/15 px-1.5 py-0.5 text-[9px] text-amber-200 uppercase tracking-wider">
              <svg
                aria-hidden="true"
                className="size-3 text-amber-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Featured
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};
