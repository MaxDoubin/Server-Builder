import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/**
 * Stops the render loop while nobody can see the canvas.
 *
 * The rack scene is pinned for four screens and then scrolls away, but its
 * loop kept drawing every frame for the rest of the visit: a full scene
 * render behind whatever the visitor was actually reading. This parks the
 * loop when the canvas leaves the viewport or the tab is hidden, and
 * starts it again the moment either comes back.
 *
 * Renders nothing; mount it once inside the Canvas.
 */
export function PauseWhenHidden() {
  const canvas = useThree((s) => s.gl.domElement);
  const setFrameloop = useThree((s) => s.setFrameloop);

  useEffect(() => {
    let onScreen = true;
    const apply = () => setFrameloop(onScreen && !document.hidden ? "always" : "never");

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      apply();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", apply);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", apply);
      setFrameloop("always");
    };
  }, [canvas, setFrameloop]);

  return null;
}
