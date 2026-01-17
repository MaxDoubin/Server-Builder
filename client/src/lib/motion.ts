import { useEffect, useState } from "react";

export const motionTokens = {
  duration: {
    fast: 120,
    medium: 220,
    slow: 360,
  },
  stagger: {
    quick: 40,
    moderate: 80,
  },
  easing: {
    standard: "cubic-bezier(0.2, 0.6, 0.2, 1)",
    emphasized: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    decelerate: "cubic-bezier(0, 0, 0.2, 1)",
    accelerate: "cubic-bezier(0.4, 0, 1, 1)",
  },
} as const;

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}
