/**
 * The words sent with a picture, shared by both vision providers.
 *
 * Split from fal.ts for the reason falBody.ts and falLimits.ts were: that file
 * reaches bootstrapEnv for the API key, and therefore node:fs, which cannot be
 * resolved in the browser environment this project's tests run in. These two
 * are pure, and they are the half worth pinning — the `focus: "style"` line is
 * what stops a restyle drawing the reference's subject instead of yours, and
 * losing it looks like a bad style rather than a missing sentence.
 */

const FOCUS_BRIEF: Record<string, string> = {
  both: "Describe both the subject and the visual style.",
  style:
    "Describe only the visual style. Never mention the specific subject, any people, or any text in the image.",
  subject: "Describe the subject and composition, briefly noting the style.",
};

/**
 * The instruction, built once and used by both providers.
 *
 * Extracted rather than duplicated when the vision call moved to Claude. It is
 * the product of several corrections — phrases and nothing else, cover these
 * seven things, and under `focus: "style"` never name the subject, which is
 * what stops a restyle drawing the reference's person instead of yours — and
 * two copies of it would drift apart exactly where nobody is looking.
 */
export const describeSystemPrompt = (focus: string): string =>
  `You describe images so their look can be reproduced by an image generator. Reply with a single paragraph of comma-separated descriptive phrases and nothing else — no preamble, no list, no quotation marks. Cover medium, palette, lighting, composition, texture, mood and rendering technique. ${FOCUS_BRIEF[focus] ?? FOCUS_BRIEF.style}`;

export const describePrompt = (
  imageUrls: string[],
  instruction: string
): string =>
  [
    imageUrls.length > 1
      ? "These images share a visual style. Describe what they have in common, as one reusable image-generation prompt. Ignore anything true of only one of them."
      : "Describe this image as a reusable image-generation prompt.",
    // Appended rather than replacing the brief: the instruction says what to
    // pay attention to, while the sentence above is what makes the answer a
    // prompt rather than a paragraph about a picture.
    // Trimmed before the test: an element whose description is a stray space
    // would otherwise append "Pay particular attention to:" and nothing, which
    // is an instruction to attend to nothing in particular.
    instruction.trim()
      ? `Pay particular attention to: ${instruction.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
