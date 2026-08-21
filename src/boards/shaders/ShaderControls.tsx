import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Delete02Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useState } from "react";
import { Control } from "./Control";
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
import "./ShaderControls.css";

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
    <div className="shader-picker">
      <div className="shader-picker__header">
        <p className="shader-picker__title">
          {wanting === "source" ? "Something to draw" : "Something to apply"}
        </p>
        <button
          className="shader-picker__cancel"
          onClick={onCancel}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          Cancel
        </button>
      </div>
      <div className="shader-picker__categories">
        {categories.map((name) => (
          <button
            className={`shader-picker__category ${
              category === name ? "shader-picker__category--on" : ""
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
      <div className="shader-picker__list">
        {shaders
          .filter((shader) => shader.category === category)
          .map((shader) => (
            <button
              className="shader-picker__option"
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
    <div className="shader-layer">
      <div className="shader-layer__header">
        <button
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${layer.name}`}
          className="shader-layer__toggle"
          onClick={() => setIsOpen((open) => !open)}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          <HugeiconsIcon
            icon={isOpen ? ArrowDown01Icon : ArrowRight01Icon}
            size={12}
          />
        </button>
        <span className="shader-layer__name">{layer.name}</span>
        <span className="shader-layer__kind">
          {effect ? "effect" : "source"}
        </span>
        <span className="shader-layer__spacer" />
        <button
          aria-label={`Move ${layer.name} up`}
          className="shader-layer__control"
          disabled={!canMoveUp}
          onClick={() => onMove(layer.id, -1)}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          <HugeiconsIcon icon={ArrowUp01Icon} size={12} />
        </button>
        <button
          aria-label={`Move ${layer.name} down`}
          className="shader-layer__control"
          disabled={!canMoveDown}
          onClick={() => onMove(layer.id, 1)}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={12} />
        </button>
        <button
          aria-label={`Remove ${layer.name}`}
          className="shader-layer__control"
          onClick={() => onRemove(layer.id)}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
        </button>
      </div>

      {effect && isOpen ? (
        <div className="shader-layer__children">
          <p className="shader-layer__group-title">Applies to</p>
          {children.length === 0 && !wiredSource ? (
            <p className="shader-layer__note shader-layer__note--warn">
              Empty — this effect has nothing to change.
            </p>
          ) : null}
          {children.length === 0 && wiredSource ? (
            <p className="shader-layer__note">
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
            <div className="shader-controls__add-row">
              <button
                className="shader-controls__add"
                onClick={() => setAdding("source")}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                + Source
              </button>
              <button
                className="shader-controls__add"
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

      <div
        className={`shader-layer__settings ${
          isOpen ? "" : "shader-layer__settings--closed"
        }`}
      >
        {meta === null ? (
          <p className="shader-layer__note shader-layer__note--missing">
            This shader is not in the installed package.
          </p>
        ) : null}
        {meta !== null && meta.props.length === 0 ? (
          <p className="shader-layer__note shader-layer__note--quiet">
            No settings — this one only holds what is inside it.
          </p>
        ) : null}
        {meta === null
          ? null
          : groupProps(meta.props).map(({ group, props }) => (
              <div className="shader-layer__prop-group" key={group}>
                <p className="shader-layer__group-title">{group}</p>
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
    <div className="shader-controls">
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
        <div className="shader-controls__add-row">
          <button
            className="shader-controls__add shader-controls__add--root"
            onClick={() => setAdding("source")}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            Add source
          </button>
          <button
            className="shader-controls__add shader-controls__add--root"
            onClick={() => setAdding("effect")}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            Add effect
          </button>
        </div>
      )}

      <p className="shader-controls__legend">
        A <span className="shader-controls__legend-term">source</span> draws a
        picture. An <span className="shader-controls__legend-term">effect</span>{" "}
        changes whatever is inside it — use Group to put several things inside
        one effect.
      </p>
    </div>
  );
}
