import { type RefObject, useEffect, useRef, useState } from "react";
import { isTyping } from "./isTyping";

/**
 * Whether a pan modifier is being held, for the pan-versus-select gesture.
 *
 * Space pans and a plain drag sweeps a selection box, which is the convention
 * every canvas tool shares. It was the other way round here — the plain drag
 * panned, and selecting several needed shift — and swapping them is what this
 * exists for.
 *
 * Shift and Control pan too, and not for symmetry: space is a two-handed key.
 * On a laptop, held on a sofa, one hand is on the trackpad and the other is
 * holding the machine up, and reaching a thumb to the space bar while dragging
 * is the specific thing that made moving around the board unpleasant. Shift
 * and Control sit under the little finger of the hand already on the trackpad.
 *
 * Both a ref and a state value, deliberately. A pointerdown handler needs the
 * answer without re-subscribing on every keypress, and the cursor needs a
 * render to change from grab to arrow; one value cannot do both without either
 * a stale read or a re-render per key event.
 */

/**
 * The keys that arm a pan.
 *
 * By `code`, so the physical key is what counts rather than what it produces:
 * `key` for Shift is "Shift" but reading a modifier's `key` is a trap the
 * moment a layout changes what a key types.
 */
const PAN_KEYS = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "Space",
]);

export interface PanModifier {
  /** Rendered, so the cursor can say the canvas is about to be dragged. */
  held: boolean;
  /** Read inside pointer handlers, where a re-render is not wanted. */
  readonly heldRef: { readonly current: boolean };
}

export const usePanModifier = (): PanModifier => {
  const heldRef: RefObject<boolean> = useRef(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    /**
     * Which pan keys are down, so releasing one of two does not end the pan.
     *
     * A set rather than a boolean because these keys overlap in ordinary use:
     * Shift is held to add to a selection, Control is half of a shortcut, and
     * letting go of one while still holding the other must not drop the board
     * mid-drag.
     */
    const down = new Set<string>();

    const sync = () => {
      const next = down.size > 0;
      if (next !== heldRef.current) {
        heldRef.current = next;
        setHeld(next);
      }
    };

    const onDown = (e: KeyboardEvent) => {
      if (!PAN_KEYS.has(e.code) || isTyping(e.target)) {
        return;
      }
      // Space scrolls the page by default, and a canvas that jumps a screenful
      // when you reach for the pan is worse than no pan at all. Shift and
      // Control have no default worth stopping, and preventing theirs would
      // take Shift+Tab and every Control shortcut with it.
      if (e.code === "Space") {
        e.preventDefault();
      }
      // A held key repeats; the set makes that idempotent, and sync only
      // renders when the answer actually changes.
      down.add(e.code);
      sync();
    };

    const onUp = (e: KeyboardEvent) => {
      down.delete(e.code);
      sync();
    };

    /*
     * Anything that could have eaten a keyup clears the lot.
     *
     * A modifier released while another window has focus never reports it, and
     * a set that has drifted leaves the board stuck in pan mode with no way
     * out but pressing and releasing the key again. Losing focus is the common
     * one — a native menu, a screenshot, cmd-tab.
     */
    const release = () => {
      down.clear();
      sync();
    };

    /*
     * Control-drag is a pan, not a right-click.
     *
     * macOS makes Control+click the secondary click, so arming a pan with
     * Control also fires contextmenu — the board would pan and open a menu
     * over itself at the same time. Owned here rather than by the canvas
     * because it is a consequence of *this* hook's choice of key: the canvas
     * did not ask for Control to mean two things.
     *
     * Only while a pan key is down, so an ordinary right-click is untouched.
     */
    const noMenuWhilePanning = (e: Event) => {
      if (down.size > 0) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    window.addEventListener("contextmenu", noMenuWhilePanning);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
      window.removeEventListener("contextmenu", noMenuWhilePanning);
    };
  }, []);

  return { held, heldRef };
};
