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

/**
 * Bind a GSAP timeline to a ScrollTrigger. The timeline is scrubbed by
 * scroll position between `start` and `end`.
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
