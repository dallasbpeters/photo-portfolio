import { sql } from "drizzle-orm";

/*
 * Two foreign keys are deliberately absent from this file.
 *
 * `recipes.current_version_id` points at `recipe_versions`, which points back
 * at `recipes`; `brand_kits.current_version_id` and `brand_kit_versions` do the
 * same. Declaring both directions makes each table's type depend on its own
 * definition, which TypeScript cannot infer — `drizzle-kit pull` emits code
 * that does not compile.
 *
 * Both constraints exist and are enforced in the database, created by
 * db/patches. Nothing here generates DDL (see db/README.md), so leaving the
 * pointer-to-version half out costs nothing: joins come from db/relations.ts,
 * which declares the relationship in both directions without the cycle.
 *
 * Re-apply this edit after every `pnpm db:pull`.
 */

import type { BuildColumns } from "drizzle-orm/column-builder";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";

/*
 * Explicit types on the four tables that reference each other.
 *
 * `recipes` points at `recipe_versions` and back; `brand_kits` and
 * `brand_kit_versions` do the same. TypeScript cannot infer a type that is used
 * inside its own definition, so `drizzle-kit pull` output does not compile
 * without these annotations. Re-add them after every `pnpm db:pull`.
 */

import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const categories = pgTable(
  "categories",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    label: text().notNull(),
    slug: text().notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    index("categories_sort_order_idx").using(
      "btree",
      table.sortOrder.asc().nullsLast().op("int4_ops")
    ),
    unique("categories_slug_key").on(table.slug),
  ]
);

export const siteSettings = pgTable(
  "site_settings",
  {
    heroTitle: text("hero_title"),
    instagramHandle: text("instagram_handle"),
    instagramUrl: text("instagram_url"),
    name: text(),
    ownerName: text("owner_name"),
    shortName: text("short_name"),
    showShader: boolean("show_shader"),
    siteKey: text("site_key").primaryKey().notNull(),
    tagline: text(),
    theme: jsonb().default({}).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [users.id],
      name: "site_settings_updated_by_fkey",
    }).onDelete("set null"),
  ]
);

export const users = pgTable(
  "users",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    email: text().notNull(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    passwordHash: text("password_hash").notNull(),
  },
  (table) => [unique("users_email_key").on(table.email)]
);

export const dailyChallenges = pgTable(
  "daily_challenges",
  {
    altText: text("alt_text"),
    challengeDate: date("challenge_date").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    imageThumbUrl: text("image_thumb_url"),
    imageUrl: text("image_url").notNull(),
    photographerName: text("photographer_name"),
    photographerUsername: text("photographer_username"),
    unsplashHtmlLink: text("unsplash_html_link"),
    unsplashPhotoId: text("unsplash_photo_id"),
  },
  (table) => [
    unique("daily_challenges_challenge_date_key").on(table.challengeDate),
  ]
);

export const challengeJournalEntries = pgTable(
  "challenge_journal_entries",
  {
    body: text().default("").notNull(),
    challengeDate: date("challenge_date").notNull(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "string",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    userId: uuid("user_id").notNull(),
  },
  (table) => [
    index("challenge_journal_user_date_idx").using(
      "btree",
      table.userId.asc().nullsLast().op("date_ops"),
      table.challengeDate.desc().nullsFirst().op("date_ops")
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "challenge_journal_entries_user_id_fkey",
    }).onDelete("cascade"),
    unique("challenge_journal_entries_user_id_challenge_date_key").on(
      table.userId,
      table.challengeDate
    ),
  ]
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    requestedIp: text("requested_ip"),
    tokenHash: text("token_hash").notNull(),
    usedAt: timestamp("used_at", { mode: "string", withTimezone: true }),
    userId: uuid("user_id").notNull(),
  },
  (table) => [
    index("password_reset_tokens_expires_idx").using(
      "btree",
      table.expiresAt.asc().nullsLast().op("timestamptz_ops")
    ),
    index("password_reset_tokens_user_idx").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("uuid_ops")
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "password_reset_tokens_user_id_fkey",
    }).onDelete("cascade"),
    unique("password_reset_tokens_token_hash_key").on(table.tokenHash),
  ]
);

