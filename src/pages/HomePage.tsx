import "./HomePage.css";
import { HugeiconsIcon } from "@hugeicons/react";
import { InstagramIcon } from "@hugeicons-pro/core-stroke-standard";
import { AnimatePresence, motion } from "motion/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { Toaster, toast } from "sonner";

/**
 * Loaded on demand, never with the page.
 *
 * This pulls in a WebGPU shader runtime that minifies to ~3.3MB (654kB gzipped)
 * — larger than the rest of the app combined. A static import put all of it in
 * the entry chunk, so every visitor paid for it before the first photo, and the
 * sites with `showShader: false` paid for code that can never run.
 *
 * Behind the flag it is fetched only where it is actually rendered, and even
 * there it is a decorative backdrop, so arriving late costs nothing.
 */
const DPDLogoShader = lazy(() => import("@/shaders/dpd-logo"));

import { SiteNav } from "../cms/SiteNav";
import { Lightbox } from "../components/Lightbox";
import { OptimizedImage } from "../components/OptimizedImage";
import { useIsInstalledApp } from "../hooks/useIsInstalledApp";
import { usePhotos } from "../hooks/usePhotos";
import posthog from "../lib/posthog";
import { startViewTransition } from "../lib/viewTransition";
import { type PageSummary, pagesApi } from "../services/portfolioService";
import { useSiteSettings } from "../theme/SiteSettingsProvider";
import type { ViewMode } from "../types";

const CATEGORY_SEPARATORS = /[-_]/;

const formatCategoryLabel = (category: string): string =>
  category
    .split(CATEGORY_SEPARATORS)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

