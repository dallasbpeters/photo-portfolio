import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Download01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import type { BoardItemVariation } from "../../types";
import { downloadImage } from "../downloadImage";
import "./ResultImages.css";
import { isVideo } from "../isVideo";
import { BOARD_IMAGE_TYPE } from "../itemOutput";

/**
 * What a node produced, and the gallery of everything it has produced before.
 *
 * Its own file because it is the largest self-contained part of a node: it
 * neither reads the node's settings nor writes them, and lifting it is what
 * kept OpNodeView under the size ceiling when video rendering arrived.
 */

/**
 * Starts dragging a result off the node.
 *
 * A version sitting in a node's gallery is one of several; pulling one onto the
 * canvas is how it becomes a thing in its own right — pinned where you put it,
 * and able to feed something else without dragging the whole node along.
 *
 * The URL travels as a board-specific type so the canvas can tell it from a
 * file drop, and as text/uri-list as well, so dropping it into another
 * application still hands over something meaningful.
 */
const beginImageDrag = (
  e: React.DragEvent,
  image: BoardItemVariation
): void => {
  // The canvas would otherwise read the press underneath as "pick this node up
  // and move it", leaving the node adrift when the drag ends elsewhere.
  e.stopPropagation();
  e.dataTransfer.effectAllowed = "copy";
  e.dataTransfer.setData(BOARD_IMAGE_TYPE, JSON.stringify(image));
  e.dataTransfer.setData("text/uri-list", image.url);
  e.dataTransfer.setData("text/plain", image.url);
};

/**
 * What a node produced: one image, or a batch laid out as a grid.
 *
 * A grid because comparing them is the entire reason for asking for several.
 */
export function ResultImages({
  images,
  onRemove,
  onSelect,
  onSendAll,
  selected,
}: {
  images: BoardItemVariation[];
  /** Deletes one version for good. Absent on a published board. */
  onRemove?: (index: number) => void;
  onSelect: (index: number) => void;
  /** Pins every version onto the board as its own image. */
  onSendAll?: () => void;
  selected: number;
}) {
  if (images.length === 0) {
    return null;
  }
  const hero = images[Math.min(selected, images.length - 1)] ?? images[0];

  return (
    <div className="result-images">
      {hero ? (
        <div className="result-images__hero">
          {isVideo(hero) ? (
            // Muted and looping, because a node's result sits on a board next
            // to a dozen others: a clip that plays sound on hover is the
            // wrong kind of surprise. `playsInline` keeps iOS from taking it
            // fullscreen the moment it starts.
            <video
              className="result-images__media"
              controls
              draggable
              loop
              muted
              onDragStart={(e) => beginImageDrag(e, hero)}
              onPointerDown={(e) => e.stopPropagation()}
              playsInline
              preload="metadata"
              src={hero.url}
            >
              <track kind="captions" />
            </video>
          ) : (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: dragstart is the browser's own drag affordance on an image, not a bespoke click handler — the picture is also reachable via the download button beside it
            <img
              alt={hero.description ?? "Result"}
              className="result-images__media"
              decoding="async"
              draggable
              height={hero.height ?? undefined}
              loading="lazy"
              onDragStart={(e) => beginImageDrag(e, hero)}
              src={hero.url}
              width={hero.width ?? undefined}
            />
          )}
          {/* Saving the picture is the point of having made it, and there was
              no way to get one off the board short of a right-click. Sits on
              the image rather than in the footer so it always refers to the
              version being looked at. */}
          <button
            aria-label="Download this version"
            className="result-images__save"
            onClick={() => {
              void downloadImage(hero.url, hero.description ?? "generated");
            }}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <HugeiconsIcon icon={Download01Icon} size={13} />
          </button>
        </div>
      ) : null}

      {/* The gallery: everything this node has made, not just the last one.
          Shown from the first image rather than the second, so it is visibly
          the place versions collect instead of appearing only once there
          happen to be two. */}
      {images.length > 0 ? (
        <div className="result-images__gallery">
          <div className="result-images__bar">
            <p className="result-images__count">
              {images.length === 1 ? "1 version" : `${images.length} versions`}
            </p>
            {/* Getting the whole set onto the board at once: a node's gallery
                is for comparing, and the moment you have chosen you usually
                want them out where they can be arranged. */}
            {onSendAll ? (
              <button
                className="result-images__send"
                onClick={onSendAll}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                Send to board
              </button>
            ) : null}
          </div>
          <div className="result-images__strip">
            {images.map((variation, index) => (
              <div className="result-images__version" key={variation.url}>
                <button
                  aria-label={`Version ${index + 1}`}
                  aria-pressed={index === selected}
                  className={`result-images__pick ${
                    index === selected ? "result-images__pick--chosen" : ""
                  }`}
                  onClick={() => onSelect(index)}
                  onPointerDown={(e) => e.stopPropagation()}
                  type="button"
                >
                  {isVideo(variation) ? (
                    // Its own first frame, rather than a generated poster: the
                    // browser decodes one frame for `preload="metadata"`, so
                    // the thumbnail costs a range request instead of a
                    // server-side render and a second file to store.
                    //
                    // The `#t=0.1` is what makes it appear. Asked for frame
                    // zero, several browsers show a blank canvas until the
                    // video is played — which is what a strip of mp4s in an
                    // <img> looked like: broken icons where pictures should be.
                    <video
                      className="result-images__thumb"
                      draggable
                      muted
                      onDragStart={(e) => beginImageDrag(e, variation)}
                      preload="metadata"
                      src={`${variation.url}#t=0.1`}
                    >
                      <track kind="captions" />
                    </video>
                  ) : (
                    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same — native image drag, and the surrounding button already carries the keyboard-reachable action
                    <img
                      alt={variation.description ?? `Version ${index + 1}`}
                      className="result-images__thumb"
                      draggable
                      height={48}
                      loading="lazy"
                      onDragStart={(e) => beginImageDrag(e, variation)}
                      src={variation.url}
                      width={48}
                    />
                  )}
                </button>
                {onRemove ? (
                  <button
                    aria-label={`Remove version ${index + 1}`}
                    className="result-images__remove"
                    onClick={() => onRemove(index)}
                    onPointerDown={(e) => e.stopPropagation()}
                    type="button"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={9} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
