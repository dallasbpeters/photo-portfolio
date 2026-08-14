/**
 * Which theme the app is in, as a choice rather than a state.
 *
 * "system" is a third answer, not the absence of one: a machine that goes dark
 * at sunset should take the app with it, and a two-way switch can only freeze
 * the choice at whatever it happened to be the first time it was pressed.
 *
 * Kept apart from the component that draws the switch because the choice has to
 * be read twice — once by the inline script in index.html, before the first
 * paint, and once by React. See the note there for why that duplication is
 * deliberate rather than an oversight.
 */
export type ThemeChoice = "dark" | "light" | "system";

export const THEME_KEY = "theme";

export const SYSTEM_QUERY = "(prefers-color-scheme: dark)";

const isChoice = (value: unknown): value is ThemeChoice =>
  value === "dark" || value === "light" || value === "system";

/**
 * What was chosen last, defaulting to following the machine.
 *
 * An unrecognised value is treated as no value: "dark" and "light" written by
 * the two-way switch this replaced are still read exactly as they were meant.
 */
export const storedTheme = (): ThemeChoice => {
  const saved = localStorage.getItem(THEME_KEY);
  return isChoice(saved) ? saved : "system";
};

/** Whether a choice means dark right now — the only place "system" is resolved. */
export const isDarkTheme = (choice: ThemeChoice): boolean =>
  choice === "dark" ||
  (choice === "system" && window.matchMedia(SYSTEM_QUERY).matches);

export const applyTheme = (choice: ThemeChoice): void => {
  document.documentElement.classList.toggle("dark", isDarkTheme(choice));
};

/** The order the one button cycles through: what you have, then the two others. */
export const nextTheme = (choice: ThemeChoice): ThemeChoice => {
  if (choice === "system") {
    return "light";
  }
  return choice === "light" ? "dark" : "system";
};
