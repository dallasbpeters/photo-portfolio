import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { nodeTypeFor } from "../../../config/nodeTypes.js";
import type { BoardItem, BoardItemVariation } from "../../types";
import { HalftonePreview } from "../canvas/HalftonePreview";
import { pickImages, selectedIndex } from "../itemOutput";
import { BrandPreview } from "./BrandPreview";
import { ListRows } from "./ListRows";
import { NodeHeader } from "./NodeHeader";
import { PaletteSwatches } from "./PaletteSwatches";
import { ResultImages } from "./ResultImages";
import { SettingField } from "./SettingField";
import "./OpNodeView.css";
import { Button } from "@/components/ui/button";

interface OpNodeViewProps {
  /** True when this node's prompt is satisfied by a wire rather than typed. */
  hasWiredPrompt: boolean;
  /** How many pictures are wired in, for the node that draws them itself. */
  imageCount?: number;
  /** The picture wired in, for the node that draws one rather than making one. */
  imageUrl?: string | null;
  item: BoardItem;
  /** Stops a run in flight. */
  onCancel?: () => void;
  onConfigChange: (config: Record<string, unknown>) => void;
  /** Deletes one stored version for good. */
  onRemoveVersion?: (index: number) => void;
  onRun: (force: boolean) => void;
  /** Pins every stored version onto the board as its own image. */
  onSendVersions?: () => void;
  /** What this node computes from its inputs — a Combine node’s joined text. */
  outputText?: string | null;
  readOnly: boolean;
  /** The rows a List node's Fill input is offering, already flattened. */
  wiredItems?: readonly string[];
  /** The words that wire is carrying, so the node can show them. */
  wiredPrompt?: string | null;
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
  return <div aria-hidden className="op-node-view__glow" />;
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
    return <p className="op-node-view__published-text">{text}</p>;
  }
  const shown = images[Math.min(selected, images.length - 1)];
  if (!shown) {
    return null;
  }
  return (
    <img
      alt={shown.description ?? ""}
      className="op-node-view__published-image"
      decoding="async"
      height={shown.height ?? undefined}
      loading="lazy"
      src={shown.url}
      width={shown.width ?? undefined}
    />
  );
}
export function OpNodeView({
  hasWiredPrompt,
  wiredPrompt,
  imageCount,
  imageUrl,
  item,
  onCancel,
  onConfigChange,
  onRemoveVersion,
  onRun,
  onSendVersions,
  outputText,
  readOnly,
  wiredItems,
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
    return <div className="op-node-view__unknown">Unknown node type</div>;
  }

  // A source node holds a value instead of producing one, so it never runs and
  // shows no run state — a Prompt node reading "Ready" would be promising
  // something that is never going to happen.
  const isSource = !type.capability;
  return (
    <>
      {isRunning ? <RunningGlow /> : null}

      <div className="op-node-view">
        <NodeHeader
          config={config}
          isSource={isSource}
          state={state}
          typeLabel={type.label}
        />

        <NodeBody
          analysed={analysed}
          config={config}
          hasWiredPrompt={hasWiredPrompt}
          imageCount={imageCount}
          images={images}
          imageUrl={imageUrl}
          item={item}
          onConfigChange={onConfigChange}
          onRemoveVersion={onRemoveVersion}
          onSendVersions={onSendVersions}
          readOnly={readOnly}
          state={state}
          type={type}
          wiredItems={wiredItems}
          wiredPrompt={wiredPrompt}
        />

        {readOnly || isSource ? null : (
          // Deliberately NOT counter-scaled, unlike the floating chrome in
          // BoardItemView. Those are fixed-size icons that sit outside their
          // item; this footer is a full-width part of the node's own layout, so
          // dividing by the zoom made it 45% of the node's width at 220% and
          // wider than the node below 100% — the button never fit its box.
          // Scaling with the node, like the prompt field above it, is correct.
          <footer className="op-node-view__footer">
            {/* The same button stops what it started. A separate Stop would sit
                disabled and useless most of the time, and a running generation
                is exactly when the Run button has nothing else to offer. */}
            <Button
              fullWidth
              onClick={() => (isRunning ? onCancel?.() : onRun(false))}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
              variant="default"
            >
              <HugeiconsIcon
                aria-hidden
                icon={isRunning ? StopIcon : PlayIcon}
                size={18}
              />
              {isRunning ? "Stop" : "Run"}
            </Button>
            {item.result ? (
              <Button
                aria-label="Run again, ignoring the stored result"
                disabled={isRunning}
                fullWidth
                onClick={() => onRun(true)}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
                variant="default"
              >
                <HugeiconsIcon icon={RefreshIcon} size={12} />
              </Button>
            ) : null}
          </footer>
        )}
      </div>
    </>
  );
}

/**
 * What a setting's field shows: the value stored on the node.
 *
 * It used to substitute the wired prompt here, because a wire replaced the
 * typed text and leaving the old text on screen would have been a lie. Both are
 * sent now, so the field shows what it edits and the notice above says a wire is
 * contributing as well.
 */
const fieldValue = (
  key: string,
  config: Record<string, unknown>
): string | undefined => {
  const stored = config[key];
  // Undefined rather than "" for a key the node has never carried, so the field
  // can tell "never set" from "just cleared". See SettingFieldProps.value.
  if (stored === undefined || stored === null) {
    return;
  }
  return typeof stored === "string" || typeof stored === "number"
    ? String(stored)
    : "";
};

