import { createContext, type ReactNode, useContext } from "react";
import { frameSlugs } from "../../config/frameSlug";
import type { BoardItem } from "../types";

/**
 * What a frame can do besides sit there: be opened, and be linked to.
 *
 * A context rather than props, and the reason is the shape of what is being
 * asked. The frame's title is the only part of it that takes a pointer, which
 * puts the handle six levels down — page, canvas, item view, item content, frame
 * body — and neither the canvas nor the item view has any opinion about what
 * opening a frame *means*. Threading callbacks through them would have made two
 * of the largest files in the project grow to carry something they do not use.
 *
 * Both halves are optional and they are supplied in different places, which is
 * the point:
 *
 *   the editor    — a link, once the board is published, because that is where
 *                   somebody is standing when they want to share a group
 *   the public page — both, since a visitor can open one and pass it on
 *
 * A frame with neither is the ordinary case: an unpublished board, where the
 * name is simply a field to type in.
 */

/** A trailing slash on the board URL, which would double up on the join. */
const TRAILING_SLASH = /\/$/;

interface FrameActions {
  /** The absolute URL of a frame, or null when the board is not published. */
  linkFor?: (frameId: string) => string | null;
  /** Opens the frame as its own view. */
  open?: (frameId: string) => void;
}

const FrameContext = createContext<FrameActions>({});

export function FrameOpenProvider({
  children,
  linkFor,
  onOpenFrame,
}: {
  children: ReactNode;
  linkFor?: (frameId: string) => string | null;
  onOpenFrame?: (frameId: string) => void;
}) {
  return (
    <FrameContext.Provider value={{ linkFor, open: onOpenFrame }}>
      {children}
    </FrameContext.Provider>
  );
}

/** What this frame can do. Empty on an unpublished board in the editor. */
export const useFrameActions = (): FrameActions => useContext(FrameContext);

/**
 * A frame's public URL, given the board's own.
 *
 * Shared by the editor and the published page so the link a frame offers is the
 * one the page resolves — `frameSlugs` is what guarantees they agree, and
 * computing it in two places with two different rules is how a copied link ends
 * up opening the wrong group.
 *
 * Null when the board has no public URL, which is what makes the copy button
 * disappear on an unpublished board rather than offering a link that 404s.
 */
export const frameLink = (
  boardUrl: string | null,
  items: BoardItem[],
  frameId: string
): string | null => {
  if (!boardUrl) {
    return null;
  }
  const slug = frameSlugs(
    items
      .filter((item) => item.kind === "frame")
      .map((frame) => ({ id: frame.id, name: frame.body }))
  ).get(frameId);
  return slug ? `${boardUrl.replace(TRAILING_SLASH, "")}/${slug}` : null;
};
