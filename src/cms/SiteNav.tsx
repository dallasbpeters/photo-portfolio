import { HugeiconsIcon } from "@hugeicons/react";
import { NavLink } from "react-router-dom";
import type { PageSummary } from "../services/portfolioService";
import { ICON_COMPONENTS, type IconComponent } from "./iconMap";

/**
 * Resolves an icon's drawing data by name, since the icon is stored as free
 * text in the database and may not match anything in the pack.
 */
export const resolveIcon = (
  name: string | null | undefined
): IconComponent | null => {
  if (!name) {
    return null;
  }
  return ICON_COMPONENTS[name] ?? null;
};

interface SiteNavProps {
  pages: PageSummary[];
  /** Renders links muted over photography, or solid on a plain background. */
  variant?: "overlay" | "solid";
}

/**
 * Page links, sitting directly beneath the site wordmark.
 *
 * Renders nothing when there are no published pages, so a site that never adds
 * one looks exactly as it did before the CMS existed.
 */
export function SiteNav({ pages, variant = "overlay" }: SiteNavProps) {
  if (pages.length === 0) {
    return null;
  }

  const base =
    variant === "overlay"
      ? "text-white/90 hover:text-white"
      : "text-white/90 hover:text-white";

  return (
    <nav
      aria-label="Pages"
      className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2"
    >
      {pages.map((page) => {
        const Icon = resolveIcon(page.icon);
        return (
          <NavLink
            // The border stays on the box at all times and only changes
            // colour, so the row does not jump by two pixels as you move
            // between pages — dropping the border entirely would reflow it.
            className={({ isActive }) =>
              `group flex items-center gap-1.5 border-b-2 px-2 text-[0.9rem] text-shadow-2xs text-shadow-a-contrast leading-loose tracking-[0.2em] transition-colors duration-300 ${base} ${
                isActive ? "border-white" : "border-transparent"
              }`
            }
            key={page.id}
            to={`/${page.slug}`}
          >
            {Icon && <HugeiconsIcon icon={Icon} size={20} />}
            <span className="relative">
              {page.title}
              <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-current transition-all duration-300 group-hover:w-full" />
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
