import type { BrandKitDoc } from "../../config/brandKit.js";
import { EMPTY_KIT, sanitizeKitDoc } from "../../config/brandKit.js";
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
  updated_at: string;
  version_count: number | string;
}

export interface BrandKitDto {
  createdAt: string;
  /** The kit as it currently stands. `EMPTY_KIT` when no version exists yet. */
  doc: BrandKitDoc;
  id: string;
  name: string;
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
export const rowToKitDto = (row: BrandKitRow): BrandKitDto => ({
  createdAt: row.created_at,
  doc: row.current_version_id ? sanitizeKitDoc(row.doc) : EMPTY_KIT,
  id: row.id,
  name: row.name,
  updatedAt: row.updated_at,
  version: row.current_version,
  versionCount: Number(row.version_count) || 0,
  versionId: row.current_version_id,
});

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
      v.version   AS current_version,
      v.doc       AS doc,
      (SELECT COUNT(*) FROM brand_kit_versions c WHERE c.brand_kit_id = k.id)
        AS version_count
    FROM brand_kits k
    LEFT JOIN brand_kit_versions v ON v.id = k.current_version_id
    ORDER BY k.updated_at DESC
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
      v.version   AS current_version,
      v.doc       AS doc,
      (SELECT COUNT(*) FROM brand_kit_versions c WHERE c.brand_kit_id = k.id)
        AS version_count
    FROM brand_kits k
    LEFT JOIN brand_kit_versions v ON v.id = k.current_version_id
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
