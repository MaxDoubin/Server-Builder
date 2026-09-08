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

    const { ScrollTrigger } = ensureGsapRegistered();
    const ctx = gsap.context(() => {
      unmountRef.current = build({ gsap });
    }, target.current);

    /*
      Refresh once the layout has stopped moving, and this is not optional.

      A ScrollTrigger records its start position when it is created. On this
      home page the hero is a lazily loaded 3D scene, three acts arrive behind
      Suspense, and the display font loads after first paint, so every one of
      those triggers is measured against a layout that then changes underneath
      it. A trigger whose start ends up somewhere the reader will never cross
      simply never fires.

      That would be a cosmetic problem if the reveals animated only position.
      They animate opacity from zero, so a trigger that never fires leaves the
      content permanently invisible. It was doing exactly that: at 768px the
      biography, the telemetry section and the practise grid were all sitting
      at opacity 0 after scrolling the whole page, with nothing in the console
      and nothing failing.

      This site has met this failure before, and the colophon already says the
      rule it produced: a transition is decoration, and it must never be the
      thing that decides whether the page is visible. The refresh is the fix
      for the measurement; the acts should also stop animating opacity from
      zero, and the one added with this change does not.
    */
    const refresh = () => ScrollTrigger.refresh();
    const raf = window.requestAnimationFrame(refresh);
    const settled = window.setTimeout(refresh, 600);
    window.addEventListener("load", refresh);
    document.fonts?.ready.then(refresh).catch(() => {});

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(settled);
      window.removeEventListener("load", refresh);
      if (typeof unmountRef.current === "function") unmountRef.current();
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
