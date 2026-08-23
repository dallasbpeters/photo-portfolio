/**
 * What a brand kit holds, and how much of it.
 *
 * Shared by the endpoint that enforces these and the panel that has to say so
 * before anything is saved — the reasoning config/elements.ts states outright: a
 * limit only the server knows about is a limit the person hits by surprise.
 *
 * A kit is a governing document, not a moodboard. The bounds below are chosen so
 * that every part of it can be shown at once and checked against in one pass; a
 * "palette" of eighty colours constrains nothing, and eighty on-brand references
 * are a board that has been filed in the wrong place.
 *
 * Dependency-free and free of browser and Node globals, like every module here.
 */

import { describePalette } from "./colourWords.js";

/** Six-digit hex, the one colour notation this app writes and reads. */
export const HEX = /^#[0-9a-f]{6}$/i;

export const MAX_PALETTE = 24;
export const MAX_TYPEFACES = 8;
export const MAX_LOGOS = 8;

/** The same handful an element allows, and for the same reason. */
export const MAX_ONBRAND = 24;
export const MAX_OFFBRAND = 24;

export const MAX_KIT_NAME = 120;

/**
 * Matching MAX_ELEMENT_DESCRIPTION, and for the same reason: voice travels into
 * the prompt, so it is the kit's substance rather than a note about it.
 */
export const MAX_VOICE = 2000;

export const MAX_RULE_TEXT = 300;

export interface PaletteEntry {
  name: string;
  /** What it is for — "text", "surface", "accent". Free text, not an enum. */
  role: string;
  /** Lower-cased six-digit hex. Anything else is dropped, never stored. */
  value: string;
}

export interface TypefaceEntry {
  name: string;
  role: string;
  weights: number[];
}

export interface LogoEntry {
  /** Minimum clear space as a fraction of the logo's own width. */
  clearSpace: number;
  label: string;
  /** Below this width the mark stops being legible. In pixels. */
  minWidth: number;
  rules: string;
  /** Ours, adopted into blob storage before the version was written. */
  url: string;
}

/**
 * The grade a brand is finished in.
 *
 * A *reference* to one of the editor's looks rather than the look itself: the
 * catalogue lives in src/editor/presets.ts with 72 entries and their edit
 * payloads, and this module is dependency-free by design — see the note at the
 * top of the file. So the id is validated for shape here and resolved against
 * the real catalogue by whoever has it.
 *
 * Which means an unknown id is possible in stored data, and both readers treat
 * it the same way: no look. That is the right failure — a brand whose grade
 * cannot be found should render ungraded rather than guess.
 */
export interface LookRef {
  id: string;
  /** 0–1. How much of the look to apply, as the editor's own slider means it. */
  strength: number;
}

export interface BrandKitDoc {
  logos: LogoEntry[];
  /** The grade, or null for none. */
  look: LookRef | null;
  /** Images that are explicitly off-brand — counter-examples, and the more
   * useful half. A model told what to avoid outperforms one told only what to
   * aim at, and a set of counter-examples is far more precise than a paragraph. */
  offBrand: string[];
  /** Images that are on-brand — what a generation should read like. */
  onBrand: string[];
  palette: PaletteEntry[];
  typefaces: TypefaceEntry[];
  voice: string;
}

export const EMPTY_KIT: BrandKitDoc = {
  logos: [],
  look: null,
  offBrand: [],
  onBrand: [],
  palette: [],
  typefaces: [],
  voice: "",
};

export const isHexColour = (value: unknown): value is string =>
  typeof value === "string" && HEX.test(value.trim());

/**
 * A kit's palette, description and counter-examples, as prompt material.
 *
 * Written here rather than in the run path so the panel can show exactly what a
 * wired kit will contribute — a brand kit that silently shapes a generation in
 * ways nobody can read is the "guidelines nobody applies" problem in a new
 * costume.
 */
