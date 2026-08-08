import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

/**
 * Promise-based confirmation, replacing window.confirm.
 *
 * The native dialog blocks the main thread, cannot be styled to match the rest
 * of the admin, and on some mobile browsers is suppressed entirely — which
 * would silently turn a guarded delete into an unguarded one.
 *
 * Usage mirrors what it replaces:
 *   if (!(await confirm({ title: "Delete photo?" }))) return;
 */
export interface ConfirmOptions {
  cancelLabel?: string;
  confirmLabel?: string;
  /** Optional detail line. Say what cannot be undone. */
  description?: string;
  /** Renders the confirm action in a destructive style. */
  destructive?: boolean;
  title: string;
}

export interface PromptOptions {
  confirmLabel?: string;
  /** Pre-filled value. */
  defaultValue?: string;
  description?: string;
  placeholder?: string;
  title: string;
}

interface ConfirmApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolves with the entered text, or null if dismissed. */
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmApi | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [promptOptions, setPromptOptions] = useState<PromptOptions | null>(
    null
  );
  const [promptValue, setPromptValue] = useState("");
  const promptResolverRef = useRef<((value: string | null) => void) | null>(
    null
  );
  // Held in a ref so resolving does not depend on a re-render landing first.
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // A second request while one is open would strand the first promise.
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setOptions(next);
      }),
    []
  );

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const prompt = useCallback(
    (next: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        promptResolverRef.current?.(null);
        promptResolverRef.current = resolve;
        setPromptValue(next.defaultValue ?? "");
        setPromptOptions(next);
      }),
    []
  );

  const settlePrompt = useCallback((result: string | null) => {
    promptResolverRef.current?.(result);
    promptResolverRef.current = null;
    setPromptOptions(null);
  }, []);

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        onOpenChange={(open) => {
          // Dismissing by overlay or Escape counts as declining.
          if (!open) {
            settle(false);
          }
        }}
        open={options !== null}
      >
        <DialogContent className="max-w-sm border-white/10 bg-black">
          <DialogHeader>
            <DialogTitle className="font-light text-sm text-white/80 uppercase tracking-[0.2em]">
              {options?.title}
            </DialogTitle>
            {options?.description ? (
              <DialogDescription className="text-[12px] text-white/45 leading-relaxed">
                {options.description}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              className="min-h-11 text-[10px] text-white/90 uppercase tracking-[0.18em] hover:text-white"
              onClick={() => settle(false)}
              type="button"
              variant="ghost"
            >
              {options?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              autoFocus
              className={`min-h-11 border-white/20 text-[10px] uppercase tracking-[0.18em] ${
                options?.destructive
                  ? "hover:bg-red-500 hover:text-white"
                  : "hover:bg-white hover:text-black"
              }`}
              onClick={() => settle(true)}
              type="button"
              variant="outline"
            >
              {options?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            settlePrompt(null);
          }
        }}
        open={promptOptions !== null}
      >
        <DialogContent className="max-w-sm border-white/10 bg-black">
          <DialogHeader>
            <DialogTitle className="font-light text-sm text-white/80 uppercase tracking-[0.2em]">
              {promptOptions?.title}
            </DialogTitle>
            {promptOptions?.description ? (
              <DialogDescription className="text-[12px] text-white/45 leading-relaxed">
                {promptOptions.description}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          <Input
            autoFocus
            className="min-h-11 border-white/10 bg-black/40 text-base transition-colors focus:border-white/40"
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                settlePrompt(promptValue);
              }
            }}
            placeholder={promptOptions?.placeholder}
            value={promptValue}
          />

          <DialogFooter className="gap-2">
            <Button
              className="min-h-11 text-[10px] text-white/90 uppercase tracking-[0.18em] hover:text-white"
              onClick={() => settlePrompt(null)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              className="min-h-11 border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
              onClick={() => settlePrompt(promptValue)}
              type="button"
              variant="outline"
            >
              {promptOptions?.confirmLabel ?? "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** Confirmation and text-prompt dialogs, replacing the native equivalents. */
export const useConfirm = (): ConfirmApi => {
  const ctx = useContext(ConfirmContext);
  // Outside a provider the actions still work rather than blocking silently.
  return (
    ctx ?? {
      confirm: () => Promise.resolve(true),
      prompt: () => Promise.resolve(null),
    }
  );
};
