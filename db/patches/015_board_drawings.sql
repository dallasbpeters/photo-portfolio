-- Drawing on the board: freehand strokes and simple shapes.
--
-- One kind rather than several. A pen stroke, a brush stroke, a rectangle and
-- an ellipse differ only in how they are drawn and what they store in config —
-- they are all a coloured mark occupying a box on the canvas, and giving each
-- its own kind would mean four near-identical branches everywhere a kind is
-- switched on, for no gain.
--
-- Geometry stays in the existing x/y/width/height columns, which is what lets a
-- drawing be dragged, resized, snapped, framed and z-ordered by exactly the
-- code that already does those things for a photograph.
--
-- Idempotent like every patch: constraints are dropped by name first.

ALTER TABLE board_items DROP CONSTRAINT IF EXISTS board_items_kind_check;
ALTER TABLE board_items DROP CONSTRAINT IF EXISTS board_items_shape;

ALTER TABLE board_items
  ADD CONSTRAINT board_items_kind_check
  CHECK (
    kind IN (
      'photo', 'reference', 'note', 'text', 'op', 'frame', 'shader', 'drawing'
    )
  );

/* A drawing is defined entirely by its config — the shape, its colours, and
   for a freehand stroke the points themselves. Without one there is nothing to
   render, so an empty drawing is malformed rather than merely blank. */
ALTER TABLE board_items
  ADD CONSTRAINT board_items_shape CHECK (
    (kind = 'photo' AND photo_id IS NOT NULL)
    OR (kind = 'reference' AND image_url IS NOT NULL)
    OR (kind IN ('note', 'text', 'frame') AND body IS NOT NULL)
    OR (kind = 'op' AND node_type IS NOT NULL)
    OR (kind IN ('shader', 'drawing') AND config IS NOT NULL)
  );
