import { useEffect, useRef } from "react";
import { MAX_RECIPE_NAME } from "../../../config/recipes.js";
import "../boardChrome.css";

/**
 * Naming a recipe on the way to saving it.
 *
 * A sibling of NamePanel rather than a generalisation of it. That one is bound
 * to a frame — it takes the frame, and falls back to the frame's own suggested
 * title — and prising those out to share a text field would have made both
 * harder to read than having two.
 *
 * The count matters more than it looks. A recipe is only ever found again by
 * its name, so this says what is about to be saved: four nodes reads very
 * differently from fourteen, and it is the last moment anyone can notice they
 * selected the whole board.
 */

export interface RecipeNamePanelProps {
  name: string;
  /** How many nodes the selection holds, shown so the scope is obvious. */
  nodeCount: number;
  onCancel: () => void;
  onConfirm: (name: string) => void;
  onType: (name: string) => void;
}

export function RecipeNamePanel({
  nodeCount,
  onCancel,
  onConfirm,
  onType,
  name,
}: RecipeNamePanelProps) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
  }, []);

  const trimmed = name.trim();
  const submit = () => {
    // Refused rather than defaulted to "Untitled": a recipe is only ever picked
    // out of a list by its name, so an unnamed one is a row nobody will find.
    if (trimmed) {
      onConfirm(trimmed);
    }
  };

  return (
    <div className="panel-section">
      <span className="panel-label">
        Save {nodeCount === 1 ? "1 node" : `${nodeCount} nodes`} as a recipe
      </span>
      <input
        aria-label="Recipe name"
        className="panel-field"
        maxLength={MAX_RECIPE_NAME}
        onChange={(e) => onType(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            onCancel();
          }
        }}
        placeholder="Product shot on seamless…"
        ref={field}
        value={name}
      />
      <div className="panel-actions panel-actions--roomy">
        <button
          className="panel-button panel-button--louder"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="panel-button panel-button--primary"
          disabled={!trimmed}
          onClick={submit}
          type="button"
        >
          Save
        </button>
      </div>
    </div>
  );
}
