import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isNodeTypeId } from "../../../config/nodeTypes.js";
import { recipeGraphIsPlaceable } from "../../../config/recipes.js";
import { getBearerUser } from "../../_lib/auth.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import { parseJsonBody } from "../../_lib/parseBody.js";
import { loadRecipeVersion, versionContent } from "../../_lib/recipeStore.js";
import { expandRecipeGraph } from "../../_lib/recipes.js";

/**
 * Drops a recipe onto a board, as real nodes and real wires.
 *
 * This is the whole reason a recipe is stored as a stencil rather than as a
 * node that runs its own subgraph: generation budgets 120s per image in
 * api/_lib/fal.ts against the serverless ceiling, so POST /api/boards/:id/run
 * runs exactly one node per request and the browser walks the order. Expansion
 * puts the work back on that path instead of asking for a call the platform
 * does not allow.
 *
 * It also makes three promises free rather than enforced. The board now holds
 * ordinary items, so it keeps behaving as the version it was built with, it
 * survives the recipe being deleted, and an interrupted run keeps the steps it
 * already paid for — each node owns its own result.
 *
 * Writes go out as one statement each, as in api/boards/[id].ts when it
 * replaces a board: the HTTP driver has no multi-statement batch. The set is
 * bounded — MAX_RECIPE_NODES caps it at forty nodes plus their wires — so they
 * are sent together rather than one after another.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const recipeId = typeof req.query.id === "string" ? req.query.id : "";
  if (!recipeId) {
    return res.status(404).json({ error: "Not found" });
  }

  const body = parseJsonBody(req.body);
  const boardId = typeof body.boardId === "string" ? body.boardId : "";
  if (!boardId) {
    return res.status(422).json({ error: "A board is needed to place onto" });
  }
  // Clamped rather than refused, the rule for every continuous value that
  // arrives from a client. expandRecipeGraph clamps again against the canvas
  // bounds so the whole group lands on the board.
  const x = Number.isFinite(Number(body.x)) ? Number(body.x) : 0;
  const y = Number.isFinite(Number(body.y)) ? Number(body.y) : 0;

  const sql = getSql();
  try {
    const recipes = (await sql`
      SELECT id, name, current_version_id FROM recipes WHERE id = ${recipeId}
    `) as { current_version_id: string | null; id: string; name: string }[];
    const [recipe] = recipes;
    if (!recipe?.current_version_id) {
      return res.status(404).json({ error: "Not found" });
    }
    const boards = (await sql`
      SELECT id FROM boards WHERE id = ${boardId}
    `) as { id: string }[];
    if (boards.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    const versionRow = await loadRecipeVersion(sql, recipe.current_version_id);
    if (!versionRow) {
      return res.status(404).json({ error: "Not found" });
    }
    const { graph, declaredInputs, version } = versionContent(versionRow);

    /* Refused rather than placed broken. A node type can be removed from the
       registry between saving a recipe and using it, and a board holding a node
       nobody can run is worse than a placement that did not happen — it looks
       like a recipe that works until the moment it is run. */
    const placeable = recipeGraphIsPlaceable(graph, isNodeTypeId);
    if (!placeable.ok) {
      return res.status(409).json({
        error: `This recipe uses a node this version of the app no longer has: ${placeable.missing.join(", ")}.`,
        missing: placeable.missing,
      });
    }

    const useId = crypto.randomUUID();
    const { items, wires } = expandRecipeGraph(graph, useId, { x, y }, () =>
      crypto.randomUUID()
    );

    // Stacked above whatever is already there, so a dropped recipe is not
    // hidden behind the arrangement it was dropped onto.
    const tops = (await sql`
      SELECT COALESCE(MAX(z_index), 0) AS top FROM board_items WHERE board_id = ${boardId}
    `) as { top: number | string }[];
    const baseZ = Number(tops[0]?.top ?? 0) + 1;

    await sql`
      INSERT INTO recipe_uses (id, board_id, recipe_id, recipe_version_id, pinned_version)
      VALUES (${useId}, ${boardId}, ${recipe.id}, ${versionRow.id}, ${version})
    `;

    await Promise.all(
      items.map(
        (item, index) => sql`
        INSERT INTO board_items (
          id, board_id, kind, node_type, config,
          x, y, width, height, z_index, recipe_use_id
        ) VALUES (
          ${item.id}, ${boardId}, 'op', ${item.nodeType},
          ${JSON.stringify(item.config)}::jsonb,
          ${item.x}, ${item.y}, ${item.width}, ${item.height},
          ${baseZ + index}, ${useId}
        )
      `
      )
    );

    // Awaited separately: a wire names two items, so every item has to be in
    // the table before the first wire is offered to it.
    await Promise.all(
      wires.map(
        (wire) => sql`
        INSERT INTO board_wires (
          id, board_id, source_item_id, source_port, target_item_id, target_port
        ) VALUES (
          ${wire.id}, ${boardId}, ${wire.sourceItemId}, ${wire.sourcePort},
          ${wire.targetItemId}, ${wire.targetPort}
        )
      `
      )
    );

    return res.status(201).json({
      declaredInputs: declaredInputs.map((input) => ({
        ...input,
        // Resolved to the id that was actually minted, so the canvas can point
        // at the port the person has to wire without re-deriving the mapping.
        itemId:
          items.find((_, i) => graph.nodes[i]?.key === input.nodeKey)?.id ??
          null,
      })),
      items,
      recipeUse: {
        id: useId,
        latestVersion: version,
        pinnedVersion: version,
        recipeId: recipe.id,
        recipeName: recipe.name,
      },
      wires,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not place that recipe" });
  }
}
