import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SettingDef } from "../../config/nodeTypes.js";
import { ColorWell } from "./ColorWell";
import { useModels } from "./ModelsContext";

/**
 * A node's settings, rendered from their definitions.
 *
 * Lifted out of OpNodeView, which had grown past the size ceiling: the node is
 * a header, a body, a result strip and a settings form, and the settings are
 * the part that neither reads nor writes anything else on the node.
 */

interface SettingFieldProps {
  onChange: (value: string) => void;
  readOnly: boolean;
  setting: SettingDef;
  /**
   * The stored value, or undefined when the node has never carried this key.
   *
   * The distinction is the whole point. "" means somebody cleared the field and
   * is mid-way through typing the next value; undefined means the node has
   * never been told. Collapsing the two — which every caller used to do —
   * makes a number field impossible to edit: backspacing to empty reads as
   * "never set", the declared default is substituted, and the field jumps back
   * to 148 the instant it is cleared. There is no way to type 60 except to
   * select the whole field first, which reads as the control being broken.
   */
  value: string | undefined;
}

/**
 * One setting, rendered from its definition rather than from a switch per node
 * type.
 *
 * Driven by the registry so a node type that gains an option gains its control
 * with no change here — the same reason the registry exists at all.
 */
export function SettingField({
  onChange,
  readOnly,
  setting,
  value,
}: SettingFieldProps) {
  /*
   * What the field shows when the node has never been told.
   *
   * A stored config only carries the keys somebody has touched, so a freshly
   * inserted node has none of them and every caller resolves a missing setting
   * to "". That is a string, so a `typeof value === "string"` guard passes it
   * straight through and the declared default is never reached: the halftone's
   * ink swatch rendered the "no fill" chequerboard and its picker opened on
   * white, neither of which was the colour the node was actually using.
   *
   * Only for settings that declare a default. A text setting has none, and an
   * empty one is a field somebody cleared rather than a field never set.
   */
  const shown = value ?? ("default" in setting ? String(setting.default) : "");

  if (setting.kind === "color") {
    return (
      <div className="flex items-center justify-between gap-2 text-[10px] text-board-ink/50 uppercase tracking-[0.14em]">
        {setting.label}
        <ColorWell label={setting.label} onChange={onChange} value={shown} />
      </div>
    );
  }

  if (setting.kind === "number") {
    return (
      <label className="flex items-center justify-between gap-2 text-[10px] text-board-ink/50 uppercase tracking-[0.14em]">
        {setting.label}
        <input
          className="w-16 rounded border border-board-ink/10 bg-board-surface/40 px-2 py-1 text-right text-[12px] text-board-ink tabular-nums outline-none focus:border-board-ink/40 disabled:opacity-60"
          disabled={readOnly}
          max={setting.max}
          min={setting.min}
          onChange={(e) => onChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          type="number"
          // The raw string, so a half-typed or momentarily empty field stays
          // as typed. The API clamps whatever lands, so nothing downstream
          // depends on this being a finished number.
          value={shown}
        />
      </label>
    );
  }

  if (setting.kind === "model") {
    return <ModelSetting {...{ onChange, setting, value }} />;
  }

  if (setting.kind === "select") {
    return (
      <div className="space-y-1">
        <p className="text-[10px] text-board-ink/40 uppercase tracking-[0.14em]">
          {setting.label}
        </p>
        <div className="flex flex-wrap gap-1">
          <Select
            onValueChange={(option) => {
              if (option !== null) {
                onChange(option);
              }
            }}
            value={shown}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            {/* Positioning left to the default: forcing `side="top"` put the
                menu above the node, which on a node near the top of the view
                is off screen, and the 48px nudge moved it sideways from the
                control it belongs to. */}
            <SelectContent>
              <SelectGroup>
                {setting.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return (
    // Labelled visibly, not only for screen readers. A node with one text field
    // could get away with an aria-label; the Iterate node has three, and three
    // unlabelled boxes are a guessing game — which is exactly how a list ended
    // up in the template field.
    <label className="block space-y-1">
      <span className="text-[10px] text-board-ink/40 uppercase tracking-[0.14em]">
        {setting.label}
      </span>
      <textarea
        className="max-h-96 min-h-16 w-full resize-y rounded border border-board-ink/10 bg-board-surface/40 p-2 text-[12px] text-board-ink leading-relaxed outline-none focus:border-board-ink/40 disabled:opacity-60"
        disabled={readOnly}
        maxLength={setting.maxLength}
        onChange={(e) => onChange(e.target.value)}
        // The surface owns dragging, so a press meant for the caret — or for
        // the resize corner — must not reach it, or typing into a node moves
        // the node and dragging the corner drags the board.
        onPointerDown={(e) => e.stopPropagation()}
        placeholder={setting.placeholder}
        value={value}
      />
    </label>
  );
}

/**
 * The model setting: a select whose choices are the `models` table rather than
 * a static option list.
 *
 * The registry still owns the control (the node type says "model" and here it
 * is); only the options are data, which is the whole point of moving the list
 * out of code.
 */
export function ModelSetting({
  onChange,
  setting,
  value,
}: Omit<SettingFieldProps, "readOnly"> & {
  setting: Extract<SettingDef, { kind: "model" }>;
}) {
  const { models } = useModels();
  // While the list is loading — or on a visitor's read-only board, where the
  // fetch is refused — the node still has to say what it is set to, even if
  // that means the raw id for a label.
  const options =
    models.length > 0
      ? models
      : [{ id: value || setting.default, label: value || setting.default }];
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-board-ink/40 uppercase tracking-[0.14em]">
        {setting.label}
      </p>
      <Select
        onValueChange={(newValue) => {
          if (newValue !== null) {
            onChange(newValue);
          }
        }}
        value={value}
      >
        <SelectTrigger className="w-full" data-size="lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
