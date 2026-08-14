import { useEffect, useState } from "react";
import "./CustomCursor.css";

interface CustomCursorProps {
  cursorColor?: string;
  userName: string;
}

/**
 * A named pointer, in the shape collaborative tools use.
 *
 * The native cursor is hidden only once this one is on screen, so there is
 * never a moment with no pointer at all.
 */
export const CustomCursor: React.FC<CustomCursorProps> = ({
  userName,
  cursorColor = "#9100FF",
}) => {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // A coarse pointer has nothing to replace — a finger leaves no cursor — and
    // hiding the native one there would be meaningless.
    if (!window.matchMedia("(pointer: fine)").matches) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      // Functional form so this effect does not depend on isVisible and
      // re-subscribe on the first move of every session.
      setIsVisible(true);
    };
    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener("mousemove", handleMouseMove);
    document.body.addEventListener("mouseleave", handleMouseLeave);
    document.body.addEventListener("mouseenter", handleMouseEnter);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.body.removeEventListener("mouseleave", handleMouseLeave);
      document.body.removeEventListener("mouseenter", handleMouseEnter);
    };
  }, []);

  // Tied to visibility rather than to mounting, and always removed on unmount,
  // so leaving the board cannot strand the page without a pointer.
  useEffect(() => {
    document.body.classList.toggle("custom-cursor-active", isVisible);
    return () => document.body.classList.remove("custom-cursor-active");
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="custom-cursor-container"
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      }}
    >
      <svg
        className="custom-cursor-pointer"
        fill={cursorColor}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>{`${userName}'s pointer`}</title>
        {/* The previous path began with a relative move to y = -20.6, which put
            the whole arrow above the 0 0 24 24 viewBox and off screen. This one
            is drawn from the tip at the origin corner, entirely inside it. */}
        <path d="M5.5 3.2v17.6c0 .45.54.67.85.35l4.3-4.3a.5.5 0 0 1 .36-.15h6.08a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.35Z" />
      </svg>

      <div
        className="custom-cursor-label"
        style={{ backgroundColor: cursorColor }}
      >
        {userName}
      </div>
    </div>
  );
};
