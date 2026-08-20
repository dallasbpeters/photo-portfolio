import { useEffect, useState } from "react";
import { useSpaceKey } from "../../boards/hooks/useSpaceKey";
import "./CustomCursor.css";

interface CustomCursorProps {
  cursorColor?: string;
  userName: string;
}

/** The arrow. Drawn from its tip at the origin corner, entirely inside 24×24. */
const ARROW =
  "M5.5 3.2v17.6c0 .45.54.67.85.35l4.3-4.3a.5.5 0 0 1 .36-.15h6.08a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.35Z";

/** The open hand, on its own 1200×1200 grid rather than the arrow's 24×24. */
const GRAB =
  "m850 350c55.258 0 100 44.742 100 100 0 85.691-15.137 170.61-44.742 250.94l-49.719 134.88c-3.668 11.871-5.5391 24.285-5.5391 36.727v52.449c0 13.809-11.191 25-25 25h-400c-13.809 0-25-11.191-25-25v-52.301c0-7.1875-3.1367-14.105-8.5117-18.832l-147.73-129.23c-27.82-24.281-43.762-59.438-43.762-96.387v-0.25c0-70.707 57.293-128 128-128h22v-132.75c0-56.223 38.707-106.21 92.828-115.53 32.453-5.6289 64.012 2.9219 88.43 22.074 19.355-15.164 43.316-23.793 68.742-23.793 33.094 0 63.469 14.52 84.367 38.512 16.105-8.75 34.25-13.512 53.133-13.512 48.746 0 90.387 31.219 105.74 75.246 2.2422-0.16406 4.4961-0.24609 6.7617-0.24609zm-50 550v-27.449c0-17.441 2.6211-34.828 8.1914-52.742l50.152-136.15c27.562-74.793 41.656-153.86 41.656-233.66 0-27.645-22.355-50-50-50-5.5508 0-11.191 1.0977-17.117 3.293-15.473 5.7305-32.152-4.832-33.59-21.27-2.8086-32.23-29.5-57.023-61.793-57.023-15.859 0-30.766 6.082-42.398 16.934-12.207 11.383-31.93 7.8359-39.406-7.0859-10.652-21.273-31.918-34.848-55.695-34.848-19.297 0-37.102 9.0312-49.043 24.332-10.008 12.82-29.398 12.824-39.41 0.007813-14.324-18.344-36.633-27.441-60.207-23.352-29.258 5.0352-51.34 33.559-51.34 66.262v157.75c0 13.809-11.191 25-25 25h-47c-43.094 0-78 34.906-78 78v0.25c0 22.523 9.7109 43.941 26.66 58.734l147.8 129.29c16.203 14.254 25.539 34.848 25.539 56.422v27.301z";

/**
 * A named pointer, in the shape collaborative tools use.
 *
 * The native cursor is hidden only once this one is on screen, so there is
 * never a moment with no pointer at all.
 *
 * It also carries the board's pan affordance, which has nowhere else to live:
 * the canvas is `cursor-none`, so the `cursor-grab` class that used to say "a
 * drag here pans rather than selects" is gone. Space held swaps the arrow for a
 * hand, and pressing closes it — the two states of the gesture the key arms.
 *
 * That state is read from `window` here rather than passed in. Both ends
 * already know it, and threading it down from the canvas would be a prop three
 * components deep to say something this one can observe directly.
 */
export const CustomCursor: React.FC<CustomCursorProps> = ({
  userName,
  cursorColor = "#9100FF",
}) => {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [isVisible, setIsVisible] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const space = useSpaceKey();

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
    const handleDown = () => setIsPressed(true);
    // Released on window rather than on the canvas: a drag that ends over a
    // panel, or outside the board entirely, would otherwise leave the hand
    // closed around nothing until the next press.
    const handleUp = () => setIsPressed(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleDown);
    window.addEventListener("mouseup", handleUp);
    document.body.addEventListener("mouseleave", handleMouseLeave);
    document.body.addEventListener("mouseenter", handleMouseEnter);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("mouseup", handleUp);
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

  const grabbing = space.held && isPressed;

  return (
    <div
      className="custom-cursor-container"
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      }}
    >
      {space.held ? (
        <svg
          className="custom-cursor-grab"
          data-grabbing={grabbing ? "" : undefined}
          fill={cursorColor}
          viewBox="0 0 1200 1200"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>{`${userName}'s pointer, ready to pan`}</title>
          <path d={GRAB} fill={cursorColor} strokeWidth="5" />
        </svg>
      ) : (
        <svg
          className="custom-cursor-pointer"
          fill={cursorColor}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>{`${userName}'s pointer`}</title>
          <path d={ARROW} />
        </svg>
      )}

      {/* Dropped while panning: the hand is the whole message, and a name
          trailing a closed fist reads as something being dragged. */}
      {grabbing ? null : (
        <div
          className="custom-cursor-label"
          style={{ backgroundColor: cursorColor }}
        >
          {userName}
        </div>
      )}
    </div>
  );
};
