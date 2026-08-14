import type { IconSvgElement } from "@hugeicons/react";
import {
  ColorsIcon,
  CropIcon,
  Download01Icon,
  EyeIcon,
  Image01Icon,
  PaintBoardIcon,
  RotateRight01Icon,
  Sun01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import type { AdjustmentGroupId } from "../adjustments";

/** Panels in the left rail. Adjustment groups share their id with the group. */
export type ToolId = AdjustmentGroupId | "crop" | "looks" | "export";

export interface Tool {
  /** Drawing data for HugeiconsIcon, not a component. */
  Icon: IconSvgElement;
  id: ToolId;
  label: string;
}

/** Ordered the way a photographer works: look, then light, then finish. */
export const TOOLS: Tool[] = [
  { Icon: ColorsIcon, id: "looks", label: "Looks" },
  { Icon: Sun01Icon, id: "tone", label: "Light" },
  { Icon: PaintBoardIcon, id: "color", label: "Color" },
  { Icon: CropIcon, id: "presence", label: "Detail" },
  { Icon: Image01Icon, id: "film", label: "Film" },
  { Icon: EyeIcon, id: "finishing", label: "Finish" },
  { Icon: RotateRight01Icon, id: "crop", label: "Crop & Rotate" },
  { Icon: Download01Icon, id: "export", label: "Export" },
];
