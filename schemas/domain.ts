import { z } from "zod";

/**
 * The API's shapes, as one source of truth.
 *
 * These are zod rather than bare TypeScript so a single definition can serve
 * three purposes: the compile-time type (`z.infer`), the runtime check a
 * handler performs on an incoming body, and the JSON Schema the OpenAPI
 * document is generated from. Writing the three separately is how they drift —
 * `PhotoRow` said `showChrome` while Postgres returned `show_chrome`, and
 * nothing caught it because the type was the only description that existed.
 */

export const ErrorResponse = z
  .object({ error: z.string() })
  .meta({ description: "Every failing endpoint answers with this shape." });

// ── Photographs ──────────────────────────────────────────────────────────────

export const PhotoExif = z.object({
  aperture: z.number().positive().optional(),
  exposureTime: z.number().positive().optional().describe("Seconds"),
  focalLength: z.number().positive().optional().describe("Millimetres"),
  iso: z.number().int().positive().optional(),
  lens: z.string().max(120).optional(),
  make: z.string().max(120).optional(),
  model: z.string().max(120).optional(),
  takenAt: z.iso.datetime().optional(),
});

export const Photo = z
  .object({
    alt: z.string().describe("Falls back to the title, so never empty."),
    category: z.string().describe("URL-safe slug."),
    categoryId: z.uuid(),
    categoryLabel: z.string(),
    chromeUrl: z
      .string()
      .nullable()
      .describe("Address drawn in the browser chrome. Display only."),
    createdAt: z.iso.datetime(),
    exif: PhotoExif.nullable(),
    height: z.number().int().nullable(),
    id: z.uuid(),
    isFeatured: z.boolean().describe("Included in the homepage hero."),
    isPublished: z.boolean().describe("False hides it from the public site."),
    lqip: z.string().nullable().describe("Inline blurred placeholder."),
    order: z.number().int(),
    originalUrl: z.string().nullable().describe("Pre-edit image, for undo."),
    showChrome: z.boolean().describe("Frame this image as a browser window."),
    title: z.string(),
    url: z.url(),
    width: z.number().int().nullable(),
  })
  .meta({ id: "Photo" });

export const PhotoList = z.array(Photo).meta({ id: "PhotoList" });

export const PhotoUpdate = z
  .object({
    categoryId: z.uuid(),
    chromeUrl: z
      .string()
      .max(300)
      .optional()
      .describe("Omit to leave alone; empty string clears it."),
    exif: PhotoExif.nullable().optional(),
    isFeatured: z.boolean().optional(),
    isPublished: z.boolean().optional(),
    order: z.number().int(),
    showChrome: z.boolean().optional(),
    title: z.string().min(1).max(200),
    url: z.url().optional(),
  })
  .meta({ id: "PhotoUpdate" });

export const PhotoCreate = z
  .object({
    alt: z.string().max(300).optional(),
    categoryId: z.uuid(),
    exif: PhotoExif.nullable().optional(),
    height: z.number().int().optional(),
    lqip: z.string().optional(),
    title: z.string().min(1).max(200),
    url: z.url(),
    width: z.number().int().optional(),
  })
  .meta({ id: "PhotoCreate" });

export const PhotoIdList = z
  .object({ photoIds: z.array(z.uuid()).min(1) })
  .meta({ id: "PhotoIdList" });

// ── Categories ───────────────────────────────────────────────────────────────

export const Category = z
  .object({
    id: z.uuid(),
    label: z.string(),
    photoCount: z.number().int().optional(),
    slug: z.string(),
    sortOrder: z.number().int(),
  })
  .meta({ id: "Category" });

export const CategoryCreate = z
  .object({ label: z.string().min(1).max(120), sortOrder: z.number().int() })
  .meta({ id: "CategoryCreate" });

// ── Editorial pages ──────────────────────────────────────────────────────────

export const PageStatus = z.enum(["draft", "published"]);

export const Page = z
  .object({
    content: z.unknown().describe("TipTap document."),
    createdAt: z.iso.datetime(),
    icon: z.string().nullable(),
    id: z.uuid(),
    order: z.number().int(),
    slug: z.string(),
    status: PageStatus,
    title: z.string(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "Page" });

export const PageSummary = Page.pick({
  icon: true,
  id: true,
  order: true,
  slug: true,
  title: true,
}).meta({ id: "PageSummary" });

export const PageCreate = z
  .object({
    icon: z.string().nullable().optional(),
    slug: z.string().min(1).max(60),
    status: PageStatus.optional(),
    title: z.string().min(1),
  })
  .meta({ id: "PageCreate" });

// ── Site settings ────────────────────────────────────────────────────────────

export const SiteTheme = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sansFont: z.string(),
  serifFont: z.string(),
});

export const SiteSettings = z
  .object({
    heroTitle: z.string(),
    instagramHandle: z.string(),
    instagramUrl: z.string(),
    name: z.string(),
    ownerName: z.string(),
    shortName: z.string(),
    showShader: z.boolean(),
    siteKey: z.string(),
    tagline: z.string(),
    theme: SiteTheme,
  })
  .meta({ id: "SiteSettings" });

export const SiteSettingsUpdate = SiteSettings.partial()
  .omit({ siteKey: true })
  .meta({ id: "SiteSettingsUpdate" });

// ── Auth ─────────────────────────────────────────────────────────────────────

export const Credentials = z
  .object({ email: z.email(), password: z.string().min(8) })
  .meta({ id: "Credentials" });

export const AuthenticatedUser = z
  .object({
    email: z.email(),
    id: z.uuid(),
    token: z.string().describe("Bearer token, valid seven days."),
  })
  .meta({ id: "AuthenticatedUser" });

/**
 * The shapes worth naming in the generated document.
 *
 * Anything listed here becomes a `#/components/schemas/<name>` entry and is
 * referenced rather than inlined, so the OpenAPI reads as a description of a
 * domain instead of a wall of repeated object literals. Anything omitted is
 * inlined at its use site, which is right for one-off request bodies.
 */
export const NAMED_SCHEMAS = {
  AuthenticatedUser,
  Category,
  CategoryCreate,
  Credentials,
  ErrorResponse,
  Page,
  PageCreate,
  PageSummary,
  Photo,
  PhotoCreate,
  PhotoIdList,
  PhotoUpdate,
  SiteSettings,
  SiteSettingsUpdate,
} as const;
