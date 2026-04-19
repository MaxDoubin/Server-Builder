import { useEffect, useState } from "react";

export type DeviceTier = "low" | "mid" | "high";

export interface DeviceProfile {
  tier: DeviceTier;
  /** Max DPR cap for R3F Canvases. */
  dpr: [number, number];
  /** Whether to run heavy per-frame camera/shader effects. */
  effects: boolean;
  /** Coarse pointer (touch) input. */
  coarse: boolean;
  /** Narrow viewport (<= 768px). */
  mobile: boolean;
}

function detectTier(): DeviceProfile {
  if (typeof window === "undefined") {
    return { tier: "high", dpr: [1, 2], effects: true, coarse: false, mobile: false };
  }

  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const mobile = window.matchMedia?.("(max-width: 768px)").matches ?? false;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const hwConcurrency = navigator.hardwareConcurrency ?? 4;
  const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const saveData =
    (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } })
      .connection?.saveData ?? false;
  const slowNet =
    (navigator as unknown as { connection?: { effectiveType?: string } })
      .connection?.effectiveType === "2g" ||
    (navigator as unknown as { connection?: { effectiveType?: string } })
      .connection?.effectiveType === "slow-2g";

  let tier: DeviceTier = "high";
  if (hwConcurrency <= 2 || (deviceMemory !== undefined && deviceMemory <= 2) || saveData || slowNet) {
    tier = "low";
  } else if (mobile || coarse || (deviceMemory !== undefined && deviceMemory <= 4)) {
    tier = "mid";
  }

  if (reduced) {
    // Reduced motion is not a perf signal per se, but treat it as a
    // budget cap so we don't animate too much either way.
    tier = tier === "high" ? "mid" : tier;
  }

  const dpr: [number, number] =
    tier === "low"
      ? [0.75, 1]
      : tier === "mid"
        ? [1, 1.5]
        : [1, 2];

  return {
    tier,
    dpr,
    effects: tier !== "low",
    coarse,
    mobile,
  };
}

/**
 * Pick a quality profile based on the device.
 *
 * We read once on mount and keep it stable for the session — resizing
 * the window shouldn't toss Canvas GL contexts. Coarse/mobile checks
 * re-evaluate only when matchMedia fires.
 */
export function useDeviceTier(): DeviceProfile {
  const [profile, setProfile] = useState<DeviceProfile>(() => detectTier());

  useEffect(() => {
    const mqs = [
      window.matchMedia("(max-width: 768px)"),
      window.matchMedia("(pointer: coarse)"),
      window.matchMedia("(prefers-reduced-motion: reduce)"),
    ];
    const handler = () => setProfile(detectTier());
    mqs.forEach((mq) => mq.addEventListener("change", handler));
    return () => mqs.forEach((mq) => mq.removeEventListener("change", handler));
  }, []);

  return profile;
}
