import { HugeiconsIcon } from "@hugeicons/react";
import { ExternalLinkIcon } from "@hugeicons-pro/core-stroke-standard";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import type { Photo } from "../types";
import { BrowserChrome } from "./BrowserChrome";
import { optimizedImageSrc } from "./OptimizedImage";
import { ShareButtons } from "./ShareButtons";

interface LightboxProps {
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  photos: Photo[];
}

export function Lightbox({
  photos,
  currentIndex,
  onClose,
  onNext,
  onPrev,
}: LightboxProps) {
  const currentPhoto = photos[currentIndex];

  if (!currentPhoto) {
    return null;
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      // Only a click on the backdrop itself closes; clicks that land on the
      // photo or its caption target a descendant and are ignored.
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <button
        className="absolute top-6 right-6 text-white/90 transition-colors hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        type="button"
      >
        <X size={32} />
      </button>

      <button
        className="absolute left-6 text-white/90 transition-colors hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
        type="button"
      >
        <ChevronLeft size={48} />
      </button>

      <button
        className="absolute right-6 text-white/90 transition-colors hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        type="button"
      >
        <ChevronRight size={48} />
      </button>

      {/* The backdrop's handler already ignores clicks that land on a
          descendant, so this wrapper needs no handler of its own. */}
      <div className="max-h-[80vh] w-full max-w-5xl px-12">
        {currentPhoto.showChrome ? (
          <BrowserChrome url={currentPhoto.chromeUrl}>
            {/* No max-height and no object-contain: inside the frame the
                screenshot is meant to overflow and scroll at full width, which
                is the only way its text stays readable. */}
            <motion.img
              alt={currentPhoto.title}
              animate={{ opacity: 1 }}
              className="block h-auto w-full"
              height={currentPhoto.height ?? undefined}
              initial={{ opacity: 0 }}
              key={currentPhoto.id}
              referrerPolicy="no-referrer"
              src={optimizedImageSrc(currentPhoto.url, 2048, 85)}
              width={currentPhoto.width ?? undefined}
            />
          </BrowserChrome>
        ) : (
          <motion.img
            alt={currentPhoto.title}
            animate={{ opacity: 1, scale: 1 }}
            className="h-auto max-h-[70vh] w-full object-contain"
            height={currentPhoto.height ?? undefined}
            initial={{ opacity: 0, scale: 0.9 }}
            key={currentPhoto.id}
            referrerPolicy="no-referrer"
            // Capped at max-w-5xl, so 2048px covers a retina view without
            // pulling the full-resolution original.
            src={optimizedImageSrc(currentPhoto.url, 2048, 85)}
            width={currentPhoto.width ?? undefined}
          />
        )}
        <div className="mt-4 text-center">
          <h3 className="font-light text-lg text-white uppercase tracking-widest">
            {currentPhoto.title}
          </h3>
          <p className="mt-1 text-sm text-white/90 uppercase tracking-tighter">
            {currentPhoto.categoryLabel}
          </p>

          {/* The photograph's own page, which carries its camera data and its
              share card. Without this the permalink was only reachable by
              modifier-clicking a grid tile, which nobody would discover. */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
            <Link
              className="inline-flex items-center gap-1.5 text-[10px] text-white/45 uppercase tracking-[0.2em] transition-colors hover:text-white"
              rel="noreferrer"
              target="_blank"
              to={`/photo/${currentPhoto.id}`}
            >
              Open photo page
              <HugeiconsIcon icon={ExternalLinkIcon} size={12} />
            </Link>

            <ShareButtons
              description={currentPhoto.alt || currentPhoto.title}
              imageUrl={currentPhoto.url}
              title={currentPhoto.title}
              url={`/photo/${currentPhoto.id}`}
              variant="overlay"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
