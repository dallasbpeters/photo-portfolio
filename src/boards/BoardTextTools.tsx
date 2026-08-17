import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  MinusSignIcon,
  Settings01Icon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextItalicIcon,
} from "@hugeicons-pro/core-stroke-standard";
import {
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from "../../config/canvas.js";
import {
  MAX_LETTER_SPACING,
  MAX_LINE_HEIGHT,
  MIN_LETTER_SPACING,
  MIN_LINE_HEIGHT,
  normalizeTextStyle,
  TEXT_ALIGNS,
  TEXT_TRANSFORMS,
  type TextAlign,
  type TextStyle,
  type TextTransform,
  textStyleCss,
  WEIGHT_CHOICES,
  weightsFor,
} from "../../config/textStyle.js";
import {
  FONT_CHOICES,
  type FontId,
  SANS_FONTS,
  SERIF_FONTS,
} from "../../config/theme.js";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import type { BoardItem } from "../types";
import { ColorWell } from "./ColorWell";
import { isTransparent, NO_FILL } from "./drawing";
import { PANEL_GAP, type PanelPlacement, placePanel } from "./panelPlacement";
import { useTextFont } from "./useTextFont";

/**
 * How a selected text or note item is set.
 *
 * Anchored to the item rather than parked in a bar at the bottom of the canvas.
 * It is a child of the item's own box, pinned to its top edge and counter-
 * scaled by `chromeScale` exactly as the delete button and the resize handles
 * are — so it follows the item through every pan, drag and zoom for free, with
 * no position arithmetic to keep in step, and stays a constant size on screen.
 *
 * Being a child of the item is also what makes it honest. BoardItemView is
 * handed the live item on every render, so there is no snapshot to go stale and
 * no lookup by id: the panel edits exactly what it is showing. An earlier
 * version sat in the editor's toolbar and had to re-find the item in the list,
 * because the selection is reported upward when the *id* changes and not when
 * the item does — every control there read one edit behind.
 *
 * One panel per selected item would be a wall of controls, so BoardItemView
 * renders this for the lone selection only: with several picked it is absent
 * rather than quietly editing whichever one it happened to hold.
 *
 * Size lives here too, which is why the item no longer carries its own
 * smaller/larger pill. One place to set the type, rather than size in one
 * place and everything else in another.
 */

/** One press changes the size by this much, in canvas units. */
const FONT_STEP = 4;
const LINE_HEIGHT_STEP = 0.05;
const LETTER_SPACING_STEP = 0.01;

/**
 * The Select's stand-in for "no family chosen".
 *
 * A select needs a value for every state, and null is a state: the text is set
 * in whatever the board surface is set in, and follows the site's theme when
 * an admin changes it.
 */
const INHERIT = "inherit";

const ALIGN_ICONS: Record<TextAlign, typeof TextAlignLeftIcon> = {
  center: TextAlignCenterIcon,
  left: TextAlignLeftIcon,
  right: TextAlignRightIcon,
};

/**
 * What each control's trigger reads before its popup has ever been opened.
 *
 * A select only learns an item's label when that item mounts, and the popup is
 * lazy — so without these the toolbar would sit there saying "cormorant-garamond"
 * and "700" until someone opened each menu once.
 */
const FAMILY_LABELS: Record<string, string> = {
  [INHERIT]: "Board default",
  ...Object.fromEntries(FONT_CHOICES.map((font) => [font.id, font.label])),
};

const WEIGHT_LABELS: Record<string, string> = Object.fromEntries(
  WEIGHT_CHOICES.map((choice) => [String(choice.value), choice.label])
);

const TRANSFORM_LABELS: Record<TextTransform, string> = {
  capitalize: "Capitalise",
  lowercase: "lowercase",
  none: "As typed",
  uppercase: "UPPERCASE",
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Two decimal places, so stepping by 0.05 does not accumulate float dust. */
const round = (value: number): number => Math.round(value * 100) / 100;

interface BoardTextToolsProps {
  /**
   * The item's own element, measured to decide whether the panel fits above it.
   *
   * The item's screen position is not knowable from its canvas coordinates —
   * the viewport that maps one to the other lives in a ref precisely so that
   * panning does not re-render — so it is read off the DOM instead.
   */
  anchor: RefObject<HTMLElement | null>;
  /** Cancels the canvas zoom, so the panel is one size at every zoom. */
  chromeScale: { transform: string };
  /** The live item. Not a snapshot: this is what the panel edits. */
  item: BoardItem;
  /**
   * One callback for both, because they are stored in two places for reasons
   * that are none of this panel's business: `textStyle` is a JSONB column and
   * `fontSize` a numeric one that predates it.
   */
  onPatch: (patch: Partial<BoardItem>) => void;
}

function Stepper({
  label,
  onStep,
  value,
}: {
  label: string;
  onStep: (direction: number) => void;
  value: string;
}) {
  return (
    <span className="flex items-center gap-0.5">
      <Button
        aria-label={`Decrease ${label}`}
        onClick={() => onStep(-1)}
        size="icon-xs"
        title={`Decrease ${label}`}
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon icon={MinusSignIcon} />
      </Button>
      <span className="min-w-8 text-center text-[10px] text-board-ink/60 tabular-nums">
        {value}
      </span>
      <Button
        aria-label={`Increase ${label}`}
        onClick={() => onStep(1)}
        size="icon-xs"
        title={`Increase ${label}`}
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon icon={Add01Icon} />
      </Button>
    </span>
  );
}

export function BoardTextTools({
  anchor,
  chromeScale,
  item,
  onPatch,
}: BoardTextToolsProps) {
  const [showMore, setShowMore] = useState(false);
  const [placement, setPlacement] = useState<PanelPlacement>("above");
  const panelRef = useRef<HTMLDivElement>(null);
  const style = item.textStyle ?? null;

  useTextFont(style);

  const decide = useCallback(() => {
    const anchored = anchor.current;
    const panel = panelRef.current;
    if (anchored && panel) {
      setPlacement(
        placePanel(anchored.getBoundingClientRect().top, panel.offsetHeight)
      );
    }
  }, [anchor]);

  // Every render is a chance the item moved under the top edge — it is dragged,
  // resized, zoomed, or the panel itself grows when the extra controls open —
  // and the measurement is read off the DOM, not off any one of those props.
  useLayoutEffect(() => {
    decide();
  });

  useLayoutEffect(() => {
    // Re-decided on the two gestures that move an item under the top edge
    // without anything re-rendering: a pan and a wheel zoom both write the
    // layer transform straight to the DOM, so neither arrives here as a prop.
    window.addEventListener("pointerup", decide);
    window.addEventListener("resize", decide);
    window.addEventListener("wheel", decide, { passive: true });
    return () => {
      window.removeEventListener("pointerup", decide);
      window.removeEventListener("resize", decide);
      window.removeEventListener("wheel", decide);
    };
  }, [decide]);

  if (!(item.kind === "text" || item.kind === "note")) {
    return null;
  }

  const css = textStyleCss(item);
  const weights = weightsFor(style?.family ?? null);
  // The nearest weight the chosen family actually has. A default of 300 on
  // Playfair Display, whose axis starts at 400, would otherwise show a blank
  // trigger for a value the browser is already drawing as 400.
  const weight =
    weights.find((choice) => choice.value >= css.fontWeight) ?? weights.at(-1);

  const set = (next: Partial<TextStyle>) =>
    onPatch({ textStyle: normalizeTextStyle({ ...(style ?? {}), ...next }) });

  const above = placement === "above";

  return (
    // Chrome inside an item has to swallow its own presses: without this the
    // canvas reads a press on a control as the start of a drag and the item
    // slides out from under the pointer — the same guard the delete button and
    // every resize handle carry.
    <div
      className={`absolute left-0 w-max rounded-lg border border-board-ink/10 bg-board-surface/90 p-1 backdrop-blur ${
        above ? "bottom-full origin-bottom-left" : "top-full origin-top-left"
      }`}
      onPointerDown={(e) => e.stopPropagation()}
      ref={panelRef}
      style={{
        // The gap is written after the counter-scale so it is measured in the
        // scale that survives it — ten screen pixels at 20% zoom and at 300%,
        // rather than ten canvas units that shrink to two.
        transform: `${chromeScale.transform} translateY(${above ? -PANEL_GAP : PANEL_GAP}px)`,
      }}
    >
      {showMore ? (
        <div className="mb-1 flex flex-wrap items-center gap-2 border-board-ink/10 border-b px-1 pb-1">
          <Button
            aria-label="Italic"
            aria-pressed={css.fontStyle === "italic"}
            onClick={() =>
              set({ italic: style?.italic === true ? null : true })
            }
            size="icon-sm"
            title="Italic"
            type="button"
            variant={css.fontStyle === "italic" ? "selected" : "ghost"}
          >
            <HugeiconsIcon icon={TextItalicIcon} />
          </Button>

          <Select
            items={TRANSFORM_LABELS}
            onValueChange={(value) =>
              set({ transform: (value ?? "none") as TextTransform })
            }
            value={css.textTransform}
          >
            <SelectTrigger aria-label="Letter case" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TEXT_TRANSFORMS.map((transform) => (
                  <SelectItem key={transform} value={transform}>
                    {TRANSFORM_LABELS[transform]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <span className="flex items-center gap-1 text-[9px] text-board-ink/40 uppercase tracking-[0.14em]">
            Leading
            <Stepper
              label="line height"
              onStep={(direction) =>
                set({
                  lineHeight: clamp(
                    round(css.lineHeight + direction * LINE_HEIGHT_STEP),
                    MIN_LINE_HEIGHT,
                    MAX_LINE_HEIGHT
                  ),
                })
              }
              value={css.lineHeight.toFixed(2)}
            />
          </span>

          <span className="flex items-center gap-1 text-[9px] text-board-ink/40 uppercase tracking-[0.14em]">
            Tracking
            <Stepper
              label="letter spacing"
              onStep={(direction) =>
                set({
                  letterSpacing: clamp(
                    round(
                      (style?.letterSpacing ?? 0) +
                        direction * LETTER_SPACING_STEP
                    ),
                    MIN_LETTER_SPACING,
                    MAX_LETTER_SPACING
                  ),
                })
              }
              value={(style?.letterSpacing ?? 0).toFixed(2)}
            />
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1">
        {/* Chequered when nothing is set, because nothing set is a real state:
            the words take the board's ink, which inverts with the theme. Pull
            the alpha to zero in the picker to hand it back. */}
        <ColorWell
          label="Text colour"
          onChange={(color) =>
            set({ color: isTransparent(color) ? null : color })
          }
          value={style?.color ?? NO_FILL}
        />

        <Select
          items={FAMILY_LABELS}
          onValueChange={(value) =>
            set({
              family: value === INHERIT ? null : ((value ?? null) as FontId),
            })
          }
          value={style?.family ?? INHERIT}
        >
          <SelectTrigger aria-label="Font" className="w-40" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={INHERIT}>Board default</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Sans</SelectLabel>
              {SANS_FONTS.map((font) => (
                <SelectItem key={font.id} value={font.id}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Serif</SelectLabel>
              {SERIF_FONTS.map((font) => (
                <SelectItem key={font.id} value={font.id}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          items={WEIGHT_LABELS}
          onValueChange={(value) => set({ weight: Number(value) })}
          value={String(weight?.value ?? css.fontWeight)}
        >
          <SelectTrigger aria-label="Weight" className="w-28" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {weights.map((choice) => (
                <SelectItem key={choice.value} value={String(choice.value)}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Stepper
          label="text size"
          onStep={(direction) =>
            onPatch({
              fontSize: clamp(
                css.fontSize + direction * FONT_STEP,
                MIN_FONT_SIZE,
                MAX_FONT_SIZE
              ),
            })
          }
          value={String(Math.round(css.fontSize))}
        />

        <span aria-hidden className="mx-1 h-5 w-px bg-board-ink/10" />

        {TEXT_ALIGNS.map((align) => (
          <Button
            aria-label={`Align ${align}`}
            aria-pressed={(style?.align ?? "left") === align}
            key={align}
            onClick={() => set({ align })}
            size="icon-sm"
            title={`Align ${align}`}
            type="button"
            variant={(style?.align ?? "left") === align ? "selected" : "ghost"}
          >
            <HugeiconsIcon icon={ALIGN_ICONS[align]} />
          </Button>
        ))}

        <Button
          aria-expanded={showMore}
          aria-label="More text settings"
          onClick={() => setShowMore((open) => !open)}
          size="icon-sm"
          title="More text settings"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={Settings01Icon} />
        </Button>
      </div>
    </div>
  );
}
