import type { VercelRequest, VercelResponse } from "@vercel/node";
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
  loadRecipeVersion,
  type RecipeRow,
  rowToRecipeDto,
} from "../_lib/recipeStore.js";

/**
 * One recipe: read it, rename it, or remove it from the library.
 *
 * Admin-only, and **404 rather than 403** for anything that is not the owner's
 * to see — confirming that a recipe exists is itself a leak, which is the rule
 * api/boards/[id].ts already follows for a private board.
 *
 * Editing the *graph* is not done here. A new version is written by saving a
 * fresh selection through POST /api/recipes; this endpoint changes only the
 * label on the library entry, because a version is immutable once written and
 * that immutability is the whole mechanism behind "an old board keeps the
 * version it was built with".
 */

type Sql = ReturnType<typeof getSql>;

const loadOne = async (sql: Sql, id: string): Promise<RecipeRow | null> => {
  const rows = (await sql`
    SELECT id, name, description, current_version_id, created_at, updated_at
    FROM recipes
    WHERE id = ${id}
  `) as RecipeRow[];
  return rows[0] ?? null;
};

const asDto = async (sql: Sql, row: RecipeRow) =>
  rowToRecipeDto(
    row,
    row.current_version_id
      ? await loadRecipeVersion(sql, row.current_version_id)
      : null
  );

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    return res.status(404).json({ error: "Not found" });
  }

  const sql = getSql();
  try {
    const row = await loadOne(sql, id);
    if (!row) {
      return res.status(404).json({ error: "Not found" });
    }

    if (req.method === "GET") {
      return res.status(200).json(await asDto(sql, row));
    }

    if (req.method === "PATCH") {
      const body = parseJsonBody(req.body);
      const name =
        typeof body.name === "string"
          ? sanitizeText(body.name).slice(0, MAX_RECIPE_NAME)
          : null;
      // An empty name is refused rather than stored: the library is browsed by
      // name, so a blank one loses the recipe in plain sight.
      if (name !== null && !name) {
        return res.status(422).json({ error: "A recipe needs a name" });
      }
      const description =
        typeof body.description === "string"
          ? body.description.trim().slice(0, MAX_RECIPE_DESCRIPTION)
          : null;
      const updated = (await sql`
        UPDATE recipes
        SET name = COALESCE(${name}, name),
            description = COALESCE(${description}, description),
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, name, description, current_version_id, created_at, updated_at
      `) as RecipeRow[];
      return res.status(200).json(await asDto(sql, updated[0]));
    }

    if (req.method === "DELETE") {
      /* FR-009. recipe_uses.recipe_id is ON DELETE SET NULL, so every board
         already using this keeps its real nodes, keeps its paid-for results and
         keeps showing the version number it was built on — it simply stops
         knowing which library entry it came from, and stops being placeable. */
      await sql`DELETE FROM recipes WHERE id = ${id}`;
      return res.status(204).end();
    }

    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not load that recipe" });
  }
}
