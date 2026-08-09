import type { Photo } from "../types";

/**
 * A starting prompt drawn from what this photographer actually shoots.
 *
 * There is no "themes" field anywhere, so this reads the two things that do
 * exist: the categories photographs are filed under, and their titles. That is
 * a weaker signal than a real taxonomy — it is a starting point to edit, not a
 * description of anyone's work.
 */

/** Words too generic to say anything about a body of work. */
const STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "misc",
  "photo",
  "photos",
  "photography",
  "untitled",
  "img",
  "dsc",
  "new",
  "a",
  "of",
  "in",
  "on",
  "at",
]);

/** Style scaffolding, so the prompt reads as a photograph rather than art. */
const STYLE = "35mm, natural light, shallow depth of field, film grain";

const DIGITS_ONLY = /^\d+$/;
const NON_LETTERS = /[^a-z]+/;

const isUseful = (word: string): boolean =>
  word.length > 2 && !STOP_WORDS.has(word) && !DIGITS_ONLY.test(word);

/** The most frequent meaningful words across titles and category labels. */
const commonSubjects = (photos: Photo[], limit: number): string[] => {
  const counts = new Map<string, number>();

  for (const photo of photos) {
    const words = `${photo.title} ${photo.categoryLabel}`
      .toLowerCase()
      .split(NON_LETTERS)
      .filter(isUseful);

    // Once per photograph, so one long title cannot dominate the tally.
    for (const word of new Set(words)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
};

export const defaultPrompt = (photos: Photo[]): string => {
  const subjects = commonSubjects(photos, 4);
  // With nothing to go on, a plain street-photography prompt beats a prompt
  // built from noise.
  if (subjects.length === 0) {
    return `Street photography: a candid moment on a city street, ${STYLE}`;
  }
  return `Street photography in the spirit of ${subjects.join(", ")} — a candid moment on a city street, ${STYLE}`;
};
