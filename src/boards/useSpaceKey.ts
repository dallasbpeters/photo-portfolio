import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Whether space is being held, for the pan-versus-select gesture.
 *
 * Space pans and a plain drag sweeps a selection box, which is the convention
 * every canvas tool shares. It was the other way round here — the plain drag
 * panned, and selecting several needed shift — and swapping them is what this
 * exists for.
 *
 * Both a ref and a state value, deliberately. A pointerdown handler needs the
 * answer without re-subscribing on every keypress, and the cursor needs a
 * render to change from grab to arrow; one value cannot do both without either
 * a stale read or a re-render per key event.
 */

/**
 * Whether a keystroke belongs to something being typed into.
 *
 * Space is a character before it is a modifier. Arming a pan while someone is
 * typing a prompt, naming an element, or editing a text node would eat the
 * space out of their sentence — and `preventDefault` on the keydown, which the
 * page needs to stop space scrolling, is what would eat it.
 */
const isTyping = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
};

export interface SpaceKey {
  /** Rendered, so the cursor can say the canvas is about to be dragged. */
  held: boolean;
  /** Read inside pointer handlers, where a re-render is not wanted. */
  readonly heldRef: { readonly current: boolean };
}

export const useSpaceKey = (): SpaceKey => {
  const heldRef: RefObject<boolean> = useRef(false);
  const [held, setHeld] = useState(false);

  const set = useCallback((next: boolean) => {
    heldRef.current = next;
    setHeld(next);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target)) {
        return;
      }
      // Space scrolls the page by default, and a canvas that jumps a screenful
      // when you reach for the pan is worse than no pan at all.
      e.preventDefault();
      // Guarded: a held key repeats, and setting state on every repeat would
      // re-render the canvas at the keyboard's repeat rate.
      if (!heldRef.current) {
        set(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        set(false);
      }
    };
    // A window that loses focus mid-drag never sees the keyup — alt-tabbing
    // away with space held would otherwise leave the canvas stuck in pan mode
    // with no way back except pressing and releasing space again.
    const release = () => set(false);

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
    };
  }, [set]);

  return { held, heldRef };
};
