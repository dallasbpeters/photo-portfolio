import type { DeclaredInput, RecipeGraph } from "../../config/recipes.js";
import type { getSql } from "./db.js";

/**
 * Reading and writing the recipe library.
 *
 * The sql half, kept apart from api/_lib/recipes.ts so that file stays pure and
 * testable — the constitution's instruction for logic whose correctness rests on
 * branching. This file makes no decisions; it loads rows and writes them.
 *
 * Every read here is admin-only at the endpoint. A recipe library is not
 * published, and a public index would leak every recipe name — the reasoning
 * api/boards/index.ts already records for boards.
 */

type Sql = ReturnType<typeof getSql>;

export interface RecipeRow {
  created_at: string | Date;
  current_version_id: string | null;
  description: string | null;
  id: string;
  name: string;
  updated_at: string | Date;
}

export interface RecipeVersionRow {
  created_at: string | Date;
  declared_inputs: unknown;
  graph: unknown;
  id: string;
  recipe_id: string;
  unverified: boolean;
  version: number | string;
}

const toIso = (value: string | Date): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const asGraph = (value: unknown): RecipeGraph => {
  const raw = (value ?? {}) as Partial<RecipeGraph>;
  return {
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    wires: Array.isArray(raw.wires) ? raw.wires : [],
  };
};

const asInputs = (value: unknown): DeclaredInput[] =>
  Array.isArray(value) ? (value as DeclaredInput[]) : [];

/** A recipe as the library panel shows it, with its current version resolved. */
export const rowToRecipeDto = (
  row: RecipeRow,
  version: RecipeVersionRow | null
) => ({
  createdAt: toIso(row.created_at),
  currentVersion: version ? Number(version.version) : null,
  declaredInputs: version ? asInputs(version.declared_inputs) : [],
  description: row.description,
  id: row.id,
  name: row.name,
  nodeCount: version ? asGraph(version.graph).nodes.length : 0,
  unverified: version ? version.unverified : false,
  updatedAt: toIso(row.updated_at),
});

export const loadRecipes = async (sql: Sql) => {
  const recipes = (await sql`
    SELECT id, name, description, current_version_id, created_at, updated_at
    FROM recipes
    ORDER BY updated_at DESC
  `) as RecipeRow[];
  if (recipes.length === 0) {
    return [];
  }
  const ids = recipes
    .map((row) => row.current_version_id)
    .filter((id): id is string => id !== null);
  const versions = (
    ids.length === 0
      ? []
      : ((await sql`
          SELECT id, recipe_id, version, graph, declared_inputs, unverified, created_at
          FROM recipe_versions
          WHERE id = ANY(${ids}::uuid[])
        `) as RecipeVersionRow[])
  ) as RecipeVersionRow[];
  const byId = new Map(versions.map((row) => [row.id, row]));
  return recipes.map((row) =>
    rowToRecipeDto(row, byId.get(row.current_version_id ?? "") ?? null)
  );
};

export const loadRecipeVersion = async (
  sql: Sql,
  versionId: string
): Promise<RecipeVersionRow | null> => {
  const rows = (await sql`
    SELECT id, recipe_id, version, graph, declared_inputs, unverified, created_at
    FROM recipe_versions
    WHERE id = ${versionId}
  `) as RecipeVersionRow[];
  return rows[0] ?? null;
};

/** The graph and inputs of a version, in the shapes the pure module expects. */
export const versionContent = (row: RecipeVersionRow) => ({
  declaredInputs: asInputs(row.declared_inputs),
  graph: asGraph(row.graph),
  version: Number(row.version),
});

/**
 * The next version number for a recipe.
 *
 * Read rather than counted: versions are never deleted in the normal course, but
 * counting would reuse a number if one ever were, and a reused version number is
 * a board that silently claims to be built on something it is not.
 */
export const nextVersionNumber = async (
  sql: Sql,
  recipeId: string
): Promise<number> => {
  const rows = (await sql`
    SELECT COALESCE(MAX(version), 0) AS highest
    FROM recipe_versions
    WHERE recipe_id = ${recipeId}
  `) as { highest: number | string }[];
  return Number(rows[0]?.highest ?? 0) + 1;
};

/**
 * The uses on a board, with the latest version each recipe now has.
 *
 * `latestVersion` is null once the recipe has been deleted — the use keeps
 * working from its own pinned number (FR-009), and the group simply stops
 * offering an upgrade.
 */
export const loadRecipeUses = async (sql: Sql, boardId: string) =>
  (await sql`
    SELECT u.id,
           u.recipe_id,
           u.pinned_version,
           r.name AS recipe_name,
           (SELECT MAX(v.version) FROM recipe_versions v WHERE v.recipe_id = u.recipe_id) AS latest_version
    FROM recipe_uses u
    LEFT JOIN recipes r ON r.id = u.recipe_id
    WHERE u.board_id = ${boardId}
    ORDER BY u.created_at
  `) as {
    id: string;
    latest_version: number | string | null;
    pinned_version: number | string;
    recipe_id: string | null;
    recipe_name: string | null;
  }[];

export const rowToUseDto = (row: {
  id: string;
  latest_version: number | string | null;
  pinned_version: number | string;
  recipe_id: string | null;
  recipe_name: string | null;
}) => ({
  id: row.id,
  latestVersion:
    row.latest_version === null ? null : Number(row.latest_version),
  pinnedVersion: Number(row.pinned_version),
  recipeId: row.recipe_id,
  recipeName: row.recipe_name,
});
