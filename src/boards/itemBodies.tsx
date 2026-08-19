import type { BoardItem } from "../types";
import { ShaderView } from "./ShaderView";
import {
  DEFAULT_SOURCE,
  isShaderConfig,
  newLayer,
  normalizeLayers,
  type ShaderConfig,
  type ShaderLayer,
} from "./shaderConfig";

/**
 * What the kinds of item that are not nodes look like on the board.
 *
 * A frame, an element and a shader. All three are "an item with a body", and
 * none of them has anything to do with the geometry, selection, chrome and
 * pointer handling that BoardItemView is otherwise entirely about — that file
 * was carrying two jobs and had run out of room to grow doing either.
 */

/**
 * Drops a default source into the named empty effect.
 *
 * Recursive because the effect that needs filling may be nested — an empty
 * Group two levels down is exactly the case the canvas button exists for.
 */
const fillEmptyEffect = (
  layers: ShaderLayer[],
  layerId: string
): ShaderLayer[] =>
  layers.map((layer) =>
    layer.id === layerId
      ? { ...layer, children: [newLayer(DEFAULT_SOURCE)] }
      : { ...layer, children: fillEmptyEffect(layer.children ?? [], layerId) }
  );

/**
 * A frame: a labelled rectangle that groups whatever sits on it.
 *
 * Drawn as an outline so its contents stay readable through the middle, and
 * transparent to the pointer everywhere except its title — a frame that took
 * clicks across its whole area would swallow every item inside it.
 */
export function FrameBody({
  item,
  onEditBody,
  readOnly,
}: {
  item: BoardItem;
  onEditBody: (body: string) => void;
  readOnly: boolean;
}) {
  return (
    <div className="pointer-events-none h-full w-full rounded-lg border-2 border-blue-500/50 border-dashed bg-board-ink/2">
      <input
        aria-label="Frame name"
        className="pointer-events-auto w-full bg-transparent px-2 py-1 font-light text-[13px] text-board-ink uppercase tracking-[0.18em] outline-none placeholder:text-board-ink"
        disabled={readOnly}
        onChange={(e) => onEditBody(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="Frame"
        value={item.body ?? ""}
      />
    </div>
  );
}

/**
 * An element on the board: the style's cover, its name, and the words it
 * carries into a prompt.
 *
 * Nothing here is editable. The library row is the authority — the copy kept on
 * the node exists only so a board still shows and still runs after the element
 * is deleted out from under it — so a field to type over it here would be a
 * second copy, free to disagree with the library. See withElements in
 * api/boards/[id]/run.ts.
 */
export function ElementBody({ item }: { item: BoardItem }) {
  const config = item.config ?? {};
  const stored = typeof config.imageUrl === "string" ? config.imageUrl : null;
  // The same picture the wire hands over, so what is on the canvas and what is
  // sent are never two different things. See resolvedImageUrl in itemOutput.ts.
  const cover = stored || item.imageUrl;
  const name = typeof config.name === "string" ? config.name : null;
  const storedWords =
    typeof config.description === "string" ? config.description : null;
  const words = item.body ?? storedWords;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-board-panel">
      {cover ? (
        <img
          alt=""
          className="min-h-0 w-full grow object-cover"
          decoding="async"
          draggable={false}
          height={item.height}
          loading="lazy"
          src={cover}
          width={item.width}
        />
      ) : (
        <div className="flex min-h-0 grow items-center justify-center text-[11px] text-board-ink/35">
          No cover yet
        </div>
      )}
      <div className="shrink-0 px-2 py-1.5">
        <p className="truncate font-medium text-[11px] text-board-ink">
          {name ?? "Element"}
        </p>
        {/* The description is the substance of an element — it rides the wire
            into the prompt — so it is shown rather than left to a side panel,
            but clamped: this is a node on a canvas, not the library. */}
        {words ? (
          <p className="line-clamp-2 text-[10px] text-board-ink/60 leading-snug">
            {words}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A shader on the board: the effect running live, with its parameters behind a
 * toggle.
 *
 * The controls are hidden until asked for because a shader is something you
 * look at — 1,668 parameters across the library means the panel would otherwise
 * bury the thing it configures.
 */
export function ShaderItem({
  imageUrl,
  item,
  onConfigChange,
  readOnly,
}: {
  imageUrl?: string | null;
  item: BoardItem;
  onConfigChange?: (config: Record<string, unknown>) => void;
  readOnly: boolean;
}) {
  // Nothing to fold any more: the controls live in the floating panel beside
  // the board, so the item is only ever the picture. The collapse state and its
  // gear went with them.
  // A stack saved before layers carried identity gets one here, so the panel
  // has a stable key to work from without the server having to be involved.
  const config: ShaderConfig = isShaderConfig(item.config)
    ? {
        ...item.config,
        layers: item.config.layers.map((layer, index) => ({
          ...layer,
          id: layer.id ?? `legacy-${index}-${layer.name}`,
        })),
      }
    : { layers: [] };

  return (
    <div className="relative h-full w-full">
      <ShaderView
        config={config}
        imageUrl={imageUrl}
        onAddSource={
          readOnly
            ? undefined
            : (layerId) =>
                onConfigChange?.({
                  ...config,
                  layers: fillEmptyEffect(
                    normalizeLayers(config.layers),
                    layerId
                  ),
                } as unknown as Record<string, unknown>)
        }
      />

      {/* The settings used to render here, pinned to the bottom and up to 85%
          of the item's height — so adjusting a shader covered the shader. They
          are in the board's overlay stack now, beside the other
          selection-owned tools. See ShaderPanel. */}
    </div>
  );
}

/**
 * The box's own classes: what it is, and whether it is selected.
 *
 * Text and an unselected drawing wear no ring — their content is the whole of
 * them, and a border there reads as part of the picture rather than as chrome.
 * Appearance rather than behaviour, which is why it sits with the bodies.
 */
export function itemBoxClassName(item: BoardItem, isSelected: boolean) {
  const isText = item.kind === "text";
  const isDrawing = item.kind === "drawing";
  const selecting = isText ? "" : "select-none";
  const ring = isSelected ? "ring-2 ring-blue-500" : "ring-1 ring-board-ink/10";
  const bare =
    isText || (isDrawing && !isSelected) ? "ring-0 ring-transparent" : "ring-0";
  return `group absolute rounded-xs contain-layout ${selecting} ${ring} ${bare}`;
}
