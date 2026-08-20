import { useEffect } from "react";
import { isTyping } from "./isTyping";

/**
 * Delete and Backspace remove whatever is selected.
 *
 * The board had no keyboard deletion at all: the only way to remove anything
 * was the cross on its hover chrome, one item at a time, which for a selection
 * of twenty is twenty trips. Every canvas tool binds this key and it is the
 * first one anybody tries.
 *
 * Both keys, because which one deletes is a platform habit rather than a
 * decision — Backspace on a Mac keyboard with no Delete key, Delete on a full
 * one — and binding only one makes the board feel broken to half its users.
 *
 * Guarded by isTyping, which matters more here than anywhere else on the board.
 * A caret in a prompt field must delete a character; deleting the node the
 * prompt was being written on instead would destroy work that has never been
 * saved, and there is no undo for a keystroke somebody did not mean to aim at
 * the canvas.
 */
export const useDeleteKey = (remove: () => void, enabled = true): void => {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const down = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") {
        return;
      }
      if (isTyping(e.target)) {
        return;
      }
      // Backspace is "go back" in a browser that still honours it, and losing
      // the board mid-edit to a stray keypress is not a recoverable mistake.
      e.preventDefault();
      remove();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [enabled, remove]);
};
