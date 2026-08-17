import { useState } from "react";
import { ModelSetting } from "./SettingField";
import type { Tool } from "./tools/types";

/**
 * The words a prompt-needing tool is run with, collected as it is picked.
 *
 * The gap this closes: `blockedReason` refuses `edit-image` and
 * `generate-image` unless the item already carries words — an op node's typed
 * `config.prompt`, or a note's body — and until this existed there was nowhere
 * to put any. Every AI tool was therefore unreachable on a plain photograph,
 * which is most of what a board is made of.
 *
 * A step in the picking, rather than a panel of its own. The tool is chosen,
 * then the words are typed, then it runs: one gesture, dismissed as a unit, and
 * the same component whether the picking started in the right-click menu or on
 * the item's own bar. Nothing here runs anything — `onSubmit` hands the words
 * back and the surface composes the invocation, exactly as `ToolPicker.onPick`
 * does with the tool.
 *
 * ## The words are not written onto the item
 *
 * Deliberately. `config.prompt` on an op node is that node's own setting and is
 * what a graph run will send; overwriting it because someone typed a one-off
 * "make it warmer" here would edit the board as a side effect of using a tool.
 * The words live for the length of the run and no longer, which is why the
 * field is pre-filled from the item rather than bound to it.
 */

/**
 * The tool's own `prompt` setting, when it declares one.
 *
 * The registry already says what the field should say and how long it may be —
 * "Describe the image…" on Generate, "What should be there instead?" on
 * Replace — so this reads it from there rather than restating it. A tool that
 * needs a prompt but declares no setting still gets a usable field.
 */
const promptSetting = (tool: Tool) =>
  tool.settings.find(
    (setting) => setting.key === "prompt" && setting.kind === "text"
  );

export interface ToolPromptProps {
  /** The words the item already carries. Pre-filled, and free to be typed over. */
  defaultValue?: string | null;
  onCancel: () => void;
  /** Never called with a blank string: an empty field cannot be submitted. */
  /**
   * The words, and the settings collected alongside them.
   *
   * The model is the only one so far, and it is here rather than on the item
   * because a one-off choice of endpoint is part of this run, not an edit to
   * the board — the same reasoning the prompt itself follows.
   */
  onSubmit: (prompt: string, config: Record<string, unknown>) => void;
  tool: Tool;
}

export function ToolPrompt({
  defaultValue,
  onCancel,
  onSubmit,
  tool,
}: ToolPromptProps) {
  const [value, setValue] = useState(defaultValue ?? "");
  /** "auto" keeps the endpoint's own choice, which is what it did before. */
  const [model, setModel] = useState("auto");
  const setting = promptSetting(tool);
  // Trimmed here and not only at the runner, because this is what decides
  // whether the button is live — a field holding three spaces must read as
  // empty to the person looking at it, not merely to the executor.
  const words = value.trim();
  const modelSetting = tool.settings.find((s) => s.kind === "model");

  const submit = () => {
    if (words) {
      onSubmit(words, model ? { model } : {});
    }
  };

  return (
    <div className="px-3 pt-2.5 pb-2.5">
      <span className="mb-1 block text-[9px] text-board-ink/35 uppercase tracking-[0.18em]">
        {tool.label}
      </span>
      <textarea
        // Autofocused: the field is opened by an explicit pick, and typing is
        // the only reason it appeared.
        aria-label={`Prompt for ${tool.label}`}
        autoFocus
        className="w-full resize-none rounded border border-board-ink/15 bg-board-surface/40 px-2 py-1.5 text-[12px] text-board-ink outline-none placeholder:text-board-ink/35 focus:border-board-ink/45"
        maxLength={setting?.kind === "text" ? setting.maxLength : undefined}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          // Enter runs, Shift+Enter breaks the line. A prompt is usually one
          // sentence, so the common case is the one keystroke.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder={
          setting?.kind === "text"
            ? setting.placeholder
            : "Describe what you want…"
        }
        rows={3}
        value={value}
      />
      {modelSetting ? (
        <div className="mt-2">
          <ModelSetting
            onChange={setModel}
            setting={modelSetting}
            value={model}
          />
        </div>
      ) : null}
      <p className="mt-1.5 text-[10px] text-board-ink/40 leading-relaxed">
        {tool.description}
      </p>
      <div className="mt-2 flex justify-end gap-1.5">
        <button
          className="rounded px-2 py-1 text-[11px] text-board-ink/50 hover:text-board-ink"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        {/* Disabled rather than hidden, and refusing again inside `submit`:
            the empty case is the whole reason this step exists, and a run
            started without words costs money and produces nothing. */}
        <button
          className="rounded bg-board-ink/15 px-2.5 py-1 text-[11px] text-board-ink hover:bg-board-ink/25 disabled:opacity-40"
          disabled={words.length === 0}
          onClick={submit}
          type="button"
        >
          Run {tool.label}
        </button>
      </div>
    </div>
  );
}