export const pages = pgTable(
  "pages",
  {
    content: jsonb().default({ content: [], type: "doc" }).notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    icon: text(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    slug: text().notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    status: text().default("draft").notNull(),
    title: text().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    index("pages_published_order_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
      table.sortOrder.asc().nullsLast().op("int4_ops"),
      table.title.asc().nullsLast().op("text_ops")
    ),
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [users.id],
      name: "pages_updated_by_fkey",
    }).onDelete("set null"),
    unique("pages_slug_key").on(table.slug),
    check(
      "pages_status_check",
      sql`status = ANY (ARRAY['draft'::text, 'published'::text])`
    ),
  ]
);

export const boards = pgTable(
  "boards",
  {
    coverUrl: text("cover_url"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by"),
    id: uuid().defaultRandom().primaryKey().notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    slug: text(),
    title: text().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("boards_recent_idx").using(
      "btree",
      table.updatedAt.desc().nullsFirst().op("timestamptz_ops")
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "boards_created_by_fkey",
    }).onDelete("set null"),
    unique("boards_slug_key").on(table.slug),
  ]
);

export const photos = pgTable(
  "photos",
  {
    alt: text(),
    categoryId: uuid("category_id").notNull(),
    chromeUrl: text("chrome_url"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by"),
    exif: jsonb(),
    height: integer(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    isFeatured: boolean("is_featured").default(false).notNull(),
    isPublished: boolean("is_published").default(true).notNull(),
    lqip: text(),
    originalHeight: integer("original_height"),
    originalUrl: text("original_url"),
    originalWidth: integer("original_width"),
    showChrome: boolean("show_chrome"),
    sortOrder: integer("sort_order").default(0).notNull(),
    title: text().notNull(),
    url: text().notNull(),
    width: integer(),
  },
  (table) => [
    index("photos_category_id_idx").using(
      "btree",
      table.categoryId.asc().nullsLast().op("uuid_ops")
    ),
    index("photos_featured_published_idx").using(
      "btree",
      table.isFeatured.asc().nullsLast().op("int4_ops"),
      table.isPublished.asc().nullsLast().op("bool_ops"),
      table.sortOrder.asc().nullsLast().op("int4_ops"),
      table.createdAt.asc().nullsLast().op("bool_ops")
    ),
    index("photos_published_order_idx").using(
      "btree",
      table.isPublished.asc().nullsLast().op("bool_ops"),
      table.sortOrder.asc().nullsLast().op("int4_ops"),
      table.createdAt.asc().nullsLast().op("timestamptz_ops")
    ),
    index("photos_sort_order_idx").using(
      "btree",
      table.sortOrder.asc().nullsLast().op("int4_ops")
    ),
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      name: "photos_category_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "photos_created_by_fkey",
    }).onDelete("set null"),
  ]
);

export const lightroomTokens = pgTable(
  "lightroom_tokens",
  {
    accessToken: text("access_token").notNull(),
    accountEmail: text("account_email"),
    catalogId: text("catalog_id"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
    refreshToken: text("refresh_token"),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: uuid("user_id").primaryKey().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "lightroom_tokens_user_id_fkey",
    }).onDelete("cascade"),
  ]
);

export const recipes = pgTable(
  "recipes",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by"),
    currentVersionId: uuid("current_version_id"),
    description: text(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("recipes_updated_idx").using(
      "btree",
      table.updatedAt.desc().nullsFirst().op("timestamptz_ops")
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "recipes_created_by_fkey",
    }).onDelete("set null"),
    check("recipes_named", sql`length(btrim(name)) > 0`),
  ]
);

export const lightroomOauthStates = pgTable(
  "lightroom_oauth_states",
  {
    codeVerifier: text("code_verifier").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    state: text().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "lightroom_oauth_states_user_id_fkey",
    }).onDelete("cascade"),
  ]
);

