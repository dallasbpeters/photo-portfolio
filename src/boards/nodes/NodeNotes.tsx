import { useModels } from "../ModelsContext";
import {
  loraTriggerNote,
  multiImageNote,
  promptOnlyNote,
} from "./promptOnlyNote";

/**
 * What this node is about to do, said before it is paid for.
 *
 * Three facts a Generate node used to keep to itself, each discovered the same
 * way — by running it and looking at the bill. A trained style's token is
 * added for you, a text-to-image model throws away anything wired to it, and
 * several pictures either blend into one run or fan out into several
 * depending on the model.
 *
 * Grouped in their own component because they are one idea — the node
 * explaining itself — and because OpNodeView.tsx is at the size ceiling. Each
 * note is a pure function of the model list and the config, which is what
 * makes them testable without a canvas.
 */
export function NodeNotes({
  config,
  imageCount,
}: {
  config: Record<string, unknown>;
  imageCount: number;
}) {
  const { models } = useModels();
  const trigger = loraTriggerNote(models, config);
  const shape = promptOnlyNote(models, config, imageCount);
  const blend = multiImageNote(models, config, imageCount);
  return (
    <>
      {trigger ? (
        <p className="op-node-view__notice op-node-view__notice--wired">
          {trigger}
        </p>
      ) : null}
      {shape ? (
        <p className="op-node-view__notice op-node-view__notice--warn">
          {shape}
        </p>
      ) : null}
      {blend ? (
        <p className="op-node-view__notice op-node-view__notice--wired">
          {blend}
        </p>
      ) : null}
    </>
  );
}
