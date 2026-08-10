-- Where a board's reference images were pulled from.
--
-- Attaching a Pinterest board means pasting its address, reading its feed and
-- dropping pins onto the canvas. Without this the address is gone the moment
-- the panel closes, so refreshing a board a week later means finding the link
-- again — and the board itself no longer records where any of it came from.
--
-- Deliberately not a per-item column. The link belongs to the *board*: several
-- items come from one source, items get deleted, and the source is still worth
-- keeping so it can be re-opened and pulled from again.
--
-- Idempotent like every patch: safe to re-run.

CREATE TABLE IF NOT EXISTS board_sources (
  /** Client-generated, like board_items and board_wires. */
  id UUID PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards (id) ON DELETE CASCADE,

  /** Which connector this came from. Only 'pinterest' so far. */
  provider TEXT NOT NULL CHECK (provider IN ('pinterest')),
  /** The board or feed address, exactly as it was pasted and validated. */
  url TEXT NOT NULL,
  /** What the source called itself, for a label that reads like the source. */
  title TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  /* Attaching the same board twice is a no-op, not a second row. */
  CONSTRAINT board_sources_unique UNIQUE (board_id, url)
);

-- Opening a board reads its sources alongside its items.
CREATE INDEX IF NOT EXISTS board_sources_board_idx ON board_sources (board_id);
