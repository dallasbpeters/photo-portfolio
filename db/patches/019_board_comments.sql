-- Comments on a board, attached to an item (an image or a node).
--
-- Anyone can leave one on the published board: a name, some words, and the
-- item they clicked. The run of them belongs to the board, and each points at
-- the item it is about, so the canvas can badge the item and the sidebar can
-- list them together. `resolved` is the admin's — comments stay open until
-- someone who owns the board says otherwise.
--
-- Idempotent like every patch.

CREATE TABLE IF NOT EXISTS board_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES board_items (id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Where within the item the comment is pinned, 0..1. Kept so a comment can
  -- later be drawn at the exact spot it was left, even though the UI currently
  -- just targets the item.
  x REAL NOT NULL DEFAULT 0.5,
  y REAL NOT NULL DEFAULT 0.5,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_comments_board_idx
  ON board_comments (board_id, created_at);
