import { z } from "zod";

/**
 * Boards and the things that live around them.
 *
 * A board's graph — its items and wires — is deliberately described as opaque
 * arrays rather than modelled node by node. There are around twenty node kinds
 * in `config/nodeTypes.ts`, each with its own config shape, and restating them
 * here would produce a schema longer than the rest of the document that goes
 * stale the moment a node type changes. What a caller needs from this API is
 * the board's identity and whether the graph is present; the graph's interior
 * is the editor's business.
 */

export const BoardSummary = z
  .object({
    coverUrl: z.string().nullable(),
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    isPublic: z.boolean(),
    itemCount: z.number().int().describe("List responses only."),
    slug: z.string().nullable(),
    title: z.string(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "BoardSummary" });

export const Board = BoardSummary.omit({ itemCount: true })
  .extend({
    items: z
      .array(z.unknown())
      .describe("The graph's nodes. See config/nodeTypes.ts."),
    sources: z
      .array(z.unknown())
      .optional()
      .describe(
        "Admin detail only — never sent to a published board's reader."
      ),
    wires: z.array(z.unknown()).describe("Connections between items."),
  })
  .meta({ id: "Board" });

export const BoardCreate = z
  .object({
    isPublic: z.boolean().optional(),
    title: z.string().min(1).max(200),
  })
  .meta({ id: "BoardCreate" });

export const BoardUpdate = z
  .object({
    isPublic: z.boolean().optional(),
    items: z.array(z.unknown()).optional(),
    slug: z.string().nullable().optional(),
    title: z.string().min(1).max(200).optional(),
    wires: z.array(z.unknown()).optional(),
  })
  .meta({ id: "BoardUpdate" });

export const BoardComment = z
  .object({
    authorName: z.string().nullable(),
    body: z.string(),
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    itemId: z.string().nullable().describe("Anchored to one item, or loose."),
    resolved: z.boolean(),
  })
  .meta({ id: "BoardComment" });

export const RunNodeResult = z
  .object({
    error: z.string().nullable().optional(),
    outputs: z.array(z.unknown()).describe("Whatever the node produced."),
    state: z.string().describe("See RunState in config/nodeTypes.ts."),
  })
  .meta({ id: "RunNodeResult" });

// ── Elements ─────────────────────────────────────────────────────────────────

export const Element = z
  .object({
    coverUrl: z
      .string()
      .nullable()
      .describe("The key image, and what a wired element hands over."),
    createdAt: z.iso.datetime(),
    description: z
      .string()
      .nullable()
      .describe("Substance, not a note — it travels into the prompt."),
    id: z.uuid(),
    imageUrls: z.array(z.string()),
    name: z.string(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "Element" });

export const ElementInput = Element.pick({
  coverUrl: true,
  description: true,
  imageUrls: true,
  name: true,
})
  .partial({ coverUrl: true, description: true })
  .meta({ id: "ElementInput" });

// ── Models ───────────────────────────────────────────────────────────────────

export const AiModel = z
  .object({
    createdAt: z.iso.datetime(),
    enabled: z.boolean(),
    id: z
      .string()
      .describe('A fal.ai model id, or a namespaced "lora/..." one.'),
    imageParam: z.enum(["image_url", "image_urls"]),
    input: z.string().describe("What the model takes: prompt, image, or both."),
    label: z.string().describe("Shown on the node; model ids do not read."),
    lora: z
      .object({
        endpoint: z.string().nullable(),
        imageEndpoint: z.string().nullable(),
        path: z.string().nullable().describe("URL to the safetensors weights."),
        scale: z.number().nullable(),
        trigger: z.string().nullable(),
      })
      .nullable(),
    sortOrder: z.number().int(),
    vector: z.boolean().optional(),
  })
  .meta({ id: "AiModel" });

export const AiModelInput = AiModel.omit({ createdAt: true })
  .partial()
  .required({ id: true, label: true })
  .meta({ id: "AiModelInput" });

// ── Daily challenge ──────────────────────────────────────────────────────────

export const DailyChallengeInfo = z
  .object({
    altText: z.string().nullable(),
    challengeDate: z.string().describe("YYYY-MM-DD, UTC."),
    imageThumbUrl: z.string().nullable(),
    imageUrl: z.string(),
    photographerName: z.string().nullable(),
    photographerUsername: z.string().nullable(),
    unsplashHtmlLink: z.string().nullable(),
    unsplashPhotoId: z.string().nullable(),
  })
  .meta({ id: "DailyChallengeInfo" });

export const DailyChallengeJournal = z
  .object({ body: z.string(), updatedAt: z.iso.datetime() })
  .meta({ id: "DailyChallengeJournal" });

export const DailyChallengeResponse = z
  .object({
    challenge: DailyChallengeInfo,
    journal: DailyChallengeJournal.nullable(),
  })
  .meta({ id: "DailyChallengeResponse" });

export const JournalInput = z
  .object({ body: z.string().max(20_000) })
  .meta({ id: "JournalInput" });

/** Named for the generated document. See NAMED_SCHEMAS in ./domain. */
export const BOARD_SCHEMAS = {
  AiModel,
  AiModelInput,
  Board,
  BoardComment,
  BoardCreate,
  BoardSummary,
  BoardUpdate,
  DailyChallengeInfo,
  DailyChallengeJournal,
  DailyChallengeResponse,
  Element,
  ElementInput,
  JournalInput,
  RunNodeResult,
} as const;
