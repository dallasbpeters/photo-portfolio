/**
 * Where a recipe group's boundary is drawn, and whether it is out of date.
 *
 * Pure geometry over plain data — no React import, no DOM read — so it can be
 * tested without mounting a canvas, which is the module discipline
 * docs/canvas-wave-0.md sets for this directory.
 *
 * A group is not a container. Placing a recipe expands it into ordinary board
 * items that happen to share a `recipeUseId`, so the boundary below is not
 * stored: it is *computed* from wherever those items currently sit. Drag one
 * node out of the cluster and the outline follows it, because the outline was
 * never the truth — the tag on each item is.
 */

/** The part of a board item this module needs. */
export interface GroupItem {
  height: number;
  id: string;
  recipeUseId?: string | null;
  width: number;
  x: number;
  y: number;
}

export interface GroupBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

/**
 * How much air the outline leaves around the nodes, in canvas units.
 *
 * Enough that the boundary reads as containing them rather than touching them,
 * and enough to hang the group's name and version off the top edge without it
 * colliding with the first node's own chrome.
 */
export const GROUP_PADDING = 32;

/**
 * The box around every item carrying this use id, or null when none do.
 *
 * Null rather than a zero-sized box on purpose: "there is nothing to outline"
 * and "there is something, of no size" are different, and a caller that renders
 * the second draws a dot in the corner of the canvas.
 */
export const groupBounds = (
  items: readonly GroupItem[],
  recipeUseId: string,
  padding = GROUP_PADDING
): GroupBounds | null => {
  const members = items.filter((item) => item.recipeUseId === recipeUseId);
  if (members.length === 0) {
    return null;
  }
  const left = Math.min(...members.map((item) => item.x));
  const top = Math.min(...members.map((item) => item.y));
  const right = Math.max(...members.map((item) => item.x + item.width));
  const bottom = Math.max(...members.map((item) => item.y + item.height));
  return {
    height: bottom - top + padding * 2,
    width: right - left + padding * 2,
    x: left - padding,
    y: top - padding,
  };
};

/** Every distinct use id present on a board, in first-seen order. */
export const groupIdsOf = (items: readonly GroupItem[]): string[] => [
  ...new Set(
    items
      .map((item) => item.recipeUseId)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  ),
];

export interface UseVersions {
  /** Null once the recipe itself has been deleted — FR-009. */
  latestVersion: number | null;
  pinnedVersion: number;
}

/**
 * Whether a newer version of the recipe exists.
 *
 * The board is never quietly moved onto it (FR-005): a group built on v1 keeps
 * behaving as v1 because it holds real nodes, and this only decides whether to
 * say so. A deleted recipe has no newer version — it has no version at all — so
 * the group goes on working and stops offering an upgrade.
 */
export const hasNewerVersion = (use: UseVersions): boolean =>
  use.latestVersion !== null && use.latestVersion > use.pinnedVersion;

/**
 * What the group's label says about its version.
 *
 * A sentence rather than a flag because all three states are worth
 * distinguishing on the canvas, and a boolean would collapse the last two.
 */
export const versionLabel = (use: UseVersions): string => {
  if (use.latestVersion === null) {
    return `v${use.pinnedVersion} · recipe deleted`;
  }
  if (use.latestVersion > use.pinnedVersion) {
    return `v${use.pinnedVersion} · v${use.latestVersion} available`;
  }
  return `v${use.pinnedVersion}`;
};
