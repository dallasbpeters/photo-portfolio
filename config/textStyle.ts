/**
 * How a board's words are set: family, weight, colour, alignment and the rest.
 *
 * Lives in config/ beside canvas.ts and theme.ts because both sides need the
 * same answer and must not disagree. The browser turns a stored style into CSS;
 * the API validates one arriving from a canvas it does not trust. Written down
 * twice is written down wrong — the vocabulary of families, weights, alignments
 * and transforms is one list, read in both directions.
 *
 * STORAGE: one JSONB column, `board_items.text_style`, rather than a column per
 * property. Nine properties would be nine ALTERs, nine entries in the row type,
 * the DTO, the incoming shape and the upsert's column list — and the tenth
 * property next month would be a tenth migration. Nothing queries or constrains
 * these values: they are read as a whole when a board opens and written as a
 * whole when the toolbar moves, never filtered or aggregated on. The thing a
 * column would buy — `WHERE font_weight > 600`, a CHECK on the allowed
 * alignments — is a query nobody has, and the CHECK would have to name a font
 * list that lives in config/theme.ts rather than in the database. So the trade
 * is taken deliberately: no per-property migration, at the price of no
 * per-property query, with `normalizeTextStyle` below as the constraint
 * instead. It is the same bargain `config` already makes for shader stacks and
 * drawn marks.
 *
 * `fontSize` is the exception and stays in its own `font_size` column, because
 * it is already there and holds real values. Moving it would mean a migration
 * that edits rows, which scripts/check-migrations.ts forbids for good reason.
 */

import { DEFAULT_NOTE_FONT_SIZE, DEFAULT_TEXT_FONT_SIZE } from "./canvas.js";
import { type FontId, findFont } from "./theme.js";

export type TextAlign = "center" | "left" | "right";

export type TextTransform = "capitalize" | "lowercase" | "none" | "uppercase";

export const TEXT_ALIGNS: TextAlign[] = ["left", "center", "right"];

export const TEXT_TRANSFORMS: TextTransform[] = [
  "none",
  "uppercase",
  "lowercase",
  "capitalize",
];

/**
 * One text item's appearance. Every property is nullable, and null always means
 * "whatever this kind of item already did" rather than a value of its own — see
 * textStyleCss for what each null resolves to, and why some of them resolve to
 * nothing at all.
 *
 * The set is deliberately what a textarea can actually honour. Underline and
 * strike-through are absent: a board text item is one styled block rather than
 * a rich-text document, so a decoration that cannot be applied to *part* of the
 * words is a switch with nothing to say. `fontSize` is absent because it is a
 * column of its own — see the note at the top of this file.
 */
export interface TextStyle {
  align: TextAlign | null;
  /** `#rgb`, `#rrggbb` or `#rrggbbaa`. Null inherits the board's ink. */
  color: string | null;
  /** A family from config/theme.ts — the only ones the app self-hosts. */
  family: FontId | null;
  /** Only ever true or null: false is the default, so it stores as nothing. */
  italic: boolean | null;
  /** In em, so tracking stays proportional as the text is resized. */
  letterSpacing: number | null;
  /** Unitless multiple of the font size, as CSS line-height. */
  lineHeight: number | null;
  transform: TextTransform | null;
  weight: number | null;
}

/**
 * What the canvas already did before any of this existed, and therefore what a
 * stored null has to keep meaning. An item saved with every property null must
 * render exactly as it rendered yesterday.
 */
export const DEFAULT_LINE_HEIGHT = 1.25;
/** A note is a card of body copy; plain text on the board is set lighter. */
export const DEFAULT_NOTE_WEIGHT = 400;
export const DEFAULT_TEXT_WEIGHT = 300;

/** Bounds, for the same reason every other canvas number is bounded. */
export const MIN_LINE_HEIGHT = 0.7;
export const MAX_LINE_HEIGHT = 3;
export const MIN_LETTER_SPACING = -0.15;
export const MAX_LETTER_SPACING = 1;

export interface WeightChoice {
  label: string;
  value: number;
}

/** The nine named steps of the CSS weight axis. */
export const WEIGHT_CHOICES: WeightChoice[] = [
  { label: "Thin", value: 100 },
  { label: "Extra light", value: 200 },
  { label: "Light", value: 300 },
  { label: "Regular", value: 400 },
  { label: "Medium", value: 500 },
  { label: "Semi bold", value: 600 },
  { label: "Bold", value: 700 },
  { label: "Extra bold", value: 800 },
  { label: "Black", value: 900 },
];

/**
 * The weights a family actually has.
 *
 * Every family here is a variable font with a declared `wght` range, and a
 * browser *clamps* a request outside it: asking Playfair Display for 100 gets
 * 400 and looks like the control is broken. Offering a weight that cannot
 * happen is the same mistake as offering a font that falls back, so the list is
 * cut to the axis.
 *
 * With no family chosen the text is set in whatever the site theme picked,
 * which is not knowable from here — so the offer is the range every family
 * shares.
 */
