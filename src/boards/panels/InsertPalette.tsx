import { HugeiconsIcon } from "@hugeicons/react";
import {
  FileStackIcon,
  FrameIcon,
  GroupLayersIcon,
  Image01Icon,
  LinkSquare01Icon,
  MagicWand01Icon,
  NotebookIcon,
  PaintBoardIcon,
  PaintBucketIcon,
  RepeatIcon,
  SearchVisualIcon,
  SparklesIcon,
  TextIcon,
  VideoReplayIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NodeTypeId } from "../../../config/nodeTypes.js";
import { ALL_SHADERS } from "../shaders/shaderConfig";
import "../boardChrome.css";
import "./InsertPalette.css";

/**
 * Everything that can be inserted, in one keyboard-reachable list.
 *
 * The palette exists because the header ran out of room: notes, text, images,
 * three node types, a frame and 189 shaders do not fit on a toolbar, and a
 * toolbar that scrolled would be worse than one you can search.
 *
 * Shaders come from the registry rather than a list, so a package update
 * changes what this offers without anything here changing.
 */

export type InsertAction =
  | { kind: "frame" }
  | { kind: "images" }
  // NodeTypeId rather than a written-out union: the registry is the list, and
  // spelling it again here meant a new node type compiled fine while being
  // impossible to insert.
  | { kind: "node"; nodeType: NodeTypeId }
  /** A saved way of working, expanded onto the board as real nodes. */
  | { kind: "recipe"; recipeId: string }
  | { kind: "shader"; name: string }
  | { kind: "writable"; writable: "note" | "text" };

interface Entry {
  action: InsertAction;
  /** Extra words that should match, beyond the label. */
  hint: string;
  icon: typeof SparklesIcon;
  label: string;
  section: string;
}

const BASE_ENTRIES: Entry[] = [
  {
    action: { kind: "writable", writable: "note" },
    hint: "sticky card write",
    icon: NotebookIcon,
    label: "Note",
    section: "Board",
  },
  {
    action: { kind: "writable", writable: "text" },
    hint: "label heading caption",
    icon: TextIcon,
    label: "Text",
    section: "Board",
  },
  {
    action: { kind: "frame" },
    hint: "group section container",
    icon: FrameIcon,
    label: "Frame",
    section: "Board",
  },
  {
    action: { kind: "images" },
    hint: "photo unsplash pinterest reference upload",
    icon: Image01Icon,
    label: "Image…",
    section: "Board",
  },
  {
    action: { kind: "node", nodeType: "generate" },
    hint: "ai image fal model batch",
    icon: SparklesIcon,
    label: "Generate",
    section: "Nodes",
  },
  {
    action: { kind: "node", nodeType: "video" },
    hint: "animate motion clip mp4 image-to-video",
    icon: VideoReplayIcon,
    label: "Video",
    section: "Nodes",
  },
  {
    action: { kind: "node", nodeType: "icon" },
    hint: "svg vector glyph magnific",
    icon: MagicWand01Icon,
    label: "Icon",
    section: "Nodes",
  },
  {
    action: { kind: "node", nodeType: "describe" },
    hint: "analyse describe style caption reference vision",
    icon: SearchVisualIcon,
    label: "Analyse",
    section: "Nodes",
  },
  {
    action: { kind: "node", nodeType: "iterate" },
    hint: "iterate repeat batch each list variations loop",
    icon: RepeatIcon,
    label: "Iterate",
    section: "Nodes",
  },
  {
    action: { kind: "node", nodeType: "join" },
    hint: "combine join merge concatenate text prompt",
    icon: LinkSquare01Icon,
    label: "Combine",
    section: "Nodes",
  },
  {
    action: { kind: "node", nodeType: "list" },
    hint: "list prompts rows editable items collection",
    icon: NotebookIcon,
    label: "List",
    section: "Nodes",
  },
  {
    action: { kind: "node", nodeType: "batch" },
    hint: "batch list queue images many each one at a time frame",
    icon: FileStackIcon,
    label: "Batch",
    section: "Nodes",
  },
  {
    action: { kind: "node", nodeType: "composite" },
    hint: "composite layer flatten merge frame stack combine images",
    icon: GroupLayersIcon,
    label: "Composite",
    section: "Nodes",
  },
  {
    action: { kind: "node", nodeType: "palette" },
    hint: "palette color color swatch brand hex restrict",
    icon: PaintBoardIcon,
    label: "Palette",
    section: "Nodes",
  },
  {
    action: { kind: "node", nodeType: "standard" },
    hint: "halftone dither dots brand shader render image",
    icon: SparklesIcon,
    label: "Halftone",
    section: "Nodes",
  },
  {
    action: { kind: "node", nodeType: "prompt" },
    hint: "text source shared style",
    icon: TextIcon,
    label: "Prompt",
    section: "Nodes",
  },
  {
    action: { kind: "node", nodeType: "brand" },
    hint: "brand kit palette voice typeface look guidelines identity",
    icon: PaintBucketIcon,
    label: "Brand",
    section: "Nodes",
  },
];

