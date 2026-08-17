import { useEffect } from "react";
import type { TextStyle } from "../../config/textStyle";
import { loadFont } from "../theme/fonts";

/**
 * Fetches the stylesheet for whichever family a text item is set in.
 *
 * The site's own font is loaded at boot because the whole page is set in it. A
 * board's text is different: one item might be Fraunces on a board where
 * nothing else is, and loading all ten families in case is ten stylesheets
 * nobody asked for. So each item asks for its own, and `loadFont` collapses the
 * repeats — a board of forty Inter headings makes one request.
 *
 * Deliberately used at the point the text is *rendered* rather than where it is
 * chosen, so a published board a visitor is only reading gets its fonts too.
 * Without a font the stack falls through to the surface's sans, which is not
 * "unstyled" but is silently the wrong typeface.
 */
export const useTextFont = (style: TextStyle | null | undefined): void => {
  const family = style?.family ?? null;
  useEffect(() => {
    if (family) {
      void loadFont(family);
    }
  }, [family]);
};
