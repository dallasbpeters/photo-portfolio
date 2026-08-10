-- Frames, and inputs that accept more than one wire.
--
-- Two changes that arrived together because both widen what a board may hold.
--
-- A *frame* is a labelled rectangle drawn behind the items sitting on it, which
-- moves them when it moves. Purely organisational: it has no ports, never runs,
-- and takes no part in the graph. It is a board_item like everything else so it
-- inherits geometry in canvas units, stacking, the cascade from its board and
-- the same clamping every other item gets — a separate table would duplicate
-- all of that to express "a rectangle with a title".
--
-- The wire change is the more consequential one. board_wires_unique_target made
-- a second wire to the same input impossible, which was right when every input
-- held one value. Batch generation needs the opposite: four references wired
-- into one Generate node are four jobs, not three overwrites. Arity now lives
-- in config/nodeTypes.ts, which knows which inputs take a list and which
-- replace — the database cannot know that, and enforcing it here made the
-- registry's answer unreachable.
--
-- Idempotent like every patch: constraints are dropped by name first, so
-- re-running is safe.

ALTER TABLE board_items DROP CONSTRAINT IF EXISTS board_items_kind_check;
ALTER TABLE board_items DROP CONSTRAINT IF EXISTS board_items_shape;

ALTER TABLE board_items
  ADD CONSTRAINT board_items_kind_check
  CHECK (kind IN ('photo', 'reference', 'note', 'text', 'op', 'frame'));

/* A frame carries its title in `body`, like a note carries its text. Empty is
   allowed: a frame is often drawn before it is named. */
ALTER TABLE board_items
  ADD CONSTRAINT board_items_shape CHECK (
    (kind = 'photo' AND photo_id IS NOT NULL)
    OR (kind = 'reference' AND image_url IS NOT NULL)
    OR (kind IN ('note', 'text', 'frame') AND body IS NOT NULL)
    OR (kind = 'op' AND node_type IS NOT NULL)
  );

-- Dropped, not replaced: single-value inputs are enforced by the registry in
-- config/nodeTypes.ts, which is the only place that knows an input's arity.
-- board_wires_unique_edge stays, so the *same* wire still cannot be stored
-- twice — what is now allowed is several different sources feeding one input.
ALTER TABLE board_wires DROP CONSTRAINT IF EXISTS board_wires_unique_target;
