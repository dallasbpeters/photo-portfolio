import { useCallback, useState } from "react";
import { createNeutralEdit, type EditState, fromDisplay } from "./adjustments";
import { applyLookAtStrength, type Look } from "./presets";

export interface EditController {
  edit: EditState;
  activeLook: Look | null;
  lookStrength: number;
  /** Sets one adjustment from its slider value (-100..100). */
  setValue: (key: keyof EditState, display: number) => void;
  chooseLook: (look: Look) => void;
  setLookStrength: (strength: number) => void;
  reset: () => void;
}

/**
 * The edit itself, and the relationship between the sliders and the looks.
 *
 * Choosing a look replaces the whole grade rather than layering onto it, and
 * touching any slider clears the active look — the result is no longer that
 * look, and continuing to show it selected would misrepresent the image.
 */
export const useEditState = (): EditController => {
  const [edit, setEdit] = useState<EditState>(createNeutralEdit);
  const [activeLook, setActiveLook] = useState<Look | null>(null);
  const [lookStrength, setLookStrengthValue] = useState(100);

  const setValue = useCallback((key: keyof EditState, display: number) => {
    setEdit((prev) => ({ ...prev, [key]: fromDisplay(display) }));
    setActiveLook(null);
  }, []);

  const chooseLook = useCallback(
    (look: Look) => {
      // Selecting the active look again clears it, so the strip doubles as a
      // toggle back to neutral.
      const next = look.id === activeLook?.id ? null : look;
      setActiveLook(next);
      setLookStrengthValue(100);
      setEdit(next ? applyLookAtStrength(next, 1) : createNeutralEdit());
    },
    [activeLook]
  );

  const setLookStrength = useCallback(
    (strength: number) => {
      setLookStrengthValue(strength);
      if (activeLook) {
        setEdit(applyLookAtStrength(activeLook, strength / 100));
      }
    },
    [activeLook]
  );

  const reset = useCallback(() => {
    setEdit(createNeutralEdit());
    setActiveLook(null);
    setLookStrengthValue(100);
  }, []);

  return {
    activeLook,
    chooseLook,
    edit,
    lookStrength,
    reset,
    setLookStrength,
    setValue,
  };
};
