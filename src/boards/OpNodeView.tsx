import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  PlayIcon,
  RefreshIcon,
  SparklesIcon,
  TextIcon,
} from "@hugeicons-pro/core-stroke-standard";
import {
  FAL_MODEL_LABELS,
  nodeTypeFor,
  type SettingDef,
} from "../../config/nodeTypes.js";
import type { BoardItem, BoardItemVariation } from "../types";

interface OpNodeViewProps {
  /** True when this node's prompt is satisfied by a wire rather than typed. */
  hasWiredPrompt: boolean;
  item: BoardItem;
  onConfigChange: (config: Record<string, unknown>) => void;
  onRun: (force: boolean) => void;
  readOnly: boolean;
}

const STATE_LABEL: Record<string, string> = {
  failed: "Failed",
  idle: "Ready",
  running: "Running…",
  skipped: "Unchanged",
  succeeded: "Done",
};

const STATE_CLASS: Record<string, string> = {
  failed: "text-red-300",
  idle: "text-white/40",
  running: "text-sky-300",
  skipped: "text-white/40",
  succeeded: "text-emerald-300",
};

interface SettingFieldProps {
  onChange: (value: string) => void;
  readOnly: boolean;
  setting: SettingDef;
  value: string;
}

/**
 * One setting, rendered from its definition rather than from a switch per node
 * type.
 *
 * Driven by the registry so a node type that gains an option gains its control
 * with no change here — the same reason the registry exists at all.
 */
