import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Cancel01Icon,
  Download01Icon,
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
import { downloadImage } from "./downloadImage";
import { BOARD_IMAGE_TYPE, pickImages, selectedIndex } from "./itemOutput";

interface OpNodeViewProps {
  /** True when this node's prompt is satisfied by a wire rather than typed. */
  hasWiredPrompt: boolean;
  item: BoardItem;
  onConfigChange: (config: Record<string, unknown>) => void;
  /** Deletes one stored version for good. */
  onRemoveVersion?: (index: number) => void;
  onRun: (force: boolean) => void;
  /** Pins every stored version onto the board as its own image. */
  onSendVersions?: () => void;
  /** What this node computes from its inputs — a Combine node’s joined text. */
  outputText?: string | null;
  readOnly: boolean;
  /** The words that wire is carrying, so the node can show them. */
  wiredPrompt?: string | null;
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
 * Starts dragging a result off the node.
 *
 * A version sitting in a node's gallery is one of several; pulling one onto the
 * canvas is how it becomes a thing in its own right — pinned where you put it,
 * and able to feed something else without dragging the whole node along.
 *
 * The URL travels as a board-specific type so the canvas can tell it from a
 * file drop, and as text/uri-list as well, so dropping it into another
 * application still hands over something meaningful.
 */
const beginImageDrag = (
  e: React.DragEvent,
  image: BoardItemVariation
): void => {
  // The canvas would otherwise read the press underneath as "pick this node up
  // and move it", leaving the node adrift when the drag ends elsewhere.
  e.stopPropagation();
  e.dataTransfer.effectAllowed = "copy";
  e.dataTransfer.setData(BOARD_IMAGE_TYPE, JSON.stringify(image));
  e.dataTransfer.setData("text/uri-list", image.url);
  e.dataTransfer.setData("text/plain", image.url);
};

/**
 * What a node produced: one image, or a batch laid out as a grid.
 *
 * A grid because comparing them is the entire reason for asking for several.
 */
function ResultImages({
  images,
  onRemove,
  onSelect,
  onSendAll,
  selected,
}: {
  images: BoardItemVariation[];
  /** Deletes one version for good. Absent on a published board. */
  onRemove?: (index: number) => void;
  onSelect: (index: number) => void;
  /** Pins every version onto the board as its own image. */
  onSendAll?: () => void;
  selected: number;
}) {
  if (images.length === 0) {
    return null;
  }
  const hero = images[Math.min(selected, images.length - 1)] ?? images[0];

  return (
    <div className="space-y-1">
      {hero ? (
        <div className="group relative">
          {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: dragstart is the browser's own drag affordance on an image, not a bespoke click handler — the picture is also reachable via the download button beside it */}
          <img
            alt={hero.description ?? "Result"}
            className="h-auto w-full cursor-grab rounded border border-white/10 object-contain"
            draggable
            height={hero.height ?? undefined}
            onDragStart={(e) => beginImageDrag(e, hero)}
            src={hero.url}
            width={hero.width ?? undefined}
          />
          {/* Saving the picture is the point of having made it, and there was
              no way to get one off the board short of a right-click. Sits on
              the image rather than in the footer so it always refers to the
              version being looked at. */}
          <button
            aria-label="Download this version"
            className="absolute top-1 right-1 rounded bg-black/70 p-1.5 text-white/70 opacity-0 backdrop-blur transition-opacity hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
            onClick={() => {
              void downloadImage(hero.url, hero.description ?? "generated");
            }}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <HugeiconsIcon icon={Download01Icon} size={13} />
          </button>
        </div>
      ) : null}

      {/* The gallery: everything this node has made, not just the last one.
          Shown from the first image rather than the second, so it is visibly
          the place versions collect instead of appearing only once there
          happen to be two. */}
      {images.length > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] text-white/30 uppercase tracking-[0.18em]">
              {images.length === 1 ? "1 version" : `${images.length} versions`}
            </p>
            {/* Getting the whole set onto the board at once: a node's gallery
                is for comparing, and the moment you have chosen you usually
                want them out where they can be arranged. */}
            {onSendAll ? (
              <button
                className="text-[9px] text-white/40 uppercase tracking-[0.14em] hover:text-white"
                onClick={onSendAll}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                Send to board
              </button>
            ) : null}
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {images.map((variation, index) => (
              <div className="group/v relative shrink-0" key={variation.url}>
                <button
                  aria-label={`Version ${index + 1}`}
                  aria-pressed={index === selected}
                  className={`block overflow-hidden rounded border transition-colors ${
                    index === selected
                      ? "border-sky-300"
                      : "border-white/10 hover:border-white/40"
                  }`}
                  onClick={() => onSelect(index)}
                  onPointerDown={(e) => e.stopPropagation()}
                  type="button"
                >
                  {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: same — native image drag, and the surrounding button already carries the keyboard-reachable action */}
                  <img
                    alt={variation.description ?? `Version ${index + 1}`}
                    className="size-12 cursor-grab object-cover"
                    draggable
                    height={48}
                    loading="lazy"
                    onDragStart={(e) => beginImageDrag(e, variation)}
                    src={variation.url}
                    width={48}
                  />
                </button>
                {onRemove ? (
                  <button
                    aria-label={`Remove version ${index + 1}`}
                    className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-black/90 text-white/70 opacity-0 transition-opacity hover:text-red-300 focus-visible:opacity-100 group-hover/v:opacity-100"
                    onClick={() => onRemove(index)}
                    onPointerDown={(e) => e.stopPropagation()}
                    type="button"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={9} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
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
/**
 * What a node looks like on a published board: the picture, and nothing else.
 */
function PublishedResult({
  images,
  selected,
  text,
}: {
  images: BoardItemVariation[];
  selected: number;
  /** An Analyse node's words, when that is what this node made. */
  text?: string | null;
}) {
  if (text) {
    return (
      <p className="whitespace-pre-wrap text-[12px] text-white/80 leading-relaxed">
        {text}
      </p>
    );
  }
  const shown = images[Math.min(selected, images.length - 1)];
  if (!shown) {
    return null;
  }
  return (
    <img
      alt={shown.description ?? ""}
      className="h-full w-full object-contain"
      height={shown.height ?? undefined}
      src={shown.url}
      width={shown.width ?? undefined}
    />
  );
}

export function OpNodeView({
  hasWiredPrompt,
  wiredPrompt,
  item,
  onConfigChange,
  onRemoveVersion,
  onRun,
  onSendVersions,
  outputText,
  readOnly,
}: OpNodeViewProps) {
  const type = nodeTypeFor(item.nodeType);
  const state = item.runState ?? "idle";
  const config = item.config ?? {};
  const isRunning = state === "running";
  const stored = item.result;
  // Words rather than pictures. Shown as text because that is what it is, and
  // because it is meant to be read and edited before being wired onward.
  // Either words a run produced, or a value the node computes without running —
  // a Combine node holds no result at all, yet has plenty to show.
  const analysed =
    (typeof stored?.text === "string" && stored.text.trim()
      ? stored.text
      : null) ?? (outputText?.trim() ? outputText : null);
  const images = pickImages(stored).filter((v) => Boolean(v?.url));

  // On a published board a node is not a node: it is whatever it produced.
  // The header, the state, the prompt and the version strip are all working
  // material, and a visitor came to look at the picture.
  if (readOnly) {
    return (
      <PublishedResult
        images={images}
        selected={selectedIndex(config)}
        text={analysed}
      />
    );
  }

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

        <NodeBody
          analysed={analysed}
          config={config}
          hasWiredPrompt={hasWiredPrompt}
          images={images}
          item={item}
          onConfigChange={onConfigChange}
          onRemoveVersion={onRemoveVersion}
          onSendVersions={onSendVersions}
          readOnly={readOnly}
          state={state}
          type={type}
          wiredPrompt={wiredPrompt}
        />

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

/**
 * What a setting's field shows.
 *
 * A wired prompt is shown in the field it replaces, rather than leaving the
 * typed text on screen while something else is actually used. Seeing the words
 * arrive is the only way to tell a wire is live — a note saying one exists
 * proves nothing about what it carries.
 */
const fieldValue = (
  key: string,
  config: Record<string, unknown>,
  wiredPrompt?: string | null
): string => {
  if (key === "prompt" && wiredPrompt) {
    return wiredPrompt;
  }
  const stored = config[key];
  return typeof stored === "string" || typeof stored === "number"
    ? String(stored)
    : "";
};

interface NodeBodyProps {
  analysed: string | null;
  config: Record<string, unknown>;
  hasWiredPrompt: boolean;
  images: BoardItemVariation[];
  item: BoardItem;
  onConfigChange: (config: Record<string, unknown>) => void;
  onRemoveVersion?: (index: number) => void;
  onSendVersions?: () => void;
  readOnly: boolean;
  state: string;
  type: NonNullable<ReturnType<typeof nodeTypeFor>>;
  wiredPrompt?: string | null;
}

/**
 * Everything below a node's header: what it made, its settings, its complaints.
 *
 * Split out because the node grew a second kind of result. OpNodeView was
 * deciding the header, the run state, the settings, three sorts of notice and
 * now text-or-images all in one function, which is more branching than one
 * component should carry.
 */
function NodeBody({
  analysed,
  config,
  hasWiredPrompt,
  wiredPrompt,
  images,
  item,
  onConfigChange,
  readOnly,
  state,
  type,
}: NodeBodyProps) {
  const set = (key: string, value: string) =>
    onConfigChange({ ...config, [key]: value });

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
      {/* What an Analyse node produced. Selectable, because the usual next
              move is to take part of it into a prompt by hand. */}
      {analysed ? (
        <p className="select-text whitespace-pre-wrap rounded border border-white/10 bg-black/40 p-2 text-[12px] text-white/80 leading-relaxed">
          {analysed}
        </p>
      ) : null}

      {/* A batch lays its variations out as a grid so they can be compared
              at a glance, which is the entire reason for asking for several. */}
      <ResultImages
        images={images}
        onSelect={(index) =>
          onConfigChange({ ...config, selectedVersion: index })
        }
        selected={selectedIndex(config)}
      />

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
          readOnly={readOnly || (hasWiredPrompt && setting.key === "prompt")}
          setting={setting}
          value={fieldValue(setting.key, config, wiredPrompt)}
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
          Came back as a raster, not vector. It will not stay sharp zoomed in.
        </p>
      ) : null}
    </div>
  );
}
