import type { BrandKitDoc } from "../../config/brandKit.js";
import {
  EMPTY_KIT,
  inheritedParts,
  resolveKitDoc,
  sanitizeKitDoc,
} from "../../config/brandKit.js";
import type { getSql } from "./db.js";

/**
 * Reading and writing brand kits.
 *
 * The same division as recipeStore (030): SQL here, rules in config, handlers
 * thin. What is particular to a kit is that **a version is never updated**.
 * Editing writes a new row and moves the pointer, which is what lets an asset
 * made in March keep showing the kit as it stood in March — see patch 031.
 */

type Sql = ReturnType<typeof getSql>;

export interface BrandKitRow {
  created_at: string;
  current_version: number | null;
  current_version_id: string | null;
  doc: unknown;
  id: string;
  name: string;
  parent_doc: unknown;
  parent_id: string | null;
  parent_name: string | null;
  updated_at: string;
  version_count: number | string;
}

export interface BrandKitDto {
  createdAt: string;
  /** The kit's *own* document. `EMPTY_KIT` when no version exists yet. */
  doc: BrandKitDoc;
  id: string;
  /** Which parts of `resolvedDoc` came from the parent rather than this kit. */
  inherited: string[];
  name: string;
  parentId: string | null;
  parentName: string | null;
  /**
   * What this kit actually means, parent included.
   *
   * Sent alongside the kit's own document rather than instead of it: the editor
   * has to show what a sub-brand states, and everything else wants what it
   * resolves to. Computed here so the panel and the run path cannot disagree.
   */
  resolvedDoc: BrandKitDoc;
  updatedAt: string;
  /** Which version `doc` came from, so a caller can pin what it read. */
  version: number | null;
  versionCount: number;
  versionId: string | null;
}

/**
 * Sanitised on the way *out* as well as in.
 *
 * A row written before a limit changed would otherwise hand the panel a
 * document it refuses to save back, which reads as the editor being broken.
 */
export const rowToKitDto = (row: BrandKitRow): BrandKitDto => {
  const own = row.current_version_id ? sanitizeKitDoc(row.doc) : EMPTY_KIT;
  const parent = row.parent_id ? sanitizeKitDoc(row.parent_doc) : null;
  return {
    createdAt: row.created_at,
    doc: own,
    id: row.id,
    inherited: inheritedParts(own, parent),
    name: row.name,
    parentId: row.parent_id,
    parentName: row.parent_name,
    resolvedDoc: resolveKitDoc(own, parent),
    updatedAt: row.updated_at,
    version: row.current_version,
    versionCount: Number(row.version_count) || 0,
    versionId: row.current_version_id,
  };
};

/**
 * Every kit, newest first, each with its current version inlined.
 *
 * One query rather than a list plus a fetch per kit: a kit is small, bounded by
 * config/brandKit.ts, and the panel shows the palette on the card — so the
 * document is wanted every time the list is.
 */
export const loadKits = async (sql: Sql): Promise<BrandKitDto[]> => {
  const rows = (await sql`
    SELECT
      k.id,
      k.name,
      k.created_at,
      k.updated_at,
      k.current_version_id,
      k.parent_id,
      p.name      AS parent_name,
      pv.doc      AS parent_doc,
      v.version   AS current_version,
      v.doc       AS doc,
      (SELECT COUNT(*) FROM brand_kit_versions c WHERE c.brand_kit_id = k.id)
        AS version_count
    FROM brand_kits k
    LEFT JOIN brand_kit_versions v ON v.id = k.current_version_id
    /* The parent's *current* version, which is what a sub-brand inherits from —
       pinning a sub-brand to a particular parent version would mean two
       version histories to reason about, and the question this feature answers
       is "what does this brand mean now". */
    LEFT JOIN brand_kits k_parent ON k_parent.id = k.parent_id
    LEFT JOIN brand_kits p ON p.id = k.parent_id
    LEFT JOIN brand_kit_versions pv ON pv.id = k_parent.current_version_id
    ORDER BY COALESCE(p.updated_at, k.updated_at) DESC, k.parent_id NULLS FIRST, k.updated_at DESC
  `) as BrandKitRow[];
  return rows.map(rowToKitDto);
};

export const loadKit = async (
  sql: Sql,
  id: string
): Promise<BrandKitDto | null> => {
  const rows = (await sql`
    SELECT
      k.id,
      k.name,
      k.created_at,
      k.updated_at,
      k.current_version_id,
      k.parent_id,
      p.name      AS parent_name,
      pv.doc      AS parent_doc,
      v.version   AS current_version,
      v.doc       AS doc,
      (SELECT COUNT(*) FROM brand_kit_versions c WHERE c.brand_kit_id = k.id)
        AS version_count
    FROM brand_kits k
    LEFT JOIN brand_kit_versions v ON v.id = k.current_version_id
    /* The parent's *current* version, which is what a sub-brand inherits from —
       pinning a sub-brand to a particular parent version would mean two
       version histories to reason about, and the question this feature answers
       is "what does this brand mean now". */
    LEFT JOIN brand_kits k_parent ON k_parent.id = k.parent_id
    LEFT JOIN brand_kits p ON p.id = k.parent_id
    LEFT JOIN brand_kit_versions pv ON pv.id = k_parent.current_version_id
    WHERE k.id = ${id}
  `) as BrandKitRow[];
  const [row] = rows;
  return row ? rowToKitDto(row) : null;
};

/** A kit's history, newest first — what "which version was this made against"
 *  is answered from. The documents come too: they are small, and a history
 *  nobody can read the contents of is a list of numbers. */
export const loadKitVersions = async (sql: Sql, kitId: string) => {
  const rows = (await sql`
    SELECT id, version, doc, created_at
    FROM brand_kit_versions
    WHERE brand_kit_id = ${kitId}
    ORDER BY version DESC
  `) as { created_at: string; doc: unknown; id: string; version: number }[];
  return rows.map((row) => ({
    createdAt: row.created_at,
    doc: sanitizeKitDoc(row.doc),
    id: row.id,
    version: row.version,
  }));
};

/**
 * Writes a new version and points the kit at it.
 *
 * The version number is taken inside the same statement that inserts it, so two
 * saves racing cannot both claim the same number — the unique constraint on
 * (brand_kit_id, version) would reject the loser, which is the right outcome but
 * a worse error than not racing. `COALESCE(MAX(version), 0) + 1` in the INSERT
 * is the whole guard.
 */
export const writeKitVersion = async (
  sql: Sql,
  kitId: string,
  doc: BrandKitDoc
) => {
  const inserted = (await sql`
    INSERT INTO brand_kit_versions (brand_kit_id, version, doc)
    SELECT
      ${kitId}::uuid,
      COALESCE(MAX(version), 0) + 1,
      ${JSON.stringify(doc)}::jsonb
    FROM brand_kit_versions
    WHERE brand_kit_id = ${kitId}
    RETURNING id, version
  `) as { id: string; version: number }[];
  const [row] = inserted;
  if (!row) {
    return null;
  }
  await sql`
    UPDATE brand_kits
    SET current_version_id = ${row.id}, updated_at = NOW()
    WHERE id = ${kitId}
  `;
  return row;
};
