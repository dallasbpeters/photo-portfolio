import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiImageIcon,
  ColorsIcon,
  CropIcon,
  Edit02Icon,
  FlipHorizontalIcon,
  MagicWand01Icon,
  Note01Icon,
  PaintBrush01Icon,
  RotateLeft01Icon,
  RotateRight01Icon,
  Search01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useId, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import type { BoardItemKind } from "../types";
import { ToolPrompt } from "./ToolPrompt";
import type { ToolContext } from "./tools/itemContext";
import { blockedReason, searchTools, toolsForKind } from "./tools/registry";
import { TOOL_GROUPS, type Tool, type ToolGroup } from "./tools/types";

/**
 * Picking a tool: search, tabs, a list, and nothing else.
 *
 * The registry already knows what exists, what it applies to and why it cannot
 * run (see ./tools/registry). This component's whole job is to render those
 * three answers, so it holds no knowledge of any individual tool — adding one
 * to the registry adds a row here without this file being edited, which is the
 * only reason a registry beats a hand-written menu.
 *
 * It does not run anything. `onPick` hands the tool back and the caller decides
 * what a run means — the right-click menu closes and runs it, a bar might open
 * a settings step first. Keeping the picker free of `runTool` is what lets the
 * same list appear in both without either one inheriting the other's lifecycle.
 *
 * ## Blocked tools are shown, disabled, with the reason
 *
 * Not hidden. `Tool.needsMask` says why: *"the bar disables rather than hides
 * these, because 'why can't I click it' is answered by the disabled reason and
 * unanswerable by an absence."* A tool that vanishes when there is no mask
 * teaches nobody that masks exist. So every tool that applies to this kind of
 * item is listed, and `blockedReason` supplies the sentence under it.
 *
 * `status: "planned"` is the same idea one step further along: greyed, badged
 * "Soon", and unpickable, because the registry lists what is coming on purpose.
 *
 * ## Except a missing prompt, which is not treated as a refusal
 *
 * A tool that `needsPrompt` is listed enabled even when the item carries no
 * words, because the words are collected at the moment of picking rather than
 * demanded before it (see `collecting`). Leaving those rows disabled — which is
 * what shipped first — meant Edit and Generate were permanently greyed on a
 * photograph with a sentence explaining that a description was needed and no
 * way to give one.
 */

/**
 * The three questions `blockedReason` asks about the target.
 *
 * Derived by `toolContextOf` rather than by this component, so the row the
 * picker draws disabled is disabled for exactly the reason the runner will
 * refuse it for.
 */
export type ToolPickerContext = ToolContext;

export interface ToolPickerProps {
  /** Positioning within the parent. The picker's own look is not a prop. */
  className?: string;
  context: ToolPickerContext;
  /** The target item's kind. Only tools whose `appliesTo` covers it are listed. */
  kind: BoardItemKind;
  onClose: () => void;
  /**
   * Never called for a blocked or planned tool, and never for a
   * prompt-needing tool without the words: those arrive as the second
   * argument, already trimmed and never empty.
   */
  onPick: (tool: Tool, prompt?: string) => void;
}

/**
 * Tool id to icon.
 *
 * Here rather than on `Tool` because the registry is deliberately free of React
 * and of an icon set — see its header. The fallback per group means a tool
 * added to the registry today renders with a sensible icon today, and only gets
 * a line here if the generic one is wrong.
 */
const ICONS: Record<string, typeof CropIcon> = {
  crop: CropIcon,
  describe: Note01Icon,
  "edit-image": Edit02Icon,
  "flip-horizontal": FlipHorizontalIcon,
  "generate-image": AiImageIcon,
  "replace-area": PaintBrush01Icon,
  restyle: ColorsIcon,
  "rotate-left": RotateLeft01Icon,
  "rotate-right": RotateRight01Icon,
};

const GROUP_FALLBACK: Record<ToolGroup, typeof CropIcon> = {
  ai: MagicWand01Icon,
  transform: CropIcon,
};

