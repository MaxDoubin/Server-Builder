import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Lenis from "lenis";
import { ensureGsapRegistered } from "./gsap";

type ScrollContextValue = {
  lenis: Lenis | null;
  scrollTo: (target: number | string | HTMLElement, opts?: { offset?: number; duration?: number; immediate?: boolean }) => void;
  stop: () => void;
  start: () => void;
  ready: boolean;
};

const ScrollContext = createContext<ScrollContextValue>({
  lenis: null,
  scrollTo: () => {},
  stop: () => {},
  start: () => {},
  ready: false,
});

export function useSmoothScroll() {
  return useContext(ScrollContext);
}

interface Props {
  children: ReactNode;
  /** Disable smooth scroll (e.g. prefers-reduced-motion). */
  disabled?: boolean;
}

export function SmoothScrollProvider({ children, disabled = false }: Props) {
  const lenisRef = useRef<Lenis | null>(null);
  const [ready, setReady] = useState(false);

  /**
   * Children mount before the provider's effect runs, so a child calling
   * `stop()` on mount (the preloader does) would otherwise hit a null
   * Lenis and silently no-op, leaving the page scrollable behind the
   * loading screen. Record the intent and apply it at construction.
   */
  const wantStopped = useRef(false);

  const stop = useCallback(() => {
    wantStopped.current = true;
    lenisRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    wantStopped.current = false;
    lenisRef.current?.start();
  }, []);

  useEffect(() => {
    const reduced = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (disabled || reduced) {
      setReady(true);
      return;
    }

    const { gsap, ScrollTrigger } = ensureGsapRegistered();

    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.1,
      infinite: false,
    });

    lenisRef.current = lenis;
    document.documentElement.classList.add("lenis", "lenis-smooth");
    if (wantStopped.current) lenis.stop();

    /**
     * Lenis drives the real window scroll position, so ScrollTrigger can
     * keep using its default window scroller and read `window.scrollY`
     * directly. It only needs to be told when to re-measure.
     *
     * A `ScrollTrigger.scrollerProxy` was used here previously. That made
     * ScrollTrigger read Lenis' *virtual* scroll value instead, which does
     * not follow programmatic scrolls (anchor links, keyboard Home/End,
     * find-in-page, the browser restoring position on reload). Progress
     * would freeze at a stale value while the page kept moving.
     */
    const onScroll = () => ScrollTrigger.update();
    lenis.on("scroll", onScroll);

    // Run Lenis off GSAP's ticker so scroll and tweens share one clock and
    // cannot tear against each other.
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    /**
     * Trigger positions are measured once at creation. This page lazy-loads
     * most of its sections and a WebGL canvas, and pins a section for ~900vh
     * against those measurements, so anything that changes document height
     * after mount leaves every trigger anchored to stale coordinates: pinned
     * sections release early and `gsap.from(..., {opacity: 0})` reveals never
     * fire, stranding content invisible. Re-measure whenever the page resizes.
     */
    let refreshTimer = 0;
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 120);
    };

    const resizeObserver = new ResizeObserver(scheduleRefresh);
    resizeObserver.observe(document.body);

    // Web fonts reflow text after first paint and shift every section below.
    if (document.fonts?.ready) {
      void document.fonts.ready.then(scheduleRefresh);
    }
    window.addEventListener("load", scheduleRefresh);

    ScrollTrigger.refresh();
    setReady(true);

    return () => {
      window.clearTimeout(refreshTimer);
      resizeObserver.disconnect();
      window.removeEventListener("load", scheduleRefresh);
      lenis.off("scroll", onScroll);
      gsap.ticker.remove(raf);
      lenis.destroy();
      lenisRef.current = null;
      document.documentElement.classList.remove("lenis", "lenis-smooth");
      // Scenes own their own triggers through `gsap.context` and revert them
      // on unmount. Killing every trigger globally here used to take out the
      // incoming page's triggers too, because React mounts the next route
      // before tearing the previous one down.
      ScrollTrigger.refresh();
    };
  }, [disabled]);

  const value = useMemo<ScrollContextValue>(
    () => ({
      lenis: lenisRef.current,
      scrollTo: (target, opts) => {
        const lenis = lenisRef.current;
        if (!lenis) {
          if (typeof target === "number") window.scrollTo({ top: target, behavior: "smooth" });
          return;
        }
        lenis.scrollTo(target as unknown as number, opts);
      },
      stop,
      start,
      ready,
    }),
    [ready, stop, start],
  );

  return <ScrollContext.Provider value={value}>{children}</ScrollContext.Provider>;
}
