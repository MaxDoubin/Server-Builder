import { createContext, useCallback, useContext, useMemo, useState } from "react";

type IntroSignal = "layout" | "scene";

type IntroContextValue = {
  ready: boolean;
  markReady: (signal: IntroSignal) => void;
};

const IntroContext = createContext<IntroContextValue | undefined>(undefined);

const REQUIRED_SIGNALS: IntroSignal[] = ["layout", "scene"];

export function IntroProvider({ children }: { children: React.ReactNode }) {
  const [signals, setSignals] = useState<Set<IntroSignal>>(() => new Set());
  const ready = REQUIRED_SIGNALS.every((signal) => signals.has(signal));

  const markReady = useCallback((signal: IntroSignal) => {
    setSignals((prev) => {
      if (prev.has(signal)) return prev;
      const next = new Set(prev);
      next.add(signal);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ready, markReady }), [ready, markReady]);

  return <IntroContext.Provider value={value}>{children}</IntroContext.Provider>;
}

export function useIntro() {
  const context = useContext(IntroContext);
  if (!context) {
    throw new Error("useIntro must be used within IntroProvider");
  }
  return context;
}
