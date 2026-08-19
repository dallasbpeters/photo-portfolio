import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Delete02Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useState } from "react";
import {
  EFFECT_CATEGORIES,
  EFFECT_SHADERS,
  groupProps,
  isEffect,
  newLayer,
  normalizeLayers,
  type ShaderConfig,
  type ShaderLayer,
  SOURCE_CATEGORIES,
  SOURCE_SHADERS,
  shaderMeta,
} from "./shaderConfig";
import { Control } from "./shaderControls/Control";

/**
 * The parameter panel for a shader, generated from the registry.
 *
 * Nothing here is written per shader. Each effect publishes its own parameters
 * with a control type, range, options and grouping, so this walks that metadata
 * and draws the right control — the same idea as a Framer component's property
 * controls, except the schema ships with the package instead of being declared
 * alongside the component.
 *
 * Six control types cover 96% of the library's 1,668 parameters. The remainder
 * — shape pickers, font choosers, media uploads — are shown as unsupported
 * rather than approximated: a control that half works is worse than one that
 * admits it is missing, because only one of those two tells you to go and edit
 * the value somewhere else.
 */

/**
 * Tree edits, all by layer id.
 *
 * By id rather than by index because an index only identifies a layer within
 * one list, and the stack is now a tree — the same position exists at every
 * depth. Each returns a new tree; nothing is mutated in place.
 */
const mapById = (
  layers: ShaderLayer[],
  id: string,
  fn: (layer: ShaderLayer) => ShaderLayer
): ShaderLayer[] =>
  layers.map((layer) =>
    layer.id === id
      ? fn(layer)
      : { ...layer, children: mapById(layer.children ?? [], id, fn) }
  );

const removeById = (layers: ShaderLayer[], id: string): ShaderLayer[] =>
  layers
    .filter((layer) => layer.id !== id)
    .map((layer) => ({
      ...layer,
      children: removeById(layer.children ?? [], id),
    }));

/** Appends into a parent's children, or onto the top level when null. */
const appendTo = (
  layers: ShaderLayer[],
  parentId: string | null,
  added: ShaderLayer
): ShaderLayer[] => {
  if (parentId === null) {
    return [...layers, added];
  }
  return mapById(layers, parentId, (layer) => ({
    ...layer,
    children: [...(layer.children ?? []), added],
  }));
};

/** Moves a layer among its own siblings, leaving other levels untouched. */
const moveById = (
  layers: ShaderLayer[],
  id: string,
  delta: number
): ShaderLayer[] => {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index === -1) {
    return layers.map((layer) => ({
      ...layer,
      children: moveById(layer.children ?? [], id, delta),
    }));
  }
  const target = index + delta;
  if (target < 0 || target >= layers.length) {
    return layers;
  }
  const next = [...layers];
  const [moved] = next.splice(index, 1);
  if (moved) {
    next.splice(target, 0, moved);
  }
  return next;
};

interface PickerProps {
  onCancel: () => void;
  onPick: (name: string) => void;
  /** Sources draw a picture; effects change one. */
  wanting: "source" | "effect";
}

/**
 * Choosing what to add, split by what the thing does.
 *
 * Two lists rather than one, because "source or effect" is the only
 * distinction that governs whether a stack works, and asking someone to infer
 * it from a "wraps" badge put the burden in the wrong place.
 */