export const HomePage = () => {
  const { settings } = useSiteSettings();
  const isInstalledApp = useIsInstalledApp();
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  // The gallery no longer owns this request. SWR holds one entry per key, so
  // the admin mounted alongside it reads the same list rather than fetching
  // its own copy and reconciling the two through a CustomEvent.
  const { error: loadError, isLoading: isLoadingPhotos, photos } = usePhotos();

  // Surfaced once per distinct failure rather than on every render: SWR keeps
  // returning the same error object while the request stays failed, and a
  // toast in the render path would stack one per paint.
  const reportedError = useRef<string | null>(null);
  useEffect(() => {
    const message = loadError?.message ?? null;
    if (message && message !== reportedError.current) {
      toast.error(message);
    }
    reportedError.current = message;
  }, [loadError]);

  // Published only, to match the grid. An admin signed in on the public page
  // otherwise gets a filter for a category whose every photograph is hidden,
  // which selects and then shows nothing.
  const categoriesInUse = useMemo(() => {
    const keys = [
      ...new Set(photos.filter((p) => p.isPublished).map((p) => p.category)),
    ];
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

  useEffect(() => {
    // Decorative: if this fails the gallery still renders, just without links.
    void pagesApi
      .list()
      .then(setPages)
      .catch(() => undefined);
  }, []);

  // Published only, stated here rather than relied on from the endpoint. The
  // API returns unpublished rows to an admin, and this page is reachable while
  // signed in — without this the gallery would show a visitor's view to
  // everyone except the one person able to tell it was wrong.
  const filteredPhotos = photos.filter(
    (p) => p.isPublished && (viewMode === "all" || p.category === viewMode)
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
    <div className="page home-page">
      <Toaster position="top-center" theme="dark" />

      {isLoadingPhotos ? (
        <div
          aria-label="Loading portfolio"
          aria-live="polite"
          className="home-page__loading"
          role="status"
        >
          <p className="label home-page__loading-label">Loading portfolio…</p>
        </div>
      ) : null}

      {loadError && !isLoadingPhotos ? (
        <div className="home-page__error" role="alert">
          {loadError.message}
        </div>
      ) : null}

      <header className="home-page__masthead">
        <h1 className="home-page__wordmark">{settings.heroTitle}</h1>
        <SiteNav pages={pages} />
      </header>
      <section className="home-page__hero">
        <div className="home-page__hero-copy">
          <div className="stack home-page__hero-list">
            {heroPhotos.map((photo, i) => (
              <button
                className={
                  heroIndex === i
                    ? "home-page__hero-title home-page__hero-title--current"
                    : "home-page__hero-title"
                }
                key={photo.id}
                onClick={() => setHeroIndex(i)}
                type="button"
              >
                <span className="home-page__hero-title-text">
                  {photo.title}
                </span>
                <sup className="home-page__hero-index">({i + 1})</sup>
              </button>
            ))}
          </div>
        </div>

        <div className="home-page__hero-media">
          {heroPhotos.length > 0 ? (
            <AnimatePresence mode="wait">
              <motion.div
                animate={{ opacity: 1 }}
                className="home-page__hero-frame"
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
                  className="home-page__hero-image"
                  fetchPriority="high"
                  loading="eager"
                  lqip={heroPhotos[heroIndex]?.lqip}
                  quality={90}
                  referrerPolicy="no-referrer"
                  sizes="100vw"
                  src={heroPhotos[heroIndex]?.url ?? ""}
                />
                <div className="home-page__hero-scrim" />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div aria-hidden className="home-page__hero-empty" />
          )}
        </div>
      </section>

      <section
        aria-label="Portfolio grid"
        className="home-page__grid-section"
        id="portfolio-grid"
        ref={gridSectionRef}
      >
        <div className="home-page__grid">
          {filteredPhotos.map((photo, index) => (
            <motion.div
              className="home-page__tile"
              initial={{ opacity: 0 }}
              key={photo.id}
              transition={{ duration: 0.3 }}
              viewport={{ once: true }}
              whileInView={{ opacity: 1 }}
            >
              {/* A real link, so each photograph can be opened in a new tab,
                  copied, and followed by crawlers. A plain click still opens the
                  lightbox, which is faster than a navigation. */}
              <Link
                className="home-page__tile-link"
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
                  className={
                    photo.showChrome
                      ? "home-page__tile-image home-page__tile-image--chrome"
                      : "home-page__tile-image"
                  }
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

      <footer className="home-page__footer">
        <div className="home-page__footer-inner">
          <div className="stack home-page__footer-identity">
            <h2 className="home-page__owner">{settings.ownerName}</h2>
            <p className="label home-page__tagline">{settings.tagline}</p>
            <div className="row home-page__socials">
              <a
                aria-label={`${settings.ownerName} on Instagram`}
                className="home-page__social"
                href={settings.instagramUrl}
              >
                <HugeiconsIcon icon={InstagramIcon} size={20} />
              </a>
            </div>
          </div>

          <div className="stack label home-page__legal">
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
              <Link className="home-page__admin-link" to="/admin">
                Admin
              </Link>
            ) : null}
          </div>
        </div>
      </footer>

      <nav
        aria-label="Filter portfolio by category"
        className="home-page__filters"
      >
        <div className="row hairline home-page__filter-bar row--wrap">
          <button
            aria-pressed={viewMode === "all"}
            className={
              viewMode === "all"
                ? "label home-page__filter home-page__filter--current"
                : "label home-page__filter"
            }
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
                className={
                  viewMode === category
                    ? "label home-page__filter home-page__filter--current"
                    : "label home-page__filter"
                }
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
      {/* Its own boundary, with no fallback: the shader is decoration, so it
          should fade in whenever it is ready and never hold up the gallery.
          Leaning on the route-level Suspense instead would blank the whole
          page while several megabytes of WebGPU downloaded. */}
      {settings.showShader ? (
        <Suspense fallback={null}>
          <DPDLogoShader
            className="home-page__shader"
            colorA="oklch(2.8% 0.13 160.46)"
            colorB={settings.theme.accent}
          />
        </Suspense>
      ) : null}
    </div>
  );
};
