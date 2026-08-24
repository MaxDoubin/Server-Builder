import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Track `prefers-reduced-motion` reactively.
 *
 * Components that swap layout on this need it as state, not a one-off
 * read: the setting can change while the page is open, and a stale value
 * leaves the component rendering the wrong branch.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.(QUERY).matches === true,
  );

  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduced;
}