export const kitPromptText = (doc: BrandKitDoc): string => {
  const parts: string[] = [];
  if (doc.palette.length > 0) {
    /*
     * Described, not listed as hex.
     *
     * `using only these colors: #2e84f5, #ffcd75` went into prompts verbatim and
     * the models that letter well drew the hex codes across the picture — a
     * prompt is a description, and a hex triplet is a string of characters
     * before it is a colour. The exact values still reach `color_palette` on the
     * endpoints that take one, where they are a real constraint rather than
     * prose. See config/colourWords.ts.
     */
    const said = describePalette(doc.palette.map((entry) => entry.value));
    if (said) {
      parts.push(`a colour palette of ${said}`);
    }
  }
  if (doc.voice.trim()) {
    parts.push(doc.voice.trim());
  }
  return parts.join(", ");
};

/**
 * A kit document, forced into shape.
 *
 * Here rather than in the endpoint because both sides need the same answer, for
 * the reason stated at the top of this file: a limit only the server knows about
 * is a limit the person hits by surprise. The panel runs this to show what will
 * be stored; the endpoint runs it because a client is not to be trusted about
 * length, count or notation.
 *
 * Everything is clamped rather than rejected. A kit is a governing document
 * someone is part-way through writing, and refusing the whole save because the
 * twenty-fifth colour is one too many loses the other twenty-four. What cannot
 * be salvaged is dropped: a colour that is not a six-digit hex has no meaning to
 * clamp toward.
 *
 * Image URLs are *not* validated here. They have to be ours — copied into blob
 * storage before the version is written, as patch 031 says — and only the server
 * can know that, so it is the server's job.
 */
const clampText = (value: unknown, max: number): string =>
  typeof value === "string"
    ? value.replace(/\0/g, "").trim().slice(0, max)
    : "";

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const clampWeights = (value: unknown): number[] =>
  asArray(value)
    .map((w) => Number(w))
    .filter((w) => Number.isFinite(w) && w >= 1 && w <= 1000)
    .slice(0, 12);

export const sanitizeKitDoc = (input: unknown): BrandKitDoc => {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    logos: asArray(raw.logos)
      .map((entry) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        return {
          /* A fraction of the logo's own width, so it means the same at any
             size. Bounded at 4 because eight logo-widths of air is not clear
             space, it is a mistake. */
          clearSpace: Math.min(Math.max(Number(e.clearSpace) || 0, 0), 4),
          label: clampText(e.label, MAX_KIT_NAME),
          minWidth: Math.min(Math.max(Number(e.minWidth) || 0, 0), 4096),
          rules: clampText(e.rules, MAX_RULE_TEXT),
          url: typeof e.url === "string" ? e.url : "",
        };
      })
      .filter((entry) => entry.url !== "")
      .slice(0, MAX_LOGOS),
    look: (() => {
      const look = (raw.look ?? null) as Record<string, unknown> | null;
      const id = typeof look?.id === "string" ? look.id.trim() : "";
      if (!id) {
        return null;
      }
      const strength = Number(look?.strength);
      return {
        id,
        /* Defaults to full rather than none: a look chosen and stored with a
           missing strength was chosen to be seen. */
        strength: Number.isFinite(strength)
          ? Math.min(Math.max(strength, 0), 1)
          : 1,
      };
    })(),
    offBrand: asArray(raw.offBrand)
      .filter((url): url is string => typeof url === "string" && url !== "")
      .slice(0, MAX_OFFBRAND),
    onBrand: asArray(raw.onBrand)
      .filter((url): url is string => typeof url === "string" && url !== "")
      .slice(0, MAX_ONBRAND),
    palette: asArray(raw.palette)
      .map((entry) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        return {
          name: clampText(e.name, MAX_KIT_NAME),
          role: clampText(e.role, MAX_KIT_NAME),
          value:
            typeof e.value === "string" ? e.value.trim().toLowerCase() : "",
        };
      })
      .filter((entry) => isHexColour(entry.value))
      .slice(0, MAX_PALETTE),
    typefaces: asArray(raw.typefaces)
      .map((entry) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        return {
          name: clampText(e.name, MAX_KIT_NAME),
          role: clampText(e.role, MAX_KIT_NAME),
          weights: clampWeights(e.weights),
        };
      })
      .filter((entry) => entry.name !== "")
      .slice(0, MAX_TYPEFACES),
    voice: clampText(raw.voice, MAX_VOICE),
  };
};

