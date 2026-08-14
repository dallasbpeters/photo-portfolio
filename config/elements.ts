/**
 * What an element may hold.
 *
 * Shared by the endpoint that enforces these and the panel that has to say so
 * before anything is saved. Kept here rather than in api/_lib because a limit
 * only the server knows about is a limit the person hits by surprise: the
 * selection that made a 53-picture element was silently kept as 24, with the
 * chosen key image among the ones dropped.
 */

/**
 * An element is a handful of pictures, not an archive.
 *
 * Bounded because every one is fetched and copied into our own storage when the
 * element is saved, and because a "style" made of eighty images is a board that
 * has been filed in the wrong place.
 */
export const MAX_ELEMENT_IMAGES = 24;

export const MAX_ELEMENT_NAME = 120;

/** An Analyse node's reading of a set of references, not an essay. */
export const MAX_ELEMENT_DESCRIPTION = 2000;
