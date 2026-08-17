import type { BoardItem } from "../types";
import { isVideoUrl } from "./isVideo";

/**
 * The picture — or the clip — a canvas item shows.
 *
 * Its own file because a video is not a one-line variation on an `<img>`: it
 * carries its own playback rules, and inlining both branches pushed
 * BoardItemView back over the size ceiling it had just come under.
 */
export function ItemMedia({
  isIcon,
  item,
}: {
  /** Icons are fitted rather than cropped; a glyph cut in half is not an icon. */
  isIcon: boolean;
  item: BoardItem;
}) {
  if (isVideoUrl(item.imageUrl)) {
    // Muted and looping because a board holds a dozen of these at once and one
    // of them shouting is the wrong kind of surprise; `playsInline` stops iOS
    // taking it fullscreen the moment it starts. Controls are deliberately
    // absent — the item is dragged and resized like any other, and a control
    // bar would swallow those gestures.
    //
    // Sized from the item, as the image below is: without width and height a
    // video reports its own intrinsic 300×150 until metadata loads, and the
    // box is measured against that in the meantime.
    return (
      <video
        autoPlay
        className="h-full w-full object-cover"
        height={item.height}
        loop
        muted
        playsInline
        preload="metadata"
        src={item.imageUrl ?? ""}
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
      src={item.imageUrl ?? ""}
      width={item.width}
    />
  );
}
