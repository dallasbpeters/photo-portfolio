-- Moodboards: a free-form canvas for planning a shoot.
--
-- Geometry is stored in *canvas units*, not pixels, against a fixed logical
-- canvas. A board therefore looks identical on a laptop and on a phone — the
-- viewport scales, the arrangement does not reflow. Storing pixels would mean a
-- board composed on a desktop collapsed into nonsense on the device these are
-- actually used on.

CREATE TABLE IF NOT EXISTS boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  /** Chosen from the board's own items; NULL until one is picked or added. */
  cover_url TEXT,
  /** Boards start private. Publishing is opt-in, per board. */
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  /** Only meaningful once public — the public URL is /board/<slug>. */
  slug TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS board_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'reference', 'note')),

  /** kind='photo': one of their own photographs. Deleting it removes the item. */
  photo_id UUID REFERENCES photos (id) ON DELETE CASCADE,

  /** kind='reference': an external image (Unsplash, or an upload). */
  image_url TEXT,
  thumb_url TEXT,
  /**
   * Attribution for external references. Unsplash's licence requires the
   * photographer be credited wherever the image is shown, so the credit travels
   * with the item rather than being looked up later — by the time a board is
   * public the API response that carried it is long gone.
   */
  credit_name TEXT,
  credit_url TEXT,

  /** kind='note': freeform text pinned to the canvas. */
  body TEXT,

  /** Canvas units. See the note above on why these are not pixels. */
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION NOT NULL DEFAULT 320,
  height DOUBLE PRECISION NOT NULL DEFAULT 240,
  /** Stacking order; ties break by created_at so the newer item wins. */
  z_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  /* A photo item points at a photo; a reference needs a URL; a note needs text.
     Enforced here so a malformed item cannot reach the canvas and render blank. */
  CONSTRAINT board_items_shape CHECK (
    (kind = 'photo' AND photo_id IS NOT NULL)
    OR (kind = 'reference' AND image_url IS NOT NULL)
    OR (kind = 'note' AND body IS NOT NULL)
  )
);

-- Opening a board reads every item in stacking order.
CREATE INDEX IF NOT EXISTS board_items_board_stack_idx
  ON board_items (board_id, z_index, created_at);

-- The admin list is newest-first.
CREATE INDEX IF NOT EXISTS boards_recent_idx
  ON boards (updated_at DESC);
