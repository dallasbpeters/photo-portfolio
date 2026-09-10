import { useEffect, useState } from "react";
import { bridgeAppName } from "../io/affinity";

/**
 * What to call the desktop editor in a label, or a name-free fallback.
 *
 * The bridge decides which editor it opens — see VECTOR_APP in
 * scripts/affinity-bridge.mjs — so the browser cannot know it without asking.
 * Hardcoding "Affinity" is wrong the moment somebody points the bridge at Boxy
 * SVG or Inkscape, and wrong in the way that is hard to spot: the button still
 * works, it just names the wrong program.
 *
 * The fallback names no app rather than guessing one. "Open in your editor" is
 * vague and true; "Open in Affinity" in front of somebody running Boxy is
 * neither.
 *
 * Cached in the io layer, so a hundred context menus ask once.
 */
export const FALLBACK_EDITOR = "your editor";

/** Trailing slashes, which is how a shell completes a directory. */
const TRAILING_SLASHES = /\/+$/;
/** The macOS bundle suffix, which is not part of what the app is called. */
const APP_SUFFIX = /\.app$/i;

/**
 * The bridge's setting, as something to put on a button.
 *
 * VECTOR_APP is often a full path rather than a name — that is the documented
 * answer when two installs answer to the same name, which is exactly the
 * situation a Mac App Store editor and its own PWA create. "Open in
 * /Applications/Boxy SVG.app" is a true label and a bad one, so the directory
 * and the .app go, and what is left is what the app is called.
 */
export const editorLabel = (raw: string | null | undefined): string => {
  const value = raw?.trim().replace(TRAILING_SLASHES, "") ?? "";
  if (!value) {
    return FALLBACK_EDITOR;
  }
  if (!value.includes("/")) {
    // A bare name, which is what `open -a` takes and what most people set.
    return value;
  }
  /*
   * A path, which is only a label if it actually names an app. "/Applications"
   * is a plausible typo and "Open in Applications" is the kind of wrong that
   * reads as deliberate, so a path that is not a bundle names nothing instead.
   */
  const base = value.split("/").at(-1) ?? "";
  const name = base.replace(APP_SUFFIX, "").trim();
  return base.toLowerCase().endsWith(".app") && name ? name : FALLBACK_EDITOR;
};

export const useVectorEditorName = (): string => {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void bridgeAppName().then((found) => {
      if (alive) {
        setName(found);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return editorLabel(name);
};
