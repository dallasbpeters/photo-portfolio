import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { type JSX, useState } from "react";
import {
  ALL_SHADERS,
  type ControlType,
  groupProps,
  newLayerId,
  SHADER_CATEGORIES,
  type ShaderConfig,
  type ShaderProp,
  shaderMeta,
} from "./shaderConfig";

/**
 * The parameter panel for a shader, generated from the registry.
 *
 * Nothing here is written per shader. Each effect publishes its own parameters
 * with a control type, range, options and grouping, so this walks that metadata
 * and draws the right control — the same idea as a Framer component's property
 * controls, except the schema ships with the package instead of being declared
 * alongside the component.
 *
 * Six control types cover 96% of the library's 1,668 parameters. The remainder
 * — shape pickers, font choosers, media uploads — are shown as unsupported
 * rather than approximated: a control that half works is worse than one that
 * admits it is missing, because only one of those two tells you to go and edit
 * the value somewhere else.
 */

interface ControlProps {
  onChange: (value: unknown) => void;
  prop: ShaderProp;
  value: unknown;
}

/** Same, with the default already applied so each control reads one value. */
interface ResolvedControlProps {
  current: unknown;
  onChange: (value: unknown) => void;
  prop: ShaderProp;
}

const asNumber = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function RangeControl({ onChange, prop, current }: ResolvedControlProps) {
  {
    const min = prop.min ?? 0;
    const max = prop.max ?? 1;
    const n = asNumber(current, asNumber(prop.default, min));
    return (
      <label className="block space-y-1">
        <span className="flex items-center justify-between text-[10px] text-white/45">
          {prop.label}
          <span className="text-white/70 tabular-nums">{n}</span>
        </span>
        <input
          className="w-full accent-sky-400"
          max={max}
          min={min}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerDown={(e) => e.stopPropagation()}
          step={prop.step ?? (max - min) / 100}
          type="range"
          value={n}
        />
      </label>
    );
  }
}

function ColorControl({ onChange, prop, current }: ResolvedControlProps) {
  {
    const hex = typeof current === "string" ? current : "#ffffff";
    return (
      <label className="flex items-center justify-between gap-2 text-[10px] text-white/45">
        {prop.label}
        <input
          className="h-6 w-10 cursor-pointer rounded border border-white/15 bg-transparent"
          onChange={(e) => onChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          type="color"
          value={hex}
        />
      </label>
    );
  }
}

function SelectControl({ onChange, prop, current }: ResolvedControlProps) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] text-white/45">{prop.label}</span>
      <select
        className="w-full rounded border border-white/10 bg-black/50 px-2 py-1 text-[11px] text-white outline-none focus:border-white/40"
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        value={typeof current === "string" ? current : ""}
      >
        {prop.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxControl({ onChange, prop, current }: ResolvedControlProps) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px] text-white/45">
      {prop.label}
      <input
        checked={current === true}
        className="size-3.5 accent-sky-400"
        onChange={(e) => onChange(e.target.checked)}
        onPointerDown={(e) => e.stopPropagation()}
        type="checkbox"
      />
    </label>
  );
}

/** Two numbers in 0–1 space; one pair of fields rather than a bespoke pad. */
function PositionControl({ onChange, prop, current }: ResolvedControlProps) {
  {
    const point = (current ?? { x: 0.5, y: 0.5 }) as { x?: number; y?: number };
    return (
      <div className="space-y-1">
        <span className="text-[10px] text-white/45">{prop.label}</span>
        <div className="flex gap-1">
          {(["x", "y"] as const).map((axis) => (
            <input
              className="w-full rounded border border-white/10 bg-black/50 px-2 py-1 text-[11px] text-white tabular-nums outline-none focus:border-white/40"
              key={axis}
              onChange={(e) =>
                onChange({ ...point, [axis]: Number(e.target.value) })
              }
              onPointerDown={(e) => e.stopPropagation()}
              step={0.01}
              type="number"
              value={asNumber(point[axis], 0.5)}
            />
          ))}
        </div>
      </div>
    );
  }
}

