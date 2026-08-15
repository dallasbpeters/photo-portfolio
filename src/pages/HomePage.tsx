import { HugeiconsIcon } from "@hugeicons/react";
import { InstagramIcon } from "@hugeicons-pro/core-stroke-standard";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { SiteNav } from "../cms/SiteNav";
import { Lightbox } from "../components/Lightbox";
import { OptimizedImage } from "../components/OptimizedImage";
import { useIsInstalledApp } from "../hooks/useIsInstalledApp";
import posthog from "../lib/posthog";
import { startViewTransition } from "../lib/viewTransition";
import {
  type PageSummary,
  pagesApi,
  portfolioService,
} from "../services/portfolioService";
import { useSiteSettings } from "../theme/SiteSettingsProvider";
import type { Photo, ViewMode } from "../types";

const CATEGORY_SEPARATORS = /[-_]/;

const formatCategoryLabel = (category: string): string =>
  category
    .split(CATEGORY_SEPARATORS)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

export const HomePage = () => {
  const { settings } = useSiteSettings();
  const isInstalledApp = useIsInstalledApp();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  const categoriesInUse = useMemo(() => {
    const keys = [...new Set(photos.map((p) => p.category))];
    keys.sort((a, b) => a.localeCompare(b));
    return keys;
  }, [photos]);

  useEffect(() => {
    if (viewMode !== "all" && !categoriesInUse.includes(viewMode)) {
      setViewMode("all");
    }
  }, [viewMode, categoriesInUse]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(true);
  const gridSectionRef = useRef<HTMLElement>(null);

  const handleFilterClick = useCallback((mode: ViewMode) => {
    posthog.capture("portfolio_category_filtered", {
      category: mode,
    });
    setViewMode(mode);
    requestAnimationFrame(() => {
      gridSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const refreshPhotos = useCallback(async () => {
    setIsLoadingPhotos(true);
    setLoadError(null);
    try {
      const list = await portfolioService.getPhotos();
      setPhotos(list);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load photos";
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
    void pagesApi
      .list()
      .then(setPages)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onChanged = () => void refreshPhotos();
    window.addEventListener("cyan-photos-changed", onChanged);
    return () => window.removeEventListener("cyan-photos-changed", onChanged);
  }, [refreshPhotos]);

  const filteredPhotos = photos.filter(
    (p) => viewMode === "all" || p.category === viewMode
  );
  const heroPhotos = photos
    .filter((p) => p.isPublished && p.isFeatured)
    .slice(0, 8);

  const handleNextHero = useCallback(() => {
    if (heroPhotos.length === 0) {
      return;
    }
    setHeroIndex((prev) => (prev + 1) % heroPhotos.length);
  }, [heroPhotos.length]);

  // Depends on heroIndex so the countdown restarts whenever the slide changes,
  // including a manual pick. Without that, choosing a photo left the original
  // schedule running and it could advance a moment later — which reads as the
  // button not working.
  useEffect(() => {
    if (heroPhotos.length < 2) {
      return;
    }
    const timer = setInterval(handleNextHero, 8000);
    return () => clearInterval(timer);
  }, [handleNextHero, heroPhotos.length]);

  const handleNextLightbox = () => {
    if (lightboxIndex === null || filteredPhotos.length === 0) {
      return;
    }
    setLightboxIndex((lightboxIndex + 1) % filteredPhotos.length);
  };

  const handlePrevLightbox = () => {
    if (lightboxIndex === null || filteredPhotos.length === 0) {
      return;
    }
    setLightboxIndex(
      (lightboxIndex - 1 + filteredPhotos.length) % filteredPhotos.length
    );
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background font-sans text-foreground selection:bg-white selection:text-black">
      <Toaster position="top-center" theme="dark" />

      {isLoadingPhotos ? (
        <div
          aria-label="Loading portfolio"
          aria-live="polite"
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          role="status"
        >
          <p className="text-[10px] text-white/90 uppercase tracking-[0.3em]">
            Loading portfolio…
          </p>
        </div>
      ) : null}

      {loadError && !isLoadingPhotos ? (
        <div
          className="fixed top-24 left-1/2 z-90 max-w-md -translate-x-1/2 rounded border border-white/20 bg-black/90 px-6 py-4 text-center text-sm text-white/80"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}

      <header className="absolute top-0 right-0 left-0 z-50 px-12 pt-12 md:px-24">
        <h1 className="font-bold text-3xl text-accent uppercase tracking-widest">
          {settings.heroTitle}
        </h1>
        <SiteNav pages={pages} />
      </header>
      <section className="relative flex h-screen w-full items-center overflow-hidden">
        <div className="absolute top-0 left-0 z-40 flex h-full w-full flex-col justify-center px-8 md:w-[70%] md:px-24">
          <div className="space-y-1 md:space-y-2">
            {heroPhotos.map((photo, i) => (
              <button
                className={`group flex cursor-pointer items-start gap-2 text-left transition-all duration-1000 ${
                  heroIndex === i
                    ? "text-white opacity-100 hover:text-accent"
                    : "text-white/90 hover:text-accent"
                }`}
                key={photo.id}
                onClick={() => setHeroIndex(i)}
                type="button"
              >
                <span className="font-black text-4xl uppercase leading-[0.85] tracking-tighter md:text-7xl">
                  {photo.title}
                </span>
                <sup className="mt-3 font-bold text-[10px] opacity-40 md:mt-6 md:text-sm">
                  ({i + 1})
                </sup>
              </button>
            ))}
          </div>
        </div>

        <div className="absolute inset-0 z-0">
          {heroPhotos.length > 0 ? (
            <AnimatePresence mode="wait">
              <motion.div
                animate={{ opacity: 1 }}
                className="relative h-full w-full"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                key={heroIndex}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                <OptimizedImage
                  alt={
                    heroPhotos[heroIndex]?.alt ||
                    heroPhotos[heroIndex]?.title ||
                    ""
                  }
                  className="h-auto w-full object-cover"
                  fetchPriority="high"
                  loading="eager"
                  lqip={heroPhotos[heroIndex]?.lqip}
                  quality={90}
                  referrerPolicy="no-referrer"
                  sizes="100vw"
                  src={heroPhotos[heroIndex]?.url ?? ""}
                />
                <div className="absolute inset-0 bg-black/20" />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div aria-hidden className="absolute inset-0 bg-neutral-950" />
          )}
        </div>
      </section>

      <section
        aria-label="Portfolio grid"
        className="mx-auto scroll-mt-6 px-4 py-24 md:px-8"
        id="portfolio-grid"
        ref={gridSectionRef}
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
          {filteredPhotos.map((photo, index) => (
            <motion.div
              className="group aspect-video overflow-hidden bg-white/5 md:aspect-square"
              initial={{ opacity: 0 }}
              key={photo.id}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
              whileInView={{ opacity: 1 }}
            >
              {/* A real link, so each photograph can be opened in a new tab,
                  copied, and followed by crawlers. A plain click still opens the
                  lightbox, which is faster than a navigation. */}
              <Link
                className="block h-full w-full cursor-pointer"
                onClick={(e) => {
                  if (
                    e.metaKey ||
                    e.ctrlKey ||
                    e.shiftKey ||
                    e.altKey ||
                    e.button !== 0
                  ) {
                    return;
                  }
                  e.preventDefault();
                  posthog.capture("portfolio_photo_opened", {
                    category: photo.category,
                  });
                  startViewTransition(() => setLightboxIndex(index));
                }}
                to={`/photo/${photo.id}`}
              >
                <OptimizedImage
                  alt={photo.alt || photo.title}
                  className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
                  height={photo.height ?? undefined}
                  lqip={photo.lqip}
                  referrerPolicy="no-referrer"
                  sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
                  src={photo.url}
                  width={photo.width ?? undefined}
                />
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="border-white/5 border-t bg-background px-4 py-24 md:px-8">
        <div className="mx-auto flex max-w-10xl flex-col items-end justify-between gap-12 md:flex-row">
          <div className="space-y-6">
            <h2 className="font-bold text-3xl uppercase tracking-widest">
              {settings.ownerName}
            </h2>
            <p className="max-w-xs text-sm text-white/90 uppercase tracking-widest">
              {settings.tagline}
            </p>
            <div className="flex gap-6">
              <a
                aria-label={`${settings.ownerName} on Instagram`}
                className="transition-colors hover:text-white/90"
                href={settings.instagramUrl}
              >
                <HugeiconsIcon icon={InstagramIcon} size={20} />
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-4 text-[10px] text-white/90 uppercase tracking-[0.3em]">
            <p>
              © {new Date().getFullYear()} {settings.ownerName}. All rights
              reserved.
            </p>
            {/* Only shown to an installed app, which has no address bar and so
                cannot reach /admin by typing. In an ordinary tab the owner can
                navigate there directly, so showing this to every visitor would
                buy nothing. iOS needs it because it ignores the manifest's
                Admin shortcut. */}
            {isInstalledApp ? (
              <Link
                className="text-white/40 transition-colors hover:text-white"
                to="/admin"
              >
                Admin
              </Link>
            ) : null}
          </div>
        </div>
      </footer>

      <nav
        aria-label="Filter portfolio by category"
        className="fixed bottom-12 left-1/2 z-50 -translate-x-1/2"
      >
        <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-6 rounded-xl border border-white/10 bg-white/5 px-8 py-3 shadow-2xl backdrop-blur-xl">
          <button
            aria-pressed={viewMode === "all"}
            className={`text-[10px] uppercase tracking-[0.3em] transition-colors ${viewMode === "all" ? "text-white" : "text-white/90 hover:text-white/90"}`}
            onClick={() => handleFilterClick("all")}
            type="button"
          >
            All
          </button>
          {categoriesInUse.map((category) => {
            const label =
              photos.find((p) => p.category === category)?.categoryLabel ??
              formatCategoryLabel(category);
            return (
              <button
                aria-pressed={viewMode === category}
                className={`text-[10px] uppercase tracking-[0.3em] transition-colors ${viewMode === category ? "text-white" : "text-white/90 hover:text-white/90"}`}
                key={category}
                onClick={() => handleFilterClick(category)}
                type="button"
              >
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      <AnimatePresence>
        {lightboxIndex !== null && filteredPhotos.length > 0 ? (
          <Lightbox
            currentIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onNext={handleNextLightbox}
            onPrev={handlePrevLightbox}
            photos={filteredPhotos}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
};
