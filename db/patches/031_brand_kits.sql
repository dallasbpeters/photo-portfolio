-- Brand kits, and the verdicts they produce.
--
-- A brand kit is an identity written down so it can be *checked* rather than
-- remembered: a palette, typefaces, logos with the rules for using them, a set
-- of references that are on-brand, a set that are explicitly off-brand, and a
-- line about voice.
--
-- The same shape as elements (016) one size up, and for the same reason — a kit
-- outlives any one board, so it lives outside them all. What it adds is a
-- version history, because "which version was this made against" is the question
-- every other feature here is built on.
--
-- Versions are immutable once written. Editing a kit writes a new row, which is
-- what lets an asset made in March keep showing the kit as it stood in March
-- even after the palette has moved on.
--
-- Every table is new and every column added is nullable, so no existing row is
-- rewritten and no board changes behaviour. Idempotent like every patch.

CREATE TABLE IF NOT EXISTS brand_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Nullable and SET NULL on delete, like recipes.current_version_id (030): a
  -- kit whose versions are gone is a kit you cannot wire, not a broken row.
  current_version_id UUID,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE brand_kits DROP CONSTRAINT IF EXISTS brand_kits_named;
ALTER TABLE brand_kits
  ADD CONSTRAINT brand_kits_named CHECK (length(btrim(name)) > 0);

CREATE TABLE IF NOT EXISTS brand_kit_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id UUID NOT NULL REFERENCES brand_kits (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  /* The whole kit as one document: palette, typefaces, logos, on-brand and
     off-brand references, voice. JSONB rather than a table per part because it
     is always read together, never queried into, and bounded by
     config/brandKit.ts — every property that makes a child table cost more than
     it returns (016 makes the same argument for an element's images).

     Every image URL in here has been copied into our own blob storage before
     the row was written. A logo referenced from someone else's CDN is a logo
     that 404s on a handoff page months later (Principle V). */
  doc JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE brand_kit_versions DROP CONSTRAINT IF EXISTS brand_kit_versions_numbered;
ALTER TABLE brand_kit_versions
  ADD CONSTRAINT brand_kit_versions_numbered UNIQUE (brand_kit_id, version);

ALTER TABLE brand_kit_versions DROP CONSTRAINT IF EXISTS brand_kit_versions_doc_object;
ALTER TABLE brand_kit_versions
  ADD CONSTRAINT brand_kit_versions_doc_object
  CHECK (jsonb_typeof(doc) = 'object');

-- Added after both tables exist, because the two reference each other.
ALTER TABLE brand_kits DROP CONSTRAINT IF EXISTS brand_kits_current_version_fk;
ALTER TABLE brand_kits
  ADD CONSTRAINT brand_kits_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES brand_kit_versions (id) ON DELETE SET NULL;

/* One reading of one asset against one version of one kit.
 *
 * Its own table rather than a slot in board_items.result, for three reasons.
 * A verdict has to survive the node that produced it, or "the verdict travels
 * with the asset" is only true until someone tidies the canvas. "Has this been
 * checked?" has to be answerable at publish time without walking the graph.
 * And the Today screen lists failures across every board, which against JSONB
 * would mean scanning every item on every board.
 *
 * It also keeps the verdict clear of the write race that result.ts and
 * version.ts both document: a debounced board save landing after a run must
 * never be able to erase it.
 */
CREATE TABLE IF NOT EXISTS brand_verdicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
  -- SET NULL: the verdict outlives the Check node that wrote it.
  item_id UUID REFERENCES board_items (id) ON DELETE SET NULL,
  -- What was actually checked. The join key on a handoff page, which is why it
  -- is the URL rather than only the item.
  asset_url TEXT NOT NULL,
  brand_kit_version_id UUID REFERENCES brand_kit_versions (id) ON DELETE SET NULL,
  -- The version number as a plain integer, kept beside the reference for the
  -- same reason recipe_uses.pinned_version is: it still reads after the row it
  -- points at is gone.
  kit_version INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  /* Each finding says whether it was measured or judged — colour distance is
     arithmetic, mood is a model's opinion, and an override is a very different
     act depending on which one you are overruling. */
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- An override never edits or deletes findings; it is recorded beside them,
  -- which is what makes the audit trail worth keeping (FR-015).
  override_reason TEXT,
  overridden_at TIMESTAMPTZ,
  -- What makes a failure stop appearing on the Today screen (FR-039).
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE brand_verdicts DROP CONSTRAINT IF EXISTS brand_verdicts_findings_array;
ALTER TABLE brand_verdicts
  ADD CONSTRAINT brand_verdicts_findings_array
  CHECK (jsonb_typeof(findings) = 'array');

-- The handoff page and the pre-share warning both look a verdict up by asset.
CREATE INDEX IF NOT EXISTS brand_verdicts_asset_idx
  ON brand_verdicts (asset_url, created_at DESC);

CREATE INDEX IF NOT EXISTS brand_verdicts_board_idx
  ON brand_verdicts (board_id, created_at DESC);

-- The Today screen asks exactly this, on every load: which failures has nobody
-- dealt with? Partial, because a passed verdict is never the answer.
CREATE INDEX IF NOT EXISTS brand_verdicts_outstanding_idx
  ON brand_verdicts (created_at DESC)
  WHERE passed = false AND acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS brand_kits_updated_idx ON brand_kits (updated_at DESC);
CREATE INDEX IF NOT EXISTS brand_kit_versions_kit_idx
  ON brand_kit_versions (brand_kit_id, version DESC);
