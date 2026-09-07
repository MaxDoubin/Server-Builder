import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { X } from "lucide-react";

interface OnboardingStep {
  title: string;
  description: string;
}

interface OnboardingProps {
  steps?: OnboardingStep[];
  storageKey?: string;
}

const defaultSteps: OnboardingStep[] = [
  {
    title: "Navigate the floor",
    description: "Drag to orbit, scroll to zoom, and click any rack to inspect its equipment.",
  },
  {
    title: "Inspect and edit racks",
    description: "Use the rack detail panel to add hardware to empty slots or remove equipment.",
  },
  {
    title: "Open the control deck",
    description: "Tap the sparkle icon to access view toggles, accessibility settings, and save tools.",
  },
];

export function Onboarding({ steps = defaultSteps, storageKey = "hyperscale-onboarding-complete" }: OnboardingProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Wrapped because a browser set to block site data throws on the access
    // rather than returning null, and this runs in an effect, so the throw
    // reaches the root and unmounts the page under the tour.
    let hasCompleted = false;
    try {
      hasCompleted = localStorage.getItem(storageKey) === "true";
    } catch {
      /* Treat it as unseen. The worst case is showing it once per visit. */
    }
    if (!hasCompleted) {
      setIsOpen(true);
    }
  }, [storageKey]);

  const totalSteps = steps.length;
  const activeStep = steps[activeIndex];
  const progressValue = useMemo(
    () => ((activeIndex + 1) / totalSteps) * 100,
    [activeIndex, totalSteps]
  );

  const handleClose = () => {
    setIsOpen(false);
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      /* Then it opens again next visit, which is better than not closing. */
    }
  };

  if (!isOpen) return null;

  return (
    <div data-print-hide className="fixed bottom-6 left-6 z-50 max-w-sm">
      <Card className="p-4 space-y-3 bg-background/90 backdrop-blur-md border border-cyan-500/20 shadow-[0_0_25px_rgba(34,211,238,0.2)]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-cyan-400">Guided Tour</p>
            <h3 className="font-display text-base font-semibold">{activeStep.title}</h3>
          </div>
          {/*
            Icon-only, so with no label it announced as a bare "button" and
            the only way to dismiss the tour was unreachable non-visually.
          */}
          <Button
            size="icon"
            variant="ghost"
            onClick={handleClose}
            aria-label="Dismiss guided tour"
            className="h-7 w-7"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{activeStep.description}</p>
        <Progress value={progressValue} className="h-1.5" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Step {activeIndex + 1} of {totalSteps}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
              disabled={activeIndex === 0}
            >
              Back
            </Button>
            {activeIndex < totalSteps - 1 ? (
              <Button size="sm" onClick={() => setActiveIndex((prev) => Math.min(totalSteps - 1, prev + 1))}>
                Next
              </Button>
            ) : (
              <Button size="sm" onClick={handleClose}>
                Done
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
