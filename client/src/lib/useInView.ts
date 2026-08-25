import { useEffect, useRef, useState } from "react";

/**
 * IntersectionObserver's `threshold` is a fraction OF THE OBSERVED ELEMENT.
 * An element taller than the viewport can never exceed
 * `viewportHeight / elementHeight`, so any threshold above that ceiling means
 * the callback never fires and whatever it was gating stays hidden forever.
 *
 * Clamp the requested threshold to half of what is reachable. For an element
 * short enough to satisfy the caller's threshold this is a no-op.
 */
export function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let observer: IntersectionObserver | null = null;
    let applied = -1;

    const observe = () => {
      const h = element.getBoundingClientRect().height;
      const vh = window.innerHeight;
      const reachable = h && vh ? (vh / h) * 0.5 : threshold;
      const effective = Math.min(threshold, Math.max(0.01, reachable));
      if (Math.abs(effective - applied) < 0.005) return;
      applied = effective;

      observer?.disconnect();
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer?.disconnect();
            observer = null;
          }
        },
        { threshold: effective },
      );
      observer.observe(element);
    };

    observe();

    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (observer) observe();
          });
    ro?.observe(element);
    const onResize = () => {
      if (observer) observe();
    };
    window.addEventListener("resize", onResize);

    return () => {
      observer?.disconnect();
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [threshold]);

  return { ref, isVisible };
}
