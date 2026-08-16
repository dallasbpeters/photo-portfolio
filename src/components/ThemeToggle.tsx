import { HugeiconsIcon } from "@hugeicons/react";
import {
  ComputerIcon,
  Moon02Icon,
  Sun02Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useState } from "react";
import {
  applyTheme,
  nextTheme,
  SYSTEM_QUERY,
  storedTheme,
  THEME_KEY,
  type ThemeChoice,
} from "../theme/theme";
import { Button } from "./ui/button";

const LABEL: Record<ThemeChoice, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

const ICON: Record<ThemeChoice, typeof Sun02Icon> = {
  dark: Moon02Icon,
  light: Sun02Icon,
  system: ComputerIcon,
};

/**
 * Light, dark, or whatever the machine is set to.
 *
 * One cycling button rather than three segments: it sits in a row of single
 * controls, and the state it is in is the state it shows. What it says is where
 * you are, not where pressing it will take you — which is why the label it
 * announces to a screen reader says both.
 */
export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(storedTheme);
  const next = nextTheme(choice);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, choice);
    applyTheme(choice);
    // Subscribed whatever the choice is and acting only on "system": the
    // listener costs nothing, and following the machine means following it as
    // it changes rather than only at the moment the page loaded.
    const media = window.matchMedia(SYSTEM_QUERY);
    const follow = () => {
      if (choice === "system") {
        applyTheme("system");
      }
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [choice]);

  return (
    <Button
      aria-label={`Theme: ${LABEL[choice]}. Switch to ${LABEL[next]}.`}
      onClick={() => setChoice(next)}
      type="button"
      variant="ghost"
    >
      <HugeiconsIcon aria-hidden icon={ICON[choice]} size={16} />
      {LABEL[choice]}
    </Button>
  );
}
