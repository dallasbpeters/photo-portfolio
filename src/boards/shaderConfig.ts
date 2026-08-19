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

/** One entry in a stack, with the parameters changed from their defaults. */
export interface ShaderLayer {
  /**
   * What this effect applies to.
   *
   * Present on effects, absent on sources. This is what makes the stack a tree
   * rather than a list, and it exists because a list cannot say *which* layers
   * an effect covers — it can only mean "everything below me". Group is the
   * plainest case: a container with no parameters at all, whose entire purpose
   * is to hold a chosen few so one effect can treat them as a unit.
   */
  children?: ShaderLayer[];
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
 * What an effect gets to work on when it is picked on its own.
 *
 * Chosen for being obviously *there*: a plasma moves and has color, so an
 * effect over it reads immediately. A flat fill would leave several effects
 * still looking broken.
 */
export const DEFAULT_SOURCE = "Plasma";

/**
 * The two kinds of shader, which is the only distinction anyone needs.
 *
 * A **source** draws a picture — a texture, a gradient, a shape, an image. An
 * **effect** changes a picture that already exists — a blur, a dither, an
 * adjustment. The registry records this as `requiresChild`, which is accurate
 * and completely opaque; every category falls cleanly on one side or the other,
 * so the split is worth naming plainly rather than explaining.
 */
export const isEffect = (name: string): boolean =>
  shaderMeta(name)?.requiresChild === true;

export const SOURCE_SHADERS: ShaderMeta[] = ALL_SHADERS.filter(
  (shader) => !shader.requiresChild
);

export const EFFECT_SHADERS: ShaderMeta[] = ALL_SHADERS.filter(
  (shader) => shader.requiresChild
);

const categoriesOf = (shaders: ShaderMeta[]): string[] => [
  ...new Set(shaders.map((shader) => shader.category)),
];

export const SOURCE_CATEGORIES: string[] = categoriesOf(SOURCE_SHADERS);
export const EFFECT_CATEGORIES: string[] = categoriesOf(EFFECT_SHADERS);

export const newLayer = (name: string): ShaderLayer => {
  const layer: ShaderLayer = { id: newLayerId(), name, props: {} };
  // An effect with nothing inside it renders an empty box, which reads as a
  // broken shader rather than an unfinished one. It arrives holding something,
  // and the source can be swapped or removed afterwards.
  if (isEffect(name)) {
    layer.children = [{ id: newLayerId(), name: DEFAULT_SOURCE, props: {} }];
  }
  return layer;
};

export const newShaderConfig = (name: string): ShaderConfig => ({
  layers: [newLayer(name)],
});

/**
 * Reads a stack saved before nesting existed.
 *
 * The old shape was a flat list in which an effect implicitly took everything
 * after it. That is exactly the chain this folds it back into, so an existing
 * board looks the same as it did — it simply becomes editable in ways it was
 * not. Detected by absence: a layer that already has `children` is new-shape,
 * and a flat list of pure sources means the same thing under either reading.
 */
export const normalizeLayers = (layers: ShaderLayer[]): ShaderLayer[] => {
  if (layers.some((layer) => Array.isArray(layer.children))) {
    return layers;
  }
  const fold = (index: number): ShaderLayer[] => {
    const layer = layers[index];
    if (!layer) {
      return [];
    }
    const rest = fold(index + 1);
    if (isEffect(layer.name)) {
      return [{ ...layer, children: rest }];
    }
    return [layer, ...rest];
  };
  return fold(0);
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

/** The library's own image source: a shader that draws a picture. */
const IMAGE_LAYER = "ImageTexture";

export const hasImageLayer = (layers: ShaderLayer[]): boolean =>
  layers.some(
    (layer) => layer.name === IMAGE_LAYER || hasImageLayer(layer.children ?? [])
  );

export const bindImage = (layers: ShaderLayer[], url: string): ShaderLayer[] =>
  layers.map((layer) =>
    layer.name === IMAGE_LAYER
      ? { ...layer, props: { ...layer.props, url } }
      : { ...layer, children: bindImage(layer.children ?? [], url) }
  );

/**
 * Puts the image where an effect will actually reach it: innermost.
 *
 * Following the last layer inwards lands inside every effect wrapping it, which
 * is what someone dragging a picture into a stack of effects means — restyle
 * this, not sit beside it.
 */
export const insertImage = (
  layers: ShaderLayer[],
  url: string
): ShaderLayer[] => {
  const last = layers.at(-1);
  const image = {
    id: `wired-${IMAGE_LAYER}`,
    name: IMAGE_LAYER,
    /*
     * `contain` rather than the library's default.
     *
     * ImageTexture defaults objectFit to "fill", which stretches the picture to
     * the viewport — so a portrait wired into a square shader came out squashed,
     * and nothing about the result said the aspect ratio had been thrown away.
     *
     * Contained rather than covered: a picture someone deliberately wired in
     * should arrive whole, and silently cropping a third of it is the worse of
     * the two failures.
     */
    props: { objectFit: "contain", url },
  };
  if (!(last && isEffect(last.name))) {
    return [...layers, image];
  }
  return [
    ...layers.slice(0, -1),
    { ...last, children: insertImage(last.children ?? [], url) },
  ];
};

/**
 * The stack as it should render, with a wired image bound into it.
 *
 * Done here rather than written into the item's config, so the picture stays a
 * property of the wire: unplug it and the stack is exactly what it was, with no
 * stale URL left behind in the saved board. An explicit ImageTexture layer is
 * filled in wherever it sits, which lets the image be placed deliberately.
 */
export const withImage = (
  layers: ShaderLayer[],
  imageUrl: string | null | undefined
): ShaderLayer[] => {
  if (!imageUrl) {
    return layers;
  }
  return hasImageLayer(layers)
    ? bindImage(layers, imageUrl)
    : insertImage(layers, imageUrl);
};
