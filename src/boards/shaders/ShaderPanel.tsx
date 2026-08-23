import { HugeiconsIcon } from "@hugeicons/react";
import {
  Download01Icon,
  FileExportIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { useState } from "react";
import { nodeTypeFor } from "../../../config/nodeTypes.js";
import type { BoardItem } from "../../types";
import { SettingField } from "../nodes/SettingField";
import { ShaderControls } from "./ShaderControls";
import { isShaderConfig, type ShaderConfig } from "./shaderConfig";
import "../boardChrome.css";
import "./ShaderPanel.css";

/**
 * The settings for the selected shader, beside it rather than on it.
 *
 * They used to render inside the item, pinned to the bottom and up to 85% of
 * its height — so adjusting a shader meant covering the shader. MaskControls
 * already made the argument for the mask brush and it is the same one here:
 * chrome on top of the very thing being judged.
 *
 * Sits with the other selection-owned tools in the board's overlay stack, so it
 * appears when a shader is selected and goes away when it is not.
 *
 * Export lives here too, and this is the first place it could. A shader is
 * drawn live and has never been a file; the settings panel is where someone
 * decides they are happy with one, which is exactly when they want to keep it.
 */

export interface ShaderPanelProps {
  /** The picture wired in, so an effect fed by one stops calling itself empty. */
  imageUrl?: string | null;
  onConfigChange: (itemId: string, config: Record<string, unknown>) => void;
  /** Renders it and saves it to the machine, without touching the board. */
  onDownload?: (item: BoardItem) => Promise<void>;
  /** Renders the stack to a file and puts it on the board. */
  onExport: (item: BoardItem) => Promise<void>;
  selected: BoardItem | null;
}

export function ShaderPanel({
  imageUrl,
  onConfigChange,
  onDownload,
  onExport,
  selected,
}: ShaderPanelProps) {
  const [saving, setSaving] = useState(false);

  /* The halftone node comes here too. It is not a shader item, but it has the
     same problem — far more visual controls than fit on the thing they change —
     and so the same answer. */
  const isHalftone =
    selected?.kind === "op" && selected.nodeType === "standard";
  const nodeType = isHalftone ? nodeTypeFor(selected?.nodeType) : null;

  if (!selected || (selected.kind !== "shader" && !isHalftone)) {
    return null;
  }
  const config: ShaderConfig = isShaderConfig(selected.config)
    ? selected.config
    : { layers: [] };

  return (
    <div className="panel-surface shader-panel">
      <div className="panel-header">
        <span className="shader-panel__title">
          {isHalftone ? "Halftone" : "Shader"}
        </span>
        <span className="shader-panel__actions">
          {/* Two destinations, because they are different jobs. Export puts the
              picture on the board so the rest of the graph can wire out of it;
              Save puts it on the machine, which is what you want when the board
              is not where it is going next. */}
          {onDownload ? (
            <button
              className="shader-panel__action"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onDownload(selected);
                } finally {
                  setSaving(false);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              <HugeiconsIcon icon={Download01Icon} size={13} />
              Save
            </button>
          ) : null}
          <button
            className="shader-panel__action"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onExport(selected);
              } finally {
                setSaving(false);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <HugeiconsIcon icon={FileExportIcon} size={13} />
            {saving ? "Rendering…" : "Export"}
          </button>
        </span>
      </div>
      {/* overscroll-contain so reaching the end of the settings does not hand
          the wheel back to the canvas and start zooming mid-scroll. */}
      <div className="shader-panel__body">
        {isHalftone && nodeType
          ? nodeType.settings.map((setting) => (
              <SettingField
                key={setting.key}
                onChange={(value) =>
                  onConfigChange(selected.id, {
                    ...(selected.config ?? {}),
                    [setting.key]: value,
                  })
                }
                readOnly={false}
                setting={setting}
                // Absent stays absent: a key the node has never carried is
                // undefined so the field can show the declared default, while
                // "" is a field somebody has just cleared and is typing into.
                value={
                  selected.config?.[setting.key] === undefined
                    ? undefined
                    : String(selected.config[setting.key])
                }
              />
            ))
          : null}
        {isHalftone ? null : (
          <ShaderControls
            config={config}
            imageUrl={imageUrl}
            onChange={(next) =>
              onConfigChange(
                selected.id,
                next as unknown as Record<string, unknown>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