export const collections = pgTable(
  "collections",
  {
    coverUrl: text("cover_url"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by"),
    description: text(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("collections_by_updated").using(
      "btree",
      table.updatedAt.desc().nullsFirst().op("timestamptz_ops")
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "collections_created_by_fkey",
    }).onDelete("set null"),
    check("collections_named", sql`length(btrim(name)) > 0`),
  ]
);

export const collectionItems = pgTable(
  "collection_items",
  {
    alt: text(),
    collectionId: uuid("collection_id").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    height: integer(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    kind: text().default("image").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    title: text(),
    url: text().notNull(),
    width: integer(),
  },
  (table) => [
    index("collection_items_by_collection").using(
      "btree",
      table.collectionId.asc().nullsLast().op("timestamptz_ops"),
      table.sortOrder.asc().nullsLast().op("uuid_ops"),
      table.createdAt.asc().nullsLast().op("uuid_ops")
    ),
    uniqueIndex("collection_items_unique").using(
      "btree",
      table.collectionId.asc().nullsLast().op("uuid_ops"),
      table.url.asc().nullsLast().op("uuid_ops")
    ),
    foreignKey({
      columns: [table.collectionId],
      foreignColumns: [collections.id],
      name: "collection_items_collection_id_fkey",
    }).onDelete("cascade"),
    check(
      "collection_items_kind",
      sql`kind = ANY (ARRAY['image'::text, 'video'::text])`
    ),
  ]
);

export const elements = pgTable(
  "elements",
  {
    coverUrl: text("cover_url"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by"),
    description: text(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    imageUrls: jsonb("image_urls").default([]).notNull(),
    name: text().notNull(),
    styleBrief: text("style_brief"),
    styleBriefKey: text("style_brief_key"),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("elements_updated_idx").using(
      "btree",
      table.updatedAt.desc().nullsFirst().op("timestamptz_ops")
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "elements_created_by_fkey",
    }).onDelete("set null"),
    check("elements_named", sql`length(btrim(name)) > 0`),
    check(
      "elements_images_array",
      sql`jsonb_typeof(image_urls) = 'array'::text`
    ),
  ]
);

export const boardWires = pgTable(
  "board_wires",
  {
    boardId: uuid("board_id").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    id: uuid().primaryKey().notNull(),
    sourceItemId: uuid("source_item_id").notNull(),
    sourcePort: text("source_port").notNull(),
    targetItemId: uuid("target_item_id").notNull(),
    targetPort: text("target_port").notNull(),
  },
  (table) => [
    index("board_wires_board_idx").using(
      "btree",
      table.boardId.asc().nullsLast().op("uuid_ops")
    ),
    foreignKey({
      columns: [table.boardId],
      foreignColumns: [boards.id],
      name: "board_wires_board_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourceItemId],
      foreignColumns: [boardItems.id],
      name: "board_wires_source_item_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.targetItemId],
      foreignColumns: [boardItems.id],
      name: "board_wires_target_item_id_fkey",
    }).onDelete("cascade"),
    unique("board_wires_unique_edge").on(
      table.sourceItemId,
      table.sourcePort,
      table.targetItemId,
      table.targetPort
    ),
    check("board_wires_no_self", sql`source_item_id <> target_item_id`),
  ]
);

export const boardSources = pgTable(
  "board_sources",
  {
    boardId: uuid("board_id").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    id: uuid().primaryKey().notNull(),
    provider: text().notNull(),
    title: text(),
    url: text().notNull(),
  },
  (table) => [
    index("board_sources_board_idx").using(
      "btree",
      table.boardId.asc().nullsLast().op("uuid_ops")
    ),
    foreignKey({
      columns: [table.boardId],
      foreignColumns: [boards.id],
      name: "board_sources_board_id_fkey",
    }).onDelete("cascade"),
    unique("board_sources_unique").on(table.boardId, table.url),
    check("board_sources_provider_check", sql`provider = 'pinterest'::text`),
  ]
);

export const canvaTokens = pgTable(
  "canva_tokens",
  {
    accessToken: text("access_token").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
    refreshToken: text("refresh_token").notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: uuid("user_id").primaryKey().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "canva_tokens_user_id_fkey",
    }).onDelete("cascade"),
  ]
);

export const canvaOauthStates = pgTable(
  "canva_oauth_states",
  {
    codeVerifier: text("code_verifier").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    state: text().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "canva_oauth_states_user_id_fkey",
    }).onDelete("cascade"),
  ]
);

