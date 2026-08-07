import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Photo } from '../types';
import { optimizedImageSrc } from './OptimizedImage';

interface LightboxProps {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export function Lightbox({ photos, currentIndex, onClose, onNext, onPrev }: LightboxProps) {
  const currentPhoto = photos[currentIndex];

  if (!currentPhoto) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
      >
        <X size={32} />
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
        className="absolute left-6 text-white/50 hover:text-white transition-colors"
      >
        <ChevronLeft size={48} />
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onNext(); }}
        className="absolute right-6 text-white/50 hover:text-white transition-colors"
      >
        <ChevronRight size={48} />
      </button>

      <div className="max-w-5xl max-h-[80vh] px-12" onClick={(e) => e.stopPropagation()}>
        <motion.img
          key={currentPhoto.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          // Capped at max-w-5xl, so 2048px covers a retina view without
          // pulling the full-resolution original.
          src={optimizedImageSrc(currentPhoto.url, 2048, 85)}
          alt={currentPhoto.title}
          className="w-full h-full object-contain"
          referrerPolicy="no-referrer"
        />
        <div className="mt-4 text-center">
          <h3 className="text-white text-lg font-light tracking-widest uppercase">{currentPhoto.title}</h3>
          <p className="text-white/50 text-sm mt-1 uppercase tracking-tighter">{currentPhoto.categoryLabel}</p>
        </div>
      </div>
    </motion.div>
  );
}
