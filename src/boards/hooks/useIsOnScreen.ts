import { type RefObject, useEffect, useState } from "react";

/**
 * Whether an element is currently within view.
 *
 * Exists for the shader items. Each mounted shader runs its own WebGL context
 * and animates on a frame loop forever — the library's root component has no
 * `paused` prop, so the only way to stop one is to unmount it. On a board with
 * several shaders that means several GPU render loops running whether or not
 * anything is on screen, which costs the same when the board is scrolled a
 * thousand units away as when you are looking at it.
 *
 * Starts true so a shader that is visible on first paint renders immediately,
 * rather than flashing a placeholder for the one frame before the observer
 * reports in.
 */
export const useIsOnScreen = (
  ref: RefObject<Element | null>,
  /** Margin around the viewport, so a shader is warm before it scrolls in. */
  rootMargin = "200px"
): boolean => {
  const [isOnScreen, setIsOnScreen] = useState(true);

  useEffect(() => {
    const el = ref.current;
    // No observer means no way to tell, and the honest fallback is to render:
    // a blank shader is a worse failure than one that costs too much.
    if (!(el && typeof IntersectionObserver === "function")) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setIsOnScreen(entry.isIntersecting);
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return isOnScreen;
};
