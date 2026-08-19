import type { JSX } from "react";
import type { ControlType, ShaderProp } from "../shaderConfig";

/**
 * One editable property of a shader layer.
 *
 * Split out of ShaderControls.tsx, which was at the size ceiling and needed
 * room to tell the truth about a wired image. These are the leaves — a slider,
 * a swatch, a select — and none of them knows anything about the stack they sit
 * in, which is why they were the safe half to move.
 */

export interface ControlProps {
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
        <span className="flex items-center justify-between text-[10px] text-board-ink/45">
          {prop.label}
          <span className="text-board-ink/70 tabular-nums">{n}</span>
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
      <label className="flex items-center justify-between gap-2 text-[10px] text-board-ink/45">
        {prop.label}
        <input
          className="h-6 w-10 cursor-pointer rounded border border-board-ink/15 bg-transparent"
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
      <span className="text-[10px] text-board-ink/45">{prop.label}</span>
      <select
        className="w-full rounded border border-board-ink/10 bg-board-surface/50 px-2 py-1 text-[11px] text-board-ink outline-none focus:border-board-ink/40"
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
    <label className="flex items-center justify-between gap-2 text-[10px] text-board-ink/45">
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
        <span className="text-[10px] text-board-ink/45">{prop.label}</span>
        <div className="flex gap-1">
          {(["x", "y"] as const).map((axis) => (
            <input
              className="w-full rounded border border-board-ink/10 bg-board-surface/50 px-2 py-1 text-[11px] text-board-ink tabular-nums outline-none focus:border-board-ink/40"
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
        <span className="text-[10px] text-board-ink/45">{prop.label}</span>
        <select
          className="w-full rounded border border-board-ink/10 bg-board-surface/50 px-2 py-1 text-[11px] text-board-ink outline-none focus:border-board-ink/40"
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
        <span className="text-[10px] text-board-ink/45">{prop.label}</span>
        {stops.length === 0 ? (
          <button
            className="w-full rounded border border-board-ink/15 py-1 text-[10px] text-board-ink/50 hover:text-board-ink"
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
            // biome-ignore lint/suspicious/noArrayIndexKey: a gradient stop has no identity but its place in the ramp — two stops may share a color and a position, and reordering is what editing one means
            <div className="flex items-center gap-1" key={index}>
              <input
                className="h-6 w-8 cursor-pointer rounded border border-board-ink/15 bg-transparent"
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
                className="w-full rounded border border-board-ink/10 bg-board-surface/50 px-2 py-1 text-[11px] text-board-ink tabular-nums outline-none"
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

export function Control({ onChange, prop, value }: ControlProps) {
  const Chosen = CONTROLS[prop.control];
  const current = value === undefined ? prop.default : value;
  if (!Chosen) {
    return (
      <p className="text-[10px] text-board-ink/25">
        {prop.label} — not editable here
      </p>
    );
  }
  return <Chosen current={current} onChange={onChange} prop={prop} />;
}
