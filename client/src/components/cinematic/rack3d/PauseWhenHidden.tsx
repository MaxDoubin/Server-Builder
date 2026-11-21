import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/**
 * Stops the render loop while nobody can see the canvas.
 *
 * The rack scene is pinned for four screens at the top of a long page. Once
 * a visitor scrolls past it the canvas is off screen for the rest of the
 * visit, and an always-on loop would keep shading it every frame. Mounted
 * inside a Canvas, this parks the loop when the canvas leaves the viewport
 * or the tab is hidden, and restarts it when both are true again.
 */
export function PauseWhenHidden() {
  const canvas = useThree((s) => s.gl.domElement);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    let onScreen = true;

    const apply = () => {
      const run = onScreen && document.visibilityState === "visible";
      setFrameloop(run ? "always" : "never");
      // "always" only takes effect once something asks for a frame.
      if (run) invalidate();
    };

    const observer = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      apply();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", apply);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", apply);
      setFrameloop("always");
    };
  }, [canvas, setFrameloop, invalidate]);

  return null;
}
