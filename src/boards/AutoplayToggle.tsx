import { HugeiconsIcon } from "@hugeicons/react";
import { PauseIcon, PlayIcon } from "@hugeicons-pro/core-stroke-standard";
import type { BoardItem } from "../types";
import { setAutoplay, useAutoplay } from "./autoplayPref";
import { isVideoUrl } from "./io/isVideo";

/**
 * Whether clips on this canvas play by themselves.
 *
 * Only appears once there is a clip to play, for the same reason MaskControls
 * only appears once something is painted: a board of photographs has no use for
 * it, and a control that does nothing is worse than an absent one — it reads as
 * broken rather than as irrelevant.
 *
 * Beside the drawing tools rather than in the header, because it belongs to
 * looking at the board rather than to the board. The preference itself is not
 * board content at all — see autoplayPref for why it is not published.
 */

const hasClip = (items: readonly BoardItem[]): boolean =>
  items.some((item) => isVideoUrl(item.result?.url ?? item.imageUrl ?? null));

export function AutoplayToggle({ items }: { items: readonly BoardItem[] }) {
  const playing = useAutoplay();
  if (!hasClip(items)) {
    return null;
  }

  return (
    <button
      aria-pressed={playing}
      className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-board-ink/10 bg-board-surface/80 px-2 py-1.5 text-[11px] text-board-ink/70 backdrop-blur hover:text-board-ink"
      onClick={() => setAutoplay(!playing)}
      // Says what pressing it does, since the icon alone leaves you working
      // out whether it shows the state or the action.
      title={playing ? "Stop clips playing on their own" : "Let clips play"}
      type="button"
    >
      <HugeiconsIcon
        aria-hidden
        icon={playing ? PauseIcon : PlayIcon}
        size={12}
      />
      {playing ? "Playing" : "Paused"}
    </button>
  );
}
