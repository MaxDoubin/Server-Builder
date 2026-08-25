/**
 * Achievements for the simulator.
 *
 * Two kinds. Most are conditions evaluated against the real derived state of
 * the floor, so they unlock when the build genuinely reaches them. Three are
 * events the page fires when something happens that no amount of looking at
 * the floor can tell you: a share link copied, a photo taken, a scenario
 * closed out.
 *
 * Unlocks persist in localStorage. Every read and write is wrapped, because a
 * browser in private mode, a storage quota, or a user who has blocked site
 * data will throw on access rather than return null, and losing a trophy is
 * not worth taking the scene down for.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Rack } from "@shared/schema";
import { logWarning } from "@/lib/error-log";

const STORAGE_KEY = "hyperscale-achievements";

export type AchievementId =
  | "first-rack"
  | "ten-racks"
  | "hundred-racks"
  | "five-hundred-racks"
  | "low-pue"
  | "scenario-closed"
  | "all-scenarios"
  | "all-clear"
  | "full-row"
  | "every-type"
  | "shared-layout"
  | "photo-mode";

export interface AchievementContext {
  rackCount: number;
  pue: number;
  /**
   * Racks currently in a critical state on the visible floor.
   *
   * Deliberately the racks and not the alert feed. The feed is generated
   * from the whole 500 rack pool and always carries one unacknowledged
   * critical, so an achievement hung on it could never be earned, while the
   * racks are something the player can actually put right.
   */
  criticalRacks: number;
  equipmentTypesUsed: number;
  equipmentTypesTotal: number;
  longestRow: number;
  completedScenarios: number;
  totalScenarios: number;
}

export interface Achievement {
  id: AchievementId;
  title: string;
  description: string;
  /** How you get it, in plain words, shown while it is still locked. */
  requirement: string;
  /** Absent for the event driven ones, which the page unlocks directly. */
  check?: (context: AchievementContext) => boolean;
  progress?: (context: AchievementContext) => { value: number; target: number };
}

const rackTier = (
  id: AchievementId,
  title: string,
  count: number,
  description: string,
): Achievement => ({
  id,
  title,
  description,
  requirement: `${count} rack${count === 1 ? "" : "s"} on the floor at once`,
  check: (ctx) => ctx.rackCount >= count,
  progress: (ctx) => ({ value: Math.min(ctx.rackCount, count), target: count }),
});

export const ACHIEVEMENTS: Achievement[] = [
  rackTier("first-rack", "Boots on the floor", 1, "You put a cabinet down. Everything else follows from here."),
  rackTier("ten-racks", "First row", 10, "Ten cabinets. Enough to need a naming convention."),
  rackTier("hundred-racks", "Hall scale", 100, "A hundred racks is a room with its own power and cooling problems."),
  rackTier(
    "five-hundred-racks",
    "Hyperscale",
    500,
    "Five hundred racks and roughly eight megawatts. At this size the utility feed is the design.",
  ),
  {
    id: "low-pue",
    title: "Under 1.2",
    description:
      "Power usage effectiveness below 1.2 on a floor worth measuring. Every watt not spent on cooling is a watt sold as compute.",
    // The ten rack floor is the point. PUE in this model improves as the
    // floor shrinks, so without a size the trophy would be handed out for
    // an empty room on first load.
    requirement: "Hold PUE under 1.20 with at least 10 racks running",
    check: (ctx) => ctx.rackCount >= 10 && ctx.pue > 0 && ctx.pue < 1.2,
    progress: (ctx) => ({ value: ctx.pue > 0 ? Math.min(1.2, ctx.pue) : 0, target: 1.2 }),
  },
  {
    id: "scenario-closed",
    title: "Incident closed",
    description: "You took an incident from briefing to debrief with every objective holding.",
    requirement: "Complete any scenario",
    check: (ctx) => ctx.completedScenarios >= 1,
    progress: (ctx) => ({ value: Math.min(1, ctx.completedScenarios), target: 1 }),
  },
  {
    id: "all-scenarios",
    title: "Full runbook",
    description: "Cooling, power, network, thermal and capacity. All five closed out.",
    requirement: "Complete every scenario",
    check: (ctx) => ctx.totalScenarios > 0 && ctx.completedScenarios >= ctx.totalScenarios,
    progress: (ctx) => ({ value: ctx.completedScenarios, target: ctx.totalScenarios }),
  },
  {
    id: "all-clear",
    title: "All clear",
    description: "A floor with racks on it and not one rack in a critical state.",
    requirement: "No critical racks, with at least one rack on the floor",
    check: (ctx) => ctx.rackCount > 0 && ctx.criticalRacks === 0,
    progress: (ctx) => ({ value: ctx.criticalRacks === 0 ? 1 : 0, target: 1 }),
  },
  {
    id: "full-row",
    title: "Contiguous row",
    description:
      "Twelve cabinets side by side with no gaps. Aisle containment only works if the row is closed.",
    requirement: "12 racks in one unbroken row",
    check: (ctx) => ctx.longestRow >= 12,
    progress: (ctx) => ({ value: Math.min(ctx.longestRow, 12), target: 12 }),
  },
  {
    id: "every-type",
    title: "Full catalog",
    description:
      "Every equipment class in the catalog installed somewhere, blanking panels and cable management included.",
    requirement: "Install at least one of every equipment type",
    check: (ctx) => ctx.equipmentTypesTotal > 0 && ctx.equipmentTypesUsed >= ctx.equipmentTypesTotal,
    progress: (ctx) => ({ value: ctx.equipmentTypesUsed, target: ctx.equipmentTypesTotal }),
  },
  {
    id: "shared-layout",
    title: "Passed it on",
    description: "You encoded a floor into a link. Whoever opens it gets your build, not a screenshot.",
    requirement: "Copy a share link",
  },
  {
    id: "photo-mode",
    title: "Press shot",
    description: "UI out of the way, camera framed, one PNG of the hall.",
    requirement: "Capture the floor in photo mode",
  },
];