interface NodeBodyProps {
  analysed: string | null;
  config: Record<string, unknown>;
  hasWiredPrompt: boolean;
  imageCount?: number;
  images: BoardItemVariation[];
  imageUrl?: string | null;
  item: BoardItem;
  onConfigChange: (config: Record<string, unknown>) => void;
  onRemoveVersion?: (index: number) => void;
  onSendVersions?: () => void;
  readOnly: boolean;
  state: string;
  type: NonNullable<ReturnType<typeof nodeTypeFor>>;
  wiredItems?: readonly string[];
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
  imageCount,
  imageUrl,
  images,
  item,
  onConfigChange,
  onRemoveVersion,
  onSendVersions,
  readOnly,
  state,
  type,
  wiredItems,
  wiredPrompt,
}: NodeBodyProps) {
  const set = (key: string, value: string) =>
    onConfigChange({ ...config, [key]: value });

  return (
    <div className="op-node-view__body">
      {/* What an Analyse node produced. Selectable, because the usual next
              move is to take part of it into a prompt by hand. */}
      {analysed ? <p className="op-node-view__text">{analysed}</p> : null}

      {/* A batch lays its variations out as a grid so they can be compared
              at a glance, which is the entire reason for asking for several. */}
      {/* Drawn live rather than waiting to be run. See HalftonePreview: this
          node generates nothing and costs nothing, so wiring a picture in is
          the whole act. */}
      {item.nodeType === "standard" ? (
        <HalftonePreview
          config={config}
          imageCount={imageCount}
          imageUrl={imageUrl}
        />
      ) : null}

      {/* A Brand node shows the kit it will spend, for the same reason the
          halftone shows its render: the node is otherwise a name and a
          dropdown, and there would be no way to tell a kit with six colours
          from an empty one. */}
      {item.nodeType === "brand" ? (
        <BrandPreview brandKitId={config.brandKitId} />
      ) : null}

      <ResultImages
        images={images}
        onRemove={onRemoveVersion}
        onSelect={(index) =>
          onConfigChange({ ...config, selectedVersion: index })
        }
        onSendAll={onSendVersions}
        selected={selectedIndex(config)}
      />

      {/* A prompt arriving down a wire wins over one typed here, so saying
              so is better than leaving a field that looks live but is ignored. */}
      {hasWiredPrompt ? (
        <p className="op-node-view__notice op-node-view__notice--wired">
          A wire is adding to this prompt. What you type here comes first.
        </p>
      ) : null}

      {/* A node with thirty-two controls cannot hold them: they render in the
          floating panel beside the board instead, for the same reason the
          shader settings moved there. Everything else keeps its settings on the
          node, where they are one glance from what they change.
          
          `panel` settings are filtered out here and rendered by
          NodeSettingsPanel instead — the model picker and the generation
          parameters beside it, which are set once and then left alone. The
          registry decides which is which; see SettingDef. */}
      {(item.nodeType === "standard"
        ? []
        : type.settings.filter((setting) => !setting.panel)
      ).map((setting) => {
        // Chosen by name rather than by a chain of ternaries: there are three
        // now, and the linter is right that a fourth would nest deeper than
        // anyone can read. The same move CanvasMenu made for its panels.
        const custom = () => {
          // A List's rows are the node, not a field on it: one prompt each,
          // editable and removable where they are.
          if (item.nodeType === "list" && setting.key === "items") {
            return (
              <ListRows
                filled={config.filled}
                onChange={(items) => set("items", items)}
                // Both keys in one write. Two calls would each spread a config
                // captured before the other landed, and the second would undo
                // the first — leaving the rows filled but no record of it, so
                // the next render would read them as a hand edit.
                onFill={(items) =>
                  onConfigChange({ ...config, filled: items, items })
                }
                readOnly={readOnly}
                value={config.items}
                wired={wiredItems}
              />
            );
          }
          // The palette's colours are swatches rather than a text field — see
          // PaletteSwatches, which edits the very same stored string.
          if (item.nodeType === "palette" && setting.key === "colors") {
            return (
              <PaletteSwatches
                onChange={(colors) => set("colors", colors)}
                value={typeof config.colors === "string" ? config.colors : ""}
              />
            );
          }
          return (
            <SettingField
              onChange={(value) => set(setting.key, value)}
              /* Never disabled by a wire any more. A wired prompt used to
                 supersede the typed one, so the field was locked to match — and
                 a Brand node, which contributes a modifier rather than a
                 subject, then left the node unable to say what the picture was
                 of at all. The parts are joined now; see jobsFor. */
              readOnly={readOnly}
              setting={setting}
              /* The typed text, not the wired text. Showing the arriving
                 words in the field made sense while they replaced it; now that
                 both are sent, the field has to be the thing it edits. What the
                 wire carries is said in the notice above. */
              value={fieldValue(setting.key, config)}
            />
          );
        };
        return <div key={setting.key}>{custom()}</div>;
      })}

      {/* A run that reported success but drew nothing would otherwise look
              identical to one that never ran. Saying so is what keeps a broken
              result visible instead of silently blank. */}
      {state === "succeeded" && images.length === 0 ? (
        <p className="op-node-view__notice op-node-view__notice--warn">
          Ran, but returned no image. Try again, or check the model.
        </p>
      ) : null}

      {item.runError ? (
        <p className="op-node-view__notice op-node-view__notice--error">
          <HugeiconsIcon aria-hidden icon={Alert02Icon} size={11} />
          {item.runError}
        </p>
      ) : null}

      {/* Stated on the node rather than left to be discovered by zooming
              in: a raster glyph turns to mush at 300% and there is nothing on
              the board to say why. */}
      {item.result?.isVector === false ? (
        <p className="op-node-view__notice op-node-view__notice--warn">
          Came back as a raster, not vector. It will not stay sharp zoomed in.
        </p>
      ) : null}
    </div>
  );
}