/** Exported for the item bar, which draws the same tools as bare icons. */
export const iconFor = (tool: Tool) =>
  ICONS[tool.id] ?? GROUP_FALLBACK[tool.group];

/** The tabs' words. `ToolGroup` is an id; "AI" is not a capitalised "ai". */
const GROUP_LABELS: Record<ToolGroup, string> = {
  ai: "AI",
  transform: "Transform",
};

interface Row {
  /** Why it cannot run, or null. Rendered; never used to filter. */
  blocked: string | null;
  tool: Tool;
}

const ROW_BASE =
  "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors";

function ToolRow({
  active,
  id,
  onPick,
  row,
}: {
  active: boolean;
  id: string;
  onPick: () => void;
  row: Row;
}) {
  const { blocked, tool } = row;
  const planned = tool.status === "planned";

  return (
    <button
      aria-disabled={blocked !== null}
      aria-selected={active}
      className={`${ROW_BASE} ${
        active ? "bg-board-ink/10" : ""
      } ${blocked ? "opacity-55" : "hover:bg-board-ink/10"}`}
      disabled={blocked !== null}
      id={id}
      onClick={onPick}
      role="option"
      tabIndex={-1}
      type="button"
    >
      <HugeiconsIcon
        aria-hidden
        className="mt-0.5 shrink-0 text-board-ink/70"
        icon={iconFor(tool)}
        size={14}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className="font-semibold text-[12px] text-board-ink"
            data-tool-label={tool.id}
          >
            {tool.label}
          </span>
          {planned ? (
            <span className="rounded-sm bg-board-ink/10 px-1 py-px text-[9px] text-board-ink/50 uppercase tracking-[0.14em]">
              Soon
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[11px] text-board-ink/50 leading-snug">
          {tool.description}
        </span>
        {/* The disabled reason, in the row rather than in a tooltip: a tooltip
            on a disabled control is unreachable by pointer and by keyboard. */}
        {blocked ? (
          <span className="mt-1 block text-[10px] text-amber-300/80 leading-snug">
            {blocked}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** All / Transform / AI. Built from TOOL_GROUPS, so a new group is a new tab. */
function GroupTabs({
  group,
  onChange,
}: {
  group: ToolGroup | null;
  onChange: (next: ToolGroup | null) => void;
}) {
  return (
    <div className="flex gap-1 px-2 pb-2">
      {[null, ...TOOL_GROUPS].map((candidate) => (
        <Button
          key={candidate ?? "all"}
          onClick={() => onChange(candidate)}
          size="xs"
          variant={candidate === group ? "selected" : "ghost"}
        >
          {candidate === null ? "All" : GROUP_LABELS[candidate]}
        </Button>
      ))}
    </div>
  );
}

/**
 * The rows for a kind, a query and a tab.
 *
 * Three registry calls rather than one, because `searchTools` filters by group
 * and `toolsForKind` by kind and neither takes the other's argument. Order
 * comes from `searchTools` so it stays registry order.
 */
const rowsFor = (
  kind: BoardItemKind,
  query: string,
  group: ToolGroup | null,
  context: ToolPickerContext
): Row[] => {
  const applicable = new Set(toolsForKind(kind).map((tool) => tool.id));
  return searchTools(query, group)
    .filter((tool) => applicable.has(tool.id))
    .map((tool) => ({
      blocked: blockedReason(tool, collecting(context)),
      tool,
    }));
};

/**
 * The context as it will be by the time the tool runs.
 *
 * `hasPrompt` is forced true because this picker can supply the words: the
 * prompt step stands between the row and `onPick`, and it cannot be got past
 * empty. Every other term is left exactly as `toolContextOf` derived it, so a
 * mask tool with no mask and a transform with no image are still refused here
 * for the sentence the runner would refuse them with.
 */
const collecting = (context: ToolPickerContext): ToolPickerContext => ({
  ...context,
  hasPrompt: true,
});

/** The picker's own chrome. */
const SHELL =
  "flex w-72 flex-col overflow-hidden rounded-lg border border-board-ink/15 bg-board-panel/95 shadow-xl backdrop-blur";

export function ToolPicker({
  className,
  context,
  kind,
  onClose,
  onPick,
}: ToolPickerProps) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<ToolGroup | null>(null);
  const [cursor, setCursor] = useState(0);
  /** The tool waiting for words, or null while the list is being browsed. */
  const [pending, setPending] = useState<Tool | null>(null);
  const listId = useId();

  const rows = useMemo(
    () => rowsFor(kind, query, group, context),
    [kind, query, group, context]
  );

  // Clamped rather than reset by an effect: the list can shrink under a cursor
  // that was valid a keystroke ago, and an effect would render one frame with
  // nothing highlighted before correcting itself.
  const active = rows.length === 0 ? -1 : Math.min(cursor, rows.length - 1);
  const rowId = (index: number) => `${listId}-row-${index}`;

  /**
   * The cursor walks blocked rows too.
   *
   * Skipping them would make the highlight jump over rows that are visibly
   * there, and would put the reason for a disabled tool out of reach of the
   * keyboard. Enter on one does nothing — which is not silent, because the row
   * is drawn disabled with its reason under it.
   */
  const move = (delta: number) => {
    if (rows.length === 0) {
      return;
    }
    setCursor((current) => {
      const from = Math.min(current, rows.length - 1);
      return (from + delta + rows.length) % rows.length;
    });
  };

  const pick = (row: Row | undefined) => {
    if (!row || row.blocked !== null) {
      return;
    }
    // A tool that needs words does not run yet: the rows above are enabled on
    // the promise that this step collects them, and picking straight through
    // would spend a paid generation on an empty prompt.
    if (row.tool.needsPrompt && !context.hasPrompt) {
      setPending(row.tool);
      return;
    }
    onPick(row.tool);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      pick(rows[active]);
    }
  };

  if (pending) {
    // The list is replaced rather than covered: this is one decision made in
    // two steps, and leaving the rows behind a panel invites picking a second
    // tool while the first still waits for its words. ToolPrompt is its own
    // component so the item's bar can reuse the same step.
    return (
      <div className={cn(SHELL, className)}>
        <ToolPrompt
          onCancel={() => setPending(null)}
          onSubmit={(words) => onPick(pending, words)}
          tool={pending}
        />
      </div>
    );
  }

  return (
    <div
      // Merged rather than appended: the picker is used standalone *and*
      // dropped inside the context menu, which already draws this chrome and
      // needs to turn it off. Concatenated classes would leave both.
      className={cn(SHELL, className)}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <HugeiconsIcon
          aria-hidden
          className="shrink-0 text-board-ink/40"
          icon={Search01Icon}
          size={14}
        />
        <input
          // biome-ignore lint/a11y/noAutofocus: the picker opens in response to
          // an explicit gesture and typing is how it is meant to be driven.
          aria-activedescendant={active >= 0 ? rowId(active) : undefined}
          aria-controls={listId}
          aria-expanded
          aria-label="Search tools"
          autoComplete="off"
          autoFocus
          className="w-full bg-transparent text-[12px] text-board-ink outline-none placeholder:text-board-ink/35"
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search tools…"
          role="combobox"
          type="text"
          value={query}
        />
      </div>

      <GroupTabs
        group={group}
        onChange={(next) => {
          setGroup(next);
          setCursor(0);
        }}
      />

      <div
        aria-label="Tools"
        className="max-h-72 overflow-y-auto border-board-ink/10 border-t"
        id={listId}
        role="listbox"
      >
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-board-ink/45">
            No tools match “{query}”.
          </p>
        ) : (
          rows.map((row, index) => (
            <ToolRow
              active={index === active}
              id={rowId(index)}
              key={row.tool.id}
              onPick={() => pick(row)}
              row={row}
            />
          ))
        )}
      </div>
    </div>
  );
}