export const boardComments = pgTable(
  "board_comments",
  {
    authorName: text("author_name").notNull(),
    boardId: uuid("board_id").notNull(),
    body: text().notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    itemId: uuid("item_id").notNull(),
    resolved: boolean().default(false).notNull(),
    x: real().default(0.5).notNull(),
    y: real().default(0.5).notNull(),
  },
  (table) => [
    index("board_comments_board_idx").using(
      "btree",
      table.boardId.asc().nullsLast().op("timestamptz_ops"),
      table.createdAt.asc().nullsLast().op("timestamptz_ops")
    ),
    foreignKey({
      columns: [table.boardId],
      foreignColumns: [boards.id],
      name: "board_comments_board_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [boardItems.id],
      name: "board_comments_item_id_fkey",
    }).onDelete("cascade"),
  ]
);

export const recipeUses = pgTable(
  "recipe_uses",
  {
    boardId: uuid("board_id").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    id: uuid().primaryKey().notNull(),
    pinnedVersion: integer("pinned_version").notNull(),
    recipeId: uuid("recipe_id"),
    recipeVersionId: uuid("recipe_version_id"),
  },
  (table) => [
    index("recipe_uses_board_idx").using(
      "btree",
      table.boardId.asc().nullsLast().op("uuid_ops")
    ),
    foreignKey({
      columns: [table.boardId],
      foreignColumns: [boards.id],
      name: "recipe_uses_board_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recipeId],
      foreignColumns: [recipes.id],
      name: "recipe_uses_recipe_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.recipeVersionId],
      foreignColumns: [recipeVersions.id],
      name: "recipe_uses_recipe_version_id_fkey",
    }).onDelete("set null"),
  ]
);

export const recipeVersions = pgTable(
  "recipe_versions",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    declaredInputs: jsonb("declared_inputs").default([]).notNull(),
    graph: jsonb().notNull(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    recipeId: uuid("recipe_id").notNull(),
    unverified: boolean().default(false).notNull(),
    version: integer().notNull(),
  },
  (table) => [
    index("recipe_versions_recipe_idx").using(
      "btree",
      table.recipeId.asc().nullsLast().op("uuid_ops"),
      table.version.desc().nullsFirst().op("uuid_ops")
    ),
    foreignKey({
      columns: [table.recipeId],
      foreignColumns: [recipes.id],
      name: "recipe_versions_recipe_id_fkey",
    }).onDelete("cascade"),
    unique("recipe_versions_numbered").on(table.recipeId, table.version),
    check(
      "recipe_versions_graph_object",
      sql`jsonb_typeof(graph) = 'object'::text`
    ),
    check(
      "recipe_versions_inputs_array",
      sql`jsonb_typeof(declared_inputs) = 'array'::text`
    ),
  ]
);

