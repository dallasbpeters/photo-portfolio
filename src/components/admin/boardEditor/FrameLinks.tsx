import { useState } from "react";
import { toast } from "sonner";
import { frameSlugs } from "../../../../config/frameSlug";
import type { BoardItem } from "../../../types";
import { Button } from "../../ui/button";
import "./boardEditorChrome.css";

/**
 * Every frame's shareable link, in the header beside the board's own.
 *
 * Two earlier attempts put this on the frame itself and both failed for reasons
 * that are properties of what a frame *is*. An icon beside the name did not
 * cancel the canvas zoom, so at a working zoom of 30% it was a seven-pixel
 * square. Labelling it and counter-scaling it fixed the size and not the real
 * problem: a frame is a backdrop drawn *behind* the items on it, so anything
 * overlapping its corner covers the title row — on a real board, a photograph
 * sat on top of the button and swallowed the click.
 *
 * The header is never covered, never scaled, and is where somebody already looks
 * for a link, because the board's own is three inches to the left.
 *
 * Only rendered once the board is published: before that there is no public URL
 * and so no link to give.
 */

export interface FrameLinksProps {
  /** The board's own public URL. Null while unpublished. */
  boardUrl: string | null;
  items: BoardItem[];
}

export function FrameLinks({ boardUrl, items }: FrameLinksProps) {
  const [open, setOpen] = useState(false);
  const frames = items.filter((item) => item.kind === "frame");

  if (!boardUrl || frames.length === 0) {
    return null;
  }

  // The same function the public page resolves with, so a copied link opens the
  // frame it names. Two implementations of this is how that stops being true.
  const slugs = frameSlugs(
    frames.map((frame) => ({ id: frame.id, name: frame.body }))
  );

  const copy = async (href: string) => {
    try {
      await navigator.clipboard.writeText(href);
      toast.success("Frame link copied");
    } catch {
      // Not secret, so showing it beats failing silently.
      toast.message(href);
    }
  };

  return (
    <span className="frame-links">
      <Button
        onClick={() => setOpen((was) => !was)}
        type="button"
        variant="ghost"
      >
        Frames ({frames.length})
      </Button>
      {open ? (
        <>
          {/* Click-away, under the menu and above everything else. */}
          <button
            aria-label="Close"
            className="frame-links__scrim"
            onClick={() => setOpen(false)}
            type="button"
          />
          <ul className="frame-links__menu">
            {frames.map((frame) => {
              const href = `${boardUrl}/${slugs.get(frame.id)}`;
              return (
                <li key={frame.id}>
                  <button
                    className="frame-links__row"
                    onClick={() => void copy(href)}
                    title={href}
                    type="button"
                  >
                    <span className="frame-links__name">
                      {frame.body?.trim() || "Untitled frame"}
                    </span>
                    <span className="frame-links__copy">Copy link</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </span>
  );
}
