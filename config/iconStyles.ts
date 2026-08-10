/**
 * The icon styles Magnific's text-to-icon API accepts.
 *
 * Shared by the API route, which rejects anything else before spending a
 * generation on it, and by the insert panel, which offers them as buttons. Both
 * ends must agree, so the list lives here rather than being written down twice.
 *
 * Like config/canvas.ts, this module stays dependency-free and free of browser
 * and Node globals so every layer can import it.
 */

export const ICON_STYLES = [
  "solid",
  "outline",
  "color",
  "flat",
  "sticker",
] as const;

export type IconStyle = (typeof ICON_STYLES)[number];

export const isIconStyle = (value: unknown): value is IconStyle =>
  typeof value === "string" &&
  (ICON_STYLES as readonly string[]).includes(value);
