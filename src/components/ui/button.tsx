"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The app's one button.
 *
 * Two things here are deliberate, because their absence is what drove 60 call
 * sites to re-skin this component by hand:
 *
 * 1. Colours come from `--btn-*` custom properties rather than literal classes.
 *    Buttons are painted on two surfaces — the dark admin chrome and the board
 *    editor's inverting paper — and a surface sets those variables once for
 *    everything inside it (see `index.css`). A button never needs to know which
 *    surface it is on, so a board button and an admin button are the same call.
 *
 * 2. The text sizes carry the app's micro-label treatment (10px, uppercase,
 *    wide tracking) and a 44px minimum touch target. That styling was already
 *    on nearly every button in the app; keeping it out of the component only
 *    meant every author had to remember it, and they disagreed — `tracking-
 *    widest` and `tracking-[0.18em]` were both in use for the same intent.
 *
 * Icon sizes deliberately skip the label treatment: there is no label to treat.
 *
 * Prefer a variant/size over `className`. Positioning a button within its
 * parent (`absolute top-2 right-2`) is still the parent's business and stays a
 * className — but anything about how the button itself *looks* belongs here, so
 * that it can be fixed in one place.
 */
const buttonVariants = cva(
  // 150ms, not 300: hover fires on every pass of the cursor, and a transition
  // long enough to notice on a high-frequency interaction reads as lag.
  // `scale` is named explicitly rather than using `transition-all`, which would
  // also animate layout properties and cost a frame on every state change.
  // Press feedback is suppressed on menu triggers (`aria-haspopup`), where the
  // button stays put while a popup opens against it.
  "group/button inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent bg-clip-padding font-medium outline-none transition-[color,background-color,border-color,scale] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    compoundVariants: [
      {
        class:
          "border-[var(--btn-danger-border)] text-[var(--btn-danger-fg)] hover:border-[var(--btn-danger-hover-border)] hover:bg-[var(--btn-danger-hover-bg)] hover:text-[var(--btn-danger-hover-fg)]",
        tone: "danger",
        variant: "outline",
      },
      {
        // Calm at rest, red on intent. A row of icon actions should not be a
        // wall of red, and the label already says "Delete".
        class:
          "hover:bg-[var(--btn-danger-hover-bg)] hover:text-[var(--btn-danger-fg)]",
        tone: "danger",
        variant: "ghost",
      },
      {
        class:
          "bg-[var(--btn-danger-solid-bg)] text-[var(--btn-danger-solid-fg)] hover:bg-[var(--btn-danger-solid-hover-bg)]",
        tone: "danger",
        variant: "default",
      },
    ],
    defaultVariants: {
      fullWidth: false,
      size: "default",
      tone: "default",
      variant: "outline",
    },
    variants: {
      fullWidth: {
        false: "",
        true: "w-full",
      },
      fullWidthLeft: {
        false: "",
        true: "w-full flex-grow-1 justify-start",
      },
      size: {
        default: "min-h-11 px-4 text-[10px] uppercase tracking-widest",
        icon: "size-10 min-h-11 min-w-11",
        "icon-lg": "size-11 min-h-11 min-w-11",
        // Below the 40px dense-desktop minimum on their own, so the target is
        // extended past the visible box with a pseudo-element rather than by
        // growing the art. Only use these where nothing sits within ~8px, or
        // the invisible targets will overlap.
        "icon-sm":
          "relative size-8 after:absolute after:-inset-1 after:content-['']",
        "icon-xs":
          "relative size-6 after:absolute after:-inset-2 after:content-[''] [&_svg:not([class*='size-'])]:size-3",
        // The tall, wide call to action — "Save settings", "Add photos".
        lg: "min-h-12 gap-2 px-8 text-[10px] uppercase tracking-widest",
        sm: "min-h-11 gap-1.5 px-3 text-[10px] uppercase tracking-widest",
        // Dense toolbars, where a 44px target would not fit. Use sparingly.
        xs: "min-h-9 gap-1.5 px-2 text-[10px] uppercase tracking-widest",
      },
      /**
       * Danger is a tone, not a variant.
       *
       * The old code proved it: "delete" buttons appeared as an outlined red,
       * a red text button, and a neutral icon that reddens on hover — three
       * shapes, one meaning. Crossing tone with variant says that once.
       */
      tone: {
        /**
         * A toggle whose "on" state is worth seeing across a grid — today the
         * homepage-slideshow star. It colours from `aria-pressed`, which the
         * button must already carry for screen readers, so the state is stated
         * once instead of once for assistive tech and again in a ternary.
         */
        accent: "aria-pressed:text-[var(--btn-accent-fg)]",
        danger: "",
        default: "",
      },
      variant: {
        default:
          "bg-[var(--btn-solid-bg)] text-[var(--btn-solid-fg)] hover:bg-[var(--btn-solid-hover-bg)]",
        ghost:
          "text-[var(--btn-fg)] hover:bg-[var(--btn-ghost-hover-bg)] hover:text-[var(--btn-fg-strong)] aria-expanded:bg-[var(--btn-ghost-hover-bg)] aria-expanded:text-[var(--btn-fg-strong)]",
        link: "text-[var(--btn-fg)] underline-offset-4 hover:text-[var(--btn-fg-strong)] hover:underline",
        noborder:
          "rounded-none text-[var(--btn-fg)] hover:bg-[var(--btn-ghost-hover-bg)] hover:text-[var(--btn-fg-strong)] aria-expanded:bg-[var(--btn-ghost-hover-bg)] aria-expanded:text-[var(--btn-fg-strong)]",
        outline:
          "border-[var(--btn-border)] text-[var(--btn-fg)] hover:bg-[var(--btn-hover-bg)] hover:text-[var(--btn-hover-fg)] aria-expanded:bg-[var(--btn-ghost-hover-bg)] aria-expanded:text-[var(--btn-fg-strong)]",
        // A pressed/selected toggle, e.g. the board's stacked-view switch.
        selected:
          "border-[var(--btn-selected-border)] bg-[var(--btn-selected-bg)] text-[var(--btn-fg-strong)] hover:bg-[var(--btn-hover-bg)] hover:text-[var(--btn-hover-fg)]",
      },
    },
  }
);

function Button({
  className,
  variant,
  size,
  tone,
  fullWidth,
  fullWidthLeft,
  ...props
}: Omit<ButtonPrimitive.Props, "size"> & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      className={cn(
        buttonVariants({
          className,
          fullWidth,
          fullWidthLeft,
          size,
          tone,
          variant,
        })
      )}
      data-slot="button"
      {...props}
    />
  );
}

export { Button, buttonVariants };
