/**
 * Five coach marks on the first visit.
 *
 * Deliberately not modal. It does not trap Tab, it does not steal focus when
 * it opens, and it does not sit over the thing it is pointing at, because a
 * tour that fights the keyboard is worse than no tour. Escape skips it, and
 * the fact that it has been seen is kept in localStorage so it never fires
 * twice.
 *
 * Positions are measured from the real elements through data-tour hooks, so
 * a moved control moves its coach mark instead of pointing at nothing.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { logWarning } from "@/lib/error-log";

const STORAGE_KEY = "hyperscale-tour-seen";

const CARD_WIDTH = 300;
const GAP = 12;

interface TourStep {
  id: string;
  /** data-tour value of the element to point at. */
  target: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    id: "dock",
    target: "dock",
    title: "The control dock",
    body: "Everything that changes the floor lives here: rack density, fill rate, the heatmap, and the panels underneath. The arrow on its edge slides it out of the way.",
  },
  {
    id: "modes",
    target: "modes",
    title: "Build and Explore",
    body: "Build gives you the placement toolbars and the rack panel. Explore hides the interface and flies the camera. You can switch at any time.",
  },
  {
    id: "scene",
    target: "scene",
    title: "The floor itself",
    body: "Drag to orbit, scroll to zoom, right drag to pan. Click any rack to open it and see what is installed, what it draws and how hot it runs.",
  },
  {
    id: "capacity",
    target: "capacity",
    title: "Power and cooling",
    body: "Two ceilings the build has to live inside: an 8 MW feed and a 26 unit cooling plant. Both bars say in words when you have gone past them.",
  },
  {
    id: "scenarios",
    target: "scenarios",
    title: "Scenarios",
    body: "Five incidents with objectives graded against the real state of this floor. Start with the cooling failure, it is the clearest one.",
  },
];

export function hasSeenTour(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch (error) {
    logWarning("Could not check whether the tour has run.", error);
    return true;
  }
}

export function markTourSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch (error) {
    logWarning("Could not record that the tour has run.", error);
  }
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function GuidedTour({
  open,
  containerRef,
  onFinish,
  onStepChange,
}: {
  open: boolean;
  containerRef: React.RefObject<HTMLElement>;
  onFinish: () => void;
  /** Lets the page open the panel a step is about to describe. */
  onStepChange?: (stepId: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const step = STEPS[index];

  // Held in a ref, not read as a dependency. A caller passing an inline
  // arrow would otherwise rebuild the measuring effect on every render, and
  // since measuring sets state that is a loop with no exit.
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container || !step) return;
    const containerBox = container.getBoundingClientRect();
    setContainerSize((prev) =>
      prev.width === containerBox.width && prev.height === containerBox.height
        ? prev
        : { width: containerBox.width, height: containerBox.height },
    );
    // querySelector only looks at descendants, and one step points at the
    // scene box itself, which is the container.
    const selector = `[data-tour="${step.target}"]`;
    const target = container.matches(selector)
      ? container
      : container.querySelector<HTMLElement>(selector);
    if (!target) {
      setTargetRect((prev) => (prev === null ? prev : null));
      return;
    }
    const box = target.getBoundingClientRect();
    const next: Rect = {
      top: box.top - containerBox.top,
      left: box.left - containerBox.left,
      width: box.width,
      height: box.height,
    };
    setTargetRect((prev) =>
      prev &&
      prev.top === next.top &&
      prev.left === next.left &&
      prev.width === next.width &&
      prev.height === next.height
        ? prev
        : next,
    );
  }, [containerRef, step]);

  useLayoutEffect(() => {
    if (!open) return;
    onStepChangeRef.current?.(step?.id ?? "");
    measure();
  }, [measure, open, step?.id]);

  useEffect(() => {
    if (!open) return;
    // Re-measure after the page has had a frame to open whichever panel the
    // step asked for, otherwise the ring lands on the element's old box.
    const raf = window.requestAnimationFrame(measure);
    const handle = () => measure();
    window.addEventListener("resize", handle);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", handle);
    };
  }, [measure, open, index]);

  const finish = useCallback(() => {
    markTourSeen();
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [finish, open]);

  if (!open || !step) return null;

  const cardPosition = () => {
    const { width, height } = containerSize;
    if (!targetRect || width === 0) {
      return { top: Math.max(GAP, height / 2 - 90), left: Math.max(GAP, width / 2 - CARD_WIDTH / 2) };
    }
    // A target that fills most of the box (the scene itself) gets a centred
    // card. Anything smaller gets the card beside or below it.
    const isLarge = targetRect.width > width * 0.7 && targetRect.height > height * 0.7;
    if (isLarge) {
      return { top: Math.max(GAP, height / 2 - 90), left: Math.max(GAP, width / 2 - CARD_WIDTH / 2) };
    }
    const rightSpace = width - (targetRect.left + targetRect.width);
    const left =
      rightSpace >= CARD_WIDTH + GAP * 2
        ? targetRect.left + targetRect.width + GAP
        : Math.min(Math.max(GAP, targetRect.left), Math.max(GAP, width - CARD_WIDTH - GAP));
    const below = targetRect.top + targetRect.height + GAP;
    const top = below + 200 < height ? below : Math.max(GAP, targetRect.top);
    return {
      top: Math.min(top, Math.max(GAP, height - 200)),
      left,
    };
  };

  const position = cardPosition();
  const isLast = index === STEPS.length - 1;

  return (
    <div className="pointer-events-none absolute inset-0 z-[110]" data-ui="true">
      {targetRect && (
        <div
          aria-hidden
          className="absolute rounded-xl border-2 border-cyan-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-all duration-200"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-label={`Tour step ${index + 1} of ${STEPS.length}`}
        className="pointer-events-auto absolute w-[300px] rounded-xl border border-cyan-500/40 bg-black/95 p-3 shadow-[0_0_28px_rgba(34,211,238,0.25)]"
        style={{ top: position.top, left: position.left }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[9px] uppercase tracking-[0.28em] text-cyan-300/80">
            Step {index + 1} of {STEPS.length}
          </div>
          <button
            type="button"
            onClick={finish}
            className="min-h-[24px] px-1 text-[10px] uppercase tracking-widest text-white/50 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            Skip tour
          </button>
        </div>
        <div aria-live="polite">
          {/*
            h2. This panel floats over the page rather than sitting in its
            content, so its level was picked to look right rather than to say
            anything, and h3 under a page whose only other heading is the h1
            left a gap in the outline. It is a top level overlay, so it is a
            level two.
          */}
          <h2 className="mt-1 text-sm font-semibold text-white">{step.title}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-white/60">{step.body}</p>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-[10px] uppercase tracking-widest text-white/60 hover:text-white"
            onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
            disabled={index === 0}
          >
            Back
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 bg-cyan-500/25 px-3 text-[10px] uppercase tracking-widest text-cyan-50 hover:bg-cyan-500/40"
            onClick={() => (isLast ? finish() : setIndex((prev) => prev + 1))}
          >
            {isLast ? "Start building" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
