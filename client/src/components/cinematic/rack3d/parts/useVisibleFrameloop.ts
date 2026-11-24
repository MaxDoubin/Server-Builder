import { useEffect, useState } from "react";

/**
 * Stops the render loop while nobody can see the canvas.
 *
 * The rack scene is pinned for four screens and then scrolls away, but its
 * loop kept drawing every frame for the rest of the visit: a full scene
 * render behind whatever the visitor was actually reading. This parks the
 * loop when the canvas leaves the viewport or the tab is hidden, and
 * starts it again the moment either comes back.
 *
 * It returns the value for the Canvas `frameloop` prop instead of calling
 * `setFrameloop` from inside the scene, because the Canvas re-applies its
 * own prop every time it re-renders (which it does on scroll, to re-measure
 * itself), and that would quietly switch the loop back on.
 *
 * Usage: `const [canvasRef, frameloop] = useVisibleFrameloop();` and pass
 * both to the Canvas.
 */
export function useVisibleFrameloop(): [(el: HTMLCanvasElement | null) => void, "always" | "never"] {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!canvas) return;
    let onScreen = true;
    const apply = () => setVisible(onScreen && !document.hidden);

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      apply();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", apply);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", apply);
    };
  }, [canvas]);

  return [setCanvas, visible ? "always" : "never"];
}
