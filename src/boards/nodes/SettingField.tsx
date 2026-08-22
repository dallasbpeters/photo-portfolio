import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SettingDef } from "../../../config/nodeTypes.js";

/*
 * The "no kit" option's value.
 *
 * Base UI's Select cannot carry "" as an item value — an empty string is how it
 * spells "nothing selected" — so the absence of a kit needs a token of its own,
 * translated back to "" on the way out.
 */
const NO_KIT = "__none__";

import { useBrandKits } from "../../hooks/useBrandKits";
import { ColorWell } from "../ColorWell";
import { useModels } from "../ModelsContext";
import "./SettingField.css";

/**
 * A node's settings, rendered from their definitions.
 *
 * Lifted out of OpNodeView, which had grown past the size ceiling: the node is
 * a header, a body, a result strip and a settings form, and the settings are
 * the part that neither reads nor writes anything else on the node.
 */

/**
 * What a select shows for a value.
 *
 * Falls back to the value itself, which is right for every option list that is
 * already readable — and is what the trigger showed before this existed.
 */
const labelOf = (
  setting: Extract<SettingDef, { kind: "select" }>,
  value: unknown
): string => {
  const key = typeof value === "string" ? value : String(setting.default);
  return setting.optionLabels?.[key] ?? key;
};

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
      <div className="setting-field setting-field--inline">
        <span className="setting-field__label">{setting.label}</span>
        <ColorWell label={setting.label} onChange={onChange} value={shown} />
      </div>
    );
  }

  if (setting.kind === "number") {
    return (
      <label className="setting-field setting-field--inline">
        <span className="setting-field__label">{setting.label}</span>
        <input
          className="setting-field__number"
          disabled={readOnly}
          max={setting.max}
          min={setting.min}
          onChange={(e) => onChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          step={setting.step ?? 1}
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

  if (setting.kind === "brandKit") {
    return <BrandKitSetting {...{ onChange, readOnly, setting, value }} />;
  }

  if (setting.kind === "select") {
    return (
      <div className="setting-field">
        <p className="setting-field__caption">{setting.label}</p>
        <div className="setting-field__options">
          <Select
            onValueChange={(option) => {
              if (option !== null) {
                onChange(option);
              }
            }}
            value={shown}
          >
            <SelectTrigger>
              {/* Base UI renders the raw value unless told otherwise — it has
                  no way to know an option's text without being handed it. That
                  is invisible while a value is its own label, which is true of
                  every select on the board except the ones carrying fal's own
                  vocabulary. */}
              <SelectValue>
                {(selected: unknown) => labelOf(setting, selected)}
              </SelectValue>
            </SelectTrigger>
            {/* Positioning left to the default: forcing `side="top"` put the
                menu above the node, which on a node near the top of the view
                is off screen, and the 48px nudge moved it sideways from the
                control it belongs to. */}
            <SelectContent>
              <SelectGroup>
                {setting.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {setting.optionLabels?.[option] ?? option}
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
    <label className="setting-field">
      <span className="setting-field__caption">{setting.label}</span>
      <textarea
        className="setting-field__text"
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
 * The brand kit setting: which kit from the library this node spends.
 *
 * The same shape as the model picker below and for the same reason — the choices
 * are rows somebody edits in the admin, so the registry declares the control and
 * the control asks for what to offer.
 *
 * Empty is a real state with its own label, not a blank select. A Brand node
 * with no kit chosen produces nothing and says so, because silently defaulting
 * to the first kit in the library would put someone else's brand on a board.
 */
export function BrandKitSetting({
  onChange,
  readOnly,
  setting,
  value,
}: SettingFieldProps & {
  setting: Extract<SettingDef, { kind: "brandKit" }>;
}) {
  const { kits } = useBrandKits();
  const chosen = kits.find((kit) => kit.id === value);

  return (
    <div className="setting-field">
      <p className="setting-field__caption">{setting.label}</p>
      <Select
        disabled={readOnly}
        onValueChange={(next) => {
          if (next !== null) {
            onChange(next === NO_KIT ? "" : next);
          }
        }}
        value={value || NO_KIT}
      >
        <SelectTrigger className="setting-field__trigger" data-size="lg">
          {/* Base UI renders the raw value unless handed the text, and here the
              raw value is a uuid. See the note on ModelSetting's trigger. */}
          <SelectValue>
            {(id: unknown) =>
              id === NO_KIT || !id
                ? "No kit"
                : (kits.find((kit) => kit.id === id)?.name ??
                  /* A kit deleted from the library, or a list that has not
                     landed. Saying the node still points at something beats
                     showing an empty control that reads as "no brand". */
                  "Unknown kit")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={NO_KIT}>No kit</SelectItem>
            {kits.map((kit) => (
              <SelectItem key={kit.id} value={kit.id}>
                {kit.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {chosen ? null : (
        <p className="setting-field__note">
          {value
            ? "This kit is no longer in the library."
            : "Pick a kit for this node to contribute anything."}
        </p>
      )}
    </div>
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
    <div className="setting-field">
      <p className="setting-field__caption">{setting.label}</p>
      <Select
        onValueChange={(newValue) => {
          if (newValue !== null) {
            onChange(newValue);
          }
        }}
        value={value}
      >
        <SelectTrigger className="setting-field__trigger" data-size="lg">
          {/* The model's label, not its id. Base UI shows the raw value unless
              handed the text, and a model id is the one value on the board that
              is genuinely unreadable — "fal-ai/recraft/vectorize" where the row
              says "Recraft · Vectorize". */}
          <SelectValue>
            {(id: unknown) =>
              options.find((model) => model.id === id)?.label ??
              String(id ?? "")
            }
          </SelectValue>
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
