import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { modelsApi } from "../services/portfolioService";
import type { AiModel } from "../types";

interface ModelsContextValue {
  /** True when the list could not be loaded, so the picker can say so. */
  failed: boolean;
  /** True on first load only; a failed fetch is not worth blocking on. */
  loading: boolean;
  models: AiModel[];
  /** Fetches again, for a caller that has reason to think it would work now. */
  reload: () => void;
}

const ModelsContext = createContext<ModelsContextValue>({
  failed: false,
  loading: true,
  models: [],
  reload: () => undefined,
});

/**
 * How many times to try before giving up on a load.
 *
 * Three, spaced below, because the failures worth surviving are brief: a deploy
 * swapping functions underneath a request, or a cold start that timed out.
 * Anything that outlasts a few seconds is a real outage, and retrying at it
 * forever would only hide that from the person who needs to know.
 */
const ATTEMPTS = 3;

/** Backoff between attempts. Short — this is a blip, not a queue. */
const RETRY_MS = [400, 1500];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fetches the list, retrying the blips. Resolves to the models, or to null
 * when every attempt failed or `alive` went false partway through — the caller
 * checks `alive` again before committing, so a stale load reports nothing.
 *
 * Recursive rather than a loop so each retry's wait is a plain tail call.
 */
async function fetchWithRetries(
  alive: () => boolean,
  tries = 0
): Promise<AiModel[] | null> {
  try {
    return await modelsApi.listEnabled();
  } catch {
    // Kept quiet until the last attempt: a first failure that the second
    // try fixes is not something to tell anybody about.
    const wait = tries < ATTEMPTS - 1 ? RETRY_MS[tries] : undefined;
    if (wait === undefined || !alive()) {
      return null;
    }
    await sleep(wait);
    if (!alive()) {
      return null;
    }
    return fetchWithRetries(alive, tries + 1);
  }
}

/**
 * The models the picker offers, loaded from the same table the run endpoint
 * reads.
 *
 * A context rather than a prop so the list reaches the Generate node's model
 * setting without threading it through BoardCanvas and BoardItemView. It is a
 * single fetch for the whole editor; a node that opens before it lands just
 * shows its current choice until then.
 *
 * Retried, reported, and reloaded on focus — none of which it did, and the
 * cost of that was a whole afternoon's confusion. The fetch happened once. A
 * five-minute API outage that overlapped it left the list permanently empty
 * for as long as the page stayed open, the error was swallowed, and the picker
 * silently fell back to a single option labelled with the raw stored id. Every
 * model in the app appeared to have vanished, with nothing on screen saying a
 * request had failed, and the only cure was a reload nobody knew to perform.
 */
export function ModelsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    failed: boolean;
    loading: boolean;
    models: AiModel[];
  }>({ failed: false, loading: true, models: [] });

  /**
   * A run counter in a ref rather than one cancellation flag per effect, so
   * `reload` can fetch directly without racing the effect's own load on first
   * mount: every load claims the next id, and only the newest one may commit.
   */
  const runRef = useRef(0);

  const load = useCallback(async () => {
    runRef.current += 1;
    const run = runRef.current;
    const alive = () => runRef.current === run;

    const models = await fetchWithRetries(alive);
    if (!alive()) {
      return;
    }
    if (models) {
      setState({ failed: false, loading: false, models });
      return;
    }
    // Out of attempts. The list stays empty — the picker still shows what a
    // node is set to — but `failed` is what lets it say why rather than
    // looking like a board with one model on it.
    setState({ failed: true, loading: false, models: [] });
  }, []);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void load();
    // A new run id nothing can match, so an in-flight load cannot commit.
    return () => {
      runRef.current += 1;
    };
  }, [load]);

  /*
   * Tries again when the window comes back, if the last try failed.
   *
   * The cheapest possible recovery: leaving the app and returning is what
   * somebody does anyway while waiting for a deploy, and it means the fix
   * arrives without anyone being told to reload. Only after a failure, so a
   * working editor is not refetching every time it is tabbed to.
   */
  useEffect(() => {
    if (!state.failed) {
      return;
    }
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [state.failed, reload]);

  return (
    <ModelsContext.Provider
      value={{
        failed: state.failed,
        loading: state.loading,
        models: state.models,
        reload,
      }}
    >
      {children}
    </ModelsContext.Provider>
  );
}

export const useModels = (): ModelsContextValue => useContext(ModelsContext);
