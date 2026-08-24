import { useEffect, useRef, type RefObject } from "react";
import { ensureGsapRegistered, type gsap as GSAPType } from "./gsap";

type ScrollTriggerVars = Parameters<
  ReturnType<typeof ensureGsapRegistered>["ScrollTrigger"]["create"]
>[0];

type SceneBuilder = (
  ctx: {
    gsap: typeof GSAPType;
    timeline: ReturnType<typeof GSAPType.timeline>;
  },
) => void;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * Bind a GSAP timeline to a ScrollTrigger. The timeline is scrubbed by
 * scroll position between `start` and `end`.
 *
 * When `prefers-reduced-motion: reduce` is active the ScrollTrigger is
 * skipped entirely. The builder runs once on a detached timeline so
 * onUpdate hooks (used to drive R3F rigs, counters, etc.) still fire
 * to their final state, then the timeline is killed. No pin, no scrub.
 */
export function useScrollScene<T extends HTMLElement>(
  target: RefObject<T | null>,
  build: SceneBuilder,
  deps: React.DependencyList = [],
  triggerVars: Partial<ScrollTriggerVars> = {},
) {
  useEffect(() => {
    if (!target.current) return;
    const { gsap, ScrollTrigger } = ensureGsapRegistered();

    if (prefersReducedMotion()) {
      // Run the builder on a paused, non-scrolling timeline, jump to the end
      // so final values are applied (progressRef counters, gsap.set calls, etc.),
      // then kill it. The pinned layout is skipped so the section is readable.
      const tl = gsap.timeline({ paused: true, defaults: { ease: "none" } });
      try {
        build({ gsap, timeline: tl });
        tl.progress(1, false);
      } finally {
        tl.kill();
      }
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: target.current as Element,
          start: "top top",
          end: "+=100%",
          scrub: 1,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          ...triggerVars,
        },
      });
      build({ gsap, timeline: tl });
    }, target.current);

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Trigger a non-scrubbed animation when a section enters the viewport.
 *
 * Under reduced motion the builder runs once and any `gsap.from` inside
 * will revert to the element's natural state immediately, so content
 * stays visible without a transition.
 */
export function useScrollReveal<T extends HTMLElement>(
  target: RefObject<T | null>,
  build: (ctx: { gsap: typeof GSAPType }) => (() => void) | void,
  deps: React.DependencyList = [],
) {
  const unmountRef = useRef<(() => void) | void>();
  useEffect(() => {
    if (!target.current) return;
    const { gsap } = ensureGsapRegistered();

    if (prefersReducedMotion()) {
      // Skip reveal animations entirely. Elements render in their
      // natural (post-animation) state.
      return;
    }

    const ctx = gsap.context(() => {
      unmountRef.current = build({ gsap });
    }, target.current);
    return () => {
      if (typeof unmountRef.current === "function") unmountRef.current();
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
