import {
  type BrandKitDoc,
  kitPromptText,
  resolveKitDoc,
  sanitizeKitDoc,
} from "../../config/brandKit.js";
import {
  DEFAULT_LOGO_PLACEMENT,
  LOGO_PLACEMENTS,
  type LogoPlacement,
  logoReservationText,
} from "../../config/nodes/logoPlacement.js";
import { UUID_RE } from "./boardItemParse.js";
import type { BoardItemRow } from "./boards.js";

/**
 * The brand kits every Brand node points at, folded into the board's rows.
 *
 * A Brand node stores only an id. The palette, the voice and the look belong to
 * the library, so that a brand can be corrected in one place and every board
 * drawing on it follows — the same argument `withElements` makes, and the same
 * mechanism.
 *
 * Resolved here, once, before anything walks the graph: `singleOutputOf` then
 * finds plain words on the row and nothing downstream has to know a kit was
 * involved.
 *
 * Two things are written onto the row's config. The prompt text, which is what
 * travels down the wire; and the *version* id, which is what a result gets
 * stamped with. That second one is the whole reason versions exist — "which
 * brand made this picture" is unanswerable if the answer is a kit that has since
 * been edited.
 *
 * A sub-brand resolves against its parent first, exactly as the panel previews
 * it: a sub-brand that states nothing still produces its parent's brand, so the
 * text a wire carries has to be the resolved document rather than the child's
 * own sparse one.
 *
 * Unlike an element, there is no fallback copy kept on the node. An element
 * node holds the picture it was built with so a tidy-up in a side panel cannot
 * break a board's ability to run; a brand is a *current* statement of what a
 * brand means, and quietly generating against a kit somebody deleted would be
 * worse than generating without one. A missing kit contributes nothing, and the
 * node says so on the canvas.
 */

interface KitRow {
  doc: unknown;
  id: string;
  parent_doc: unknown;
  version_id: string | null;
}

/** Just enough of the database to read one join, as withElements takes it. */
type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown>;

/** What a Brand node contributes, written onto its row before the graph walk. */
export interface BrandBrief {
  /** Which version said it, for the result's provenance stamp. */
  brandKitVersionId: string | null;
  /** The resolved kit as prompt material, or "" when there is nothing to say. */
  brandText: string;
  /**
   * The chosen logo's own rules, resolved from the library.
   *
   * Carried onto the row so the compositor gets them from the same place the
   * text came from. They are guidelines about an object that has to arrive
   * intact — a minimum legible width and a clear-space margin — so they end up
   * as arithmetic rather than as prose in a prompt. See stampLogo.
   */
  logoClearSpace: number | null;
  logoMinWidth: number | null;
  /** Resolved from the id the node stores, so a renamed logo still follows. */
  logoUrl: string | null;
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** The kit ids the board's Brand nodes name, ignoring anything malformed. */
const wantedKits = (rows: BoardItemRow[]): string[] => {
  const wanted = new Set<string>();
  for (const row of rows) {
    const id = asObject(row.config).brandKitId;
    if (
      row.node_type === "brand" &&
      typeof id === "string" &&
      UUID_RE.test(id)
    ) {
      wanted.add(id);
    }
  }
  return [...wanted];
};

export const withBrandKits = async (
  sql: SqlTag,
  rows: BoardItemRow[]
): Promise<BoardItemRow[]> => {
  const wanted = wantedKits(rows);
  if (wanted.length === 0) {
    return rows;
  }

  /*
   * The kit, its current version, and its parent's current version.
   *
   * The parent's *current* version rather than one pinned at any point, which is
   * the same choice loadKits makes: pinning a sub-brand to a particular parent
   * version would mean two histories to reason about, and the question this
   * answers is "what does this brand mean now".
   *
   * Tolerant of a database that has not run patch 031 yet, for the reason
   * withElements gives: the whole run fails on a missing relation, so an
   * unmigrated database could not generate anything at all rather than merely
   * generating without a brand.
   */
  const found = (await sql`
    SELECT
      k.id,
      v.doc                AS doc,
      v.id                 AS version_id,
      pv.doc               AS parent_doc
    FROM brand_kits k
    LEFT JOIN brand_kit_versions v ON v.id = k.current_version_id
    LEFT JOIN brand_kits p ON p.id = k.parent_id
    LEFT JOIN brand_kit_versions pv ON pv.id = p.current_version_id
    WHERE k.id = ANY(${wanted}::uuid[])
  `.catch(() => [])) as KitRow[];

  const resolved = new Map<string, BrandKitDoc>();
  const versions = new Map<string, string | null>();
  for (const row of found) {
    const own: BrandKitDoc = sanitizeKitDoc(row.doc);
    const parent = row.parent_doc ? sanitizeKitDoc(row.parent_doc) : null;
    resolved.set(row.id, resolveKitDoc(own, parent));
    versions.set(row.id, row.version_id);
  }

  return rows.map((row) => {
    if (row.node_type !== "brand") {
      return row;
    }
    const config = asObject(row.config);
    const id = config.brandKitId;
    const doc = typeof id === "string" ? resolved.get(id) : undefined;
    /*
     * The logo is matched by URL rather than by index.
     *
     * An index into the kit's list is a reference that moves: delete the first
     * logo and every node pointing at "the second one" silently starts stamping
     * a different mark. The URL is the logo's identity, and a logo removed from
     * the kit simply stops resolving — which the node then says.
     */
    const wanted = typeof config.logoUrl === "string" ? config.logoUrl : null;
    const logo = wanted
      ? doc?.logos.find((entry) => entry.url === wanted)
      : undefined;
    /*
     * The words, plus a request to leave room for the mark.
     *
     * Only when a logo is actually going to be stamped: asking a model to keep a
     * corner clear on a picture that will never receive one is a constraint paid
     * for and wasted. See logoReservationText on why the instruction is the
     * opposite of "use this logo".
     */
    const words = doc ? kitPromptText(doc) : "";
    const placement = LOGO_PLACEMENTS.includes(
      config.logoPlacement as LogoPlacement
    )
      ? (config.logoPlacement as LogoPlacement)
      : DEFAULT_LOGO_PLACEMENT;
    const brandText = logo
      ? [words, logoReservationText(placement)].filter(Boolean).join(", ")
      : words;

    return {
      ...row,
      config: {
        ...config,
        brandKitVersionId: versions.get(String(id)) ?? null,
        brandText,
        logoClearSpace: logo?.clearSpace ?? null,
        logoMinWidth: logo?.minWidth ?? null,
        logoUrl: logo?.url ?? null,
      },
    };
  });
};

/**
 * The brand version a run was made against, read off the rows that fed it.
 *
 * Answered from the *resolved* rows rather than from the wires, because by the
 * time a result is stamped the only thing that still knows which kit was
 * involved is the config `withBrandKits` wrote.
 *
 * One brand per stamp: `brandKitVersionId` is a single column, and a graph
 * wiring two brands into one generation has already made a mess that no stamp
 * can describe. The first one wins, deterministically by row order, so the same
 * board stamps the same answer twice.
 */
export const brandVersionOf = (rows: BoardItemRow[]): string | null => {
  for (const row of rows) {
    if (row.node_type === "brand") {
      const id = asObject(row.config).brandKitVersionId;
      if (typeof id === "string" && id) {
        return id;
      }
    }
  }
  return null;
};
