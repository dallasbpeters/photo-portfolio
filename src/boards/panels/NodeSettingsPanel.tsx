import { HugeiconsIcon } from "@hugeicons/react";
import { SlidersHorizontalIcon } from "@hugeicons-pro/core-stroke-standard";
import { nodeTypeFor, type SettingDef } from "../../../config/nodeTypes.js";
import { providerFor } from "../../../config/providers.js";
import type { AiModel, BoardItem } from "../../types";
import { useModels } from "../ModelsContext";
import { ProviderLogo } from "../nodes/ProviderLogo";
import { SettingField } from "../nodes/SettingField";
import "../boardChrome.css";
import "./NodeSettingsPanel.css";

/**
 * The model a node will call, and the parameters it will call it with.
 *
 * Beside the board rather than on the node, which is the whole point. The model
 * picker was the widest control on a generation card and the least often
 * touched — a menu of thirty long labels, chosen once and then left alone while
 * the prompt is worked on — and it pushed the prompt, the result and the run
 * button into whatever height was left. The generation parameters that arrived
 * with it have exactly the same shape.
 *
 * Which settings come here is declared by the registry (`panel` on a
 * SettingDef), not decided here: the node renders the rest, so a setting cannot
 * end up drawn twice or not at all. See SettingDef in config/nodeTypes.ts.
 *
 * Shares the right-hand column with ShaderPanel, and for the same reason — a
 * panel of this many controls does not fit along the bottom. Only one of the two
 * can be showing, because only one item is selected, so they cannot collide.
 */

export interface NodeSettingsPanelProps {
  onConfigChange: (itemId: string, config: Record<string, unknown>) => void;
  selected: BoardItem | null;
}

/**
 * What a run of this node will cost, in generations.
 *
 * Iterations multiply loops: three iterations over two loops is six billed
 * calls, and neither number says so on its own. Worth stating because both
 * fields are one keystroke from a number nobody meant — and unlike most
 * mistakes on a board, this one is charged for.
 */
const runCost = (config: Record<string, unknown>): number => {
  const count = Number(config.count ?? 1);
  const loops = Number(config.loops ?? 1);
  const safe = (value: number) =>
    Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
  return safe(count) * safe(loops);
};

/** The chosen model's row, or null for "auto" and for a list still loading. */
const modelOf = (
  models: readonly AiModel[],
  config: Record<string, unknown>
): AiModel | null => {
  const id = typeof config.model === "string" ? config.model : null;
  return id && id !== "auto"
    ? (models.find((model) => model.id === id) ?? null)
    : null;
};

export function NodeSettingsPanel({
  onConfigChange,
  selected,
}: NodeSettingsPanelProps) {
  const { models } = useModels();
  const type = selected?.kind === "op" ? nodeTypeFor(selected.nodeType) : null;
  const settings = type?.settings.filter((setting) => setting.panel) ?? [];

  // Nothing to show unless an op node with panel settings is selected. The
  // halftone node deliberately does not come here — it has its own panel of
  // visual controls in ShaderPanel, and two panels in one column would fight.
  if (!(selected && type) || settings.length === 0) {
    return null;
  }
  if (selected.nodeType === "standard") {
    return null;
  }

  const config = selected.config ?? {};
  const model = modelOf(models, config);
  const provider = providerFor(
    typeof config.model === "string" ? config.model : null
  );
  const cost = runCost(config);

  const set = (key: string, value: string) =>
    onConfigChange(selected.id, { ...config, [key]: value });

  return (
    <div className="panel-surface node-settings-panel">
      <div className="panel-header">
        <span className="panel-header__title">
          <HugeiconsIcon aria-hidden icon={SlidersHorizontalIcon} size={13} />
          {type.label}
        </span>
      </div>

      {/*
        Who and what, before any of the knobs.

        The panel is reached by selecting a node, so it has to re-state which
        node — a column of unlabelled selects beside a board of similar cards is
        how the wrong node gets edited.
      */}
      <div className="node-settings-panel__identity">
        <ProviderLogo
          modelId={typeof config.model === "string" ? config.model : null}
          units={12}
        />
        <span className="node-settings-panel__identity-text">
          <span className="node-settings-panel__model">
            {model?.label ?? "Auto"}
          </span>
          <span className="node-settings-panel__provider">
            {provider?.name ?? "Unknown provider"}
            {model?.output === "video" ? " · video" : null}
          </span>
        </span>
      </div>

      <div className="node-settings-panel__body">
        {settings.map((setting) => (
          <PanelSetting
            config={config}
            key={setting.key}
            onChange={(value) => set(setting.key, value)}
            setting={setting}
          />
        ))}

        {/*
          What pressing Run will actually spend.

          Only once it is more than one: on a default node the line would be
          noise, and the point is to catch the pair of numbers that quietly
          became twelve.
        */}
        {cost > 1 ? (
          <p className="panel-hint">
            <span className="panel-warning">{cost} generations per run</span>
            Iterations multiply loops. Each one is billed.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One panel control, with the note that explains what it will do.
 *
 * The hints are here rather than in the registry because they are about *this*
 * panel's job — a size that may be ignored, a format that throws away
 * transparency, a loop count that multiplies the bill. The registry says what a
 * setting is; a panel is where you say what choosing it costs.
 */
function PanelSetting({
  config,
  onChange,
  setting,
}: {
  config: Record<string, unknown>;
  onChange: (value: string) => void;
  setting: SettingDef;
}) {
  const stored = config[setting.key];
  const value =
    stored === undefined || stored === null ? undefined : String(stored);

  return (
    <div className="node-settings-panel__setting">
      <SettingField
        onChange={onChange}
        readOnly={false}
        setting={setting}
        // Absent stays absent, so the field can show the declared default
        // rather than treating a never-set key as a cleared one. See
        // SettingFieldProps.value.
        value={value}
      />
      {HINTS[setting.key] ? (
        <p className="panel-hint node-settings-panel__hint">
          {HINTS[setting.key]}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What each parameter actually does, said once, next to the control.
 *
 * All four of these have a way of doing nothing, or doing something expensive,
 * and none of it is guessable from the label. "auto" in particular is not a
 * neutral placeholder — it means the field is not sent at all, which is usually
 * the behaviour somebody wants to keep.
 */
const HINTS: Record<string, string> = {
  loops:
    "Feeds each result back in as the source image and runs again. Sequential, so two loops take twice as long.",
  outputFormat:
    "JPEG has no transparency — avoid it on a node whose job is removing a background.",
  quality:
    "Mapped to whatever the chosen lab calls it. Models that expose no such control ignore it.",
  size: "Left on auto, an edit keeps the shape of the picture wired into it.",
};
