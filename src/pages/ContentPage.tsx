import "./ContentPage.css";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Toaster } from "sonner";
import { PageContent } from "../cms/PageContent";
import { resolveIcon, SiteNav } from "../cms/SiteNav";
import {
  type PageRecord,
  type PageSummary,
  pagesApi,
} from "../services/portfolioService";
import { useSiteSettings } from "../theme/SiteSettingsProvider";

/**
 * Public view of a CMS page.
 *
 * Drafts resolve only for a signed-in admin — the API 404s them otherwise — so
 * an unpublished page can be previewed at its real URL without being reachable.
 */
export function ContentPage() {
  const { slug = "" } = useParams();
  const { settings } = useSiteSettings();

  const [page, setPage] = useState<PageRecord | null>(null);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing">(
    "loading"
  );

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    void (async () => {
      try {
        const record = await pagesApi.get(slug);
        if (!cancelled) {
          setPage(record);
          setState("ready");
        }
      } catch {
        if (!cancelled) {
          setState("missing");
        }
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
    <div className="page content-page">
      <Toaster position="top-center" theme="dark" />

      <header className="page__body content-page__masthead">
        <Link className="content-page__wordmark" to="/">
          {settings.heroTitle}
        </Link>
        <SiteNav pages={pages} />
      </header>

      <main className="page__body page__body--reading content-page__main">
        {state === "loading" && <p className="label label--quiet">Loading</p>}

        {state === "missing" && (
          <div className="stack">
            <h1 className="content-page__notice-title">Page not found</h1>
            <p className="content-page__prose">
              This page may have been moved, renamed, or not published yet.
            </p>
            <Link className="label content-page__back" to="/">
              Back to the gallery
            </Link>
          </div>
        )}

        {state === "ready" && page && (
          <article>
            <nav aria-label="Breadcrumb" className="content-page__crumbs">
              <ol className="row label label--quiet row--wrap">
                <li>
                  <Link className="quiet-link" to="/">
                    {settings.shortName}
                  </Link>
                </li>
                <li aria-hidden className="row">
                  <HugeiconsIcon icon={ArrowRight01Icon} size={11} />
                </li>
                <li
                  aria-current="page"
                  className="row content-page__crumb-current"
                >
                  {Icon && <HugeiconsIcon icon={Icon} size={11} />}
                  {page.title}
                </li>
              </ol>
            </nav>

            <h1 className="content-page__title">{page.title}</h1>

            {page.status === "draft" && (
              <p className="label content-page__draft">
                Draft — only visible to signed-in admins
              </p>
            )}

            <PageContent doc={page.content} />
          </article>
        )}
      </main>

      <footer className="hairline content-page__footer">
        <p className="label label--quiet">
          © {new Date().getFullYear()} {settings.ownerName}
        </p>
      </footer>
    </div>
  );
}
