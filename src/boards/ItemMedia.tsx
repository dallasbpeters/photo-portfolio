import { useState } from "react";
import { optimizedImageSrc } from "../components/OptimizedImage";
import type { BoardItem } from "../types";
import { useAutoplay } from "./autoplayPref";
import { grownBucket, wantedWidth } from "./imageBucket";
import { isVideoUrl } from "./isVideo";
import { currentImageUrl } from "./itemOutput";

/**
 * The picture — or the clip — a canvas item shows.
 *
 * Its own file because a video is not a one-line variation on an `<img>`: it
 * carries its own playback rules, and inlining both branches pushed
 * BoardItemView back over the size ceiling it had just come under.
 */
/**
 * What the item currently shows: what a tool made of it, or its own picture.
 *
 * Imported rather than restated. The wires had their own copy of this rule that
 * had never been corrected, so an edited photograph drew correctly here and
 * handed its untouched original to whatever it fed.
 */
const shownUrl = currentImageUrl;

/**
 * The width to request for an item currently this wide.
 *
 * Kept as state that only ever grows. The width changes every frame of a drag,
 * so requesting it directly would ask for a new image constantly; bucketing
 * holds the request still within a rung, and the ratchet stops a shrink from
 * swapping a decoded image for a pending one — the flicker that kept this
 * canvas on full-size originals.
 *
 * Adjusted during render rather than in an effect. React re-runs the component
 * immediately without committing, so the larger image is asked for in the same
 * pass; an effect would paint one frame at the old size first.
 */
const useImageBucket = (boxWidth: number): number => {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const next = wantedWidth(boxWidth, dpr);
  const [bucket, setBucket] = useState(next);
  if (next > bucket) {
    setBucket(next);
  }
  return grownBucket(bucket, next);
};

export function ItemMedia({
  isIcon,
  item,
}: {
  /** Icons are fitted rather than cropped; a glyph cut in half is not an icon. */
  isIcon: boolean;
  item: BoardItem;
}) {
  const playing = useAutoplay();
  // Before the video branch below, because that branch returns early and a hook
  // called after it would run on some renders and not others. Videos are not
  // put through the image optimizer, so the bucket simply goes unused there.
  const bucket = useImageBucket(item.width);
  const url = shownUrl(item);
  if (isVideoUrl(url)) {
    // Muted and looping because a board holds a dozen of these at once and one
    // of them shouting is the wrong kind of surprise; `playsInline` stops iOS
    // taking it fullscreen the moment it starts. Controls are deliberately
    // absent — the item is dragged and resized like any other, and a control
    // bar would swallow those gestures.
    //
    // Whether they start on their own is a viewing preference, not a property
    // of the board — see autoplayPref. Stopped, a clip still shows its first
    // frame, which `#t=0.1` is what makes appear: asked for frame zero several
    // browsers render nothing at all until the video is played.
    //
    // Sized from the item, as the image below is: without width and height a
    // video reports its own intrinsic 300×150 until metadata loads, and the
    // box is measured against that in the meantime.
    return (
      <video
        autoPlay={playing}
        className="h-full w-full object-cover"
        height={item.height}
        loop
        muted
        playsInline
        preload="metadata"
        src={playing ? (url ?? "") : `${url ?? ""}#t=0.1`}
        width={item.width}
      >
        <track kind="captions" />
      </video>
    );
  }
  // Lazy and async because a board is mostly off screen. A decoded 1024-square
  // bitmap is four megabytes whether or not it is in view, and a board of a
  // hundred results was decoding all of them at once — felt as the canvas
  // bogging down rather than as anything to do with pictures.
  return (
    <img
      alt=""
      className={`h-full w-full ${isIcon ? "object-contain" : "object-cover"}`}
      decoding="async"
      draggable={false}
      height={item.height}
      loading="lazy"
      src={optimizedImageSrc(url ?? "", bucket)}
      width={item.width}
    />
  );
}