interface InsertPaletteProps {
  onChoose: (action: InsertAction) => void;
  onDismiss: () => void;
  /** The owner's saved recipes. Empty until any have been kept. */
  recipes?: { id: string; name: string; nodeCount: number }[];
}

/** How many shaders to offer before a search narrows them. */
const SHADER_PREVIEW = 8;

export function InsertPalette({
  onChoose,
  onDismiss,
  recipes = [],
}: InsertPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const entries = useMemo(() => {
    // Above the shaders and below the built-ins: a recipe is the owner's own
    // work, so it should be easier to reach than a library of effects, and it
    // is only ever found by the name they gave it.
    const saved: Entry[] = recipes.map((recipe) => ({
      action: { kind: "recipe" as const, recipeId: recipe.id },
      hint: `recipe saved ${recipe.nodeCount} nodes`,
      icon: RepeatIcon,
      label: recipe.name,
      section: "Recipes",
    }));

    const shaders: Entry[] = ALL_SHADERS.map((shader) => ({
      action: { kind: "shader" as const, name: shader.name },
      hint: `${shader.category} ${shader.description}`,
      icon: SparklesIcon,
      label: shader.name,
      section: `Shaders · ${shader.category}`,
    }));

    const term = query.trim().toLowerCase();
    if (!term) {
      // Unsearched, the full library would bury everything else, so only a
      // taste of it shows until someone types.
      return [...BASE_ENTRIES, ...saved, ...shaders.slice(0, SHADER_PREVIEW)];
    }
    return [...BASE_ENTRIES, ...saved, ...shaders].filter((entry) =>
      `${entry.label} ${entry.hint}`.toLowerCase().includes(term)
    );
  }, [query, recipes]);

  // A filtered list is a different list; keeping the old index would leave the
  // highlight on whatever happened to be in that position.
  useEffect(() => {
    setActive(0);
  }, []);

  const choose = (index: number) => {
    const entry = entries[index];
    if (entry) {
      onChoose(entry.action);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onDismiss();
    }
  };

  let lastSection = "";

  return (
    <div className="modal-layer modal-layer--top">
      <button
        aria-label="Dismiss"
        className="modal-scrim"
        onClick={onDismiss}
        tabIndex={-1}
        type="button"
      />

      <div className="modal-panel modal-panel--veiled insert-palette">
        <input
          className="insert-palette__input"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Insert…"
          ref={inputRef}
          value={query}
        />

        <div className="insert-palette__list">
          {entries.length === 0 ? (
            <p className="insert-palette__empty">Nothing matches “{query}”.</p>
          ) : null}

          {entries.map((entry, index) => {
            const showSection = entry.section !== lastSection;
            lastSection = entry.section;
            return (
              <div key={`${entry.section}-${entry.label}`}>
                {showSection ? (
                  <p className="insert-palette__section">{entry.section}</p>
                ) : null}
                <button
                  className={`insert-palette__option ${
                    index === active ? "insert-palette__option--active" : ""
                  }`}
                  onClick={() => choose(index)}
                  onPointerEnter={() => setActive(index)}
                  type="button"
                >
                  <HugeiconsIcon aria-hidden icon={entry.icon} size={14} />
                  {entry.label}
                </button>
              </div>
            );
          })}
        </div>

        <p className="insert-palette__keys">
          ↑↓ to move · ↵ to insert · esc to close
        </p>
      </div>
    </div>
  );
}
