import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { modelsApi } from "../services/portfolioService";
import type { AiModel } from "../types";

interface ModelsContextValue {
  /** True on first load only; a failed fetch is not worth blocking on. */
  loading: boolean;
  models: AiModel[];
}

const ModelsContext = createContext<ModelsContextValue>({
  loading: true,
  models: [],
});

/**
 * The models the picker offers, loaded from the same table the run endpoint
 * reads.
 *
 * A context rather than a prop so the list reaches the Generate node's model
 * setting without threading it through BoardCanvas and BoardItemView. It is a
 * single fetch for the whole editor; a node that opens before it lands just
 * shows its current choice until then.
 */
export function ModelsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModelsContextValue>({
    loading: true,
    models: [],
  });

  useEffect(() => {
    let alive = true;
    modelsApi
      .listEnabled()
      .then((models) => {
        if (alive) {
          setState({ loading: false, models });
        }
      })
      .catch(() => {
        // The picker falls back to showing the current selection, so a failed
        // fetch is a degraded label, not a broken node.
        if (alive) {
          setState({ loading: false, models: [] });
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <ModelsContext.Provider value={state}>{children}</ModelsContext.Provider>
  );
}

export const useModels = (): ModelsContextValue => useContext(ModelsContext);
