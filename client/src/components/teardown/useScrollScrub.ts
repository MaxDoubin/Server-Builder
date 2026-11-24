import { useEffect } from "react";

/**
 * How much page has to go by to take the teardown from closed to fully
 * open, as a share of the viewport height. Three quarters of a screen is
 * about the distance the viewer stays pinned for on a desktop, and about as
 * long as the canvas stays in view on a phone.
 */
const TRACK_VIEWPORTS = 0.75;

/**
 * Let the page's own scrolling scrub the teardown.
 *
 * It nudges the progress by how far the page moved rather than pinning the
 * progress to a scroll position. The slider and the play button own the
 * same value, and a mapping from position would snatch it back to wherever
 * the page happened to be the moment the reader touched the wheel. Adding a
 * delta means all three controls can be used in any order: scroll down and
 * the machine opens further from wherever it was, scroll back and it closes
 * again.
 *
 * Only while the model is mostly on screen, so reading the notes further
 * down the page does not take apart a machine nobody is looking at.
 */
export function useScrollScrub(
  targetRef: React.RefObject<HTMLElement>,
  enabled: boolean,
  nudge: (delta: number) => void,
): void {
  useEffect(() => {
    const el = targetRef.current;
    if (!enabled || !el || typeof IntersectionObserver === "undefined") return;

    let engaged = false;
    let lastY = window.scrollY;
    const io = new IntersectionObserver(
      ([entry]) => {
        engaged = entry.intersectionRatio >= 0.5;
        // Scrolling done while the model was out of sight does not count.
        lastY = window.scrollY;
      },
      { threshold: 0.5 },
    );
    io.observe(el);

    const onScroll = () => {
      const y = window.scrollY;
      const moved = y - lastY;
      lastY = y;
      if (engaged && moved !== 0) nudge(moved / (window.innerHeight * TRACK_VIEWPORTS));
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [targetRef, enabled, nudge]);
}
