import { useEffect, useRef, useState } from "react";
import {
  HalftoneError,
  halftoneOptionsFrom,
  loadImage,
  paintHalftone,
} from "./halftoneGl";
import "./HalftonePreview.css";

/**
 * The halftone, drawn on the node as soon as a picture is wired in.
 *
 * A Halftone node used to show nothing until it had been run: it is an op node
 * with a capability, so it wore a Run button and sat blank until somebody
 * pressed it. That is right for a node that calls a model and costs money, and
 * wrong for this one. Nothing here is generated and nothing is paid for.
 *
 * The same shader the export uses, from one definition — see halftoneGl —
 * because a preview drawn a second way is a preview that can disagree with the
 * file, and that has already happened here more than once.
 *
 * Running it still matters, for a different reason: a run renders this to a
 * file and uploads it, which is what gives the node an output another node can
 * read. Seeing it and handing it on are separate jobs.
 */

/** Past this a preview costs more than the glance it is worth. */
const MAX_PIXEL_RATIO = 1.5;

export interface HalftonePreviewProps {
  config: Record<string, unknown>;
  /** How many pictures are wired in, counted the way the run counts them. */
  imageCount?: number;
  /** The picture on the node's image input, or null while nothing is wired. */
  imageUrl?: string | null;
}

export function HalftonePreview({
  config,
  imageCount,
  imageUrl,
}: HalftonePreviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  /*
   * The settings as four primitives rather than an object.
   *
   * The config arrives rebuilt on every render of the board, so an effect that
   * depended on it would redraw — reloading the picture and recompiling the
   * shader — every time anything else on the canvas moved.
   */
  const { dot, gamma, ink, paper } = halftoneOptionsFrom(config);

  useEffect(() => {
    if (!imageUrl) {
      return;
    }
    let live = true;
    setFailed(null);
    loadImage(imageUrl)
      .then((image) => {
        // Read here rather than when the effect ran: the picture loads
        // asynchronously and the node may have gone in the meantime.
        const box = canvas.current;
        if (!(live && box)) {
          return;
        }
        const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        box.width = Math.max(1, Math.round(box.clientWidth * ratio));
        box.height = Math.max(1, Math.round(box.clientHeight * ratio));
        // The pitch is in output pixels, so it follows the device ratio — or a
        // retina preview draws dots at half the size the file will carry.
        paintHalftone(box, image, { dot: dot * ratio, gamma, ink, paper });
      })
      .catch((err: unknown) => {
        if (live) {
          setFailed(
            err instanceof HalftoneError ? err.message : "It would not draw."
          );
        }
      });
    return () => {
      live = false;
    };
  }, [dot, gamma, imageUrl, ink, paper]);

  if (!imageUrl) {
    return (
      <p className="halftone-preview__empty">
        Wire a picture into this node and it draws straight away.
      </p>
    );
  }

  return (
    <div className="halftone-preview">
      <canvas className="halftone-preview__canvas" ref={canvas} />
      {failed ? <p className="halftone-preview__failed">{failed}</p> : null}
      {(imageCount ?? 1) > 1 ? (
        <p className="halftone-preview__count">
          {imageCount} pictures · showing the first
        </p>
      ) : null}
    </div>
  );
}
