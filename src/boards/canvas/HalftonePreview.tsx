import { halftoneStack } from "./renderShaderNode";

/**
 * The halftone, drawn on the node as soon as a picture is wired in.
 *
 * A Halftone node used to show nothing until it had been run: it is an op node
 * with a capability, so it wore a Run button and a state and sat blank until
 * somebody pressed it. That is right for a node that calls a model and costs
 * money, and wrong for this one. Nothing here is generated, nothing is paid
 * for, and the whole result is a function of one picture and a dozen settings
 * the panel is already showing — so attaching an image is the entire act, and
 * the node should look like what it is.
 *
 * The same stack the export uses, from one definition, because a preview that
 * is drawn a second way is a preview that can disagree with the file. That
 * already happened here more than once.
 *
 * Running it still matters, but for a different reason: a run renders this to a
 * file and uploads it, which is what gives the node an output another node can
 * read. Seeing it and handing it on are separate jobs, and only the second one
 * needs asking for.
 */

export interface HalftonePreviewProps {
  config: Record<string, unknown>;
  /** How wide the node is, so the screen is not drawn finer than it can be. */
  frameWidth?: number;
  /** The picture on the node's image input, or null while nothing is wired. */
  imageUrl?: string | null;
}

export function HalftonePreview({
  config,
  frameWidth,
  imageUrl,
}: HalftonePreviewProps) {
  if (!imageUrl) {
    return (
      <p className="px-1 py-3 text-[10px] text-board-ink/35 leading-relaxed">
        Wire a picture into this node and it draws straight away.
      </p>
    );
  }

  return (
    // A fixed aspect rather than the node's full height: the node body scrolls,
    // and a child sized to a scrolling parent has no height to render into.
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded bg-board-surface/40">
      {halftoneStack(config, imageUrl, frameWidth)}
    </div>
  );
}
