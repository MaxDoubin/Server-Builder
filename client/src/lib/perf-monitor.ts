type PerfCleanup = () => void;

const warn = (message: string, details?: Record<string, unknown>) => {
  if (details) {
    console.warn(message, details);
  } else {
    console.warn(message);
  }
};

const checkBaselineAnimation = () => {
  const baseline = document.querySelectorAll(
    ".rack-led-pulse, .rack-led-flicker, .rack-fan-spin, .home-hero__grid, .home-hero__pulse"
  );
  if (baseline.length === 0) {
    warn("[perf] Baseline animation classes not found in DOM.");
  }
};

const warnLargeBundle = () => {
  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const scripts = resources.filter((entry) => entry.initiatorType === "script");
  if (scripts.length === 0) return;
  const maxSize = Math.max(...scripts.map((entry) => entry.transferSize || 0));
  const maxKb = Math.round(maxSize / 1024);
  const limitKb = 300;
  if (maxKb > limitKb) {
    warn("[perf] Initial script transfer size exceeds budget.", { maxKb, limitKb });
  }
};

export const startPerfMonitor = (): PerfCleanup => {
  if (typeof window === "undefined") return () => {};
  if (!("PerformanceObserver" in window)) return () => {};

  const observers: PerformanceObserver[] = [];
  const supported = PerformanceObserver.supportedEntryTypes ?? [];

  if (supported.includes("longtask")) {
    const longTaskObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.duration > 50) {
          warn("[perf] Long task detected (>50ms).", {
            duration: Math.round(entry.duration),
            name: entry.name,
          });
        }
      });
    });
    longTaskObserver.observe({ type: "longtask", buffered: true });
    observers.push(longTaskObserver);
  }

  if (supported.includes("layout-shift")) {
    let clsValue = 0;
    const layoutShiftObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
        if (!shift.hadRecentInput && typeof shift.value === "number") {
          clsValue += shift.value;
          warn("[perf] Layout shift detected.", { cls: clsValue.toFixed(3) });
        }
      });
    });
    layoutShiftObserver.observe({ type: "layout-shift", buffered: true });
    observers.push(layoutShiftObserver);
  }

  if (supported.includes("paint")) {
    const paintObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        warn(`[perf] Paint timing: ${entry.name}`, {
          startTime: Math.round(entry.startTime),
        });
      });
    });
    paintObserver.observe({ type: "paint", buffered: true });
    observers.push(paintObserver);
  }

  if (supported.includes("resource")) {
    const resourceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.some((entry) => entry.entryType === "resource")) {
        warnLargeBundle();
      }
    });
    resourceObserver.observe({ type: "resource", buffered: true });
    observers.push(resourceObserver);
  }

  let rafId = 0;
  let lastFrame = performance.now();
  let slowFrameStreak = 0;
  const frameCheck = (now: number) => {
    const delta = now - lastFrame;
    if (delta > 50) {
      warn("[perf] Long frame detected (>50ms).", { delta: Math.round(delta) });
    }
    if (delta > 24) {
      slowFrameStreak += 1;
      if (slowFrameStreak >= 3) {
        warn("[perf] Repeated frame drops detected (>24ms).", { delta: Math.round(delta) });
        slowFrameStreak = 0;
      }
    } else {
      slowFrameStreak = 0;
    }
    lastFrame = now;
    rafId = window.requestAnimationFrame(frameCheck);
  };
  rafId = window.requestAnimationFrame(frameCheck);

  const baselineTimer = window.setTimeout(checkBaselineAnimation, 1200);
  warnLargeBundle();

  return () => {
    observers.forEach((observer) => observer.disconnect());
    window.cancelAnimationFrame(rafId);
    window.clearTimeout(baselineTimer);
  };
};
