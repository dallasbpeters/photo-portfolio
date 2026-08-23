/**
 * A frame's own address on a published board.
 *
 * A published board is one wide canvas, and the interesting thing on it is
 * usually a *group* — the five logo studies, the deck mockups — which is what a
 * frame already is. Giving each frame a URL turns one board into as many
 * shareable views as it has frames, without duplicating anything: the frame is
 * still a rectangle on the same board, and this is only a name for it.
 *
 * Built from the frame's own name so the link reads like the thing it opens.
 * Names are typed by hand, so they collide, repeat and go missing — all three
 * are handled here rather than by asking somebody to keep them unique.
 *
 * Kept in config/ and dependency-free: the page resolves a slug to a frame and
 * a share button builds one, and the two must agree exactly or a shared link
 * opens the wrong group.
 */

/** Anything that is not a letter, a digit or a dash. */
const NOT_SLUGGABLE = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

/**
 * How much of a name a slug keeps.
 *
 * Long enough for a real title, short enough that a URL stays readable when it
 * is pasted into a message.
 */
const MAX_SLUG = 48;

/**
 * One name, as a URL segment.
 *
 * Returns "" for a name with nothing sluggable in it — an untitled frame, or one
 * named only in a script this regex does not cover. The caller substitutes the
 * id, because a frame with no usable name still deserves an address.
 */
export const slugifyName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(NOT_SLUGGABLE, "-")
    .replace(EDGE_DASHES, "")
    .slice(0, MAX_SLUG)
    .replace(EDGE_DASHES, "");

/** A frame, as much of one as an address needs. */
export interface SluggableFrame {
  id: string;
  /** The typed name. Frames keep theirs in `body`. */
  name: string | null;
}

/**
 * The first eight characters of an id, as a fallback and a disambiguator.
 *
 * Eight is plenty: these are uuids, and a board with two frames whose first
 * eight hex digits match is not a board anybody has.
 */
const shortId = (id: string): string =>
  id.replace(/-/g, "").slice(0, 8).toLowerCase();

/**
 * Every frame's slug, guaranteed distinct within one board.
 *
 * Order matters and is the frames' own: the first frame to claim a name keeps
 * the clean slug, and later ones carrying the same name get their id appended.
 * That way a link shared today keeps working when a second frame is named the
 * same tomorrow — the *new* frame is the one that gets the uglier address.
 *
 * A map rather than a function per frame, because uniqueness is a property of
 * the set. Asking "what is this frame's slug" one frame at a time cannot answer
 * it.
 */
export const frameSlugs = (
  frames: readonly SluggableFrame[]
): Map<string, string> => {
  const taken = new Set<string>();
  const slugs = new Map<string, string>();
  for (const frame of frames) {
    const base = slugifyName(frame.name ?? "");
    // An unnamed frame is addressed by id alone. Not "frame-2": a position is
    // not an identity, and inserting one above it would move every link.
    let slug = base || shortId(frame.id);
    if (taken.has(slug)) {
      slug = `${slug}-${shortId(frame.id)}`;
    }
    // Two frames with the same name *and* the same short id cannot happen, but
    // a name that is already exactly some other frame's short id can — so the
    // loop is not decoration.
    while (taken.has(slug)) {
      slug = `${slug}-${slugs.size + 1}`;
    }
    taken.add(slug);
    slugs.set(frame.id, slug);
  }
  return slugs;
};

/**
 * The frame a slug names, or null.
 *
 * Tolerant of the id being pasted in place of the slug: an id is what an older
 * link or a copied selection is likely to carry, and refusing it would be
 * refusing a link that unambiguously identifies a frame.
 */
export const frameForSlug = (
  frames: readonly SluggableFrame[],
  slug: string
): SluggableFrame | null => {
  const wanted = slug.trim().toLowerCase();
  if (!wanted) {
    return null;
  }
  const slugs = frameSlugs(frames);
  for (const frame of frames) {
    if (slugs.get(frame.id) === wanted) {
      return frame;
    }
  }
  return (
    frames.find(
      (frame) =>
        frame.id.toLowerCase() === wanted || shortId(frame.id) === wanted
    ) ?? null
  );
};
