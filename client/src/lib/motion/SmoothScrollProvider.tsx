import {
  createContext,
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
  const rafRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reduced = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (disabled || reduced) {
      setReady(true);
      return;
    }

    const { ScrollTrigger } = ensureGsapRegistered();

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

    // Drive GSAP ScrollTrigger off Lenis' scroll position
    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => {
      lenis.raf(time);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // GSAP ticker fallback for any animation that uses gsap.ticker
    const gsapScroller = (value?: number) => {
      if (typeof value === "number") lenis.scrollTo(value, { immediate: true });
      return lenis.scroll;
    };
    ScrollTrigger.scrollerProxy(document.documentElement, {
      scrollTop: gsapScroller,
      getBoundingClientRect() {
        return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
      },
    });
    ScrollTrigger.defaults({ scroller: document.documentElement });
    ScrollTrigger.refresh();

    setReady(true);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lenis.destroy();
      lenisRef.current = null;
      document.documentElement.classList.remove("lenis", "lenis-smooth");
      ScrollTrigger.getAll().forEach((t) => t.kill());
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
      stop: () => lenisRef.current?.stop(),
      start: () => lenisRef.current?.start(),
      ready,
    }),
    [ready],
  );

  return <ScrollContext.Provider value={value}>{children}</ScrollContext.Provider>;
}
