-- Editorial pages authored in the admin (About, Prints, Contact…).
--
-- Body is stored as the editor's own JSON document rather than HTML: it stays
-- structured, is safe to render without trusting markup, and can be re-rendered
-- differently later without a migration.

CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  /** Optional Iconoir icon name shown beside the nav link. */
  icon TEXT,
  content JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users (id) ON DELETE SET NULL
);

-- The public nav reads published pages in display order on every page load.
CREATE INDEX IF NOT EXISTS pages_published_order_idx
  ON pages (status, sort_order, title);
