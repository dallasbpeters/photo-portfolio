import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Toaster } from 'sonner';
import { NavArrowRight } from 'iconoir-react';
import { pagesApi, type PageRecord, type PageSummary } from '../services/portfolioService';
import { useSiteSettings } from '../theme/SiteSettingsProvider';
import { PageContent } from '../cms/PageContent';
import { resolveIcon, SiteNav } from '../cms/SiteNav';

/**
 * Public view of a CMS page.
 *
 * Drafts resolve only for a signed-in admin — the API 404s them otherwise — so
 * an unpublished page can be previewed at its real URL without being reachable.
 */
export function ContentPage() {
  const { slug = '' } = useParams();
  const { settings } = useSiteSettings();

  const [page, setPage] = useState<PageRecord | null>(null);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');

    void (async () => {
      try {
        const record = await pagesApi.get(slug);
        if (!cancelled) {
          setPage(record);
          setState('ready');
        }
      } catch {
        if (!cancelled) setState('missing');
      }
    })();

    // The nav is decorative here; a failure to load it must not blank the page.
    void pagesApi
      .list()
      .then((list) => !cancelled && setPages(list))
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const Icon = resolveIcon(page?.icon);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Toaster position="top-center" theme="dark" />

      <header className="px-8 pt-12 md:px-24">
        <Link
          to="/"
          className="text-3xl font-bold uppercase tracking-widest text-accent transition-opacity hover:opacity-80"
        >
          {settings.heroTitle}
        </Link>
        <SiteNav pages={pages} />
      </header>

      <main className="mx-auto max-w-2xl px-8 py-16 md:py-24">
        {state === 'loading' && (
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Loading</p>
        )}

        {state === 'missing' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-light uppercase tracking-[0.24em]">Page not found</h1>
            <p className="text-[13px] leading-relaxed text-white/45">
              This page may have been moved, renamed, or not published yet.
            </p>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center border border-white/20 px-6 text-[10px] uppercase tracking-[0.2em] transition-colors hover:bg-white hover:text-black"
            >
              Back to the gallery
            </Link>
          </div>
        )}

        {state === 'ready' && page && (
          <article>
            <nav aria-label="Breadcrumb" className="mb-8">
              <ol className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/30">
                <li>
                  <Link to="/" className="transition-colors hover:text-white/70">
                    {settings.shortName}
                  </Link>
                </li>
                <li aria-hidden className="flex items-center">
                  <NavArrowRight width={11} height={11} />
                </li>
                <li aria-current="page" className="flex items-center gap-1.5 text-white/60">
                  {Icon && <Icon width={11} height={11} />}
                  {page.title}
                </li>
              </ol>
            </nav>

            <h1 className="mb-10 text-3xl font-light uppercase tracking-[0.16em] md:text-4xl">
              {page.title}
            </h1>

            {page.status === 'draft' && (
              <p className="mb-8 border border-amber-400/25 bg-amber-400/[0.06] px-4 py-2.5 text-[10px] uppercase tracking-[0.16em] text-amber-300/80">
                Draft — only visible to signed-in admins
              </p>
            )}

            <PageContent doc={page.content} />
          </article>
        )}
      </main>

      <footer className="border-t border-white/5 px-8 py-12 md:px-24">
        <p className="text-[10px] uppercase tracking-[0.3em] text-white/20">
          © {new Date().getFullYear()} {settings.ownerName}
        </p>
      </footer>
    </div>
  );
}
