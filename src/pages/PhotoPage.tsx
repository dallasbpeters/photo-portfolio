import "./PhotoPage.css";
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
    <div className="page photo-page">
      <Toaster position="top-center" theme="dark" />

      <header className="photo-page__masthead">
        <Link className="photo-page__wordmark" to="/">
          {settings.heroTitle}
        </Link>
        <SiteNav pages={pages} />
      </header>

      <main className="photo-page__main">
        {state === "loading" && <p className="label label--quiet">Loading</p>}

        {state === "missing" && (
          <div className="stack photo-page__not-found">
            <h1 className="photo-page__notice-title">Photograph not found</h1>
            <Link className="label photo-page__back" to="/">
              Back to the gallery
            </Link>
          </div>
        )}

        {state === "ready" && photo && (
          <article className="photo-page__article">
            <figure>
              <OptimizedImage
                alt={photo.alt || photo.title}
                className="photo-page__image"
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

            <div className="row photo-page__meta row--between row--wrap">
              <div className="stack stack--tight">
                <h1 className="photo-page__title">{photo.title}</h1>
                <Link className="label quiet-link photo-page__category" to="/">
                  {photo.categoryLabel}
                </Link>

                <div className="photo-page__share">
                  <ShareButtons
                    description={photo.alt || photo.title}
                    imageUrl={photo.url}
                    title={`${photo.title} — ${settings.name}`}
                    url={`/photo/${photo.id}`}
                  />
                </div>
              </div>

              <nav aria-label="Photograph navigation" className="row">
                {previous ? (
                  <Link
                    aria-label={`Previous: ${previous.title}`}
                    className="row label quiet-link"
                    to={`/photo/${previous.id}`}
                  >
                    <HugeiconsIcon icon={ArrowLeft01Icon} size={13} />
                    Prev
                  </Link>
                ) : (
                  <span className="label photo-page__pager-empty">Prev</span>
                )}
                {next ? (
                  <Link
                    aria-label={`Next: ${next.title}`}
                    className="row label quiet-link"
                    to={`/photo/${next.id}`}
                  >
                    Next
                    <HugeiconsIcon icon={ArrowRight01Icon} size={13} />
                  </Link>
                ) : (
                  <span className="label photo-page__pager-empty">Next</span>
                )}
              </nav>
            </div>

            {exifParts.length > 0 && (
              <dl className="row hairline photo-page__exif row--wrap">
                {exifParts.map((part) => (
                  <dd className="photo-page__exif-item" key={part}>
                    {part}
                  </dd>
                ))}
              </dl>
            )}
          </article>
        )}
      </main>

      <footer className="hairline photo-page__footer">
        <p className="label label--quiet">
          © {new Date().getFullYear()} {settings.ownerName}
        </p>
      </footer>
    </div>
  );
}