export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;

/**
 * Longest unbroken run of racks sharing a row.
 *
 * Racks sit on an integer grid, so a row is one positionY and a run is
 * consecutive positionX values inside it. Duplicated positions count once.
 */
export function longestContiguousRow(racks: Rack[]): number {
  const rows = new Map<number, Set<number>>();
  for (const rack of racks) {
    if (!Number.isFinite(rack.positionX) || !Number.isFinite(rack.positionY)) continue;
    const key = Math.round(rack.positionY);
    let row = rows.get(key);
    if (!row) {
      row = new Set<number>();
      rows.set(key, row);
    }
    row.add(Math.round(rack.positionX));
  }

  let longest = 0;
  rows.forEach((columns) => {
    const sorted = Array.from(columns).sort((a, b) => a - b);
    let run = 0;
    let previous: number | null = null;
    for (const column of sorted) {
      run = previous !== null && column === previous + 1 ? run + 1 : 1;
      previous = column;
      if (run > longest) longest = run;
    }
  });
  return longest;
}

export type UnlockMap = Partial<Record<AchievementId, number>>;

function readUnlocked(): UnlockMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const known = new Set(ACHIEVEMENTS.map((achievement) => achievement.id as string));
    const result: UnlockMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (known.has(key) && typeof value === "number") {
        result[key as AchievementId] = value;
      }
    }
    return result;
  } catch (error) {
    logWarning("Could not read achievements.", error);
    return {};
  }
}

function writeUnlocked(map: UnlockMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    logWarning("Could not persist achievements.", error);
  }
}

export interface AchievementsState {
  achievements: Achievement[];
  unlocked: UnlockMap;
  unlockedCount: number;
  /** Unlocks waiting to be shown in the corner. Oldest first. */
  pending: Achievement[];
  unlock: (id: AchievementId) => void;
  evaluate: (context: AchievementContext) => void;
  dismiss: (id: AchievementId) => void;
  reset: () => void;
}

export function useAchievements(): AchievementsState {
  const [unlocked, setUnlocked] = useState<UnlockMap>(() => readUnlocked());
  const [pendingIds, setPendingIds] = useState<AchievementId[]>([]);
  // Read inside callbacks without making them depend on the map, which would
  // rebuild evaluate on every unlock and retrigger the caller's effect.
  const unlockedRef = useRef(unlocked);
  unlockedRef.current = unlocked;

  const commit = useCallback((ids: AchievementId[]) => {
    if (ids.length === 0) return;
    const now = Date.now();
    const next: UnlockMap = { ...unlockedRef.current };
    for (const id of ids) next[id] = now;
    unlockedRef.current = next;
    setUnlocked(next);
    writeUnlocked(next);
    setPendingIds((prev) => [...prev, ...ids.filter((id) => !prev.includes(id))]);
  }, []);

  const unlock = useCallback(
    (id: AchievementId) => {
      if (unlockedRef.current[id]) return;
      commit([id]);
    },
    [commit],
  );

  const evaluate = useCallback(
    (context: AchievementContext) => {
      const newly = ACHIEVEMENTS.filter(
        (achievement) =>
          achievement.check && !unlockedRef.current[achievement.id] && achievement.check(context),
      ).map((achievement) => achievement.id);
      commit(newly);
    },
    [commit],
  );

  const dismiss = useCallback((id: AchievementId) => {
    setPendingIds((prev) => prev.filter((pending) => pending !== id));
  }, []);

  const reset = useCallback(() => {
    unlockedRef.current = {};
    setUnlocked({});
    setPendingIds([]);
    writeUnlocked({});
  }, []);

  const pending = useMemo(
    () =>
      pendingIds
        .map((id) => ACHIEVEMENTS.find((achievement) => achievement.id === id))
        .filter((achievement): achievement is Achievement => Boolean(achievement)),
    [pendingIds],
  );

  return {
    achievements: ACHIEVEMENTS,
    unlocked,
    unlockedCount: Object.keys(unlocked).length,
    pending,
    unlock,
    evaluate,
    dismiss,
    reset,
  };
}

/** Auto dismiss for the corner notification, in milliseconds. */
export const ACHIEVEMENT_TOAST_MS = 6000;

/**
 * Dismisses the oldest pending unlock after a delay.
 *
 * Kept as a hook so the notification component stays a pure renderer, and so
 * the timer is cleared properly when the queue changes underneath it.
 */
export function useAchievementAutoDismiss(
  pending: Achievement[],
  dismiss: (id: AchievementId) => void,
  enabled = true,
) {
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const head = pending[0]?.id;

  useEffect(() => {
    if (!enabled || !head) return;
    const timer = window.setTimeout(() => dismissRef.current(head), ACHIEVEMENT_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, head]);
}
