import { MAX_MODEL_ID } from "../../config/models.js";
import { nodeTypeFor, type SettingDef } from "../../config/nodeTypes.js";
import { UUID_RE } from "./boardItemParse.js";
import { clamp, num, text } from "./values.js";

/**
 * Three, six or eight digits — the forms a colour arrives in.
 *
 * Hoisted because this runs per setting, per item, per save, and a regex
 * rebuilt on every one of those is work for nothing.
 */
const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

/**
 * What a node's `config` blob may contain, per node type.
 *
 * The fiddly half of validating an incoming item: every node type declares its
 * own settings, and a shader or a drawing carries a nested structure with its
 * own depth and size limits. Kept apart from boardItemParse.ts so that file
 * reads as the shape of an item, and this one as the shape of its settings.
 *
 * Bounds here are all Principle III's "coerce, do not reject" rule: a number
 * outside its range is clamped, an over-long list is truncated. Only a
 * structural violation — a shader nested past MAX_SHADER_DEPTH — drops the
 * whole config.
 */

/** A number setting's stored value, clamped rather than rejected. */
const numberStored = (
  setting: Extract<SettingDef, { kind: "number" }>,
  value: unknown
): number => {
  // Clamped rather than rejected, like every other number the canvas sends.
  // This one bounds *spending* — it is how many paid generations a single
  // run will make — so an absurd value must not survive the trip.
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return setting.default;
  }
  // Rounded only when the setting counts in whole numbers. A tint between 0
  // and 1 was being truncated to 0 or 1 on the way in, so every value in
  // between was thrown away by the save rather than by the control.
  const whole = (setting.step ?? 1) >= 1;
  return clamp(whole ? Math.trunc(n) : n, setting.min, setting.max);
};

/** The kinds that store a bounded string and fall back to their default. */
type ChoiceSetting = Extract<
  SettingDef,
  { kind: "brandKit" | "color" | "model" | "select" }
>;

/** One of those kinds' stored value: the string it accepts, or the default. */
const choiceStored = (setting: ChoiceSetting, value: unknown): string => {
  if (typeof value !== "string") {
    return setting.default;
  }
  const trimmed = value.trim();
  if (setting.kind === "model") {
    // Not checked against the models table here: the run endpoint falls back
    // to "auto" for an id it does not know, and refusing a save would strand
    // boards whose model was deleted from the admin. Bounded like any other
    // stored string, defaulted when empty.
    return trimmed ? value.slice(0, MAX_MODEL_ID) : setting.default;
  }
  if (setting.kind === "brandKit") {
    // A uuid or nothing. Not checked against the table for the same reason a
    // model id is not: a kit deleted from the library must leave the boards
    // built on it saveable, and the run path already treats an id it cannot
    // resolve as "no brand" rather than as an error.
    return UUID_RE.test(trimmed) ? trimmed : setting.default;
  }
  if (setting.kind === "color") {
    // Coerced to the default rather than refused, like every other continuous
    // value that arrives from a client: a malformed colour is a swatch nobody
    // set, not a reason to lose the rest of the save.
    return HEX_COLOR.test(trimmed) ? trimmed : setting.default;
  }
  return setting.options.includes(value) ? value : setting.default;
};

/**
 * What one setting's stored value is, for the value the canvas sent.
 *
 * Kept out of the loop so each kind's rules stay readable and the loop stays a
 * loop. `keep` is false only for a text that is not a string at all — a prompt
 * may legitimately be cleared back to empty, but a number where a prompt goes
 * is not a prompt.
 */
export const settingStored = (
  setting: SettingDef,
  value: unknown
): { keep: boolean; value: unknown } => {
  if (setting.kind === "text") {
    // Not `text()`: a prompt may legitimately be cleared back to empty, and
    // treating that as absent would silently keep the previous one.
    if (typeof value !== "string") {
      return { keep: false, value: undefined };
    }
    return { keep: true, value: value.slice(0, setting.maxLength) };
  }
  if (setting.kind === "number") {
    return { keep: true, value: numberStored(setting, value) };
  }
  return { keep: true, value: choiceStored(setting, value) };
};

/** App-owned text config keys: not node settings, so they are not in the
 * allowlist, but written by the app rather than handed to a model — a rendered
 * composite or mask, the element library's id, and the copies kept on the node.
 * They survive a save for the same reason `selectedVersion` does. */
