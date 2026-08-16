import type { ZodType } from "zod";
import {
  AuthenticatedUser,
  Category,
  CategoryCreate,
  Credentials,
  Page,
  PageCreate,
  PageSummary,
  Photo,
  PhotoCreate,
  PhotoIdList,
  PhotoList,
  PhotoUpdate,
  SiteSettings,
  SiteSettingsUpdate,
} from "./domain";

/**
 * What each endpoint accepts and returns.
 *
 * The route *list* is not here — `scripts/generate-openapi.ts` walks `api/` and
 * derives every path and method from the filesystem, so a new endpoint appears
 * in the document the moment the file exists. This registry only adds the
 * detail a filename cannot carry: the bodies, and whether a token is needed.
 *
 * An endpoint missing from here is still published, marked as having no
 * described body, which keeps the document honest rather than silently partial.
 */
export interface Operation {
  /** Requires `Authorization: Bearer <token>`. */
  auth?: boolean;
  /** Request body schema. */
  body?: ZodType;
  description?: string;
  /** 2xx response schema. */
  response?: ZodType;
  summary: string;
}

/** Keyed `"<METHOD> <path>"`, using the OpenAPI path form. */
export const OPERATIONS: Record<string, Operation> = {
  "DELETE /api/categories/{id}": {
    auth: true,
    summary: "Delete a category. Fails while photographs still use it.",
  },
  "DELETE /api/pages/{slug}": { auth: true, summary: "Delete a page." },
  "DELETE /api/photos/{id}": { auth: true, summary: "Delete a photograph." },

  "GET /api/auth/me": {
    auth: true,
    response: AuthenticatedUser,
    summary: "The signed-in user.",
  },
  "GET /api/categories": {
    response: Category.array(),
    summary: "Every category, in sort order.",
  },
  "GET /api/pages": {
    description:
      "Published pages only for a visitor; every page when a token is sent.",
    response: PageSummary.array(),
    summary: "Page summaries for the navigation.",
  },
  "GET /api/pages/{slug}": { response: Page, summary: "One page, with body." },
  "GET /api/photos": {
    description:
      "Published photographs only for a visitor. With a bearer token the unpublished ones are included, which is what the admin library reads.",
    response: PhotoList,
    summary: "The photograph library.",
  },
  "GET /api/site-settings": {
    description:
      "Falls back to the values compiled into config/sites.ts if the table is unreachable, so this never fails.",
    response: SiteSettings,
    summary: "Editable branding and theme for this site.",
  },

  "PATCH /api/pages/{slug}": {
    auth: true,
    body: PageCreate.partial(),
    response: Page,
    summary: "Update a page.",
  },
  "PATCH /api/photos/{id}": {
    auth: true,
    body: PhotoUpdate,
    description:
      "Absent keys are left alone. `exif` and `chromeUrl` are the exception: sending them empty clears the stored value, which is the only way to remove one.",
    response: Photo,
    summary: "Update a photograph.",
  },
  "PATCH /api/site-settings": {
    auth: true,
    body: SiteSettingsUpdate,
    response: SiteSettings,
    summary: "Save branding and theme.",
  },

  "POST /api/auth/login": {
    body: Credentials,
    response: AuthenticatedUser,
    summary: "Exchange credentials for a bearer token.",
  },
  "POST /api/categories": {
    auth: true,
    body: CategoryCreate,
    response: Category,
    summary: "Create a category.",
  },
  "POST /api/pages": {
    auth: true,
    body: PageCreate,
    response: Page,
    summary: "Create a page.",
  },
  "POST /api/photos": {
    auth: true,
    body: PhotoCreate,
    response: Photo,
    summary: "Add a photograph. Inserted at the top; every other order shifts.",
  },
  "POST /api/photos/{id}/reset": {
    auth: true,
    response: Photo,
    summary: "Restore the pre-edit original.",
  },
  "POST /api/photos/{id}/rotate": {
    auth: true,
    response: Photo,
    summary: "Rotate a photograph 90 degrees.",
  },
  "POST /api/photos/batch-delete": {
    auth: true,
    body: PhotoIdList,
    summary: "Delete several photographs at once.",
  },
  "POST /api/photos/reorder": {
    auth: true,
    body: PhotoIdList,
    description: "The ids in their new order.",
    response: PhotoList,
    summary: "Reorder the library.",
  },
};