export const lightroomAssets = pgTable(
  "lightroom_assets",
  {
    assetId: text("asset_id").primaryKey().notNull(),
    catalogId: text("catalog_id").notNull(),
    direction: text().default("import").notNull(),
    importedAt: timestamp("imported_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    photoId: uuid("photo_id"),
    rendition: text(),
  },
  (table) => [
    index("lightroom_assets_catalog_idx").using(
      "btree",
      table.catalogId.asc().nullsLast().op("text_ops")
    ),
    index("lightroom_assets_photo_idx")
      .using("btree", table.photoId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(photo_id IS NOT NULL)`),
    foreignKey({
      columns: [table.photoId],
      foreignColumns: [photos.id],
      name: "lightroom_assets_photo_id_fkey",
    }).onDelete("set null"),
    check(
      "lightroom_assets_direction",
      sql`direction = ANY (ARRAY['import'::text, 'export'::text])`
    ),
  ]
);

export const models = pgTable(
  "models",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    enabled: boolean().default(true).notNull(),
    id: text().primaryKey().notNull(),
    imageParam: text("image_param").default("image_url").notNull(),
    input: text().notNull(),
    label: text().notNull(),
    loraEndpoint: text("lora_endpoint"),
    loraImageEndpoint: text("lora_image_endpoint"),
    loraPath: text("lora_path"),
    loraScale: real("lora_scale"),
    loraTrigger: text("lora_trigger"),
    output: text().default("image").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    /*
     * A training run this app started. See db/patches/035_model_training.sql.
     *
     * Added by hand rather than by `pnpm db:pull`, because a pull rewrites this
     * file and would undo the two edits documented at the top of it. Keep these
     * in step with the patch by hand, or re-pull and re-apply all three.
     *
     * Null on every model added by hand, which is most of them: only a row this
     * app trained carries a status.
     */
    trainingError: text("training_error"),
    trainingResponseUrl: text("training_response_url"),
    trainingStartedAt: timestamp("training_started_at", {
      mode: "string",
      withTimezone: true,
    }),
    trainingStatus: text("training_status"),
    trainingStatusUrl: text("training_status_url"),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    vector: boolean().default(false).notNull(),
  },
  (table) => [
    index("models_enabled_order_idx").using(
      "btree",
      table.enabled.asc().nullsLast().op("int4_ops"),
      table.sortOrder.asc().nullsLast().op("bool_ops"),
      table.id.asc().nullsLast().op("bool_ops")
    ),
    check("models_label", sql`length(btrim(label)) > 0`),
    check(
      "models_input",
      sql`input = ANY (ARRAY['prompt'::text, 'image'::text, 'prompt-and-image'::text, 'prompt-or-image'::text, 'video'::text, 'prompt-and-video'::text])`
    ),
    check(
      "models_image_param",
      sql`image_param = ANY (ARRAY['image_url'::text, 'image_urls'::text, 'start_image_url'::text, 'video_url'::text])`
    ),
    check(
      "models_auto_shape",
      sql`(id <> 'auto'::text) OR ((input = 'prompt-or-image'::text) AND (image_param = 'image_url'::text) AND (vector = false))`
    ),
    check(
      "models_output_check",
      sql`output = ANY (ARRAY['image'::text, 'video'::text])`
    ),
  ]
);

export const boardItems = pgTable(
  "board_items",
  {
    boardId: uuid("board_id").notNull(),
    body: text(),
    config: jsonb(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    creditName: text("credit_name"),
    creditUrl: text("credit_url"),
    fontSize: doublePrecision("font_size"),
    height: doublePrecision().default(240).notNull(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    imageUrl: text("image_url"),
    kind: text().notNull(),
    nodeType: text("node_type"),
    photoId: uuid("photo_id"),
    recipeUseId: uuid("recipe_use_id"),
    result: jsonb(),
    runError: text("run_error"),
    runState: text("run_state"),
    textStyle: jsonb("text_style"),
    thumbUrl: text("thumb_url"),
    width: doublePrecision().default(320).notNull(),
    x: doublePrecision().default(0).notNull(),
    y: doublePrecision().default(0).notNull(),
    zIndex: integer("z_index").default(0).notNull(),
  },
  (table) => [
    index("board_items_board_stack_idx").using(
      "btree",
      table.boardId.asc().nullsLast().op("int4_ops"),
      table.zIndex.asc().nullsLast().op("uuid_ops"),
      table.createdAt.asc().nullsLast().op("timestamptz_ops")
    ),
    index("board_items_recipe_use_idx")
      .using("btree", table.recipeUseId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(recipe_use_id IS NOT NULL)`),
    foreignKey({
      columns: [table.boardId],
      foreignColumns: [boards.id],
      name: "board_items_board_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.photoId],
      foreignColumns: [photos.id],
      name: "board_items_photo_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recipeUseId],
      foreignColumns: [recipeUses.id],
      name: "board_items_recipe_use_fk",
    }).onDelete("set null"),
    check(
      "board_items_run_state_check",
      sql`(run_state IS NULL) OR (run_state = ANY (ARRAY['idle'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'skipped'::text]))`
    ),
    check(
      "board_items_kind_check",
      sql`kind = ANY (ARRAY['photo'::text, 'reference'::text, 'note'::text, 'text'::text, 'op'::text, 'frame'::text, 'shader'::text, 'drawing'::text])`
    ),
    check(
      "board_items_shape",
      sql`((kind = 'photo'::text) AND (photo_id IS NOT NULL)) OR ((kind = 'reference'::text) AND (image_url IS NOT NULL)) OR ((kind = ANY (ARRAY['note'::text, 'text'::text, 'frame'::text])) AND (body IS NOT NULL)) OR ((kind = 'op'::text) AND (node_type IS NOT NULL)) OR ((kind = ANY (ARRAY['shader'::text, 'drawing'::text])) AND (config IS NOT NULL))`
    ),
  ]
);

export const lightroomCredentials = pgTable(
  "lightroom_credentials",
  {
    clientId: text("client_id"),
    clientSecret: text("client_secret"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    id: integer().default(1).primaryKey().notNull(),
    redirectUri: text("redirect_uri"),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [users.id],
      name: "lightroom_credentials_updated_by_fkey",
    }).onDelete("set null"),
    check("lightroom_credentials_single_row", sql`id = 1`),
  ]
);

