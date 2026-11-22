import { useEffect, useState, type RefObject } from "react";

/**
 * Whether anybody can currently see the canvas: it is in the viewport and
 * the tab is showing.
 *
 * The rack scene is pinned for four screens at the top of a long page. Once
 * a visitor scrolls past it the canvas is off screen for the rest of the
 * visit, and an always-on loop would keep shading it every frame. The scene
 * feeds this into the Canvas `frameloop` prop to park the loop meanwhile.
 *
 * It has to be the prop. Calling the store's setFrameloop from inside the
 * canvas does not stick: Canvas re-measures itself on scroll and re-applies
 * its props, which silently switches the loop back on.
 */
export function useCanvasVisible(canvasRef: RefObject<HTMLCanvasElement>): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let onScreen = true;

    const apply = () => setVisible(onScreen && document.visibilityState === "visible");

    const observer = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      apply();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", apply);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", apply);
    };
  }, [canvasRef]);

  return visible;
}
