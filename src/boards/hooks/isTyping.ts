/**
 * Whether a keystroke belongs to something being typed into.
 *
 * Shared because every global shortcut on the board needs the same answer and
 * getting it wrong is destructive in proportion to what the shortcut does.
 * Space is a character before it is a modifier, and arming a pan mid-sentence
 * eats it. Delete is far worse: pressing it while a caret sits in a prompt must
 * remove a character, never the node the prompt is written on.
 */
export const isTyping = (target: EventTarget | null): boolean => {
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
