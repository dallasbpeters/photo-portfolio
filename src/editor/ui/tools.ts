import {
  ColorFilter,
  Crop,
  Download,
  Eye,
  MediaImage,
  Palette,
  SunLight,
} from "iconoir-react";
import type { AdjustmentGroupId } from "../adjustments";

/** Panels in the left rail. Adjustment groups share their id with the group. */
export type ToolId = AdjustmentGroupId | "looks" | "export";

export type Tool = {
  id: ToolId;
  label: string;
  Icon: typeof SunLight;
};

/** Ordered the way a photographer works: look, then light, then finish. */
export const TOOLS: Tool[] = [
  { Icon: ColorFilter, id: "looks", label: "Looks" },
  { Icon: SunLight, id: "tone", label: "Light" },
  { Icon: Palette, id: "color", label: "Colour" },
  { Icon: Crop, id: "presence", label: "Detail" },
  { Icon: MediaImage, id: "film", label: "Film" },
  { Icon: Eye, id: "finishing", label: "Finish" },
  { Icon: Download, id: "export", label: "Export" },
];
