import { Xmark } from "iconoir-react";
import { type Tool, TOOLS, type ToolId } from "./tools";

type EditorRailProps = {
  active: ToolId;
  onSelect: (id: ToolId) => void;
  onClose: () => void;
};

/** Left rail: close, then one icon per panel. */
export function EditorRail({ active, onSelect, onClose }: EditorRailProps) {
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-white/[0.07] border-r py-4">
      <button
        aria-label="Close editor"
        className="mb-4 flex size-9 items-center justify-center text-white/35 transition-colors hover:text-white"
        onClick={onClose}
        type="button"
      >
        <Xmark height={16} width={16} />
      </button>

      {TOOLS.map((tool: Tool) => (
        <button
          aria-label={tool.label}
          aria-pressed={active === tool.id}
          className={`relative flex size-9 items-center justify-center transition-colors duration-200 ${
            active === tool.id
              ? "text-white"
              : "text-white/30 hover:text-white/60"
          }`}
          key={tool.id}
          onClick={() => onSelect(tool.id)}
          title={tool.label}
          type="button"
        >
          {active === tool.id ? (
            <span aria-hidden className="absolute left-0 h-4 w-px bg-white" />
          ) : null}
          <tool.Icon height={16} width={16} />
        </button>
      ))}
    </nav>
  );
}