const brandKitVersionsColumns = {
  brandKitId: uuid("brand_kit_id").notNull(),
  createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
    .defaultNow()
    .notNull(),
  doc: jsonb().notNull(),
  id: uuid().defaultRandom().primaryKey().notNull(),
  version: integer().notNull(),
};

export const brandKitVersions: PgTableWithColumns<{
  columns: BuildColumns<
    "brand_kit_versions",
    typeof brandKitVersionsColumns,
    "pg"
  >;
  dialect: "pg";
  name: "brand_kit_versions";
  schema: undefined;
}> = pgTable("brand_kit_versions", brandKitVersionsColumns, (table) => [
  index("brand_kit_versions_kit_idx").using(
    "btree",
    table.brandKitId.asc().nullsLast().op("int4_ops"),
    table.version.desc().nullsFirst().op("int4_ops")
  ),
  foreignKey({
    columns: [table.brandKitId],
    foreignColumns: [brandKits.id],
    name: "brand_kit_versions_brand_kit_id_fkey",
  }).onDelete("cascade"),
  unique("brand_kit_versions_numbered").on(table.brandKitId, table.version),
  check(
    "brand_kit_versions_doc_object",
    sql`jsonb_typeof(doc) = 'object'::text`
  ),
]);

export const brandVerdicts = pgTable(
  "brand_verdicts",
  {
    acknowledgedAt: timestamp("acknowledged_at", {
      mode: "string",
      withTimezone: true,
    }),
    assetUrl: text("asset_url").notNull(),
    boardId: uuid("board_id").notNull(),
    brandKitVersionId: uuid("brand_kit_version_id"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    findings: jsonb().default([]).notNull(),
    id: uuid().defaultRandom().primaryKey().notNull(),
    itemId: uuid("item_id"),
    kitVersion: integer("kit_version").notNull(),
    overriddenAt: timestamp("overridden_at", {
      mode: "string",
      withTimezone: true,
    }),
    overrideReason: text("override_reason"),
    passed: boolean().notNull(),
  },
  (table) => [
    index("brand_verdicts_asset_idx").using(
      "btree",
      table.assetUrl.asc().nullsLast().op("text_ops"),
      table.createdAt.desc().nullsFirst().op("text_ops")
    ),
    index("brand_verdicts_board_idx").using(
      "btree",
      table.boardId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops")
    ),
    index("brand_verdicts_outstanding_idx")
      .using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops"))
      .where(sql`((passed = false) AND (acknowledged_at IS NULL))`),
    foreignKey({
      columns: [table.boardId],
      foreignColumns: [boards.id],
      name: "brand_verdicts_board_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [boardItems.id],
      name: "brand_verdicts_item_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.brandKitVersionId],
      foreignColumns: [brandKitVersions.id],
      name: "brand_verdicts_brand_kit_version_id_fkey",
    }).onDelete("set null"),
    check(
      "brand_verdicts_findings_array",
      sql`jsonb_typeof(findings) = 'array'::text`
    ),
  ]
);

export const brandKits = pgTable(
  "brand_kits",
  {
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by"),
    currentVersionId: uuid("current_version_id"),
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    parentId: uuid("parent_id"),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("brand_kits_parent_idx")
      .using("btree", table.parentId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(parent_id IS NOT NULL)`),
    index("brand_kits_updated_idx").using(
      "btree",
      table.updatedAt.desc().nullsFirst().op("timestamptz_ops")
    ),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "brand_kits_parent_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "brand_kits_created_by_fkey",
    }).onDelete("set null"),
    check("brand_kits_named", sql`length(btrim(name)) > 0`),
    check(
      "brand_kits_not_own_parent",
      sql`(parent_id IS NULL) OR (parent_id <> id)`
    ),
  ]
);
