-- Recipes: a way of working, saved so tomorrow does not start by rebuilding it.
--
-- A recipe is a subgraph someone got right once — a reference into an Analyse,
-- joined with a prompt, driven through a Generate — kept so it can be pointed
-- at new inputs without redrawing a single wire.
--
-- Deliberately not a board, for the same reason an element is not (016). A
-- board is a place you work; a recipe is a conclusion you reached there, so it
-- outlives the board that produced it and is not deleted with one.
--
-- **Placing a recipe expands it into ordinary board_items and board_wires.** It
-- is not an opaque node that runs its own subgraph, and that is a platform
-- constraint rather than a preference: one generation budgets 120s in
-- api/_lib/fal.ts against the serverless ceiling, so POST /api/boards/:id/run
-- runs exactly one node per request and the browser walks the order. A recipe
-- that stayed collapsed would need a call this platform does not allow.
--
-- Expansion is also what makes three promises free rather than enforced: a
-- board built on version 1 keeps behaving as version 1 because it holds real
-- nodes; deleting a recipe cannot break a board because the nodes are not
-- references; and an interrupted run keeps its finished steps because each node
-- already owns its own result and run_state.
--
-- Every column added here is nullable and every table is new, so no existing
-- row is rewritten and no board changes behaviour. Idempotent like every patch.

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- What it is for, in the owner's words. The graph says what it does; this
  -- says when to reach for it.
  description TEXT,
  -- Which version is offered when the recipe is placed. Nullable and SET NULL
  -- on delete so a half-written recipe, or one whose versions were removed, is
  -- a recipe you cannot place rather than a foreign key violation.
  current_version_id UUID,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mirrors elements_named, and for the same reason: a recipe with no name cannot
-- be picked out of a list.
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_named;
ALTER TABLE recipes
  ADD CONSTRAINT recipes_named CHECK (length(btrim(name)) > 0);

-- Immutable once written. Editing a recipe writes a new row rather than
-- changing this one, which is the whole mechanism behind "an old board keeps
-- the version it was built with".
CREATE TABLE IF NOT EXISTS recipe_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  /* The template: nodes with offsets, and the wires between them.
     Positions are offsets in canvas units from wherever the recipe is dropped,
     never absolute — config/canvas.ts's rule applied to something that has no
     place on a board yet. Validated against config/recipes.ts rather than by a
     database constraint, so adding a node type stays a code change (011). */
  graph JSONB NOT NULL,
  /* Which inputs are supplied at use, and which settings the recipe fixes.
     A wire crossing the selection boundary when the recipe was saved becomes an
     entry here. */
  declared_inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  /* True when the selection had never run successfully. Saved anyway — the work
     is real and refusing it loses it — but the panel says so, because an
     unverified recipe is a guess about what those wires do. */
  unverified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE recipe_versions DROP CONSTRAINT IF EXISTS recipe_versions_numbered;
ALTER TABLE recipe_versions
  ADD CONSTRAINT recipe_versions_numbered UNIQUE (recipe_id, version);

-- A JSONB column with no type check accepts a bare string, which is the same
-- reasoning as elements_images_array in 016.
ALTER TABLE recipe_versions DROP CONSTRAINT IF EXISTS recipe_versions_graph_object;
ALTER TABLE recipe_versions
  ADD CONSTRAINT recipe_versions_graph_object
  CHECK (jsonb_typeof(graph) = 'object');

ALTER TABLE recipe_versions DROP CONSTRAINT IF EXISTS recipe_versions_inputs_array;
ALTER TABLE recipe_versions
  ADD CONSTRAINT recipe_versions_inputs_array
  CHECK (jsonb_typeof(declared_inputs) = 'array');

-- Added after both tables exist, because the two reference each other. SET NULL
-- rather than CASCADE: losing the current version must not delete the recipe.
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_current_version_fk;
ALTER TABLE recipes
  ADD CONSTRAINT recipes_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES recipe_versions (id) ON DELETE SET NULL;

-- One placement of one recipe version on one board.
CREATE TABLE IF NOT EXISTS recipe_uses (
  /* Client-generated, like board_items.id and board_wires.id — see the note in
     007_boards.sql on why. */
  id UUID PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
  /* SET NULL, emphatically not CASCADE. Deleting a recipe must not break a
     board that already uses it: the nodes are real and their results were paid
     for. The group simply stops knowing which library entry it came from. */
  recipe_id UUID REFERENCES recipes (id) ON DELETE SET NULL,
  recipe_version_id UUID REFERENCES recipe_versions (id) ON DELETE SET NULL,
  /* The version number as a plain integer, kept beside the reference on
     purpose. It is what lets a group still say "built on v3" after the version
     row itself is gone. */
  pinned_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Opening a board reads every use on it.
CREATE INDEX IF NOT EXISTS recipe_uses_board_idx ON recipe_uses (board_id);

-- The panel lists them most recently touched first, which is the order anyone
-- wants a library of things they are actively building (016).
CREATE INDEX IF NOT EXISTS recipes_updated_idx ON recipes (updated_at DESC);
CREATE INDEX IF NOT EXISTS recipe_versions_recipe_idx
  ON recipe_versions (recipe_id, version DESC);

/* Which group a node belongs to, or NULL for every node that is not in one.
   Nullable and additive: every item that exists today keeps NULL and behaves
   exactly as it does now.

   SET NULL rather than CASCADE, again. Dissolving a group must leave the nodes
   and their paid-for results on the board — the group is a boundary drawn
   around them, not their owner. */
ALTER TABLE board_items ADD COLUMN IF NOT EXISTS recipe_use_id UUID;

ALTER TABLE board_items DROP CONSTRAINT IF EXISTS board_items_recipe_use_fk;
ALTER TABLE board_items
  ADD CONSTRAINT board_items_recipe_use_fk
  FOREIGN KEY (recipe_use_id) REFERENCES recipe_uses (id) ON DELETE SET NULL;

-- Drawing a group's boundary reads every node carrying its id.
CREATE INDEX IF NOT EXISTS board_items_recipe_use_idx
  ON board_items (recipe_use_id)
  WHERE recipe_use_id IS NOT NULL;
