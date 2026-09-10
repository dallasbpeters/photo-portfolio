import { describe, expect, it } from "vitest";
import { editorLabel, FALLBACK_EDITOR } from "./useVectorEditorName";

/**
 * The bridge's setting, turned into something that reads on a button.
 *
 * VECTOR_APP is a path as often as it is a name — that is the documented fix
 * for two installs sharing one name — and a path on a button is a bug nobody
 * files.
 */
describe("editorLabel", () => {
  it("keeps a plain app name", () => {
    expect(editorLabel("Affinity")).toBe("Affinity");
    expect(editorLabel("Inkscape")).toBe("Inkscape");
  });

  it("reduces a full path to the app's name", () => {
    expect(editorLabel("/Applications/Boxy SVG.app")).toBe("Boxy SVG");
  });

  it("copes with a trailing slash, which is how a shell completes a path", () => {
    expect(editorLabel("/Applications/Boxy SVG.app/")).toBe("Boxy SVG");
  });

  it("names no app rather than guessing one", () => {
    // Guessing "Affinity" in front of somebody running Boxy is worse than
    // being vague: the button works, so nothing tells them the label lied.
    for (const empty of [null, undefined, "", "   ", "/Applications/"]) {
      expect(editorLabel(empty)).toBe(FALLBACK_EDITOR);
    }
  });
});
