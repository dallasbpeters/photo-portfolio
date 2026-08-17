import { ArrowDown, ArrowUp, Box, Pencil, Trash2 } from "lucide-react";
import { PROTECTED_MODEL_ID } from "../../../config/models";
import type { AiModel } from "../../types";
import { Button } from "../ui/button";
import { inputLabel, loraSummary } from "./modelSummary";

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
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-white/90">
            {model.label}
          </span>
          {model.vector ? (
            <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-300 uppercase tracking-wider">
              Vector
            </span>
          ) : null}
          {model.enabled ? null : (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50 uppercase tracking-wider">
              Off
            </span>
          )}
          {isAuto ? (
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300 uppercase tracking-wider">
              Default
            </span>
          ) : null}
        </div>
        <p className="truncate font-mono text-white/40 text-xs">{model.id}</p>
        <p className="text-white/60 text-xs">
          {inputLabel(model.input)}
          {summary ? ` · ${summary}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
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
