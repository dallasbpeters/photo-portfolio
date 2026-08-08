import { OpenNewWindow } from "iconoir-react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import type { Photo } from "../types";
import { optimizedImageSrc } from "./OptimizedImage";

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
      <div className="max-h-[80vh] max-w-5xl px-12">
        <motion.img
          alt={currentPhoto.title}
          animate={{ opacity: 1, scale: 1 }}
          className="h-full w-full object-contain"
          height={currentPhoto.height ?? undefined}
          initial={{ opacity: 0, scale: 0.9 }}
          key={currentPhoto.id}
          referrerPolicy="no-referrer"
          // Capped at max-w-5xl, so 2048px covers a retina view without
          // pulling the full-resolution original.
          src={optimizedImageSrc(currentPhoto.url, 2048, 85)}
          width={currentPhoto.width ?? undefined}
        />
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
          <Link
            className="mt-4 inline-flex items-center gap-1.5 text-[10px] text-white/45 uppercase tracking-[0.2em] transition-colors hover:text-white"
            onClick={(e) => e.stopPropagation()}
            rel="noreferrer"
            target="_blank"
            to={`/photo/${currentPhoto.id}`}
          >
            Open photo page
            <OpenNewWindow height={12} width={12} />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
