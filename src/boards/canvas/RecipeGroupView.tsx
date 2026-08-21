import type { BoardItem } from "../../types";
import {
  groupBounds,
  groupIdsOf,
  hasNewerVersion,
  type UseVersions,
  versionLabel,
} from "../geometry/recipeGroup";
import "./RecipeGroupView.css";

/**
 * The outline around the nodes a recipe put on the board.
 *
 * A recipe expands into ordinary items rather than staying a box, which is what
 * makes everything else work — results, versions, comments, export and the run
 * loop all keep operating on plain nodes, and a board built on version 1 keeps
 * behaving as version 1 because it holds the real thing. The cost is that a
 * placed recipe would otherwise be indistinguishable from four nodes somebody
 * happened to draw. This is what says otherwise.
 *
 * The boundary is *computed* from wherever the members currently sit, never
 * stored. Drag a node out of the cluster and the outline follows it, because
 * the outline was never the truth — the tag on each item is. That also means
 * there is nothing to keep in sync and nothing to repair.
 *
 * Drawn behind everything, in canvas units, inside the transformed layer: it is
 * part of the arrangement rather than chrome, so it must zoom and pan with the
 * nodes it describes.
 */

export interface RecipeGroupViewProps {
  items: BoardItem[];
  uses: (UseVersions & {
    id: string;
    recipeId: string | null;
    recipeName: string | null;
  })[];
}

export function RecipeGroupView({ items, uses }: RecipeGroupViewProps) {
  // Driven by what is on the board rather than by the list of uses: a use whose
  // every node has been deleted should stop being outlined, and groupBounds
  // returning null is exactly that case.
  const present = new Set(groupIdsOf(items));

  return (
    <>
      {uses
        .filter((use) => present.has(use.id))
        .map((use) => {
          const bounds = groupBounds(items, use.id);
          if (!bounds) {
            return null;
          }
          const stale = hasNewerVersion(use);
          return (
            <div
              className={`recipe-group ${stale ? "recipe-group--stale" : ""}`}
              key={use.id}
              style={{
                height: bounds.height,
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                // Behind every item. A recipe group is a backdrop, and one
                // drawn over its own nodes would swallow every click in it.
                zIndex: 0,
              }}
            >
              <span
                className={`recipe-group__label ${
                  stale ? "recipe-group__label--stale" : ""
                }`}
              >
                {use.recipeName ?? "Recipe"} · {versionLabel(use)}
              </span>
            </div>
          );
        })}
    </>
  );
}
