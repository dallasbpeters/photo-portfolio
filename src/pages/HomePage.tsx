import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Photo, ViewMode } from '../types';
import { Lightbox } from '../components/Lightbox';
import { OptimizedImage } from '../components/OptimizedImage';
import { Toaster, toast } from 'sonner';
import { portfolioService } from '../services/portfolioService';
import { Instagram } from 'iconoir-react';
import { useSiteSettings } from '../theme/SiteSettingsProvider';
import { SiteNav } from '../cms/SiteNav';
import { pagesApi, type PageSummary } from '../services/portfolioService';
import posthog from '../lib/posthog';

const formatCategoryLabel = (category: string): string =>
  category
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

export const HomePage = () => {
  const { settings } = useSiteSettings();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  const categoriesInUse = useMemo(() => {
    const keys = [...new Set(photos.map((p) => p.category))];
    keys.sort((a, b) => a.localeCompare(b));
    return keys;
  }, [photos]);

  useEffect(() => {
    if (viewMode !== 'all' && !categoriesInUse.includes(viewMode)) {
      setViewMode('all');
    }
  }, [viewMode, categoriesInUse]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(true);
  const gridSectionRef = useRef<HTMLElement>(null);

  const handleFilterClick = useCallback((mode: ViewMode) => {
    posthog.capture('portfolio_category_filtered', {
      category: mode,
    });
    setViewMode(mode);
    requestAnimationFrame(() => {
      gridSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const refreshPhotos = useCallback(async () => {
    setIsLoadingPhotos(true);
    setLoadError(null);
    try {
      const list = await portfolioService.getPhotos();
      setPhotos(list);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not load photos';
      setLoadError(message);
      setPhotos([]);
      toast.error(message);
    } finally {
      setIsLoadingPhotos(false);
    }
  }, []);

  useEffect(() => {
    void refreshPhotos();
  }, [refreshPhotos]);

  useEffect(() => {
    // Decorative: if this fails the gallery still renders, just without links.
    void pagesApi.list().then(setPages).catch(() => undefined);
  }, []);

  useEffect(() => {
    const onChanged = () => void refreshPhotos();
    window.addEventListener('cyan-photos-changed', onChanged);
    return () => window.removeEventListener('cyan-photos-changed', onChanged);
  }, [refreshPhotos]);

  const filteredPhotos = photos.filter((p) => viewMode === 'all' || p.category === viewMode);
  const heroPhotos = photos.slice(0, 5);

  const handleNextHero = useCallback(() => {
    if (heroPhotos.length === 0) return;
    setHeroIndex((prev) => (prev + 1) % heroPhotos.length);
  }, [heroPhotos.length]);

  useEffect(() => {
    if (heroPhotos.length === 0) return;
    const timer = setInterval(handleNextHero, 8000);
    return () => clearInterval(timer);
  }, [handleNextHero, heroPhotos.length]);

  const handleNextLightbox = () => {
    if (lightboxIndex === null || filteredPhotos.length === 0) return;
    setLightboxIndex((lightboxIndex + 1) % filteredPhotos.length);
  };

  const handlePrevLightbox = () => {
    if (lightboxIndex === null || filteredPhotos.length === 0) return;
    setLightboxIndex((lightboxIndex - 1 + filteredPhotos.length) % filteredPhotos.length);
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black overflow-x-hidden">
      <Toaster position="top-center" theme="dark" />

      {isLoadingPhotos && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label="Loading portfolio"
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/60">Loading portfolio…</p>
        </div>
      )}

      {loadError && !isLoadingPhotos && (
        <div
          className="fixed top-24 left-1/2 -translate-x-1/2 z-90 max-w-md rounded border border-white/20 bg-black/90 px-6 py-4 text-center text-sm text-white/80"
          role="alert"
        >
          {loadError}
        </div>
      )}

      <section className="relative h-screen w-full overflow-hidden flex items-center">
        <div className="absolute left-0 top-0 h-full w-full md:w-[70%] z-40 flex flex-col justify-center px-8 md:px-24 pointer-events-none">
          <div className="space-y-1 md:space-y-2 pointer-events-auto">
            {heroPhotos.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setHeroIndex(i)}
                className={`group flex items-start gap-2 text-left transition-all duration-1000 ${heroIndex === i ? 'text-white opacity-100' : 'text-white/30 hover:text-white/50'
                  }`}
              >
                <span className="text-4xl md:text-7xl font-black tracking-tighter leading-[0.85] uppercase">
                  {photo.title}
                </span>
                <sup className="text-[10px] md:text-sm font-bold mt-3 md:mt-6 opacity-40">({i + 1})</sup>
              </button>
            ))}
          </div>
        </div>

        <div className="absolute inset-0 z-0">
          {heroPhotos.length > 0 ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={heroIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, ease: 'easeInOut' }}
                className="relative w-full h-full"
              >
                <OptimizedImage
                  src={heroPhotos[heroIndex]?.url ?? ''}
                  alt={heroPhotos[heroIndex]?.title ?? ''}
                  sizes="100vw"
                  quality={90}
                  loading="eager"
                  fetchPriority="high"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/20" />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="absolute inset-0 bg-neutral-950" aria-hidden />
          )}
        </div>

        <div className="absolute top-12 left-8 md:left-24 z-50">
          <h1 className="text-3xl text-accent font-bold tracking-widest uppercase">
            {settings.heroTitle}
          </h1>
          <SiteNav pages={pages} />
        </div>
      </section>

      <section
        ref={gridSectionRef}
        id="portfolio-grid"
        className="scroll-mt-6 py-24 px-4 md:px-8 max-w-450 mx-auto"
        aria-label="Portfolio grid"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          {filteredPhotos.map((photo, index) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="group cursor-pointer aspect-video md:aspect-square overflow-hidden bg-white/5"
              onClick={() => {
                posthog.capture('portfolio_photo_opened', {
                  category: photo.category,
                });
                setLightboxIndex(index);
              }}
            >
              <OptimizedImage
                src={photo.url}
                alt={photo.title}
                sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="py-24 px-12 border-t border-white/5 bg-black">
        <div className="max-w-10xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="space-y-6">
            <h2 className="text-3xl font-bold uppercase tracking-widest">{settings.ownerName}</h2>
            <p className="text-sm text-white/40 uppercase tracking-widest max-w-xs">
              {settings.tagline}
            </p>
            <div className="flex gap-6">
              <a
                href={settings.instagramUrl}
                aria-label={`${settings.ownerName} on Instagram`}
                className="hover:text-white/60 transition-colors"
              >
                <Instagram width={20} height={20} />
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-4 text-[10px] uppercase tracking-[0.3em] text-white/20">
            <p>
              © {new Date().getFullYear()} {settings.ownerName}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      <nav
        className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50"
        aria-label="Filter portfolio by category"
      >
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-8 py-3 flex flex-wrap items-center justify-center gap-6 shadow-2xl max-w-[calc(100vw-2rem)]">
          <button
            type="button"
            onClick={() => handleFilterClick('all')}
            className={`text-[10px] uppercase tracking-[0.3em] transition-colors ${viewMode === 'all' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
            aria-pressed={viewMode === 'all'}
          >
            All
          </button>
          {categoriesInUse.map((category) => {
            const label =
              photos.find((p) => p.category === category)?.categoryLabel ?? formatCategoryLabel(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => handleFilterClick(category)}
                className={`text-[10px] uppercase tracking-[0.3em] transition-colors ${viewMode === category ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
                aria-pressed={viewMode === category}
              >
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      <AnimatePresence>
        {lightboxIndex !== null && filteredPhotos.length > 0 && (
          <Lightbox
            photos={filteredPhotos}
            currentIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onNext={handleNextLightbox}
            onPrev={handlePrevLightbox}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