function SettingField({
  onChange,
  readOnly,
  setting,
  value,
}: SettingFieldProps) {
  if (setting.kind === "number") {
    return (
      <label className="flex items-center justify-between gap-2 text-[10px] text-white/50 uppercase tracking-[0.14em]">
        {setting.label}
        <input
          className="w-16 rounded border border-white/10 bg-black/40 px-2 py-1 text-right text-[12px] text-white tabular-nums outline-none focus:border-white/40 disabled:opacity-60"
          disabled={readOnly}
          max={setting.max}
          min={setting.min}
          onChange={(e) => onChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          type="number"
          value={Number(value) || setting.default}
        />
      </label>
    );
  }

  if (setting.kind === "select") {
    return (
      <div className="space-y-1">
        <p className="text-[10px] text-white/40 uppercase tracking-[0.14em]">
          {setting.label}
        </p>
        <div className="flex flex-wrap gap-1">
          {setting.options.map((option) => (
            <button
              className={`min-h-7 rounded px-2 text-[10px] tracking-[0.08em] transition-colors ${
                (value || setting.default) === option
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/80"
              }`}
              disabled={readOnly}
              key={option}
              onClick={() => onChange(option)}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              {/* Model ids are namespaced and long; the vendor prefix is the
                  same on all of them and only costs width on the node. */}
              {FAL_MODEL_LABELS[option] ?? option}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <textarea
      aria-label={setting.label}
      className="min-h-16 w-full resize-none rounded border border-white/10 bg-black/40 p-2 text-[12px] text-white leading-relaxed outline-none focus:border-white/40 disabled:opacity-60"
      disabled={readOnly}
      maxLength={setting.maxLength}
      onChange={(e) => onChange(e.target.value)}
      // The surface owns dragging, so a press meant for the caret must not
      // reach it — otherwise typing into a node moves the node.
      onPointerDown={(e) => e.stopPropagation()}
      placeholder={setting.placeholder}
      value={value}
    />
  );
}

/**
 * What a node produced: one image, or a batch laid out as a grid.
 *
 * A grid because comparing them is the entire reason for asking for several.
 */
function ResultImages({ images }: { images: BoardItemVariation[] }) {
  if (images.length === 0) {
    return null;
  }
  return (
    <div className={images.length > 1 ? "grid grid-cols-2 gap-1" : "block"}>
      {images.map((variation, index) => (
        <img
          alt={variation.description ?? `Variation ${index + 1}`}
          className="h-auto w-full rounded border border-white/10 object-contain"
          height={variation.height ?? undefined}
          key={variation.url}
          src={variation.url}
          width={variation.width ?? undefined}
        />
      ))}
    </div>
  );
}

/**
 * The rotating glow that marks a node as working.
 *
 * The same conic sweep the admin's photo stacks use, for the same reason: it
 * reads as "busy" from across the board without a spinner competing with the
 * node's own contents. It sits behind the node and bleeds past its edge, so a
 * running node is obvious even zoomed out far enough that its text is not.
 */
function RunningGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -inset-1 animate-gradient-spin rounded-lg"
      style={{
        background:
          "conic-gradient(from calc(var(--gradient-angle) + 335deg), transparent 0deg, oklch(52.74% 0.21 281.43deg) 30deg, oklch(73.91% 0.22 322.89deg) 60deg, transparent 100deg, transparent 360deg)",
        filter: "blur(20px)",
      }}
    />
  );
}

/**
 * An operation node: what it does, what it is set to, and what it last made.
 *
 * Deliberately shows its prompt on the node rather than in a panel. The whole
 * point of the graph is that what produced an image travels with the image
 * instead of being discarded when a side panel closes.
 */
export function OpNodeView({
  hasWiredPrompt,
  item,
  onConfigChange,
  onRun,
  readOnly,
}: OpNodeViewProps) {
  const type = nodeTypeFor(item.nodeType);
  const state = item.runState ?? "idle";
  const config = item.config ?? {};
  const isRunning = state === "running";

  if (!type) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-900 p-3 text-[11px] text-red-300">
        Unknown node type
      </div>
    );
  }

  // A source node holds a value instead of producing one, so it never runs and
  // shows no run state — a Prompt node reading "Ready" would be promising
  // something that is never going to happen.
  const isSource = !type.capability;
  const set = (key: string, value: string) =>
    onConfigChange({ ...config, [key]: value });

  /**
   * Every image this node has to show.
   *
   * `variations` arrived with batching; results saved before it have only a
   * single `url`, and reading the array alone left those images sitting in the
   * database undrawn. The nulls are real too — a sparse array serialises its
   * holes, so a batch that has filled slot 2 but not slot 1 round-trips as
   * [null, {...}].
   */
  const stored = item.result;
  const images = (
    stored?.variations?.length
      ? stored.variations.filter((v) => Boolean(v?.url))
      : ((stored?.url ? [stored] : []) as BoardItemVariation[])
  ) as BoardItemVariation[];

  return (
    <>
      {isRunning ? <RunningGlow /> : null}

      <div className="relative flex h-full w-full flex-col overflow-hidden bg-neutral-900/95">
        <header className="flex shrink-0 items-center justify-between gap-2 border-white/10 border-b px-2 py-1">
          <span className="flex items-center gap-1 text-[10px] text-white/70 uppercase tracking-[0.18em]">
            <HugeiconsIcon
              aria-hidden
              icon={isSource ? TextIcon : SparklesIcon}
              size={11}
            />
            {type.label}
          </span>
          {isSource ? null : (
            <span
              className={`text-[9px] uppercase tracking-widest ${STATE_CLASS[state]}`}
            >
              {STATE_LABEL[state]}
            </span>
          )}
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {/* A batch lays its variations out as a grid so they can be compared
              at a glance, which is the entire reason for asking for several. */}
          <ResultImages images={images} />

          {/* A prompt arriving down a wire wins over one typed here, so saying
              so is better than leaving a field that looks live but is ignored. */}
          {hasWiredPrompt ? (
            <p className="text-[10px] text-sky-300/70">
              Prompt is wired in; the text below is not used.
            </p>
          ) : null}

          {type.settings.map((setting) => (
            <SettingField
              key={setting.key}
              onChange={(value) => set(setting.key, value)}
              // Only the prompt is superseded by a wire. Disabling every
              // setting locked the model and variation count too, which have
              // nothing to do with where the prompt came from.
              readOnly={
                readOnly || (hasWiredPrompt && setting.key === "prompt")
              }
              setting={setting}
              value={
                typeof config[setting.key] === "string" ||
                typeof config[setting.key] === "number"
                  ? String(config[setting.key])
                  : ""
              }
            />
          ))}

          {/* A run that reported success but drew nothing would otherwise look
              identical to one that never ran. Saying so is what keeps a broken
              result visible instead of silently blank. */}
          {state === "succeeded" && images.length === 0 ? (
            <p className="text-[10px] text-amber-300/70 leading-relaxed">
              Ran, but returned no image. Try again, or check the model.
            </p>
          ) : null}

          {item.runError ? (
            <p className="flex items-start gap-1 text-[10px] text-red-300/90 leading-relaxed">
              <HugeiconsIcon aria-hidden icon={Alert02Icon} size={11} />
              {item.runError}
            </p>
          ) : null}

          {/* Stated on the node rather than left to be discovered by zooming
              in: a raster glyph turns to mush at 300% and there is nothing on
              the board to say why. */}
          {item.result?.isVector === false ? (
            <p className="text-[10px] text-amber-300/70 leading-relaxed">
              Came back as a raster, not vector. It will not stay sharp zoomed
              in.
            </p>
          ) : null}
        </div>

        {readOnly || isSource ? null : (
          // Deliberately NOT counter-scaled, unlike the floating chrome in
          // BoardItemView. Those are fixed-size icons that sit outside their
          // item; this footer is a full-width part of the node's own layout, so
          // dividing by the zoom made it 45% of the node's width at 220% and
          // wider than the node below 100% — the button never fit its box.
          // Scaling with the node, like the prompt field above it, is correct.
          <footer className="flex shrink-0 items-center gap-1 border-white/10 border-t p-1">
            <button
              className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded border border-white/20 text-[10px] text-white/80 uppercase tracking-[0.18em] hover:bg-white hover:text-black disabled:opacity-40"
              disabled={isRunning}
              onClick={() => onRun(false)}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              <HugeiconsIcon aria-hidden icon={PlayIcon} size={12} />
              {isRunning ? "Running…" : "Run"}
            </button>
            {item.result ? (
              <button
                aria-label="Run again, ignoring the stored result"
                className="flex min-h-8 items-center justify-center rounded border border-white/20 px-2 text-white/60 hover:text-white disabled:opacity-40"
                disabled={isRunning}
                onClick={() => onRun(true)}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                <HugeiconsIcon icon={RefreshIcon} size={12} />
              </button>
            ) : null}
          </footer>
        )}
      </div>
    </>
  );
}
