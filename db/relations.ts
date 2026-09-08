import { relations } from "drizzle-orm/relations";
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
  elements,
  lightroomAssets,
  lightroomCredentials,
  lightroomOauthStates,
  lightroomTokens,
  pages,
  passwordResetTokens,
  photos,
  recipes,
  recipeUses,
  recipeVersions,
  siteSettings,
  users,
} from "./schema";

export const siteSettingsRelations = relations(siteSettings, ({ one }) => ({
  user: one(users, {
    fields: [siteSettings.updatedBy],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  boards: many(boards),
  brandKits: many(brandKits),
  canvaOauthStates: many(canvaOauthStates),
  canvaTokens: many(canvaTokens),
  challengeJournalEntries: many(challengeJournalEntries),
  collections: many(collections),
  elements: many(elements),
  lightroomCredentials: many(lightroomCredentials),
  lightroomOauthStates: many(lightroomOauthStates),
  lightroomTokens: many(lightroomTokens),
  pages: many(pages),
  passwordResetTokens: many(passwordResetTokens),
  photos: many(photos),
  recipes: many(recipes),
  siteSettings: many(siteSettings),
}));

export const challengeJournalEntriesRelations = relations(
  challengeJournalEntries,
  ({ one }) => ({
    user: one(users, {
      fields: [challengeJournalEntries.userId],
      references: [users.id],
    }),
  })
);

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  })
);

export const pagesRelations = relations(pages, ({ one }) => ({
  user: one(users, {
    fields: [pages.updatedBy],
    references: [users.id],
  }),
}));

export const boardsRelations = relations(boards, ({ one, many }) => ({
  boardComments: many(boardComments),
  boardItems: many(boardItems),
  boardSources: many(boardSources),
  boardWires: many(boardWires),
  brandVerdicts: many(brandVerdicts),
  recipeUses: many(recipeUses),
  user: one(users, {
    fields: [boards.createdBy],
    references: [users.id],
  }),
}));

export const photosRelations = relations(photos, ({ one, many }) => ({
  boardItems: many(boardItems),
  category: one(categories, {
    fields: [photos.categoryId],
    references: [categories.id],
  }),
  lightroomAssets: many(lightroomAssets),
  user: one(users, {
    fields: [photos.createdBy],
    references: [users.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  photos: many(photos),
}));

export const lightroomTokensRelations = relations(
  lightroomTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [lightroomTokens.userId],
      references: [users.id],
    }),
  })
);

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  recipeUses: many(recipeUses),
  recipeVersion: one(recipeVersions, {
    fields: [recipes.currentVersionId],
    references: [recipeVersions.id],
    relationName: "recipes_currentVersionId_recipeVersions_id",
  }),
  recipeVersions: many(recipeVersions, {
    relationName: "recipeVersions_recipeId_recipes_id",
  }),
  user: one(users, {
    fields: [recipes.createdBy],
    references: [users.id],
  }),
}));

export const recipeVersionsRelations = relations(
  recipeVersions,
  ({ one, many }) => ({
    recipe: one(recipes, {
      fields: [recipeVersions.recipeId],
      references: [recipes.id],
      relationName: "recipeVersions_recipeId_recipes_id",
    }),
    recipes: many(recipes, {
      relationName: "recipes_currentVersionId_recipeVersions_id",
    }),
    recipeUses: many(recipeUses),
  })
);

export const lightroomOauthStatesRelations = relations(
  lightroomOauthStates,
  ({ one }) => ({
    user: one(users, {
      fields: [lightroomOauthStates.userId],
      references: [users.id],
    }),
  })
);

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  collectionItems: many(collectionItems),
  user: one(users, {
    fields: [collections.createdBy],
    references: [users.id],
  }),
}));

export const collectionItemsRelations = relations(
  collectionItems,
  ({ one }) => ({
    collection: one(collections, {
      fields: [collectionItems.collectionId],
      references: [collections.id],
    }),
  })
);

export const elementsRelations = relations(elements, ({ one }) => ({
  user: one(users, {
    fields: [elements.createdBy],
    references: [users.id],
  }),
}));

export const boardWiresRelations = relations(boardWires, ({ one }) => ({
  board: one(boards, {
    fields: [boardWires.boardId],
    references: [boards.id],
  }),
  boardItem_sourceItemId: one(boardItems, {
    fields: [boardWires.sourceItemId],
    references: [boardItems.id],
    relationName: "boardWires_sourceItemId_boardItems_id",
  }),
  boardItem_targetItemId: one(boardItems, {
    fields: [boardWires.targetItemId],
    references: [boardItems.id],
    relationName: "boardWires_targetItemId_boardItems_id",
  }),
}));

