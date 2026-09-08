import { eq, type SQL } from "drizzle-orm";
import type { SiteSettingsRow } from "../../config/siteSettings.js";
import { getDb, schema } from "./orm.js";

/**
 * Reading a site's saved settings.
 *
 * Its own module because two endpoints want the same row and the same column
 * names: api/manifest.ts, which serves the install prompt, and
 * api/site-settings.ts, which edits it. A second copy of the projection is a
 * column that goes missing from one of them and reads as an admin's edit not
 * having saved.
 */

/**
 * The columns under the snake_case names `SiteSettingsRow` and
 * `resolveSiteSettings` expect.
 *
 * Written out rather than taking `.select()` wholesale. Drizzle returns its own
 * camelCase field names, and `resolveSiteSettings` reads `hero_title` — so an
 * unprojected select typechecks only with a cast and then resolves every field
 * to its compiled default at runtime, which looks exactly like a site whose
 * settings were never saved.
 */
export const siteSettingsSelection = {
  hero_title: schema.siteSettings.heroTitle,
  instagram_handle: schema.siteSettings.instagramHandle,
  instagram_url: schema.siteSettings.instagramUrl,
  name: schema.siteSettings.name,
  owner_name: schema.siteSettings.ownerName,
  short_name: schema.siteSettings.shortName,
  show_shader: schema.siteSettings.showShader,
  site_key: schema.siteSettings.siteKey,
  tagline: schema.siteSettings.tagline,
  theme: schema.siteSettings.theme,
};

/** One site's row, or null when it has never been saved. */
export const readSiteSettingsRow = async (
  siteKey: string
): Promise<SiteSettingsRow | null> => {
  const [row] = await getDb()
    .select(siteSettingsSelection)
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.siteKey, siteKey))
    .limit(1);
  return row ?? null;
};

/**
 * Every column a save must write, as a type rather than a list to remember.
 *
 * The raw INSERT named its columns twice — once as values, once as EXCLUDED —
 * and the whole risk of that shape was the two getting out of step. Replacing
 * it with one object removed the duplication and replaced it with a subtler
 * version of the same bug: an object literal happily omits a field, so the
 * first conversion of this endpoint silently dropped `tagline`. A save still
 * succeeded; the tagline just stopped being saved.
 *
 * `Required` is what closes it. A missing key is now a compile error rather
 * than a column that quietly stops persisting, which is the only guard that
 * survives somebody adding a twelfth setting in a year's time.
 */
export type SiteSettingsWrite = Required<
  Pick<
    typeof schema.siteSettings.$inferInsert,
    | "heroTitle"
    | "instagramHandle"
    | "instagramUrl"
    | "name"
    | "ownerName"
    | "shortName"
    | "showShader"
    | "tagline"
    | "theme"
    | "updatedBy"
  >
> & {
  /**
   * The timestamp, which is a SQL expression rather than a value.
   *
   * Written as `now()` in the database rather than a Date from Node, so every
   * row's time comes from one clock. `$inferInsert` types it as the string it
   * reads back as, which is why it is widened here instead of listed above.
   */
  updatedAt: SQL;
};
