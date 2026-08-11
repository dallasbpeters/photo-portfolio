/**
 * A shader item's configuration, and the registry it is built from.
 *
 * The `shaders` package publishes a registry of 189 effects, each carrying its
 * own parameter schema — defaults, ranges, option lists, and the control type
 * the UI should use. That is the whole reason this feature is small: nothing
 * here is written per shader. The picker, the controls and the defaults are all
 * derived from that metadata, so a shader added by a package update appears
 * without a line of code changing.
 *
 * Browser-only. The registry is a runtime dependency and has no business inside
 * a serverless function that never renders anything — see api/_lib/shaders.ts
 * for why the server validates shape rather than values.
 */

import {
  getCategories,
  getShaderByName,
  shaderRegistry,
} from "shaders/registry";

/** How the panel should draw a parameter. */
export type ControlType =
  | "range"
  | "color"
  | "select"
  | "checkbox"
  | "position"
  | "origin"
  | "gradient-stops"
  | "unsupported";

export interface SelectOption {
  label: string;
  value: string;
}

export interface ShaderProp {
  control: ControlType;
  default: unknown;
  description: string | null;
  /** The registry's own grouping — "Colors", "Position", "Effect". */
  group: string;
  key: string;
  label: string;
  max: number | null;
  min: number | null;
  options: SelectOption[];
  step: number | null;
}

export interface ShaderMeta {
  category: string;
  description: string;
  name: string;
  props: ShaderProp[];
  /** True when this effect wraps something else rather than drawing alone. */
  requiresChild: boolean;
}

/** One effect in a stack, with the parameters that have been changed from default. */
export interface ShaderLayer {
  /**
   * Stable identity for a layer.
   *
   * Its position is not its identity: the same effect may appear twice in a
   * stack, and reordering is a normal edit — keying on the index would make
   * React reuse the wrong control state the moment one moved.
   */
  id: string;
  name: string;
  props: Record<string, unknown>;
}

export interface ShaderConfig {
  layers: ShaderLayer[];
}

/**
 * The six control types that cover the library.
 *
 * 96% of the 1,668 parameters in the registry use one of these. The rest —
 * shape pickers, font choosers, media uploads — appear a handful of times each
 * and are surfaced as read-only rather than pretended at: a control that half
 * works is worse than one that says it is not implemented.
 */
const SUPPORTED: ReadonlySet<string> = new Set([
  "range",
  "color",
  "select",
  "checkbox",
  "position",
  "origin",
  "gradient-stops",
]);

const asControl = (raw: unknown): ControlType => {
  // Some parameters declare several, most specific first: ["range", "map"].
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === "string" && SUPPORTED.has(first)
    ? (first as ControlType)
    : "unsupported";
};

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

interface RegistryUi {
  group?: string;
  label?: string;
  max?: number;
  min?: number;
  options?: { label?: string; value?: string }[];
  step?: number;
  type?: string | string[];
}

interface RegistryProp {
  default?: unknown;
  description?: string;
  ui?: RegistryUi;
}

const toProp = (key: string, def: RegistryProp): ShaderProp => ({
  control: asControl(def.ui?.type),
  default: def.default,
  description: def.description ?? null,
  group: def.ui?.group ?? "Other",
  key,
  // Falls back to the property name so a control is never unlabelled.
  label: def.ui?.label ?? key,
  max: num(def.ui?.max),
  min: num(def.ui?.min),
  options: (def.ui?.options ?? [])
    .filter((option) => typeof option.value === "string")
    .map((option) => ({
      label: option.label ?? String(option.value),
      value: String(option.value),
    })),
  step: num(def.ui?.step),
});

const toMeta = (entry: {
  category?: string;
  definition?: { props?: Record<string, RegistryProp> };
  description?: string;
  name: string;
  requiresChild?: boolean;
}): ShaderMeta => ({
  category: entry.category ?? "Other",
  description: entry.description ?? "",
  name: entry.name,
  props: Object.entries(entry.definition?.props ?? {}).map(([key, def]) =>
    toProp(key, def)
  ),
  requiresChild: entry.requiresChild === true,
});

/** Every shader the installed package offers, already reduced to what the UI needs. */
export const ALL_SHADERS: ShaderMeta[] = shaderRegistry.map(toMeta);

export const SHADER_CATEGORIES: string[] = getCategories();

export const shaderMeta = (name: string): ShaderMeta | null => {
  const entry = getShaderByName(name);
  return entry ? toMeta(entry) : null;
};

/** Parameters grouped the way the registry groups them, for a panel that reads well. */
export const groupProps = (
  props: ShaderProp[]
): { group: string; props: ShaderProp[] }[] => {
  const groups = new Map<string, ShaderProp[]>();
  for (const prop of props) {
    const existing = groups.get(prop.group);
    if (existing) {
      existing.push(prop);
    } else {
      groups.set(prop.group, [prop]);
    }
  }
  return [...groups].map(([group, grouped]) => ({ group, props: grouped }));
};

/**
 * A shader item's starting configuration.
 *
 * Only the effect is stored — its parameters stay absent until one is changed,
 * so the package's own defaults keep applying and a package update improves an
 * existing board rather than being overridden by values copied out of it.
 */
export const newLayerId = (): string =>
  `l${Math.random().toString(36).slice(2, 10)}`;

/**
 * What a wrapping effect gets to transform when it is picked on its own.
 *
 * Chosen for being obviously *there*: a plasma moves and has colour, so an
 * effect layered over it reads immediately. A flat fill would leave several
 * effects still looking broken.
 */
export const DEFAULT_SOURCE = "Plasma";

export const newShaderConfig = (name: string): ShaderConfig => {
  const layer = { id: newLayerId(), name, props: {} };

  // Slightly more than half the library transforms a picture rather than
  // drawing one, and such an effect alone has nothing to work on — it renders
  // an empty box, which reads as "this shader is broken" rather than "this
  // shader needs something underneath". So it arrives with something to chew
  // on, and the source can be swapped or removed afterwards.
  if (shaderMeta(name)?.requiresChild) {
    return {
      layers: [layer, { id: newLayerId(), name: DEFAULT_SOURCE, props: {} }],
    };
  }
  return { layers: [layer] };
};

export const isShaderConfig = (value: unknown): value is ShaderConfig => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { layers } = value as ShaderConfig;
  return (
    Array.isArray(layers) &&
    layers.every((layer) => typeof layer?.name === "string")
  );
};
