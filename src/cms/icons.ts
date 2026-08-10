/**
 * The icons offered in the page editor.
 *
 * A curated set rather than the full 1,600-icon pack: the field used to be free
 * text, which meant knowing an exact icon-pack export name. Every entry here
 * has an entry in ./iconMap.ts, so a chosen icon always renders.
 *
 * Grouped so the picker can show headings instead of one undifferentiated wall.
 */
export interface IconGroup {
  icons: string[];
  label: string;
}

export const ICON_GROUPS: IconGroup[] = [
  {
    icons: [
      "Camera",
      "MediaImage",
      "MediaImagePlus",
      "Frame",
      "Crop",
      "Palette",
      "ColorFilter",
      "VideoCamera",
      "Printer",
      "Sparks",
    ],
    label: "Photography",
  },
  {
    icons: [
      "InfoCircle",
      "Book",
      "BookStack",
      "Page",
      "Journal",
      "Notes",
      "Edit",
      "DesignNib",
      "QuestionMark",
      "Language",
    ],
    label: "Pages",
  },
  {
    icons: [
      "Mail",
      "Send",
      "Phone",
      "ChatBubble",
      "User",
      "Group",
      "Community",
      "Megaphone",
    ],
    label: "Contact",
  },
  {
    icons: [
      "Shop",
      "Cart",
      "Package",
      "CreditCard",
      "Wallet",
      "Gift",
      "Trophy",
      "Medal",
    ],
    label: "Commerce",
  },
  {
    icons: [
      "MapPin",
      "Globe",
      "Compass",
      "Airplane",
      "Car",
      "Home",
      "Building",
      "Suitcase",
      "Bicycle",
    ],
    label: "Places",
  },
  {
    icons: [
      "Leaf",
      "Tree",
      "Flower",
      "SunLight",
      "HalfMoon",
      "Cloud",
      "Snow",
      "Flash",
    ],
    label: "Nature",
  },
  {
    icons: [
      "Star",
      "Heart",
      "Bookmark",
      "Calendar",
      "Clock",
      "Link",
      "Search",
      "Eye",
      "Lock",
      "Key",
      "Shield",
      "Rocket",
      "Puzzle",
      "GraduationCap",
      "Microphone",
      "Headset",
      "Cutlery",
      "Running",
    ],
    label: "Other",
  },
];

/** Flat list, for validating a stored value. */
export const ICON_NAMES: string[] = ICON_GROUPS.flatMap((g) => g.icons);

export const isKnownIcon = (name: string | null | undefined): boolean =>
  typeof name === "string" && ICON_NAMES.includes(name);
