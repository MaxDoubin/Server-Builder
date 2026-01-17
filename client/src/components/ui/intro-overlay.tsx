import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIntro } from "@/lib/intro-context";
import { usePrefersReducedMotion } from "@/lib/motion";

const MIN_DISPLAY_MS = 450;
const MAX_DISPLAY_MS = 4500;

const IntroMarkup = () => (
  <div id="intro-overlay" className="intro-overlay" data-intro-state="enter">
    <div className="intro-overlay__media" role="presentation" />
    <div className="intro-overlay__scrim" />
    <div className="intro-overlay__content">
      <div className="intro-overlay__badge">
        <span className="intro-overlay__dot" />
        Hyperscale
      </div>
      <h1 className="intro-overlay__title">Hyperscale Command</h1>
      <p className="intro-overlay__subtitle">
        Live orchestration across power, thermals, and network topology.
      </p>
      <div className="intro-overlay__grid">
        <div className="intro-overlay__panel">
          <div className="intro-overlay__panel-title">System status</div>
          <div className="intro-overlay__panel-row" />
          <div className="intro-overlay__panel-row" />
          <div className="intro-overlay__panel-row" />
        </div>
        <div className="intro-overlay__panel">
          <div className="intro-overlay__panel-title">Live modules</div>
          <div className="intro-overlay__panel-line">
            <span>Thermal balance</span>
            <span>Ready</span>
          </div>
          <div className="intro-overlay__panel-line">
            <span>Network flow</span>
            <span>Ready</span>
          </div>
          <div className="intro-overlay__panel-line">
            <span>Power envelope</span>
            <span>Ready</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export function IntroOverlay() {
  const { ready } = useIntro();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    const existing = document.getElementById("intro-overlay") as HTMLElement | null;
    if (existing) {
      elementRef.current = existing;
      startRef.current = performance.now();
      return;
    }

    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (!elementRef.current && portalTarget) {
      const created = document.getElementById("intro-overlay") as HTMLElement | null;
      if (created) {
        elementRef.current = created;
        startRef.current = performance.now();
      }
    }
  }, [portalTarget]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const minDuration = prefersReducedMotion ? 150 : MIN_DISPLAY_MS;
    const maxDuration = prefersReducedMotion ? 800 : MAX_DISPLAY_MS;

    const tick = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - (startRef.current ?? now);
      const timeExceeded = elapsed >= maxDuration;
      const minElapsed = elapsed >= minDuration;

      if ((ready && minElapsed) || timeExceeded) {
        if (timeExceeded && !ready) {
          console.warn("[intro] Forced intro dismissal after max duration.");
        }
        element.dataset.introState = "exit";
        if (prefersReducedMotion) {
          element.parentElement?.removeChild(element);
          return;
        }
        const handleTransitionEnd = () => {
          element.removeEventListener("transitionend", handleTransitionEnd);
          element.parentElement?.removeChild(element);
        };
        element.addEventListener("transitionend", handleTransitionEnd);
        return;
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafRef.current);
    };
  }, [prefersReducedMotion, ready]);

  if (!portalTarget) {
    return null;
  }

  return createPortal(<IntroMarkup />, portalTarget);
}
