import { claudeToken } from "./claudeAuth.js";

/**
 * Reading a picture back as words, through Claude.
 *
 * This used to go to fal-ai/any-llm/vision, which fal has marked "no longer
 * supported". It is not a feature nobody uses: it is how an element's style
 * brief is written, and how the Analyse node answers — so the deprecation was
 * a fuse under two working features rather than a note for later.
 *
 * Claude reads images, so the move is a change of address rather than of
 * approach. What changes with it is the credential: there is none. The call is
 * authenticated with the identity Vercel already signs for the request, which
 * means adding a second model provider added no secret to the environment.
 */

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/** Vision is not the expensive part of a board; the picture that follows is. */
const VISION_MODEL = "claude-haiku-4-5-20251001";

/**
 * Long enough for a reading, short of the serverless ceiling.
 *
 * Shorter than the generation timeout on purpose: a brief is written *before*
 * the picture somebody asked for, so time spent here is taken from the thing
 * they actually want. ensureStyleBrief races this with a deadline of its own
 * for the same reason.
 */
const REQUEST_TIMEOUT_MS = 60_000;

/** Images arrive as addresses; Claude fetches them itself. */
const imageBlock = (url: string) => ({
  source: { type: "url" as const, url },
  type: "image" as const,
});

export const isClaudeVisionConfigured = async (): Promise<boolean> =>
  (await claudeToken()) !== null;

/**
 * A picture as a reusable prompt, or several read as one look.
 *
 * The system prompt is the fal one, unchanged and deliberately so: it is the
 * product of several corrections — reply with phrases and nothing else, cover
 * these seven things, and under `focus: "style"` never name the subject, which
 * is what stops a restyle drawing the reference's person instead of yours.
 * Moving providers is not the moment to also reword the instruction.
 */
export const describeWithClaude = async (
  imageUrls: string[],
  system: string,
  prompt: string
): Promise<string> => {
  const token = await claudeToken();
  if (!token) {
    throw new Error("Claude is not configured for this deployment");
  }
  const res = await fetch(MESSAGES_URL, {
    body: JSON.stringify({
      max_tokens: 1024,
      messages: [
        {
          content: [
            ...imageUrls.map(imageBlock),
            { text: prompt, type: "text" },
          ],
          role: "user",
        },
      ],
      model: VISION_MODEL,
      system,
    }),
    headers: {
      "anthropic-version": API_VERSION,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(
      `Image analysis failed (${res.status}): ${(await res.text()).slice(0, 200)}`
    );
  }
  const json = (await res.json()) as {
    content?: { text?: string; type?: string }[];
  };
  // The first text block. A reply is one paragraph by instruction, but the
  // shape allows several blocks and reading only [0] would drop a reply that
  // began with anything else.
  const text = (json.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join(" ")
    .trim();
  if (!text) {
    throw new Error("The model returned no description");
  }
  return text;
};