export const boardItemsRelations = relations(boardItems, ({ one, many }) => ({
  board: one(boards, {
    fields: [boardItems.boardId],
    references: [boards.id],
  }),
  boardComments: many(boardComments),
  boardWires_sourceItemId: many(boardWires, {
    relationName: "boardWires_sourceItemId_boardItems_id",
  }),
  boardWires_targetItemId: many(boardWires, {
    relationName: "boardWires_targetItemId_boardItems_id",
  }),
  brandVerdicts: many(brandVerdicts),
  photo: one(photos, {
    fields: [boardItems.photoId],
    references: [photos.id],
  }),
  recipeus: one(recipeUses, {
    fields: [boardItems.recipeUseId],
    references: [recipeUses.id],
  }),
}));

export const boardSourcesRelations = relations(boardSources, ({ one }) => ({
  board: one(boards, {
    fields: [boardSources.boardId],
    references: [boards.id],
  }),
}));

export const canvaTokensRelations = relations(canvaTokens, ({ one }) => ({
  user: one(users, {
    fields: [canvaTokens.userId],
    references: [users.id],
  }),
}));

export const canvaOauthStatesRelations = relations(
  canvaOauthStates,
  ({ one }) => ({
    user: one(users, {
      fields: [canvaOauthStates.userId],
      references: [users.id],
    }),
  })
);

export const boardCommentsRelations = relations(boardComments, ({ one }) => ({
  board: one(boards, {
    fields: [boardComments.boardId],
    references: [boards.id],
  }),
  boardItem: one(boardItems, {
    fields: [boardComments.itemId],
    references: [boardItems.id],
  }),
}));

export const recipeUsesRelations = relations(recipeUses, ({ one, many }) => ({
  board: one(boards, {
    fields: [recipeUses.boardId],
    references: [boards.id],
  }),
  boardItems: many(boardItems),
  recipe: one(recipes, {
    fields: [recipeUses.recipeId],
    references: [recipes.id],
  }),
  recipeVersion: one(recipeVersions, {
    fields: [recipeUses.recipeVersionId],
    references: [recipeVersions.id],
  }),
}));

export const lightroomAssetsRelations = relations(
  lightroomAssets,
  ({ one }) => ({
    photo: one(photos, {
      fields: [lightroomAssets.photoId],
      references: [photos.id],
    }),
  })
);

export const lightroomCredentialsRelations = relations(
  lightroomCredentials,
  ({ one }) => ({
    user: one(users, {
      fields: [lightroomCredentials.updatedBy],
      references: [users.id],
    }),
  })
);

export const brandKitVersionsRelations = relations(
  brandKitVersions,
  ({ one, many }) => ({
    brandKit: one(brandKits, {
      fields: [brandKitVersions.brandKitId],
      references: [brandKits.id],
      relationName: "brandKitVersions_brandKitId_brandKits_id",
    }),
    brandKits: many(brandKits, {
      relationName: "brandKits_currentVersionId_brandKitVersions_id",
    }),
    brandVerdicts: many(brandVerdicts),
  })
);

export const brandKitsRelations = relations(brandKits, ({ one, many }) => ({
  brandKit: one(brandKits, {
    fields: [brandKits.parentId],
    references: [brandKits.id],
    relationName: "brandKits_parentId_brandKits_id",
  }),
  brandKits: many(brandKits, {
    relationName: "brandKits_parentId_brandKits_id",
  }),
  brandKitVersion: one(brandKitVersions, {
    fields: [brandKits.currentVersionId],
    references: [brandKitVersions.id],
    relationName: "brandKits_currentVersionId_brandKitVersions_id",
  }),
  brandKitVersions: many(brandKitVersions, {
    relationName: "brandKitVersions_brandKitId_brandKits_id",
  }),
  user: one(users, {
    fields: [brandKits.createdBy],
    references: [users.id],
  }),
}));

export const brandVerdictsRelations = relations(brandVerdicts, ({ one }) => ({
  board: one(boards, {
    fields: [brandVerdicts.boardId],
    references: [boards.id],
  }),
  boardItem: one(boardItems, {
    fields: [brandVerdicts.itemId],
    references: [boardItems.id],
  }),
  brandKitVersion: one(brandKitVersions, {
    fields: [brandVerdicts.brandKitVersionId],
    references: [brandKitVersions.id],
  }),
}));
