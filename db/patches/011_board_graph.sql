-- Node graphs on a board: operation nodes, and wires between items.
--
-- A node is not a new kind of thing living beside the moodboard — it is a
-- board_item with kind 'op'. That is deliberate: an item already has geometry
-- in canvas units, a stacking order, a cascade from its board and a validator
-- that clamps what the canvas sends. A node needs every one of those, and a
-- separate table would duplicate all of them and then need a union query to
-- read a board back.
--
-- It also means a photograph or a note pinned to a board months ago is already
-- a valid input to a generation. There is nothing to convert and nothing to
-- migrate; wires simply point at rows that exist.
--
-- Every column added here is nullable and every constraint change is additive,
-- so no existing row needs rewriting and no board changes behaviour. Idempotent
-- like every patch: constraints are dropped by name first, so re-running is
-- safe.

ALTER TABLE board_items DROP CONSTRAINT IF EXISTS board_items_kind_check;
ALTER TABLE board_items DROP CONSTRAINT IF EXISTS board_items_shape;

-- Guarded because every patch replays on every migrate. This one narrows
-- `kind` to the set that existed when it was written, and a later patch widens
-- it again — so on a database that already holds a newer kind, re-adding the
-- narrow constraint would fail on rows that are perfectly valid. Adding it only
-- when the data satisfies it lets the later patch own the wider set, and keeps
-- a fresh database getting the constraint it expects.
DO $$
BEGIN
  ALTER TABLE board_items ADD CONSTRAINT board_items_kind_check CHECK (kind IN ('photo', 'reference', 'note', 'text', 'op'));
EXCEPTION
  WHEN check_violation THEN NULL;
END $$;

/* Which operation this node performs — 'generate', and later others.
   Validated against config/nodeTypes.ts rather than a database enum, so adding
   a node type is a code change and not a migration. */
ALTER TABLE board_items ADD COLUMN IF NOT EXISTS node_type TEXT;

/* The node's own settings: its typed prompt, its style, whatever its type
   defines. JSONB because the shape belongs to the node type; a column per
   setting would mean a patch every time one gained an option. */
ALTER TABLE board_items ADD COLUMN IF NOT EXISTS config JSONB;

/* What the last successful run produced, including the fingerprint of the
   inputs that produced it — that is what lets a re-run skip a node nothing has
   changed under, instead of spending money to arrive at the same image. */
ALTER TABLE board_items ADD COLUMN IF NOT EXISTS result JSONB;

/* State of the last run, and why it failed.
   These three columns are written ONLY by POST /api/boards/:id/run, never by
   the board save. The canvas replaces the whole arrangement on a debounce, and
   a save already in flight when a two-minute generation lands would otherwise
   write back the pre-run copy and erase a result that has been paid for. */
ALTER TABLE board_items ADD COLUMN IF NOT EXISTS run_state TEXT;
ALTER TABLE board_items ADD COLUMN IF NOT EXISTS run_error TEXT;

ALTER TABLE board_items DROP CONSTRAINT IF EXISTS board_items_run_state_check;
ALTER TABLE board_items
  ADD CONSTRAINT board_items_run_state_check CHECK (
    run_state IS NULL
    OR run_state IN ('idle', 'running', 'succeeded', 'failed', 'skipped')
  );

-- Re-added last, so it sees the node_type column it refers to. An op item must
-- say what it does; the other four arms are unchanged.
DO $$
BEGIN
  ALTER TABLE board_items ADD CONSTRAINT board_items_shape CHECK (
    (kind = 'photo' AND photo_id IS NOT NULL)
    OR (kind = 'reference' AND image_url IS NOT NULL)
    OR (kind IN ('note', 'text') AND body IS NOT NULL)
    OR (kind = 'op' AND node_type IS NOT NULL)
  );
EXCEPTION
  WHEN check_violation THEN NULL;
END $$;

-- A directed connection from an output port on one item to an input port on
-- another. Both endpoints cascade, which is what makes "deleting an item
-- deletes its wires" a property of the schema rather than something the
-- application has to remember.
CREATE TABLE IF NOT EXISTS board_wires (
  /** Client-generated, like board_items.id — see the note there on why. */
  id UUID PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards (id) ON DELETE CASCADE,

  source_item_id UUID NOT NULL REFERENCES board_items (id) ON DELETE CASCADE,
  source_port TEXT NOT NULL,
  target_item_id UUID NOT NULL REFERENCES board_items (id) ON DELETE CASCADE,
  target_port TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  /* The shortest cycle there is, and free to forbid here. */
  CONSTRAINT board_wires_no_self CHECK (source_item_id <> target_item_id),

  /* An input holds one value, so reconnecting replaces rather than accumulates.
     Outputs are deliberately NOT unique: one image feeding several different
     treatments side by side is the comparison workflow this exists for. */
  CONSTRAINT board_wires_unique_target UNIQUE (target_item_id, target_port),

  CONSTRAINT board_wires_unique_edge
    UNIQUE (source_item_id, source_port, target_item_id, target_port)
);

-- Opening a board reads every wire on it.
CREATE INDEX IF NOT EXISTS board_wires_board_idx ON board_wires (board_id);
