import {
  ADJUSTMENT_GROUPS,
  type EditState,
  toDisplay,
} from "../adjustments";
import { EditorSlider } from "./EditorSlider";

type AdjustmentPanelProps = {
  groupId: string;
  edit: EditState;
  isDisabled: boolean;
  onChange: (key: keyof EditState, display: number) => void;
};

/** Sliders for one adjustment group, driven by the shared definitions. */
export function AdjustmentPanel({
  groupId,
  edit,
  isDisabled,
  onChange,
}: AdjustmentPanelProps) {
  const group = ADJUSTMENT_GROUPS.find((g) => g.id === groupId);
  if (!group) {
    return null;
  }

  return (
    <div className="divide-white/[0.05] divide-y">
      {group.items.map((def) => (
        <EditorSlider
          centered={def.centered}
          isDisabled={isDisabled}
          key={def.key}
          label={def.label}
          max={toDisplay(def.max)}
          min={toDisplay(def.min)}
          onChange={(v) => onChange(def.key, v)}
          value={toDisplay(edit[def.key])}
        />
      ))}
    </div>
  );
}
