import { ArrowDown, ArrowUp, Box, Pencil, Trash2 } from "lucide-react";
import { PROTECTED_MODEL_ID } from "../../../config/models";
import type { AiModel } from "../../types";
import { Button } from "../ui/button";
import { inputLabel, loraSummary } from "./modelSummary";
import "../../styles/primitives.css";
import "../../styles/adminChrome.css";

/**
 * One model in the list.
 *
 * Its own file because ModelsPanel holds three things — a form, a list and a
 * row — and only the row is self-contained. Splitting it is what brought the
 * panel back under the size ceiling without compressing anything.
 */

export interface ModelRowProps {
  isFirst: boolean;
  isLast: boolean;
  model: AiModel;
  onEdit: () => void;
  onMoved: (id: string, direction: -1 | 1) => void;
  onRemoved: (model: AiModel) => void;
  onToggled: (model: AiModel) => void;
}

export function ModelRow({
  isFirst,
  isLast,
  model,
  onEdit,
  onMoved,
  onRemoved,
  onToggled,
}: ModelRowProps) {
  const isAuto = model.id === PROTECTED_MODEL_ID;
  const summary = loraSummary(model);
  return (
    <div className="admin-row">
      <div className="admin-row__body">
        <div className="row">
          <span className="admin-row__name">{model.label}</span>
          {model.vector ? (
            <span className="admin-chip admin-chip--kind">Vector</span>
          ) : null}
          {model.enabled ? null : (
            <span className="admin-chip admin-chip--plain">Off</span>
          )}
          {isAuto ? (
            <span className="admin-chip admin-chip--on">Default</span>
          ) : null}
        </div>
        <p className="admin-row__id">{model.id}</p>
        <p className="admin-row__note">
          {inputLabel(model.input)}
          {summary ? ` · ${summary}` : ""}
        </p>
      </div>
      <div className="row row--snug">
        <Button
          aria-label={`Move ${model.label} up`}
          disabled={isFirst}
          onClick={() => onMoved(model.id, -1)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowUp size={14} />
        </Button>
        <Button
          aria-label={`Move ${model.label} down`}
          disabled={isLast}
          onClick={() => onMoved(model.id, 1)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowDown size={14} />
        </Button>
        <Button
          aria-label={`Toggle ${model.label}`}
          disabled={isAuto}
          onClick={() => onToggled(model)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Box size={14} />
        </Button>
        <Button
          aria-label={`Edit ${model.label}`}
          onClick={onEdit}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Pencil size={14} />
        </Button>
        <Button
          aria-label={`Delete ${model.label}`}
          disabled={isAuto}
          onClick={() => onRemoved(model)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}
