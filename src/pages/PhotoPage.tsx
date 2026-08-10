import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Toaster } from "sonner";
import { SiteNav } from "../cms/SiteNav";
import { OptimizedImage } from "../components/OptimizedImage";
import { ShareButtons } from "../components/ShareButtons";
import { formatExif } from "../lib/photoMetadata";
import {
  type PageSummary,
  pagesApi,
  portfolioService,
} from "../services/portfolioService";
import { useSiteSettings } from "../theme/SiteSettingsProvider";
import type { Photo } from "../types";

/**
 * A single photograph at its own address.
 *
 * Exists so one image can be linked, shared and indexed on its own — the unit
 * that actually travels for a photographer. Share cards and structured data for
 * this route are injected server-side for crawlers; see api/shell.ts.
 */
export function PhotoPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { settings } = useSiteSettings();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing">(
    "loading"
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await portfolioService.getPhotos();
        if (cancelled) {
          return;
        }
        setPhotos(list);
        setState(list.some((p) => p.id === id) ? "ready" : "missing");
      } catch {
        if (!cancelled) {
          setState("missing");
        }
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
  const next =
    index >= 0 && index < photos.length - 1 ? photos[index + 1] : undefined;

  const exifParts = useMemo(() => formatExif(photo?.exif), [photo]);

  // Arrow keys move between photographs, Escape returns to the gallery.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && previous) {
        navigate(`/photo/${previous.id}`);
      }
      if (e.key === "ArrowRight" && next) {
        navigate(`/photo/${next.id}`);
      }
      if (e.key === "Escape") {
        navigate("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, next, previous]);

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <Toaster position="top-center" theme="dark" />

      <header className="px-8 pt-10 md:px-16">
        <Link
          className="font-bold text-2xl text-accent uppercase tracking-widest transition-opacity hover:opacity-80"
          to="/"
        >
          {settings.heroTitle}
        </Link>
        <SiteNav pages={pages} />
      </header>

      <main className="px-4 py-10 md:px-16">
        {state === "loading" && (
          <p className="text-[10px] text-white/80 uppercase tracking-[0.3em]">
            Loading
          </p>
        )}

        {state === "missing" && (
          <div className="space-y-6 py-16">
            <h1 className="font-light text-2xl uppercase tracking-[0.24em]">
              Photograph not found
            </h1>
            <Link
              className="inline-flex min-h-11 items-center border border-white/20 px-6 text-[10px] uppercase tracking-[0.2em] transition-colors hover:bg-white hover:text-black"
              to="/"
            >
              Back to the gallery
            </Link>
          </div>
        )}

        {state === "ready" && photo && (
          <article className="mx-auto max-w-5xl">
            <figure className="relative">
              <OptimizedImage
                alt={photo.alt || photo.title}
                className="max-h-[76vh] w-full object-contain"
                fetchPriority="high"
                height={photo.height ?? undefined}
                loading="eager"
                lqip={photo.lqip}
                quality={90}
                sizes="(min-width: 1280px) 1100px, 100vw"
                src={photo.url}
                width={photo.width ?? undefined}
              />
            </figure>

            <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
              <div className="space-y-2">
                <h1 className="font-light text-xl uppercase tracking-[0.2em] md:text-2xl">
                  {photo.title}
                </h1>
                <Link
                  className="inline-block text-[10px] text-white/90 uppercase tracking-[0.18em] transition-colors hover:text-white"
                  to="/"
                >
                  {photo.categoryLabel}
                </Link>

                <div className="pt-2">
                  <ShareButtons
                    description={photo.alt || photo.title}
                    imageUrl={photo.url}
                    title={`${photo.title} — ${settings.name}`}
                    url={`/photo/${photo.id}`}
                  />
                </div>
              </div>

              <nav
                aria-label="Photograph navigation"
                className="flex items-center gap-4"
              >
                {previous ? (
                  <Link
                    aria-label={`Previous: ${previous.title}`}
                    className="flex items-center gap-1.5 text-[10px] text-white/90 uppercase tracking-[0.18em] transition-colors hover:text-white"
                    to={`/photo/${previous.id}`}
                  >
                    <HugeiconsIcon icon={ArrowLeft01Icon} size={13} />
                    Prev
                  </Link>
                ) : (
                  <span className="text-[10px] text-white/15 uppercase tracking-[0.18em]">
                    Prev
                  </span>
                )}
                {next ? (
                  <Link
                    aria-label={`Next: ${next.title}`}
                    className="flex items-center gap-1.5 text-[10px] text-white/90 uppercase tracking-[0.18em] transition-colors hover:text-white"
                    to={`/photo/${next.id}`}
                  >
                    Next
                    <HugeiconsIcon icon={ArrowRight01Icon} size={13} />
                  </Link>
                ) : (
                  <span className="text-[10px] text-white/15 uppercase tracking-[0.18em]">
                    Next
                  </span>
                )}
              </nav>
            </div>

            {exifParts.length > 0 && (
              <dl className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-white/[0.07] border-t pt-5">
                {exifParts.map((part) => (
                  <dd
                    className="font-mono text-[10px] text-white/90 tracking-[0.08em]"
                    key={part}
                  >
                    {part}
                  </dd>
                ))}
              </dl>
            )}
          </article>
        )}
      </main>

      <footer className="border-white/5 border-t px-8 py-10 md:px-16">
        <p className="text-[10px] text-white/90 uppercase tracking-[0.3em]">
          © {new Date().getFullYear()} {settings.ownerName}
        </p>
      </footer>
    </div>
  );
}