function OriginControl({ onChange, prop, current }: ResolvedControlProps) {
  {
    const ORIGINS = [
      "top-left",
      "top",
      "top-right",
      "left",
      "center",
      "right",
      "bottom-left",
      "bottom",
      "bottom-right",
    ];
    return (
      <label className="block space-y-1">
        <span className="text-[10px] text-white/45">{prop.label}</span>
        <select
          className="w-full rounded border border-white/10 bg-black/50 px-2 py-1 text-[11px] text-white outline-none focus:border-white/40"
          onChange={(e) => onChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          value={typeof current === "string" ? current : "center"}
        >
          {ORIGINS.map((origin) => (
            <option key={origin} value={origin}>
              {origin}
            </option>
          ))}
        </select>
      </label>
    );
  }
}

function GradientControl({ onChange, prop, current }: ResolvedControlProps) {
  {
    const stops = Array.isArray(current)
      ? (current as { color: string; position: number }[])
      : [];
    return (
      <div className="space-y-1">
        <span className="text-[10px] text-white/45">{prop.label}</span>
        {stops.length === 0 ? (
          <button
            className="w-full rounded border border-white/15 py-1 text-[10px] text-white/50 hover:text-white"
            onClick={() =>
              onChange([
                { color: "#ffffff", position: 0 },
                { color: "#000000", position: 1 },
              ])
            }
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            Add gradient
          </button>
        ) : (
          stops.map((stop, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a gradient stop has no identity but its place in the ramp — two stops may share a colour and a position, and reordering is what editing one means
            <div className="flex items-center gap-1" key={index}>
              <input
                className="h-6 w-8 cursor-pointer rounded border border-white/15 bg-transparent"
                onChange={(e) => {
                  const next = [...stops];
                  next[index] = { ...stop, color: e.target.value };
                  onChange(next);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                type="color"
                value={stop.color}
              />
              <input
                className="w-full rounded border border-white/10 bg-black/50 px-2 py-1 text-[11px] text-white tabular-nums outline-none"
                max={1}
                min={0}
                onChange={(e) => {
                  const next = [...stops];
                  next[index] = { ...stop, position: Number(e.target.value) };
                  onChange(next);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                step={0.01}
                type="number"
                value={stop.position}
              />
            </div>
          ))
        )}
      </div>
    );
  }
}

/**
 * One parameter, drawn by whichever control its metadata asks for.
 *
 * A lookup rather than a chain of branches: the registry names the control, so
 * dispatching on that name keeps each control small and makes an unhandled type
 * a missing entry rather than a fallthrough.
 */
const CONTROLS: Partial<
  Record<ControlType, (props: ResolvedControlProps) => JSX.Element>
> = {
  checkbox: CheckboxControl,
  color: ColorControl,
  "gradient-stops": GradientControl,
  origin: OriginControl,
  position: PositionControl,
  range: RangeControl,
  select: SelectControl,
};

function Control({ onChange, prop, value }: ControlProps) {
  const Chosen = CONTROLS[prop.control];
  const current = value === undefined ? prop.default : value;
  if (!Chosen) {
    return (
      <p className="text-[10px] text-white/25">
        {prop.label} — not editable here
      </p>
    );
  }
  return <Chosen current={current} onChange={onChange} prop={prop} />;
}

interface ShaderControlsProps {
  config: ShaderConfig;
  onChange: (config: ShaderConfig) => void;
}

export function ShaderControls({ config, onChange }: ShaderControlsProps) {
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState(SHADER_CATEGORIES[0] ?? "");
  const setLayerProp = (index: number, key: string, value: unknown) => {
    const layers = config.layers.map((layer, i) =>
      i === index
        ? { ...layer, props: { ...layer.props, [key]: value } }
        : layer
    );
    onChange({ ...config, layers });
  };

  const removeLayer = (index: number) => {
    onChange({
      ...config,
      layers: config.layers.filter((_, i) => i !== index),
    });
  };

  /**
   * Moves a layer up or down the stack.
   *
   * Order is not cosmetic: a wrapping effect takes everything below it as its
   * children, so moving one changes what it transforms. Putting a Dither above
   * a Plasma is how you say "dither the plasma".
   */
  const moveLayer = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= config.layers.length) {
      return;
    }
    const layers = [...config.layers];
    const [moved] = layers.splice(index, 1);
    if (moved) {
      layers.splice(target, 0, moved);
      onChange({ ...config, layers });
    }
  };

  const addLayer = (name: string) => {
    onChange({
      ...config,
      layers: [...config.layers, { id: newLayerId(), name, props: {} }],
    });
  };

  return (
    <div className="space-y-3">
      {config.layers.map((layer, index) => {
        const meta = shaderMeta(layer.name);
        return (
          <div
            className="rounded border border-white/10 bg-black/40"
            key={layer.id}
          >
            <div className="flex items-center justify-between gap-2 border-white/10 border-b px-2 py-1">
              <span className="truncate text-[10px] text-white/70 uppercase tracking-[0.14em]">
                {layer.name}
              </span>
              <button
                aria-label={`Move ${layer.name} up`}
                className="text-white/30 hover:text-white disabled:opacity-20"
                disabled={index === 0}
                onClick={() => moveLayer(index, -1)}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                <HugeiconsIcon icon={ArrowUp01Icon} size={12} />
              </button>
              <button
                aria-label={`Move ${layer.name} down`}
                className="text-white/30 hover:text-white disabled:opacity-20"
                disabled={index === config.layers.length - 1}
                onClick={() => moveLayer(index, 1)}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                <HugeiconsIcon icon={ArrowDown01Icon} size={12} />
              </button>
              <button
                aria-label={`Remove ${layer.name}`}
                className="text-white/30 hover:text-white"
                onClick={() => removeLayer(index)}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                <HugeiconsIcon icon={Delete02Icon} size={12} />
              </button>
            </div>

            <div className="space-y-3 p-2">
              {meta === null ? (
                <p className="text-[10px] text-amber-300/70">
                  This effect is not in the installed package.
                </p>
              ) : (
                groupProps(meta.props).map(({ group, props }) => (
                  <div className="space-y-2" key={group}>
                    <p className="text-[9px] text-white/30 uppercase tracking-[0.18em]">
                      {group}
                    </p>
                    {props.map((prop) => (
                      <Control
                        key={prop.key}
                        onChange={(value) =>
                          setLayerProp(index, prop.key, value)
                        }
                        prop={prop}
                        value={layer.props[prop.key]}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}

      {adding ? (
        <div className="space-y-2 rounded border border-white/15 bg-black/60 p-2">
          <div className="flex flex-wrap gap-1">
            {SHADER_CATEGORIES.map((name) => (
              <button
                className={`min-h-6 rounded px-1.5 text-[9px] tracking-[0.08em] transition-colors ${
                  category === name
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/80"
                }`}
                key={name}
                onClick={() => setCategory(name)}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
          <div className="max-h-40 space-y-0.5 overflow-y-auto">
            {ALL_SHADERS.filter((shader) => shader.category === category).map(
              (shader) => (
                <button
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11px] text-white/75 hover:bg-white/10 hover:text-white"
                  key={shader.name}
                  onClick={() => {
                    addLayer(shader.name);
                    setAdding(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  type="button"
                >
                  {shader.name}
                  {shader.requiresChild ? (
                    <span className="shrink-0 text-[8px] text-sky-300/60 uppercase tracking-widest">
                      wraps
                    </span>
                  ) : null}
                </button>
              )
            )}
          </div>
        </div>
      ) : null}

      <button
        className="w-full rounded border border-white/15 py-1.5 text-[10px] text-white/60 uppercase tracking-[0.14em] hover:text-white"
        onClick={() => setAdding((open) => !open)}
        onPointerDown={(e) => e.stopPropagation()}
        type="button"
      >
        {adding ? "Cancel" : "Add effect"}
      </button>

      {/* Order is the nesting. Said once here rather than left to be worked out
          from why moving a layer changed the picture. */}
      {config.layers.length > 1 ? (
        <p className="text-[9px] text-white/25 leading-relaxed">
          Effects marked “wraps” transform everything below them. Reorder to
          change what each one affects.
        </p>
      ) : null}
    </div>
  );
}
