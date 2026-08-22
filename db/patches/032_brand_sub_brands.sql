-- Sub-brands: a kit that belongs to another kit.
--
-- A brand with a retail line, a foundation, a podcast. Each has its own accent
-- and its own logo, and each keeps the parent's voice and typefaces — which is
-- the whole reason to model this rather than name two kits "Acme" and
-- "Acme Retail" and hope.
--
-- Inheritance is resolved in config/brandKit.ts (`resolveKitDoc`), part by part:
-- a sub-brand that states a palette replaces its parent's wholesale rather than
-- having colours merged in, because a palette assembled from two brands is a
-- palette nobody chose. Nothing about it lives in SQL — the document is JSONB
-- and always read whole, so resolution belongs where both the panel and the
-- endpoint can share one answer.
--
-- **One level, enforced.** A kit with a parent cannot itself be a parent. That
-- rules out cycles entirely rather than guarding against them, keeps resolution
-- to exactly two documents with no recursion, and matches what the feature is
-- for: a sub-brand of a sub-brand is a naming problem, not a hierarchy.
--
-- Every column added is nullable and every existing row is left alone, so no
-- kit changes behaviour. Idempotent like every patch.

ALTER TABLE brand_kits
  ADD COLUMN IF NOT EXISTS parent_id UUID;

/* CASCADE rather than SET NULL: a sub-brand inherits from its parent, so a
   sub-brand whose parent is gone is not an independent brand — it is a document
   with holes in it that nothing can fill. The panel says how many will go. */
ALTER TABLE brand_kits DROP CONSTRAINT IF EXISTS brand_kits_parent_fk;
ALTER TABLE brand_kits
  ADD CONSTRAINT brand_kits_parent_fk
  FOREIGN KEY (parent_id) REFERENCES brand_kits (id) ON DELETE CASCADE;

/* A kit cannot be its own parent. The one-level rule below makes longer cycles
   impossible, but this is the case a single UPDATE could still reach. */
ALTER TABLE brand_kits DROP CONSTRAINT IF EXISTS brand_kits_not_own_parent;
ALTER TABLE brand_kits
  ADD CONSTRAINT brand_kits_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);

/*
 * One level, in the database rather than only in the API.
 *
 * A trigger because the rule spans rows: it is not "this row is valid" but "this
 * row's parent has no parent, and this row has no children if it is gaining
 * one", which no CHECK constraint can see.
 */
CREATE OR REPLACE FUNCTION brand_kits_one_level() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    -- The parent must be a top-level brand.
    IF EXISTS (SELECT 1 FROM brand_kits p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'A sub-brand cannot have sub-brands of its own';
    END IF;
    -- And this kit must not already be one.
    IF EXISTS (SELECT 1 FROM brand_kits c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'A brand with sub-brands cannot become a sub-brand';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS brand_kits_one_level_check ON brand_kits;
CREATE TRIGGER brand_kits_one_level_check
  BEFORE INSERT OR UPDATE OF parent_id ON brand_kits
  FOR EACH ROW EXECUTE FUNCTION brand_kits_one_level();

CREATE INDEX IF NOT EXISTS brand_kits_parent_idx
  ON brand_kits (parent_id) WHERE parent_id IS NOT NULL;