/**
 * A sub-brand's document, resolved against its parent.
 *
 * Part by part, not field by field. A sub-brand that states a palette replaces
 * its parent's wholesale rather than having its colours merged in — a palette
 * assembled from two brands is a palette nobody chose, and the whole point of a
 * kit is that somebody chose it.
 *
 * So each part is inherited only when the child leaves it empty, which is also
 * what makes the common case work: a sub-brand that overrides one accent colour
 * and nothing else still carries the parent's voice, typefaces and grade.
 *
 * `voice` is the one text field, and an empty string is "not stated" rather than
 * "deliberately silent" — a sub-brand wanting no voice at all is not a case
 * worth a flag, and clearing the field to inherit again is what people expect.
 */
export const resolveKitDoc = (
  child: BrandKitDoc,
  parent: BrandKitDoc | null
): BrandKitDoc => {
  if (!parent) {
    return child;
  }
  return {
    logos: child.logos.length > 0 ? child.logos : parent.logos,
    look: child.look ?? parent.look,
    offBrand: child.offBrand.length > 0 ? child.offBrand : parent.offBrand,
    onBrand: child.onBrand.length > 0 ? child.onBrand : parent.onBrand,
    palette: child.palette.length > 0 ? child.palette : parent.palette,
    typefaces: child.typefaces.length > 0 ? child.typefaces : parent.typefaces,
    voice: child.voice.trim() ? child.voice : parent.voice,
  };
};

/** Which parts of a resolved document came from the parent rather than the
 *  child — so the panel can say so instead of appearing to have values the
 *  sub-brand does not actually hold. */
export const inheritedParts = (
  child: BrandKitDoc,
  parent: BrandKitDoc | null
): string[] => {
  if (!parent) {
    return [];
  }
  const parts: string[] = [];
  if (child.palette.length === 0 && parent.palette.length > 0) {
    parts.push("palette");
  }
  if (child.typefaces.length === 0 && parent.typefaces.length > 0) {
    parts.push("typefaces");
  }
  if (child.logos.length === 0 && parent.logos.length > 0) {
    parts.push("logos");
  }
  if (!(child.look || !parent.look)) {
    parts.push("look");
  }
  if (!child.voice.trim() && parent.voice.trim()) {
    parts.push("voice");
  }
  return parts;
};

/**
 * The colours in a pasted stylesheet.
 *
 * Written because a brand's colours almost always already exist as CSS
 * somewhere — a tokens file, a theme block, a component's variables — and
 * retyping six hex codes into six fields is how one of them ends up wrong.
 *
 * Custom properties are read as *named* entries, because the name is the useful
 * half: `--brand-ink: #101a2b` knows both what the colour is and what it is
 * for, which is exactly the pair a palette entry holds. Bare hexes elsewhere in
 * the snippet are taken too, unnamed, since a snippet is as likely to be a
 * fragment of a rule as a token block.
 *
 * Duplicates collapse on value, keeping the first name seen: a token file
 * usually states a colour once and then aliases it, and the alias is the less
 * descriptive name.
 */
const CSS_CUSTOM_PROPERTY = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g;
const CSS_BARE_HEX = /#[0-9a-fA-F]{6}\b/g;

/** `#abc` and `#abcd` mean the same colour as their doubled form. */
const expandHex = (hex: string): string | null => {
  const body = hex.slice(1).toLowerCase();
  if (body.length === 3 || body.length === 4) {
    const rgb = body
      .slice(0, 3)
      .split("")
      .map((ch) => ch + ch)
      .join("");
    return `#${rgb}`;
  }
  if (body.length === 6 || body.length === 8) {
    return `#${body.slice(0, 6)}`;
  }
  return null;
};

export const paletteFromCss = (css: string): PaletteEntry[] => {
  const seen = new Map<string, PaletteEntry>();
  const add = (value: string | null, name: string) => {
    if (!(value && HEX.test(value)) || seen.has(value)) {
      return;
    }
    seen.set(value, { name, role: "", value });
  };
  for (const match of css.matchAll(CSS_CUSTOM_PROPERTY)) {
    add(expandHex(match[2] ?? ""), match[1] ?? "");
  }
  for (const match of css.matchAll(CSS_BARE_HEX)) {
    add(expandHex(match[0]), "");
  }
  return [...seen.values()].slice(0, MAX_PALETTE);
};
