-- Shaders on a board.
--
-- A shader item is a stack of effects from the `shaders` package, rendered live
-- on the canvas. Its whole configuration — which effects, in what order, with
-- what parameters — lives in the `config` column that operation nodes already
-- use, because it is the same kind of thing: settings whose shape belongs to
-- something outside the database.
--
-- Not a graph participant. A shader has no ports and never runs; it is a
-- surface, like a photograph is. That may change, but adding ports later costs
-- nothing whereas guessing at them now would put a wire model on something that
-- has no output to give.
--
-- Idempotent like every patch: constraints are dropped by name first.

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
  ALTER TABLE board_items
    ADD CONSTRAINT board_items_kind_check
    CHECK (
      kind IN ('photo', 'reference', 'note', 'text', 'op', 'frame', 'shader')
    );
EXCEPTION
  WHEN check_violation THEN NULL;
END $$;

/* A shader is defined entirely by its config; without one there is nothing to
   render, so an empty shader item is malformed rather than merely blank.
   Guarded for the same reason as the kind check above. */
DO $$
BEGIN
  ALTER TABLE board_items
    ADD CONSTRAINT board_items_shape CHECK (
      (kind = 'photo' AND photo_id IS NOT NULL)
      OR (kind = 'reference' AND image_url IS NOT NULL)
      OR (kind IN ('note', 'text', 'frame') AND body IS NOT NULL)
      OR (kind = 'op' AND node_type IS NOT NULL)
      OR (kind = 'shader' AND config IS NOT NULL)
    );
EXCEPTION
  WHEN check_violation THEN NULL;
END $$;
