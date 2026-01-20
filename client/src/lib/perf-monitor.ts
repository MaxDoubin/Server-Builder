type PerfCleanup = () => void;

const warn = (message: string, details?: Record<string, unknown>) => {
  if (details) {
    console.warn(message, details);
  } else {
    console.warn(message);
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

  let rafId = 0;
  let lastFrame = performance.now();
  const frameCheck = (now: number) => {
    const delta = now - lastFrame;
    if (delta > 50) {
      warn("[perf] Long frame detected (>50ms).", { delta: Math.round(delta) });
    }
    lastFrame = now;
    rafId = window.requestAnimationFrame(frameCheck);
  };
  rafId = window.requestAnimationFrame(frameCheck);

  return () => {
    observers.forEach((observer) => observer.disconnect());
    window.cancelAnimationFrame(rafId);
  };
};
