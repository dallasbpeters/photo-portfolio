import { z } from "zod";
import {
  AiModel,
  AiModelInput,
  Board,
  BoardComment,
  BoardCreate,
  BoardSummary,
  BoardUpdate,
  DailyChallengeResponse,
  Element,
  ElementInput,
  JournalInput,
  RunNodeResult,
} from "./boards";
import { AuthenticatedUser, Credentials, PhotoIdList } from "./domain";
import {
  CanvaStatus,
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
} from "./integrations";
import type { Operation } from "./routes";

/**
 * Everything outside the core photograph/page/settings surface.
 *
 * Split from `routes.ts` only to keep both files under the 500-line ceiling —
 * the generator merges them, so which file an entry lives in means nothing.
 */
export const INTEGRATION_OPERATIONS: Record<string, Operation> = {
  // ── boards ────────────────────────────────────────────────────────────────
  "DELETE /api/boards/{id}": { auth: true, summary: "Delete a board." },

  // ── daily challenge ───────────────────────────────────────────────────────
  "DELETE /api/daily-challenge/history": {
    auth: true,
    summary: "Delete a journal entry.",
  },

  // ── elements ──────────────────────────────────────────────────────────────
  "DELETE /api/elements/{id}": { auth: true, summary: "Delete an element." },

  // ── models ────────────────────────────────────────────────────────────────
  "DELETE /api/models/{id}": { auth: true, summary: "Delete a model." },
  "GET /api/boards": {
    auth: true,
    response: BoardSummary.array(),
    summary: "Every board, without its graph.",
  },
  "GET /api/boards/{id}": {
    description:
      "A published board is readable without a token; `sources` is omitted in that case.",
    response: Board,
    summary: "One board, with items and wires.",
  },
  "GET /api/boards/{id}/comments": {
    response: BoardComment.array(),
    summary: "Comments on a board.",
  },

  // ── canva ─────────────────────────────────────────────────────────────────
  "GET /api/canva/callback": {
    description: "The OAuth redirect target. Answers a redirect, not JSON.",
    summary: "Finish connecting Canva.",
  },
  "GET /api/canva/connect": {
    auth: true,
    description: "Answers a redirect to Canva's consent screen.",
    summary: "Begin connecting Canva.",
  },
  "GET /api/canva/status": {
    auth: true,
    response: CanvaStatus,
    summary: "Whether Canva is connected, and until when.",
  },
  "GET /api/canva/templates": {
    auth: true,
    response: z.object({ templates: z.array(z.unknown()) }),
    summary: "Brand templates available to the connected account.",
  },
  "GET /api/canva/templates/{id}": {
    auth: true,
    summary: "One brand template, with its data fields.",
  },
  "GET /api/daily-challenge": {
    auth: true,
    response: DailyChallengeResponse,
    summary: "Today's challenge and its journal entry.",
  },
  "GET /api/daily-challenge/history": {
    auth: true,
    response: DailyChallengeResponse.array(),
    summary: "Past challenges and their entries.",
  },
  "GET /api/elements": {
    auth: true,
    response: Element.array(),
    summary: "Saved elements.",
  },

  // ── fal ───────────────────────────────────────────────────────────────────
  "GET /api/fal/library": {
    auth: true,
    response: FalLibraryPage,
    summary: "The fal account's own generation history, as a library.",
  },
  "GET /api/google/picker-config": {
    auth: true,
    response: PickerConfig,
    summary: "What the Google Drive picker needs to open.",
  },

  // ── documents served as text, not JSON ────────────────────────────────────
  "GET /api/manifest": { summary: "PWA manifest for this site (JSON)." },
  "GET /api/models": {
    response: AiModel.array(),
    summary: "Models a Generate node may ask for.",
  },
  "GET /api/robots": { summary: "robots.txt for this site (text/plain)." },
  "GET /api/shell": {
    description:
      "Server-rendered <head> and a photograph list, so a crawler and a share card see real content rather than an empty root div.",
    summary: "Pre-rendered HTML shell (text/html).",
  },
  "GET /api/sitemap": {
    summary: "sitemap.xml for this site (application/xml).",
  },

  // ── sites ─────────────────────────────────────────────────────────────────
  "GET /api/sites/provision": {
    auth: true,
    response: z.object({ projects: z.array(z.unknown()) }),
    summary: "Vercel projects this token can see.",
  },

  // ── unsplash ──────────────────────────────────────────────────────────────
  "GET /api/unsplash/search": {
    auth: true,
    response: z.object({ results: UnsplashResult.array() }),
    summary: "Search Unsplash. Takes `?q=`.",
  },
  "PATCH /api/boards/{id}": {
    auth: true,
    body: BoardUpdate,
    response: Board,
    summary: "Save a board. Absent keys are left alone.",
  },
  "PATCH /api/boards/{id}/comments/{commentId}": {
    auth: true,
    body: z.object({
      body: z.string().optional(),
      resolved: z.boolean().optional(),
    }),
    response: BoardComment,
    summary: "Edit or resolve a comment.",
  },
  "PATCH /api/elements/{id}": {
    auth: true,
    body: ElementInput.partial(),
    response: Element,
    summary: "Update an element.",
  },
  "PATCH /api/models/{id}": {
    auth: true,
    body: AiModelInput.partial(),
    response: AiModel,
    summary: "Update a model.",
  },
  // ── ai ────────────────────────────────────────────────────────────────────
  "POST /api/ai/generate": {
    auth: true,
    body: GenerateInput,
    description:
      "The result is copied to our own blob host before returning — fal serves from a temporary location that would expire under the board.",
    response: GeneratedImage,
    summary: "Generate an image from a prompt, optionally from a source image.",
  },
  "POST /api/ai/icon": {
    auth: true,
    body: z.object({ prompt: z.string().min(1), style: z.string().optional() }),
    response: GeneratedImage,
    summary: "Generate an SVG icon.",
  },
  "POST /api/ai/icon-webhook": {
    description:
      "Called by fal, not by the app. Authenticated by the signature on the request rather than a bearer token.",
    summary: "Delivery callback for a queued icon generation.",
  },

  // ── auth ──────────────────────────────────────────────────────────────────
  "POST /api/auth/change-password": {
    auth: true,
    body: z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    }),
    summary: "Change the signed-in user's password.",
  },
  "POST /api/auth/forgot-password": {
    body: z.object({ email: z.email() }),
    description:
      "Always answers 200, whether or not the address is known — a different answer would confirm which addresses have accounts.",
    summary: "Send a reset link.",
  },
  "POST /api/auth/google": {
    body: z.object({ credential: z.string().describe("Google ID token.") }),
    response: AuthenticatedUser,
    summary: "Exchange a Google credential for a bearer token.",
  },
  "POST /api/auth/register": {
    body: Credentials,
    response: AuthenticatedUser,
    summary: "Create the first admin. Closed once one exists.",
  },
  "POST /api/auth/reset-password": {
    body: z.object({ password: z.string().min(8), token: z.string() }),
    summary: "Set a new password from a reset token.",
  },
  "POST /api/boards": {
    auth: true,
    body: BoardCreate,
    response: Board,
    summary: "Create a board.",
  },
  "POST /api/boards/{id}/comments": {
    body: z.object({
      authorName: z.string().max(120).optional(),
      body: z.string().min(1),
      itemId: z.string().optional(),
    }),
    response: BoardComment,
    summary: "Leave a comment. Open on a published board.",
  },
  "POST /api/boards/{id}/dataset": {
    auth: true,
    response: z.object({ url: z.url() }),
    summary: "Export the board's images and prompts as a training dataset.",
  },
  "POST /api/boards/{id}/export": {
    auth: true,
    response: z.object({ url: z.url() }),
    summary: "Export the board as a single image.",
  },
  "POST /api/boards/{id}/run": {
    auth: true,
    body: z.object({ itemId: z.string() }),
    description:
      "Runs one node and everything downstream of it. The longest request in the API — generation is measured in tens of seconds.",
    response: RunNodeResult,
    summary: "Run a node in the board's graph.",
  },
  "POST /api/boards/{id}/svg": {
    auth: true,
    body: z.object({ svg: z.string() }),
    response: z.object({ url: z.url() }),
    summary: "Store an SVG and return a URL for it.",
  },
  "POST /api/boards/{id}/version": {
    auth: true,
    response: z.object({ createdAt: z.iso.datetime(), id: z.uuid() }),
    summary: "Snapshot the board so it can be restored.",
  },
  "POST /api/boards/adopt": {
    auth: true,
    body: z.object({ boardId: z.uuid() }),
    response: Board,
    summary: "Take ownership of a board created before accounts existed.",
  },
  "POST /api/canva/send": {
    auth: true,
    body: z.object({ imageUrls: z.array(z.url()), templateId: z.string() }),
    summary: "Push images into a Canva design.",
  },
  "POST /api/daily-challenge": {
    auth: true,
    response: DailyChallengeResponse,
    summary: "Draw a different inspiration photograph for today.",
  },
  "POST /api/elements": {
    auth: true,
    body: ElementInput,
    response: Element,
    summary: "Save an element.",
  },
  "POST /api/fal/library": {
    auth: true,
    response: FalLibraryPage,
    summary: "Page through the library.",
  },

  // ── framer, google, upload ────────────────────────────────────────────────
  "POST /api/framer/page": {
    auth: true,
    body: z.object({ url: z.url() }),
    response: z.object({
      images: FramerImage.array(),
      title: z.string().nullable(),
    }),
    summary: "Read the images off a published Framer page.",
  },
  "POST /api/models": {
    auth: true,
    body: AiModelInput,
    response: AiModel,
    summary: "Add a model.",
  },

  // ── photos (batch) ────────────────────────────────────────────────────────
  "POST /api/photos/batch": {
    auth: true,
    body: PhotoIdList.extend({ categoryId: z.uuid() }),
    description: "Moves a selection to another category in one statement.",
    summary: "Set the category on several photographs.",
  },

  // ── pinterest ─────────────────────────────────────────────────────────────
  "POST /api/pinterest/board": {
    auth: true,
    body: z.object({ url: z.url() }),
    description:
      "Read from the board's public RSS feed, which carries only the most recent pins. More would need OAuth and a reviewed app.",
    response: PinterestBoardResult,
    summary: "Read the pins off a public Pinterest board.",
  },
  "POST /api/pinterest/pin": {
    auth: true,
    body: z.object({ url: z.url() }),
    response: PinResult,
    summary: "Read one pin.",
  },
  "POST /api/sites/provision": {
    auth: true,
    body: z.object({ name: z.string().min(1), region: z.string().optional() }),
    response: ProvisionResult,
    summary: "Create a Vercel project and a Neon database for a new site.",
  },
  "POST /api/sites/setup": {
    auth: true,
    body: z.object({ projectId: z.string() }),
    summary: "Run first-time setup against a provisioned site.",
  },
  "POST /api/unsplash/search": {
    body: z.object({ downloadLocation: z.string() }),
    description:
      "Unsplash's terms require reporting that a photograph was used. Fire and forget — crediting must not stand between the image and the board.",
    summary: "Report a download to Unsplash.",
  },
  "POST /api/upload": {
    auth: true,
    description:
      "multipart/form-data with a single `file` field. Answers the blob URL the image is now served from.",
    response: UploadResult,
    summary: "Upload an image to blob storage.",
  },
  "PUT /api/daily-challenge": {
    auth: true,
    body: JournalInput,
    response: DailyChallengeResponse,
    summary: "Save today's journal entry.",
  },
  "PUT /api/daily-challenge/history": {
    auth: true,
    body: JournalInput,
    summary: "Edit a past journal entry.",
  },
};
