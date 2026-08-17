import type { BoardItemRow } from "./boards.js";
import { styleBriefKey } from "./elementStyle.js";
import { imageUrlsOf } from "./elements.js";
import { describeImage } from "./fal.js";

/**
 * How the model sees an element's style, cached on the element.
 *
 * An element is a handful of pictures that share a look. The obvious way to use
 * them — send them to the image model beside the picture being restyled — does
 * not work, and it fails in a way that looks like a bad style rather than a bad
 * request: an edit endpoint treats every entry in `image_urls` as an equal
 * input, so one subject among six references is a seventh of what the model
 * sees, and the references read as things to draw rather than as ways to draw.
 * That is why a restyle came back looking like one of the references.
 *
 * So the pictures are read once, by the vision model, into a single reusable
 * prompt describing what they have in common — literally how the model sees the
 * style. A generation then sends exactly one picture, the subject, with that
 * brief in its prompt. Nothing is left to confuse, and it works on the many
 * endpoints that take only one image and previously had to refuse the run.
 *
 * Derived lazily rather than on save: an element written before this existed
 * has no brief, and there is no backfill to run or forget. The cost is one
 * vision call the first time a style is used after it changes.
 */

/** The reading the vision model is asked for. Style, not subject matter. */
const BRIEF_FOCUS = "style";

/**
 * How long a style reading may hold up the run it precedes.
 *
 * Well inside the serverless ceiling, because whatever is left after this has
 * to be enough for the generation itself — the thing that was actually asked
 * for. A reading that misses the deadline is not wasted: it is still running at
 * fal, and the next run finds it cached.
 */
const BRIEF_DEADLINE_MS = 20_000;

interface BriefRow {
  description: string | null;
  id: string;
  style_brief: string | null;
  style_brief_key: string | null;
}

/** Just enough of the database to read and write one column. */
type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown>;

/**
 * The element's brief, generating and storing it when it is missing or stale.
 *
 * Returns the empty string rather than throwing when the style cannot be read:
 * a vision model that is down or an element with no pictures should cost the
 * run its style, not the whole generation. The description still travels, so a
 * degraded run is one styled by words alone.
 */
export const ensureStyleBrief = async (
  sql: SqlTag,
  row: BriefRow,
  imageUrls: string[]
): Promise<string> => {
  const description = row.description ?? "";
  if (imageUrls.length === 0) {
    return "";
  }
  const key = styleBriefKey(description, imageUrls);
  if (row.style_brief && row.style_brief_key === key) {
    return row.style_brief;
  }

  let brief = "";
  try {
    // The description is handed over as the instruction: it is what the author
    // says matters about this style, so it steers the reading rather than being
    // replaced by it.
    //
    // Raced against a deadline of its own. `describeImage` carries fal's 120s
    // timeout, which is a sensible bound for a call somebody asked for and a
    // terrible one here: this runs inside `prepare()`, before the generation
    // the user actually wants, so a slow vision model does not merely cost the
    // style — it holds the whole run past the serverless ceiling and kills it.
    // Losing the style is survivable; the description still travels.
    brief = (
      await Promise.race([
        describeImage(imageUrls, BRIEF_FOCUS, description),
        new Promise<string>((resolve) => {
          setTimeout(() => resolve(""), BRIEF_DEADLINE_MS);
        }),
      ])
    ).trim();
  } catch {
    return "";
  }
  if (!brief) {
    return "";
  }

  // A failed write costs the next run another reading, which is cheaper than
  // failing a generation the model has already been paid for.
  await sql`
    UPDATE elements
    SET style_brief = ${brief}, style_brief_key = ${key}
    WHERE id = ${row.id}::uuid
  `.catch(() => undefined);
  return brief;
};

interface ElementFields {
  cover_url: string | null;
  description: string | null;
  id: string;
  /** Every picture the style rests on, JSONB. See db/patches/016_elements.sql. */
  image_urls: unknown;
  style_brief: string | null;
  style_brief_key: string | null;
}

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The library rows every element node points at, folded into the board's rows.
 *
 * An element node stores only an id. The picture it hands over and the words it
 * carries belong to the library, so that a style can be corrected in one place
 * and every board using it follows — which is the difference between a library
 * and a stamp.
 *
 * Resolved here, once, before anything walks the graph: `singleOutputOf` then
 * finds a plain image on the row and the prompt finds plain words, so nothing
 * downstream has to know an element was involved.
 *
 * The copy stored on the node is the fallback. An element deleted from the
 * library leaves the boards built with it still showing, and still able to run,
 * the picture they were built with — a tidy-up in a side panel must not quietly
 * break work.
 */
export const withElements = async (
  sql: SqlTag,
  rows: BoardItemRow[]
): Promise<BoardItemRow[]> => {
  const wanted = new Set<string>();
  for (const row of rows) {
    const id = asObject(row.config).elementId;
    if (
      row.node_type === "element" &&
      typeof id === "string" &&
      UUID.test(id)
    ) {
      wanted.add(id);
    }
  }
  if (wanted.size === 0) {
    return rows;
  }

  // The brief columns are newer than this code's oldest deployment target, and
  // a board run is not the place to discover that: the whole run fails on a
  // missing column, so an unmigrated database cannot generate anything at all
  // rather than merely generating without a style. Falling back costs one
  // failed query on a database that has not caught up yet, and nothing at all
  // on one that has.
  const found = (await sql`
    SELECT id, cover_url, description, image_urls, style_brief, style_brief_key
    FROM elements
    WHERE id = ANY(${[...wanted]}::uuid[])
  `.catch(
    () => sql`
      SELECT id, cover_url, description, image_urls,
             NULL AS style_brief, NULL AS style_brief_key
      FROM elements
      WHERE id = ANY(${[...wanted]}::uuid[])
    `
  )) as ElementFields[];

  // Read before the rows are mapped, because a reading is a network call and
  // the map is not the place for one. Sequential rather than concurrent: a
  // board rarely carries more than a couple of elements, and a fleet of vision
  // calls fired at once is how a rate limit is found.
  // Chained rather than looped so each reading is still started only once the
  // one before it has landed.
  const briefs = new Map<string, string>();
  await found.reduce(
    (earlier, element) =>
      earlier
        .then(() =>
          ensureStyleBrief(sql, element, imageUrlsOf(element.image_urls))
        )
        .then((brief) => {
          briefs.set(element.id, brief);
        }),
    Promise.resolve()
  );
  const byId = new Map(found.map((element) => [element.id, element]));

  return rows.map((row) => {
    if (row.node_type !== "element") {
      return row;
    }
    const config = asObject(row.config);
    const element =
      typeof config.elementId === "string"
        ? byId.get(config.elementId)
        : undefined;
    const storedImage =
      typeof config.imageUrl === "string" ? config.imageUrl : null;
    const storedWords =
      typeof config.description === "string" ? config.description : null;
    return {
      ...row,
      body: element?.description ?? storedWords,
      config: {
        ...config,
        // How the model sees this style. The pictures themselves no longer
        // travel to the image model — see the note at the top of this file.
        styleBrief: element ? (briefs.get(element.id) ?? "") : "",
      },
      image_url: element?.cover_url ?? storedImage,
    };
  });
};
