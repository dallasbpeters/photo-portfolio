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

// ── Recipes ──────────────────────────────────────────────────────────────────

export const DeclaredInput = z
  .object({
    key: z.string(),
    label: z.string(),
    nodeKey: z.string().describe("Which node in the template this feeds."),
    port: z.string(),
    required: z.boolean(),
    type: z.string().describe("A PortType — see config/nodeTypes.ts."),
  })
  .meta({ id: "DeclaredInput" });

export const RecipeVersion = z
  .object({
    createdAt: z.iso.datetime(),
    declaredInputs: z.array(DeclaredInput),
    id: z.uuid(),
    nodeCount: z.int(),
    unverified: z
      .boolean()
      .describe("Saved from a selection that had never run successfully."),
    version: z.int(),
  })
  .meta({ id: "RecipeVersion" });

export const Recipe = z
  .object({
    createdAt: z.iso.datetime(),
    currentVersion: z.int().nullable(),
    declaredInputs: z.array(DeclaredInput),
    description: z.string().nullable(),
    id: z.uuid(),
    name: z.string(),
    nodeCount: z.int(),
    unverified: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "Recipe" });

export const RecipeInput = z
  .object({
    boardId: z.uuid().describe("The board the selection is read from."),
    declaredInputs: z.array(DeclaredInput).optional(),
    description: z.string().nullable().optional(),
    itemIds: z
      .array(z.string())
      .describe("Ids only — the server reads the graph, never the client."),
    name: z.string(),
  })
  .meta({ id: "RecipeInput" });

export const RecipeUse = z
  .object({
    id: z.uuid(),
    latestVersion: z
      .int()
      .nullable()
      .describe("Null when the recipe has been deleted."),
    pinnedVersion: z.int().describe("What this board was built against."),
    recipeId: z.uuid().nullable(),
    recipeName: z.string().nullable(),
  })
  .meta({ id: "RecipeUse" });

export const RecipePlacement = z
  .object({
    boardId: z.uuid(),
    x: z.number(),
    y: z.number(),
  })
  .meta({ id: "RecipePlacement" });

/**
 * What produced an asset, kept legible.
 *
 * Stored beside the fingerprint in `board_items.result` — the fingerprint
 * decides whether to re-run, this says what happened. Absent on anything made
 * before the record existed, which the canvas says rather than inventing.
 */
export const Provenance = z
  .object({
    at: z.iso.datetime(),
    brandKitVersionId: z.uuid().nullable().optional(),
    inputs: z.array(z.string()),
    model: z.string().nullable(),
    prompt: z.string().nullable(),
    recipeVersionId: z.uuid().nullable().optional(),
    settings: z.record(z.string(), z.unknown()),
  })
  .meta({ id: "Provenance" });

// ── Brand kits ───────────────────────────────────────────────────────────────

export const BrandKitDoc = z
  .object({
    logos: z.array(
      z.object({
        clearSpace: z.number(),
        label: z.string(),
        minWidth: z.number(),
        rules: z.string(),
        url: z.string().describe("Ours — adopted into blob storage on save."),
      })
    ),
    offBrand: z
      .array(z.string())
      .describe("Counter-examples, and the more precise half of a kit."),
    onBrand: z.array(z.string()),
    palette: z.array(
      z.object({ name: z.string(), role: z.string(), value: z.string() })
    ),
    typefaces: z.array(
      z.object({
        name: z.string(),
        role: z.string(),
        weights: z.array(z.int()),
      })
    ),
    voice: z.string().describe("Substance — it travels into the prompt."),
  })
  .meta({ id: "BrandKitDoc" });

export const BrandKit = z
  .object({
    createdAt: z.iso.datetime(),
    currentVersion: z.int().nullable(),
    doc: BrandKitDoc,
    id: z.uuid(),
    name: z.string(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "BrandKit" });

export const BrandKitInput = z
  .object({ doc: BrandKitDoc, name: z.string() })
  .meta({ id: "BrandKitInput" });

export const CheckFinding = z
  .object({
    detail: z.string(),
    expected: z.string().optional(),
    found: z.string().optional(),
    kind: z.string().describe("A FindingKind — see config/brandCheck.ts."),
    severity: z.enum(["pass", "warn", "fail"]),
    source: z
      .enum(["measured", "judged"])
      .describe(
        "Arithmetic, or a model's opinion. An override differs by which."
      ),
  })
  .meta({ id: "CheckFinding" });

export const CheckVerdict = z
  .object({
    acknowledgedAt: z.iso.datetime().nullable(),
    assetUrl: z.string(),
    boardId: z.uuid(),
    createdAt: z.iso.datetime(),
    findings: z.array(CheckFinding),
    id: z.uuid(),
    itemId: z.string().nullable(),
    kitName: z.string().nullable(),
    kitVersion: z.int(),
    overrideReason: z
      .string()
      .nullable()
      .describe("Recorded beside the findings, never in place of them."),
    passed: z.boolean(),
  })
  .meta({ id: "CheckVerdict" });

/** Named for the generated document. See NAMED_SCHEMAS in ./domain. */
export const BOARD_SCHEMAS = {
  AiModel,
  AiModelInput,
  Board,
  BoardComment,
  BoardCreate,
  BoardSummary,
  BoardUpdate,
  BrandKit,
  BrandKitDoc,
  BrandKitInput,
  CheckFinding,
  CheckVerdict,
  DailyChallengeInfo,
  DailyChallengeJournal,
  DailyChallengeResponse,
  DeclaredInput,
  Element,
  ElementInput,
  JournalInput,
  Provenance,
  Recipe,
  RecipeInput,
  RecipePlacement,
  RecipeUse,
  RecipeVersion,
  RunNodeResult,
} as const;
