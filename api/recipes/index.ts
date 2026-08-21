import type { VercelRequest, VercelResponse } from "@vercel/node";
import { nodeTypeFor, type PortType } from "../../config/nodeTypes.js";
import {
  MAX_RECIPE_DESCRIPTION,
  MAX_RECIPE_NAME,
} from "../../config/recipes.js";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { sanitizeText } from "../_lib/httpUrl.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import {
  loadRecipes,
  nextVersionNumber,
  type RecipeRow,
  rowToRecipeDto,
} from "../_lib/recipeStore.js";
import {
  extractRecipeGraph,
  type TemplateItem,
  type TemplateWire,
} from "../_lib/recipes.js";

/**
 * The recipe library: what has been saved, and saving something new.
 *
 * Admin-only in both directions. A recipe library is a working library rather
 * than anything published, and the panel that reads it is behind the same door
 * as the board list — a public index would leak every recipe name, which is the
 * reasoning api/boards/index.ts already records.
 *
 * **The client sends item ids, never a graph.** The server reads the selected
 * items and the wires between them off the board itself. Accepting a template
 * from the browser would mean trusting its shape, its size and its node types,
 * and a forged one would be expanded into real rows on a later request — the
 * same reasoning api/boards/[id]/result.ts gives for building the result server
 * side rather than storing what the caller sent.
 */

type Sql = ReturnType<typeof getSql>;
type User = ReturnType<typeof getBearerUser>;

/** A port's declared type, so a declared input carries the right one. */
const portTypeOf = (nodeType: string | null, port: string): PortType | null =>
  nodeTypeFor(nodeType)?.inputs.find((input) => input.key === port)?.type ??
  null;

async function handleGet(sql: Sql, user: User, res: VercelResponse) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.status(200).json(await loadRecipes(sql));
}

/** Every item on the board, and every wire, as the pure module wants them. */
const loadSelection = async (sql: Sql, boardId: string) => {
  const items = (await sql`
    SELECT id, kind, node_type, config, x, y, width, height, run_state, recipe_use_id
    FROM board_items
    WHERE board_id = ${boardId}
  `) as {
    config: unknown;
    height: number | string;
    id: string;
    kind: string;
    node_type: string | null;
    recipe_use_id: string | null;
    run_state: string | null;
    width: number | string;
    x: number | string;
    y: number | string;
  }[];
  const wires = (await sql`
    SELECT source_item_id, source_port, target_item_id, target_port
    FROM board_wires
    WHERE board_id = ${boardId}
  `) as {
    source_item_id: string;
    source_port: string;
    target_item_id: string;
    target_port: string;
  }[];
  const num = (v: number | string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    items: items.map(
      (row): TemplateItem => ({
        config: row.config,
        height: num(row.height),
        id: row.id,
        kind: row.kind,
        nodeType: row.node_type,
        recipeUseId: row.recipe_use_id,
        runState: row.run_state,
        width: num(row.width),
        x: num(row.x),
        y: num(row.y),
      })
    ),
    wires: wires.map(
      (row): TemplateWire => ({
        sourceItemId: row.source_item_id,
        sourcePort: row.source_port,
        targetItemId: row.target_item_id,
        targetPort: row.target_port,
      })
    ),
  };
};

async function handlePost(
  sql: Sql,
  user: User,
  req: VercelRequest,
  res: VercelResponse
) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseJsonBody(req.body);
  const name =
    typeof body.name === "string"
      ? sanitizeText(body.name).slice(0, MAX_RECIPE_NAME)
      : "";
  // Refused rather than defaulted, exactly as an element is: a recipe is only
  // ever found again by its name, so an unnamed one is a row nobody will pick.
  if (!name) {
    return res.status(422).json({ error: "A recipe needs a name" });
  }
  const boardId = typeof body.boardId === "string" ? body.boardId : "";
  const itemIds = Array.isArray(body.itemIds)
    ? body.itemIds.filter((id): id is string => typeof id === "string")
    : [];
  if (!boardId || itemIds.length === 0) {
    return res
      .status(422)
      .json({ error: "Select something on a board to save first" });
  }

  const { items, wires } = await loadSelection(sql, boardId);
  const extracted = extractRecipeGraph(items, wires, itemIds, portTypeOf);
  if ("reason" in extracted) {
    // 422 rather than 400: the request is well-formed, the selection is not.
    return res
      .status(422)
      .json({ error: extracted.detail, reason: extracted.reason });
  }

  const description =
    typeof body.description === "string"
      ? body.description.trim().slice(0, MAX_RECIPE_DESCRIPTION)
      : "";

  const [recipe] = (await sql`
    INSERT INTO recipes (name, description, created_by)
    VALUES (${name}, ${description || null}, ${user.userId})
    RETURNING id, name, description, current_version_id, created_at, updated_at
  `) as RecipeRow[];

  const version = await nextVersionNumber(sql, recipe.id);
  const versions = (await sql`
    INSERT INTO recipe_versions (recipe_id, version, graph, declared_inputs, unverified)
    VALUES (
      ${recipe.id},
      ${version},
      ${JSON.stringify(extracted.graph)}::jsonb,
      ${JSON.stringify(extracted.declaredInputs)}::jsonb,
      ${extracted.unverified}
    )
    RETURNING id, recipe_id, version, graph, declared_inputs, unverified, created_at
  `) as { id: string }[];

  // Two statements rather than one: the HTTP driver has no transaction spanning
  // statements, so the recipe exists for a moment with no current version. That
  // is the harmless order — a recipe with no version is simply not placeable,
  // where a version pointing at no recipe would be an orphan.
  await sql`
    UPDATE recipes SET current_version_id = ${versions[0].id}, updated_at = NOW()
    WHERE id = ${recipe.id}
  `;

  return res.status(201).json({
    ...rowToRecipeDto(
      { ...recipe, current_version_id: versions[0].id },
      {
        created_at: new Date(),
        declared_inputs: extracted.declaredInputs,
        graph: extracted.graph,
        id: versions[0].id,
        recipe_id: recipe.id,
        unverified: extracted.unverified,
        version,
      }
    ),
    // Never silent about a wire that did not survive the move, for the same
    // reason an element reports a picture it could not copy.
    openInputs: extracted.openPorts,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  const sql = getSql();
  const user = getBearerUser(req.headers.authorization);
  try {
    if (req.method === "GET") {
      return await handleGet(sql, user, res);
    }
    if (req.method === "POST") {
      return await handlePost(sql, user, req, res);
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not load recipes" });
  }
}
