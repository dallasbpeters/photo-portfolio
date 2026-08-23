import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon, TextIcon } from "@hugeicons-pro/core-stroke-standard";
import type { AiModel } from "../../types";
import { useModels } from "../ModelsContext";
import { ProviderLogo } from "./ProviderLogo";
import "./OpNodeView.css";

/**
 * A node's title bar, and the vocabulary it needs.
 *
 * Split out of OpNodeView when the header grew from an icon and a word into
 * four parts with their own lookup tables — the file was over the size limit,
 * and the header neither reads nor writes anything else on the node, which is
 * the same reason NodeBody and SettingField left before it.
 */

/**
 * What a model does to what it is given, as one word on the node.
 *
 * Read off the model's declared `input` rather than typed per row: a model
 * taking a picture and a prompt reworks ("Edit"), one taking only a prompt
 * invents ("Generate"), one taking only a picture transforms it without being
 * told what to do ("Process") — background removal and vectorising both land
 * there. The badge is the fastest way to see, on a board of identical cards,
 * which nodes need a picture wired in before they can run at all.
 */
const MODE_LABEL: Record<string, string> = {
  image: "Process",
  prompt: "Generate",
  "prompt-and-image": "Edit",
  "prompt-and-video": "Video",
  "prompt-or-image": "Generate",
  video: "Video",
};

/**
 * The model a node is set to, as the models table has it.
 *
 * Null while the list is loading, on a published board where the fetch is
 * refused, or for a node type that has no model setting at all. Every caller
 * treats that as "say less", never as an error: a header that hid itself until
 * a fetch landed would make the whole board flash on load.
 */
const modelOf = (
  models: readonly AiModel[],
  config: Record<string, unknown>
): AiModel | null => {
  const id = typeof config.model === "string" ? config.model : null;
  if (!id || id === "auto") {
    return null;
  }
  return models.find((model) => model.id === id) ?? null;
};

const STATE_LABEL: Record<string, string> = {
  failed: "Failed",
  idle: "Ready",
  running: "Running…",
  skipped: "Unchanged",
  succeeded: "Done",
};

/*
 * The modifier each run state wears.
 *
 * Idle and skipped have none: the base class already means "nothing is
 * happening", and a modifier that restates the default is one that can drift
 * from it.
 */
const STATE_CLASS: Record<string, string> = {
  failed: "op-node-view__state--failed",
  idle: "",
  running: "op-node-view__state--running",
  skipped: "",
  succeeded: "op-node-view__state--succeeded",
};

/**
 * A node's title bar: whose model, which model, what it does, how it went.
 *
 * The lab's mark leads, because on a board of a dozen generation nodes it is
 * the only part legible at the zoom you actually work at — every card otherwise
 * says "Generate" in the same grey. The model's own label sits under the node
 * type, so the card answers "what will this cost me" without being opened.
 *
 * A source node gets none of it. It holds a value rather than calling anything,
 * so there is no lab, no model and no run to report — and a Prompt node wearing
 * a status pip would be promising something that is never going to happen.
 */
export function NodeHeader({
  config,
  isSource,
  state,
  typeLabel,
}: {
  config: Record<string, unknown>;
  isSource: boolean;
  state: string;
  typeLabel: string;
}) {
  const { models } = useModels();
  // Only asked for where a node has a model at all: `config.model` is absent on
  // every source node and on the ones that call a fixed endpoint.
  const hasModel = typeof config.model === "string";
  const model = modelOf(models, config);
  const mode = model ? MODE_LABEL[model.input] : null;

  if (isSource) {
    return (
      <header className="op-node-view__header">
        <span className="op-node-view__title">
          <HugeiconsIcon aria-hidden icon={TextIcon} size={11} />
          {typeLabel}
        </span>
      </header>
    );
  }

  return (
    <header className="op-node-view__header">
      {hasModel ? (
        <ProviderLogo modelId={config.model as string} units={10} />
      ) : (
        <span className="op-node-view__mark">
          <HugeiconsIcon aria-hidden icon={SparklesIcon} size={16} />
        </span>
      )}

      <span className="op-node-view__heading">
        <span className="op-node-view__title">{typeLabel}</span>
        {/* "Auto" said out loud rather than left blank — it is a real answer,
            not a node still loading: the endpoint is chosen at run time by
            whether a picture is wired in. Omitted entirely on a node that calls
            no model at all, since an empty line still spends the gap above it. */}
        {hasModel ? (
          <span className="op-node-view__model">{model?.label ?? "Auto"}</span>
        ) : null}
      </span>

      {mode ? <span className="op-node-view__badge">{mode}</span> : null}

      {/* A pip rather than a word. The state used to be spelled out, which at
          the far end of the header competed with the model's name for the eye;
          colour carries it, and the word stays as the title for a pointer. */}
      <span
        className={`op-node-view__state ${STATE_CLASS[state]}`}
        title={STATE_LABEL[state]}
      >
        <span className="op-node-view__pip" />
      </span>
    </header>
  );
}