function Picker({ onCancel, onPick, wanting }: PickerProps) {
  const shaders = wanting === "source" ? SOURCE_SHADERS : EFFECT_SHADERS;
  const categories =
    wanting === "source" ? SOURCE_CATEGORIES : EFFECT_CATEGORIES;
  const [category, setCategory] = useState(categories[0] ?? "");

  return (
    <div className="space-y-2 rounded border border-board-ink/15 bg-board-surface/60 p-2">
      <div className="flex items-center justify-between">
        <p className="text-[9px] text-board-ink/40 uppercase tracking-[0.18em]">
          {wanting === "source" ? "Something to draw" : "Something to apply"}
        </p>
        <button
          className="text-[9px] text-board-ink/40 uppercase tracking-[0.14em] hover:text-board-ink"
          onClick={onCancel}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          Cancel
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {categories.map((name) => (
          <button
            className={`min-h-6 rounded px-1.5 text-[9px] tracking-[0.08em] transition-colors ${
              category === name
                ? "bg-board-ink/10 text-board-ink"
                : "text-board-ink/40 hover:text-board-ink/80"
            }`}
            key={name}
            onClick={() => setCategory(name)}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
      <div className="max-h-40 space-y-0.5 overflow-y-auto">
        {shaders
          .filter((shader) => shader.category === category)
          .map((shader) => (
            <button
              className="w-full rounded px-2 py-1 text-left text-[11px] text-board-ink/75 hover:bg-board-ink/10 hover:text-board-ink"
              key={shader.name}
              onClick={() => onPick(shader.name)}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              {shader.name}
            </button>
          ))}
      </div>
    </div>
  );
}

interface LayerRowProps {
  canMoveDown: boolean;
  canMoveUp: boolean;
  layer: ShaderLayer;
  onAdd: (parentId: string, name: string) => void;
  onMove: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onSetProp: (id: string, key: string, value: unknown) => void;
  /**
   * True when a picture is wired into this item.
   *
   * An effect fed by a wire is not empty, even though the saved stack under it
   * is: withImage injects the picture at render time on purpose, so unplugging
   * leaves no stale URL behind.
   */
  wiredSource?: boolean;
}

/**
 * One layer, and everything inside it.
 *
 * Recursive, because the stack is a tree: an effect's contents are drawn within
 * its own box, so what a Group holds is visible rather than inferred from the
 * order of a flat list.
 */
function LayerRow({
  wiredSource,
  canMoveDown,
  canMoveUp,
  layer,
  onAdd,
  onMove,
  onRemove,
  onSetProp,
}: LayerRowProps) {
  const [adding, setAdding] = useState<"source" | "effect" | null>(null);
  // Collapsed per layer, because a nested stack is otherwise a very tall column
  // of sliders and the one being worked on scrolls out of reach.
  const [isOpen, setIsOpen] = useState(true);
  const meta = shaderMeta(layer.name);
  const effect = isEffect(layer.name);
  const children = layer.children ?? [];

  return (
    <div className="rounded border border-board-ink/10 bg-board-surface/40">
      <div className="flex items-center gap-2 border-board-ink/10 border-b px-2 py-1">
        <button
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${layer.name}`}
          className="shrink-0 text-board-ink/40 hover:text-board-ink"
          onClick={() => setIsOpen((open) => !open)}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          <HugeiconsIcon
            icon={isOpen ? ArrowDown01Icon : ArrowRight01Icon}
            size={12}
          />
        </button>
        <span className="truncate text-[10px] text-board-ink/70 uppercase tracking-[0.14em]">
          {layer.name}
        </span>
        <span className="shrink-0 text-[8px] text-board-ink/25 uppercase tracking-widest">
          {effect ? "effect" : "source"}
        </span>
        <span className="grow" />
        <button
          aria-label={`Move ${layer.name} up`}
          className="text-board-ink/30 hover:text-board-ink disabled:opacity-20"
          disabled={!canMoveUp}
          onClick={() => onMove(layer.id, -1)}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          <HugeiconsIcon icon={ArrowUp01Icon} size={12} />
        </button>
        <button
          aria-label={`Move ${layer.name} down`}
          className="text-board-ink/30 hover:text-board-ink disabled:opacity-20"
          disabled={!canMoveDown}
          onClick={() => onMove(layer.id, 1)}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={12} />
        </button>
        <button
          aria-label={`Remove ${layer.name}`}
          className="text-board-ink/30 hover:text-board-ink"
          onClick={() => onRemove(layer.id)}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
        </button>
      </div>

      {effect && isOpen ? (
        <div className="space-y-2 border-board-ink/10 border-b p-2">
          <p className="text-[9px] text-board-ink/30 uppercase tracking-[0.18em]">
            Applies to
          </p>
          {children.length === 0 && !wiredSource ? (
            <p className="text-[10px] text-amber-300/60">
              Empty — this effect has nothing to change.
            </p>
          ) : null}
          {children.length === 0 && wiredSource ? (
            <p className="text-[10px] text-board-ink/45">
              The picture wired into this item. Unplug it to change that.
            </p>
          ) : null}
          {children.map((child, index) => (
            <LayerRow
              canMoveDown={index < children.length - 1}
              canMoveUp={index > 0}
              key={child.id}
              layer={child}
              onAdd={onAdd}
              onMove={onMove}
              onRemove={onRemove}
              onSetProp={onSetProp}
            />
          ))}
          {adding ? (
            <Picker
              onCancel={() => setAdding(null)}
              onPick={(name) => {
                onAdd(layer.id, name);
                setAdding(null);
              }}
              wanting={adding}
            />
          ) : (
            <div className="flex gap-1">
              <button
                className="grow rounded border border-board-ink/15 py-1 text-[9px] text-board-ink/60 uppercase tracking-[0.14em] hover:text-board-ink"
                onClick={() => setAdding("source")}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                + Source
              </button>
              <button
                className="grow rounded border border-board-ink/15 py-1 text-[9px] text-board-ink/60 uppercase tracking-[0.14em] hover:text-board-ink"
                onClick={() => setAdding("effect")}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                + Effect
              </button>
            </div>
          )}
        </div>
      ) : null}

      <div className={`space-y-3 p-2 ${isOpen ? "" : "hidden"}`}>
        {meta === null ? (
          <p className="text-[10px] text-amber-300/70">
            This shader is not in the installed package.
          </p>
        ) : null}
        {meta !== null && meta.props.length === 0 ? (
          <p className="text-[10px] text-board-ink/25">
            No settings — this one only holds what is inside it.
          </p>
        ) : null}
        {meta === null
          ? null
          : groupProps(meta.props).map(({ group, props }) => (
              <div className="space-y-2" key={group}>
                <p className="text-[9px] text-board-ink/30 uppercase tracking-[0.18em]">
                  {group}
                </p>
                {props.map((prop) => (
                  <Control
                    key={prop.key}
                    onChange={(value) => onSetProp(layer.id, prop.key, value)}
                    prop={prop}
                    value={layer.props[prop.key]}
                  />
                ))}
              </div>
            ))}
      </div>
    </div>
  );
}

interface ShaderControlsProps {
  config: ShaderConfig;
  /**
   * The picture wired into this item, if any.
   *
   * Only needed so an effect fed by a wire stops calling itself empty. The
   * image is injected at render time and deliberately never saved — see
   * withImage — so the stored stack, which is all this panel could otherwise
   * see, genuinely has nothing under the effect while the canvas behind it is
   * plainly rendering the picture.
   */
  imageUrl?: string | null;
  onChange: (config: ShaderConfig) => void;
}

export function ShaderControls({
  config,
  imageUrl,
  onChange,
}: ShaderControlsProps) {
  const [adding, setAdding] = useState<"source" | "effect" | null>(null);
  // Read through the migration on every edit, so a stack saved in the old flat
  // shape is rewritten the first time it is touched rather than half-converted.
  const layers = normalizeLayers(config.layers);
  const put = (next: ShaderLayer[]) => onChange({ ...config, layers: next });

  return (
    <div className="space-y-3">
      {layers.map((layer, index) => (
        <LayerRow
          canMoveDown={index < layers.length - 1}
          canMoveUp={index > 0}
          key={layer.id}
          layer={layer}
          onAdd={(parentId, name) =>
            put(appendTo(layers, parentId, newLayer(name)))
          }
          onMove={(id, delta) => put(moveById(layers, id, delta))}
          onRemove={(id) => put(removeById(layers, id))}
          onSetProp={(id, key, value) =>
            put(
              mapById(layers, id, (found) => ({
                ...found,
                props: { ...found.props, [key]: value },
              }))
            )
          }
          wiredSource={Boolean(imageUrl)}
        />
      ))}

      {adding ? (
        <Picker
          onCancel={() => setAdding(null)}
          onPick={(name) => {
            put(appendTo(layers, null, newLayer(name)));
            setAdding(null);
          }}
          wanting={adding}
        />
      ) : (
        <div className="flex gap-1">
          <button
            className="grow rounded border border-board-ink/15 py-1.5 text-[10px] text-board-ink/60 uppercase tracking-[0.14em] hover:text-board-ink"
            onClick={() => setAdding("source")}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            Add source
          </button>
          <button
            className="grow rounded border border-board-ink/15 py-1.5 text-[10px] text-board-ink/60 uppercase tracking-[0.14em] hover:text-board-ink"
            onClick={() => setAdding("effect")}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            Add effect
          </button>
        </div>
      )}

      <p className="text-[9px] text-board-ink/25 leading-relaxed">
        A <span className="text-board-ink/50">source</span> draws a picture. An{" "}
        <span className="text-board-ink/50">effect</span> changes whatever is
        inside it — use Group to put several things inside one effect.
      </p>
    </div>
  );
}
