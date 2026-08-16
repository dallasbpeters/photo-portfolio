import type { ReactNode } from "react";

interface BrowserChromeProps {
  /** The screenshot. Rendered at full width so it can be read, not fitted. */
  children: ReactNode;
  /** Address drawn in the title bar. Display only — never a link. */
  url: string | null;
}

/**
 * A browser window drawn around a full-page screenshot.
 *
 * The title bar is pinned and the capture scrolls beneath it, which is the
 * whole point: a tall screenshot fitted to the viewport shrinks until none of
 * its text can be read, and one that scrolls with the page takes its own
 * address bar off screen. Pinning the bar keeps the frame legible at any
 * height while the image stays at full width.
 *
 * Deliberately not interactive. The traffic lights are decoration, so they are
 * `aria-hidden` rather than buttons that do nothing, and the address is plain
 * text rather than an anchor — it describes where the screenshot came from and
 * is not necessarily a resolvable URL.
 */
export function BrowserChrome({ children, url }: BrowserChromeProps) {
  return (
    <div className="flex max-h-[78vh] w-full flex-col overflow-hidden rounded-xl bg-[#2a2a2d] shadow-2xl ring-1 ring-white/10">
      <div className="flex shrink-0 items-center gap-3 border-white/8 border-b bg-[#3a3a3e] px-4 py-3">
        <div aria-hidden className="flex shrink-0 gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>

        {url ? (
          <div className="min-w-0 flex-1 rounded-md bg-[#2a2a2d] px-3 py-1.5">
            <p className="truncate text-center font-sans text-[11px] text-white/55 lowercase tracking-normal">
              {url}
            </p>
          </div>
        ) : null}

        {/* Balances the traffic lights so a url with no trailing control still
            reads as centred in the bar. */}
        <div aria-hidden className="w-[52px] shrink-0" />
      </div>

      {/* The scroll container. `overscroll-contain` stops a flick at the end of
          a long screenshot from scrolling the gallery behind the lightbox. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  );
}
