import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "@/lib/utils";

const Input = function Input({
  className,
  type,
  ref,
  ...props
}: React.ComponentProps<"input"> & {
  ref?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <InputPrimitive
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base text-white outline-none transition-colors file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:disabled:bg-input/80",
        className
      )}
      data-slot="input"
      // Base UI Input is typed as HTMLElement ref; forwardRef uses HTMLInputElement — same node at runtime.
      ref={ref as never}
      type={type}
      {...props}
    />
  );
};

export { Input };