export const weightsFor = (family: FontId | null): WeightChoice[] => {
  const font = family === null ? undefined : findFont(family);
  const min = font?.weight.min ?? 300;
  const max = font?.weight.max ?? 700;
  return WEIGHT_CHOICES.filter(
    (choice) => choice.value >= min && choice.value <= max
  );
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * A number in range, or null.
 *
 * `typeof value === "number"` rather than `Number(value)`, because a stored
 * null coerces to zero — and a zero line-height collapses every line of an
 * existing board into one. The one place this function could be lax is the one
 * place laxness destroys a board.
 */
const bounded = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? clamp(value, min, max)
    : null;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const isEmpty = (style: TextStyle): boolean =>
  Object.values(style).every((value) => value === null);

/** Rounds to a named step and pulls it inside the family's axis. */
const clampToAxis = (weight: number, family: FontId | null): number => {
  const available = weightsFor(family);
  const min = available.at(0)?.value ?? 300;
  const max = available.at(-1)?.value ?? 700;
  return clamp(Math.round(weight / 100) * 100, min, max);
};

/**
 * Validates a style from the canvas, or reads one back out of the database.
 *
 * One function for both directions on purpose: the column holds exactly what
 * the client sent, so the rules that decide what may be stored are the rules
 * that decide what may be believed on the way out. A row written by an older
 * build, or by hand, is filtered the same way a request is.
 *
 * Returns null when nothing is set, so an item nobody has styled stores nothing
 * rather than an object full of nulls — and so a `text_style` of NULL and one
 * of `{}` cannot mean two different things.
 */
export const normalizeTextStyle = (raw: unknown): TextStyle | null => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const family = findFont(typeof o.family === "string" ? o.family : "")?.id;
  const weight = bounded(o.weight, 100, 900);
  const style: TextStyle = {
    align: TEXT_ALIGNS.find((align) => align === o.align) ?? null,
    color:
      typeof o.color === "string" && HEX.test(o.color)
        ? o.color.toLowerCase()
        : null,
    family: family ?? null,
    // Never false. Not italic is the default, so storing it says nothing that
    // an absent key does not already say.
    italic: o.italic === true ? true : null,
    letterSpacing: bounded(
      o.letterSpacing,
      MIN_LETTER_SPACING,
      MAX_LETTER_SPACING
    ),
    lineHeight: bounded(o.lineHeight, MIN_LINE_HEIGHT, MAX_LINE_HEIGHT),
    transform: TEXT_TRANSFORMS.find((value) => value === o.transform) ?? null,
    // Snapped into the chosen family's axis rather than refused: a weight kept
    // from a previous family is a reasonable thing to have sent, and the
    // browser would clamp it anyway — better that the toolbar shows what will
    // actually be drawn.
    weight:
      weight === null
        ? null
        : clampToAxis(weight, family === undefined ? null : family),
  };
  return isEmpty(style) ? null : style;
};

/** Enough of a board item for its text to be set. */
export interface TextStyleTarget {
  /** In canvas units; null takes the default for the kind. */
  fontSize: number | null;
  kind: string;
  textStyle?: TextStyle | null;
}

/**
 * The CSS a text item is rendered with. Assignable to React's CSSProperties.
 *
 * Three properties are optional, and their absence is the point — see the note
 * on textStyleCss.
 */
export interface TextCss {
  color?: string;
  fontFamily?: string;
  fontSize: number;
  fontStyle: "italic" | "normal";
  fontWeight: number;
  letterSpacing: string;
  lineHeight: number;
  textAlign?: TextAlign;
  textTransform: TextTransform;
}

/**
 * A stored style as the properties the browser is given.
 *
 * The rule for what a null becomes, which is the whole of requirement "an
 * existing item with nothing set must render as it does today":
 *
 *   - a property the code already hard-codes gets that same hard-coded value.
 *     Size, line-height and weight were literals in BoardItemView; they are
 *     literals here.
 *   - a property whose value comes from somewhere else is *omitted entirely*
 *     rather than given a default. Colour comes from `text-board-ink`, which
 *     inverts with the board's theme — writing `#000000` here would nail every
 *     unstyled board to black the moment the lights went out. Family comes from
 *     the surface's `--font-sans`, which an admin can change without a deploy.
 *     Alignment comes from the writing direction, where `start` is not the same
 *     answer as `left`.
 *
 * So an item with an empty style produces `{fontSize, lineHeight, fontWeight,
 * fontStyle, letterSpacing, textTransform}` — the three that were already set,
 * plus three whose values are the CSS initial values anyway.
 */
export const textStyleCss = (item: TextStyleTarget): TextCss => {
  const isNote = item.kind === "note";
  const style = item.textStyle ?? null;
  const family = style?.family ? findFont(style.family) : undefined;

  const css: TextCss = {
    fontSize:
      item.fontSize ??
      (isNote ? DEFAULT_NOTE_FONT_SIZE : DEFAULT_TEXT_FONT_SIZE),
    fontStyle: style?.italic === true ? "italic" : "normal",
    fontWeight:
      style?.weight ?? (isNote ? DEFAULT_NOTE_WEIGHT : DEFAULT_TEXT_WEIGHT),
    // em rather than px: the canvas is a zooming space and the size is a
    // property of the item, so tracking set at one size must survive the item
    // being made twice as large.
    letterSpacing:
      typeof style?.letterSpacing === "number"
        ? `${style.letterSpacing}em`
        : "normal",
    lineHeight: style?.lineHeight ?? DEFAULT_LINE_HEIGHT,
    textTransform: style?.transform ?? "none",
  };

  if (style?.color) {
    css.color = style.color;
  }
  if (family) {
    css.fontFamily = family.stack;
  }
  if (style?.align) {
    css.textAlign = style.align;
  }
  return css;
};
