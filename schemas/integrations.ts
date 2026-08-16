import { z } from "zod";

/**
 * The endpoints that stand in front of somebody else's API.
 *
 * These exist so a key never reaches the browser, so each is a thin proxy: the
 * request is usually one search term or one URL, and the response is the
 * upstream's answer reduced to what a board item needs. Describing the
 * upstream's full payload would be describing Unsplash's API, not ours.
 */

export const UnsplashResult = z
  .object({
    altText: z.string().nullable(),
    creditName: z.string().describe("Required wherever the photograph shows."),
    creditUrl: z.string(),
    downloadLocation: z.string().nullable(),
    id: z.string(),
    imageUrl: z.string(),
    thumbUrl: z.string(),
  })
  .meta({ id: "UnsplashResult" });

export const PinResult = z
  .object({
    altText: z.string().nullable(),
    creditName: z.string().nullable(),
    creditUrl: z.string().describe("The pin itself, so a board links back."),
    imageUrl: z.string(),
    thumbUrl: z.string().nullable(),
  })
  .meta({ id: "PinResult" });

export const PinterestBoardResult = z
  .object({ pins: z.array(PinResult), title: z.string().nullable() })
  .meta({ id: "PinterestBoardResult" });

export const GeneratedImage = z
  .object({
    description: z.string().nullable(),
    height: z.number().int().nullable(),
    url: z
      .string()
      .describe("Already copied to our blob host; fal's URLs expire."),
    width: z.number().int().nullable(),
  })
  .meta({ id: "GeneratedImage" });

export const GenerateInput = z
  .object({
    modelId: z.string().optional(),
    prompt: z.string().min(1),
    sourceImageUrl: z.string().nullable().optional(),
  })
  .meta({ id: "GenerateInput" });

export const FalLibraryItem = z
  .object({
    contentType: z.string().nullable(),
    createdAt: z.iso.datetime(),
    endpoint: z.string(),
    id: z.string(),
    previewUrl: z
      .string()
      .describe("The fal URL, or an inlined data URI for vector output."),
    prompt: z.string().nullable(),
    url: z.string(),
  })
  .meta({ id: "FalLibraryItem" });

export const FalLibraryPage = z
  .object({ hasMore: z.boolean(), items: z.array(FalLibraryItem) })
  .meta({ id: "FalLibraryPage" });

export const UploadResult = z
  .object({
    height: z.number().int().nullable().optional(),
    url: z.url().describe("Blob URL the image is now served from."),
    width: z.number().int().nullable().optional(),
  })
  .meta({ id: "UploadResult" });

export const CanvaStatus = z
  .object({
    connected: z.boolean(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .meta({ id: "CanvaStatus" });

export const FramerImage = z
  .object({
    altText: z.string().nullable(),
    imageUrl: z.string(),
    thumbUrl: z.string().nullable(),
  })
  .meta({ id: "FramerImage" });

export const PickerConfig = z
  .object({
    appId: z.string().nullable(),
    clientId: z.string(),
    developerKey: z.string().nullable(),
    scope: z.string(),
  })
  .meta({ id: "PickerConfig" });

export const ProvisionResult = z
  .object({
    databaseId: z.string().nullable().optional(),
    projectId: z.string(),
    projectName: z.string(),
    url: z.string().nullable().optional(),
  })
  .meta({ id: "ProvisionResult" });

/** Named for the generated document. See NAMED_SCHEMAS in ./domain. */
export const INTEGRATION_SCHEMAS = {
  CanvaStatus,
  FalLibraryItem,
  FalLibraryPage,
  FramerImage,
  GeneratedImage,
  GenerateInput,
  PickerConfig,
  PinResult,
  PinterestBoardResult,
  ProvisionResult,
  UnsplashResult,
  UploadResult,
} as const;
