import { Check, Minus } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

const Checkbox = function Checkbox({
  className,
  ref,
  ...props
}: React.ComponentProps<"input"> & {
  ref?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <span className={cn("relative inline-flex h-4 w-4 shrink-0", className)}>
      {/* Transparent and stretched over the box rather than `sr-only`.
          `sr-only` clips the input to a 1px square in the corner, so the
          visible box below — an aria-hidden sibling with no behaviour of its
          own — swallowed every click. The control looked correct, and both the
          keyboard and a bound <label> worked, so the only symptom was that
          clicking the checkbox did nothing. */}
      <input
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        ref={ref}
        type="checkbox"
        {...props}
      />
      {/* Box */}
      <span
        aria-hidden
        className="absolute inset-0 rounded border border-white/25 bg-black/40 transition-colors peer-checked:border-white/50 peer-checked:bg-white/10 peer-indeterminate:border-white/40 peer-indeterminate:bg-white/10 peer-focus-visible:ring-2 peer-focus-visible:ring-white/30 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-black peer-disabled:cursor-not-allowed peer-disabled:opacity-40"
      />
      {/* Check */}
      <Check
        aria-hidden
        className="pointer-events-none absolute inset-0 m-auto h-2.5 w-2.5 stroke-3 text-white opacity-0 transition-opacity peer-checked:opacity-100 peer-indeterminate:opacity-0 peer-disabled:opacity-50"
      />
      {/* Dash for indeterminate */}
      <Minus
        aria-hidden
        className="pointer-events-none absolute inset-0 m-auto h-2.5 w-2.5 stroke-3 text-white opacity-0 transition-opacity peer-indeterminate:opacity-100 peer-disabled:opacity-50"
      />
    </span>
  );
};

Checkbox.displayName = "Checkbox";

export { Checkbox };