export const OWNED_TEXT_KEYS = [
  { key: "compositeUrl", max: 2000 },
  // What the browser rendered for a shader node, written the same way and for
  // the same reason as compositeUrl: only the browser can produce it, and the
  // run reads it back.
  { key: "renderUrl", max: 2000 },
  { key: "description", max: 2000 },
  { key: "elementId", max: 100 },
  { key: "imageUrl", max: 2000 },
  /* Which of the kit's logos a Brand node stamps. Chosen by clicking one of the
     marks on the node, so it is written by the app rather than declared as a
     setting — and matched by URL rather than index, because an index into the
     kit's list points at a different logo the moment one is deleted. */
  { key: "logoUrl", max: 2000 },
  { key: "maskUrl", max: 2000 },
  { key: "name", max: 200 },
  // Which element wrote this node's prompt; `elementStyleOf` reads it so the
  // style is not stated twice.
  { key: "styleFrom", max: 100 },
] as const;

/** A bounded copy of a batch's strike-off list, or undefined when absent. */
export const ownedList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return;
  }
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .slice(0, 200)
    .map((entry) => entry.slice(0, 2000));
};

/**
 * A node's settings, filtered to what its type actually declares.
 *
 * Unknown keys are dropped rather than stored: `config` reaches a third-party
 * generator, and a payload that can smuggle arbitrary fields into it is a
 * payload that can change what we ask the model for. Text is capped at the
 * length the corresponding endpoint already enforces, and a select falls back
 * to its default rather than failing — the same allowlist-then-fall-back
 * treatment api/ai/icon.ts gives an unknown style.
 */
export const parseNodeConfig = (
  nodeType: string,
  raw: unknown
): Record<string, unknown> | null => {
  const type = nodeTypeFor(nodeType);
  if (!type) {
    return null;
  }
  // A primitive would read as undefined at every key below and be rejected by
  // the guards there, so this only has to stop a null from throwing.
  const source = (raw ?? {}) as Record<string, unknown>;

  const config: Record<string, unknown> = {};

  // Which stored version the node is showing and handing downstream. Not a
  // node-type setting — it belongs to the results rather than to the recipe —
  // but it lives in the same object, so it has to survive the filter that keeps
  // unknown keys out.
  const selected = Number(source.selectedVersion);
  if (Number.isFinite(selected) && selected >= 0) {
    config.selectedVersion = Math.trunc(selected);
  }

  // The app writes a few keys that no node declares as settings, and they have
  // to survive the same way `selectedVersion` does: the composite's rendered
  // file, a mask's rendered bitmap, a batch's strike-offs, and the element
  // library's id and the copies kept on the node. None of them is handed to a
  // model, so keeping them out of the settings allowlist but preserving them
  // here lets the canvas and the run agree without opening the door to an
  // arbitrary payload.
  for (const { key, max } of OWNED_TEXT_KEYS) {
    const value = source[key];
    if (typeof value === "string") {
      config[key] = value.slice(0, max);
    }
  }
  const excluded = ownedList(source.excluded);
  if (excluded) {
    config.excluded = excluded;
  }
  // One rendered file per wired picture, in the order the run will ask for
  // them. Bounded like the strike-off list and for the same reason: it arrives
  // from a client and an unbounded array of addresses is an unbounded row.
  const renders = ownedList(source.renderUrls);
  if (renders) {
    config.renderUrls = renders;
  }

  for (const setting of type.settings) {
    const stored = settingStored(setting, source[setting.key]);
    if (stored.keep) {
      config[setting.key] = stored.value;
    }
  }
  return config;
};

/**
 * A shader item's configuration: an ordered stack of effects and their values.
 *
 * Shape only, deliberately. The parameter schema lives in the `shaders` package
 * registry, which is a browser dependency — importing 189 shaders' metadata
 * into a serverless function that never renders anything would be weight for
 * nothing. These values also reach no third party, no query and no generator:
 * the worst a bad one can do is render badly, for the one person who typed it.
 * So this bounds the payload and drops anything malformed, and the controls
 * that produced the values are what keep them in range.
 */
export const MAX_SHADER_LAYERS = 12;

export const MAX_SHADER_PROPS = 80;

