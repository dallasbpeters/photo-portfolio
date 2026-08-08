import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Toaster } from 'sonner';
import { NavArrowLeft, NavArrowRight } from 'iconoir-react';
import { portfolioService } from '../services/portfolioService';
import { useSiteSettings } from '../theme/SiteSettingsProvider';
import { OptimizedImage } from '../components/OptimizedImage';
import { SiteNav } from '../cms/SiteNav';
import { pagesApi, type PageSummary } from '../services/portfolioService';
import { formatExif } from '../lib/photoMetadata';
import type { Photo } from '../types';

/**
 * A single photograph at its own address.
 *
 * Exists so one image can be linked, shared and indexed on its own — the unit
 * that actually travels for a photographer. Share cards and structured data for
 * this route are injected server-side for crawlers; see api/shell.ts.
 */
export function PhotoPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { settings } = useSiteSettings();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await portfolioService.getPhotos();
        if (cancelled) return;
        setPhotos(list);
        setState(list.some((p) => p.id === id) ? 'ready' : 'missing');
      } catch {
        if (!cancelled) setState('missing');
      }
    })();
    void pagesApi
      .list()
      .then((list) => !cancelled && setPages(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id]);

  const index = photos.findIndex((p) => p.id === id);
  const photo = index >= 0 ? photos[index] : undefined;
  const previous = index > 0 ? photos[index - 1] : undefined;
  const next = index >= 0 && index < photos.length - 1 ? photos[index + 1] : undefined;

  const exifParts = useMemo(() => formatExif(photo?.exif), [photo]);

  // Arrow keys move between photographs, Escape returns to the gallery.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && previous) navigate(`/photo/${previous.id}`);
      if (e.key === 'ArrowRight' && next) navigate(`/photo/${next.id}`);
      if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, next, previous]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Toaster position="top-center" theme="dark" />

      <header className="px-8 pt-10 md:px-16">
        <Link
          to="/"
          className="text-2xl font-bold uppercase tracking-widest text-accent transition-opacity hover:opacity-80"
        >
          {settings.heroTitle}
        </Link>
        <SiteNav pages={pages} />
      </header>

      <main className="px-4 py-10 md:px-16">
        {state === 'loading' && (
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Loading</p>
        )}

        {state === 'missing' && (
          <div className="space-y-6 py-16">
            <h1 className="text-2xl font-light uppercase tracking-[0.24em]">Photograph not found</h1>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center border border-white/20 px-6 text-[10px] uppercase tracking-[0.2em] transition-colors hover:bg-white hover:text-black"
            >
              Back to the gallery
            </Link>
          </div>
        )}

        {state === 'ready' && photo && (
          <article className="mx-auto max-w-5xl">
            <figure className="relative">
              <OptimizedImage
                src={photo.url}
                alt={photo.alt || photo.title}
                sizes="(min-width: 1280px) 1100px, 100vw"
                quality={90}
                loading="eager"
                fetchPriority="high"
                width={photo.width ?? undefined}
                height={photo.height ?? undefined}
                lqip={photo.lqip}
                className="max-h-[76vh] w-full object-contain"
              />
            </figure>

            <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
              <div className="space-y-2">
                <h1 className="text-xl font-light uppercase tracking-[0.2em] md:text-2xl">
                  {photo.title}
                </h1>
                <Link
                  to="/"
                  className="inline-block text-[10px] uppercase tracking-[0.18em] text-white/35 transition-colors hover:text-white"
                >
                  {photo.categoryLabel}
                </Link>
              </div>

              <nav className="flex items-center gap-4" aria-label="Photograph navigation">
                {previous ? (
                  <Link
                    to={`/photo/${previous.id}`}
                    aria-label={`Previous: ${previous.title}`}
                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white"
                  >
                    <NavArrowLeft width={13} height={13} />
                    Prev
                  </Link>
                ) : (
                  <span className="text-[10px] uppercase tracking-[0.18em] text-white/15">Prev</span>
                )}
                {next ? (
                  <Link
                    to={`/photo/${next.id}`}
                    aria-label={`Next: ${next.title}`}
                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white"
                  >
                    Next
                    <NavArrowRight width={13} height={13} />
                  </Link>
                ) : (
                  <span className="text-[10px] uppercase tracking-[0.18em] text-white/15">Next</span>
                )}
              </nav>
            </div>

            {exifParts.length > 0 && (
              <dl className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/[0.07] pt-5">
                {exifParts.map((part) => (
                  <dd
                    key={part}
                    className="font-mono text-[10px] tracking-[0.08em] text-white/35"
                  >
                    {part}
                  </dd>
                ))}
              </dl>
            )}
          </article>
        )}
      </main>

      <footer className="border-t border-white/5 px-8 py-10 md:px-16">
        <p className="text-[10px] uppercase tracking-[0.3em] text-white/20">
          © {new Date().getFullYear()} {settings.ownerName}
        </p>
      </footer>
    </div>
  );
}
