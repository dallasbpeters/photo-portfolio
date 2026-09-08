import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  boardCommentsRelations,
  boardItemsRelations,
  boardSourcesRelations,
  boardsRelations,
  boardWiresRelations,
  brandKitsRelations,
  brandKitVersionsRelations,
  brandVerdictsRelations,
  canvaOauthStatesRelations,
  canvaTokensRelations,
  categoriesRelations,
  challengeJournalEntriesRelations,
  collectionItemsRelations,
  collectionsRelations,
  elementsRelations,
  lightroomAssetsRelations,
  lightroomCredentialsRelations,
  lightroomOauthStatesRelations,
  lightroomTokensRelations,
  pagesRelations,
  passwordResetTokensRelations,
  photosRelations,
  recipesRelations,
  recipeUsesRelations,
  recipeVersionsRelations,
  siteSettingsRelations,
  usersRelations,
} from "../../db/relations.js";
import {
  boardComments,
  boardItems,
  boardSources,
  boards,
  boardWires,
  brandKits,
  brandKitVersions,
  brandVerdicts,
  canvaOauthStates,
  canvaTokens,
  categories,
  challengeJournalEntries,
  collectionItems,
  collections,
  dailyChallenges,
  elements,
  lightroomAssets,
  lightroomCredentials,
  lightroomOauthStates,
  lightroomTokens,
  models,
  pages,
  passwordResetTokens,
  photos,
  recipes,
  recipeUses,
  recipeVersions,
  siteSettings,
  users,
} from "../../db/schema.js";
import { getDatabaseUrl } from "./db.js";

/**
 * The typed way to reach the database.
 *
 * A second door onto the same connection `getSql` already opens, not a
 * replacement for it: the endpoints written against raw SQL keep working
 * untouched, and each one moves over when it is next edited. Converting
 * seventy files at once would mean retesting every endpoint in the app to gain
 * nothing the day it landed.
 *
 * Over the same neon-http driver, so nothing about connections, pooling or the
 * serverless environment changes — only how a query is written.
 *
 * The schema in db/schema.ts is generated from a real database by
 * `pnpm db:pull`. Run it after adding a patch to db/patches, which remains the
 * only thing that creates or alters a table. Drizzle here reads and writes
 * rows; it does not own the shape of them.
 *
 * Usage:
 *   import { getDb, schema } from "../_lib/orm.js";
 *   const db = getDb();
 *   const rows = await db.select().from(schema.boards).limit(10);
 */

/** Every table in db/schema.ts, gathered under one name. */
export const schema = {
  boardComments,
  boardItems,
  boardSources,
  boards,
  boardWires,
  brandKits,
  brandKitVersions,
  brandVerdicts,
  canvaOauthStates,
  canvaTokens,
  categories,
  challengeJournalEntries,
  collectionItems,
  collections,
  dailyChallenges,
  elements,
  lightroomAssets,
  lightroomCredentials,
  lightroomOauthStates,
  lightroomTokens,
  models,
  pages,
  passwordResetTokens,
  photos,
  recipes,
  recipeUses,
  recipeVersions,
  siteSettings,
  users,
};

/** Every relation in db/relations.ts, gathered under one name. */
export const relations = {
  boardCommentsRelations,
  boardItemsRelations,
  boardSourcesRelations,
  boardsRelations,
  boardWiresRelations,
  brandKitsRelations,
  brandKitVersionsRelations,
  brandVerdictsRelations,
  canvaOauthStatesRelations,
  canvaTokensRelations,
  categoriesRelations,
  challengeJournalEntriesRelations,
  collectionItemsRelations,
  collectionsRelations,
  elementsRelations,
  lightroomAssetsRelations,
  lightroomCredentialsRelations,
  lightroomOauthStatesRelations,
  lightroomTokensRelations,
  pagesRelations,
  passwordResetTokensRelations,
  photosRelations,
  recipesRelations,
  recipeUsesRelations,
  recipeVersionsRelations,
  siteSettingsRelations,
  usersRelations,
};

/**
 * Built per call rather than once at module scope.
 *
 * `bootstrapEnv` re-reads the env files per request under `vercel dev`, and the
 * site being served decides which database is addressed — a client captured at
 * import time would pin the first site's URL for the life of the module.
 */
export const getDb = () =>
  drizzle(neon(getDatabaseUrl()), { schema: { ...schema, ...relations } });