export interface ShaderLayerDto {
  children?: ShaderLayerDto[];
  id: string;
  name: string;
  props: Record<string, unknown>;
}

/**
 * How deep a stack of effects may nest.
 *
 * An effect holds what it applies to, so nesting is the structure rather than a
 * flourish — but it is also user-supplied and recursive, and this function has
 * to terminate on a payload written by hand. Well past anything legible.
 */
export const MAX_SHADER_DEPTH = 6;

/**
 * Shape only, never values.
 *
 * The registry that knows what a parameter means is a browser dependency, and
 * has no business inside a function that renders nothing. The client is trusted
 * to send sensible values; the server's job is that it cannot send something
 * unbounded or malformed.
 */
export const parseLayers = (raw: unknown, depth: number): ShaderLayerDto[] => {
  if (!Array.isArray(raw) || depth >= MAX_SHADER_DEPTH) {
    return [];
  }
  const parsed: ShaderLayerDto[] = [];
  for (const layer of raw.slice(0, MAX_SHADER_LAYERS)) {
    const o = layer as {
      children?: unknown;
      id?: unknown;
      name?: unknown;
      props?: unknown;
    };
    const name = text(o.name, 80);
    if (!name) {
      continue;
    }
    // Assigned here when absent so a stack saved before layers had identity
    // gains it, rather than the canvas having to invent one every render.
    const id = text(o.id, 40) ?? `l${Math.random().toString(36).slice(2, 10)}`;
    const props: Record<string, unknown> = {};
    const source =
      typeof o.props === "object" && o.props !== null
        ? (o.props as Record<string, unknown>)
        : {};
    for (const [key, value] of Object.entries(source).slice(
      0,
      MAX_SHADER_PROPS
    )) {
      // Primitives, plus the small objects and arrays the position and gradient
      // controls produce. Anything deeper is not a shader parameter.
      props[key] = value;
    }
    const entry: ShaderLayerDto = { id, name, props };
    // Only carried when present: an absent `children` is what marks a source,
    // and writing an empty array onto every layer would make each one look like
    // an effect that someone had emptied.
    if (Array.isArray(o.children)) {
      entry.children = parseLayers(o.children, depth + 1);
    }
    parsed.push(entry);
  }
  return parsed;
};

/** The tools a drawing may claim to be, mirroring DRAW_TOOLS on the client. */
export const DRAW_TOOLS = new Set([
  "pen",
  "brush",
  "rect",
  "rounded",
  "ellipse",
]);

/** A freehand path this long is a mistake or an attack, not a drawing. */
export const MAX_DRAW_POINTS = 4000;

/**
 * A drawn mark: shape only, never appearance.
 *
 * Colors are passed through as given rather than parsed. They are written into
 * an SVG attribute, not into markup, so a malformed one paints nothing — and
 * the length cap is what stops the column being used as storage for something
 * that is not a color.
 *
 * The point cap matters more: a freehand path is the one field here whose size
 * is chosen by whoever is drawing, and an unbounded array of coordinates is an
 * unbounded row.
 */
export const parseDrawingConfig = (
  raw: unknown
): Record<string, unknown> | null => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const tool =
    typeof o.tool === "string" && DRAW_TOOLS.has(o.tool) ? o.tool : null;
  if (!tool) {
    return null;
  }

  const config: Record<string, unknown> = {
    fill: text(o.fill, 32),
    stroke: text(o.stroke, 32) ?? "#ffffff",
    strokeWidth: clamp(num(o.strokeWidth, 4), 1, 200),
    tool,
  };

  if (Array.isArray(o.points)) {
    config.points = o.points
      .slice(0, MAX_DRAW_POINTS)
      .filter(
        (point): point is { x: number; y: number } =>
          typeof point === "object" &&
          point !== null &&
          Number.isFinite((point as { x?: unknown }).x) &&
          Number.isFinite((point as { y?: unknown }).y)
      )
      .map((point) => ({ x: point.x, y: point.y }));
  }
  return config;
};

export const parseShaderConfig = (
  raw: unknown
): Record<string, unknown> | null => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { layers } = raw as { layers?: unknown };
  if (!Array.isArray(layers)) {
    return null;
  }
  const parsed = parseLayers(layers, 0);
  return parsed.length > 0 ? { layers: parsed } : null;
};
