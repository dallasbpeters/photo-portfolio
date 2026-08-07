import { Link } from 'react-router-dom';
import * as Icons from 'iconoir-react';
import type { PageSummary } from '../services/portfolioService';

/**
 * Resolves an Iconoir component by name, since the icon is stored as free text
 * in the database and may not match anything in the pack.
 */
export const resolveIcon = (name: string | null | undefined) => {
  if (!name) return null;
  const pack = Icons as unknown as Record<string, React.ComponentType<{ width?: number; height?: number }>>;
  return pack[name] ?? null;
};

interface SiteNavProps {
  pages: PageSummary[];
  /** Renders links muted over photography, or solid on a plain background. */
  variant?: 'overlay' | 'solid';
}

/**
 * Page links, sitting directly beneath the site wordmark.
 *
 * Renders nothing when there are no published pages, so a site that never adds
 * one looks exactly as it did before the CMS existed.
 */
export function SiteNav({ pages, variant = 'overlay' }: SiteNavProps) {
  if (pages.length === 0) return null;

  const base =
    variant === 'overlay'
      ? 'text-white/50 hover:text-white'
      : 'text-white/40 hover:text-white';

  return (
    <nav className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Pages">
      {pages.map((page) => {
        const Icon = resolveIcon(page.icon);
        return (
          <Link
            key={page.id}
            to={`/${page.slug}`}
            className={`group flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors duration-300 ${base}`}
          >
            {Icon && <Icon width={12} height={12} />}
            <span className="relative">
              {page.title}
              <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-current transition-all duration-300 group-hover:w-full" />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
