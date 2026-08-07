/**
 * The icons offered in the page editor.
 *
 * A curated set rather than the full 1,600-icon pack: the field used to be free
 * text, which meant knowing an exact Iconoir export name. Every entry here is
 * verified to exist in iconoir-react, so a chosen icon always renders.
 *
 * Grouped so the picker can show headings instead of one undifferentiated wall.
 */
export type IconGroup = {
  label: string;
  icons: string[];
};

export const ICON_GROUPS: IconGroup[] = [
  {
    label: 'Photography',
    icons: [
      'Camera',
      'MediaImage',
      'MediaImagePlus',
      'Frame',
      'Crop',
      'Palette',
      'ColorFilter',
      'VideoCamera',
      'Printer',
      'Sparks',
    ],
  },
  {
    label: 'Pages',
    icons: [
      'InfoCircle',
      'Book',
      'BookStack',
      'Page',
      'Journal',
      'Notes',
      'Edit',
      'DesignNib',
      'QuestionMark',
      'Language',
    ],
  },
  {
    label: 'Contact',
    icons: ['Mail', 'Send', 'Phone', 'ChatBubble', 'User', 'Group', 'Community', 'Megaphone'],
  },
  {
    label: 'Commerce',
    icons: ['Shop', 'Cart', 'Package', 'CreditCard', 'Wallet', 'Gift', 'Trophy', 'Medal'],
  },
  {
    label: 'Places',
    icons: ['MapPin', 'Globe', 'Compass', 'Airplane', 'Car', 'Home', 'Building', 'Suitcase', 'Bicycle'],
  },
  {
    label: 'Nature',
    icons: ['Leaf', 'Tree', 'Flower', 'SunLight', 'HalfMoon', 'Cloud', 'Snow', 'Flash'],
  },
  {
    label: 'Other',
    icons: [
      'Star',
      'Heart',
      'Bookmark',
      'Calendar',
      'Clock',
      'Link',
      'Search',
      'Eye',
      'Lock',
      'Key',
      'Shield',
      'Rocket',
      'Puzzle',
      'GraduationCap',
      'Microphone',
      'Headset',
      'Cutlery',
      'Running',
    ],
  },
];

/** Flat list, for validating a stored value. */
export const ICON_NAMES: string[] = ICON_GROUPS.flatMap((g) => g.icons);

export const isKnownIcon = (name: string | null | undefined): boolean =>
  typeof name === 'string' && ICON_NAMES.includes(name);
