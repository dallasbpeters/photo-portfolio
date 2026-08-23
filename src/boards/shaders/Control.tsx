import type { JSX } from "react";
import type { ControlType, ShaderProp } from "./shaderConfig";
import "./Control.css";

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
      <label className="control--stacked">
        <span className="control__label-row">
          {prop.label}
          <span className="control__value">{n}</span>
        </span>
        <input
          className="control__range"
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
      <label className="control--inline">
        {prop.label}
        <input
          className="control__swatch"
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
    <label className="control--stacked">
      <span className="control__label">{prop.label}</span>
      <select
        className="control__field"
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
    <label className="control--inline">
      {prop.label}
      <input
        checked={current === true}
        className="control__checkbox"
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
      <div className="control--stacked">
        <span className="control__label">{prop.label}</span>
        <div className="control__pair">
          {(["x", "y"] as const).map((axis) => (
            <input
              className="control__field control__field--numeric"
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
      <label className="control--stacked">
        <span className="control__label">{prop.label}</span>
        <select
          className="control__field"
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
      <div className="control--stacked">
        <span className="control__label">{prop.label}</span>
        {stops.length === 0 ? (
          <button
            className="control__add"
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
            <div className="control__row" key={index}>
              <input
                className="control__swatch control__swatch--stop"
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
                className="control__field control__field--numeric"
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
      <p className="control__unsupported">{prop.label} — not editable here</p>
    );
  }
  return <Chosen current={current} onChange={onChange} prop={prop} />;
}
