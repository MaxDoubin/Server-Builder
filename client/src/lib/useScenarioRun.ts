/**
 * Runtime state for a scenario in progress.
 *
 * Kept out of the scene page so completion is detected whether or not the
 * scenario panel happens to be open, and so the page only has to own one
 * piece of state rather than five.
 *
 * The baseline is measured by the caller and handed in, rather than read
 * after the fact. Starting a scenario changes the rack density, and a
 * baseline captured before that change describes a floor that no longer
 * exists, while one captured after it is at the mercy of a debounced state
 * update landing first.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Equipment, Rack } from "@shared/schema";
import { deriveCapacity, type CapacityOverrides, type FacilityCapacity } from "@/lib/capacity";
import {
  evaluateScenario,
  getScenario,
  resolveScenarioOverrides,
  type Scenario,
  type ScenarioBaseline,
  type ScenarioContext,
  type ScenarioEvaluation,
} from "@/lib/scenarios";
import { logWarning } from "@/lib/error-log";

const COMPLETED_KEY = "hyperscale-scenarios-complete";

/** Stable identity so the capacity memo does not rerun on every render. */
const EMPTY_OVERRIDES: CapacityOverrides = {};

export interface ScenarioRun {
  scenarioId: string;
  startedAt: number;
  completedAt: number | null;
  baseline: ScenarioBaseline;
  overrides: CapacityOverrides;
}

export function baselineFromCapacity(capacity: FacilityCapacity): ScenarioBaseline {
  return {
    rackCount: capacity.rackCount,
    itLoadW: capacity.itLoadW,
    equipmentCount: capacity.equipmentCount,
    serverCount: capacity.serverCount,
    switchCount: capacity.switchCount,
    routerCount: capacity.routerCount,
    firewallCount: capacity.firewallCount,
  };
}

function readCompleted(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COMPLETED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch (error) {
    logWarning("Could not read completed scenarios.", error);
    return [];
  }
}

function writeCompleted(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMPLETED_KEY, JSON.stringify(ids));
  } catch (error) {
    logWarning("Could not persist completed scenarios.", error);
  }
}

interface UseScenarioRunArgs {
  /** The racks actually on the floor, which is the density slider's slice. */
  visibleRacks: Rack[];
  catalog: Map<string, Equipment>;
  heatmapOn: boolean;
  criticalAlerts: number;
  /** Called when a scenario starts so the page can apply its rack density. */
  onApplySetup: (scenario: Scenario) => void;
  /** Fired once, the first time a scenario's objectives all hold. */
  onComplete?: (scenarioId: string) => void;
}

export interface ScenarioRunState {
  /**
   * Capacity of the visible floor, derived with the active run's overrides.
   *
   * Derived here rather than in the page because the overrides live with the
   * run: a page that computed capacity itself would need the run to exist
   * first, and the run needs capacity to evaluate against.
   */
  capacity: FacilityCapacity;
  run: ScenarioRun | null;
  scenario: Scenario | null;
  evaluation: ScenarioEvaluation | null;
  context: ScenarioContext | null;
  completedIds: string[];
  overrides: CapacityOverrides;
  start: (scenario: Scenario, baseline: FacilityCapacity) => void;
  abort: () => void;
  restart: () => void;
  elapsedSeconds: number;
}

export function useScenarioRun({
  visibleRacks,
  catalog,
  heatmapOn,
  criticalAlerts,
  onApplySetup,
  onComplete,
}: UseScenarioRunArgs): ScenarioRunState {
  const [run, setRun] = useState<ScenarioRun | null>(null);
  const [completedIds, setCompletedIds] = useState<string[]>(() => readCompleted());
  const lastBaselineRef = useRef<FacilityCapacity | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const scenario = run ? getScenario(run.scenarioId) ?? null : null;
  const overrides = run?.overrides ?? EMPTY_OVERRIDES;

  const capacity = useMemo(
    () => deriveCapacity(visibleRacks, catalog, overrides),
    [catalog, overrides, visibleRacks],
  );

  const elapsedSeconds = run
    ? Math.max(0, Math.round(((run.completedAt ?? Date.now()) - run.startedAt) / 1000))
    : 0;

  const context = useMemo<ScenarioContext | null>(() => {
    if (!run) return null;
    return {
      capacity,
      baseline: run.baseline,
      heatmapOn,
      criticalAlerts,
      elapsedSeconds,
    };
  }, [capacity, criticalAlerts, elapsedSeconds, heatmapOn, run]);

  const evaluation = useMemo(
    () => (scenario && context ? evaluateScenario(scenario, context) : null),
    [context, scenario],
  );

  useEffect(() => {
    if (!run || run.completedAt || !evaluation?.complete) return;
    const completedAt = Date.now();
    setRun((prev) => (prev && !prev.completedAt ? { ...prev, completedAt } : prev));
    setCompletedIds((prev) => {
      if (prev.includes(run.scenarioId)) return prev;
      const next = [...prev, run.scenarioId];
      writeCompleted(next);
      return next;
    });
    onCompleteRef.current?.(run.scenarioId);
  }, [evaluation?.complete, run]);

  const start = useCallback(
    (next: Scenario, baselineCapacity: FacilityCapacity) => {
      lastBaselineRef.current = baselineCapacity;
      const baseline = baselineFromCapacity(baselineCapacity);
      setRun({
        scenarioId: next.id,
        startedAt: Date.now(),
        completedAt: null,
        baseline,
        overrides: resolveScenarioOverrides(next, baseline),
      });
      onApplySetup(next);
    },
    [onApplySetup],
  );

  const abort = useCallback(() => setRun(null), []);

  const restart = useCallback(() => {
    if (!scenario) return;
    const baseline = lastBaselineRef.current;
    if (!baseline) return;
    start(scenario, baseline);
  }, [scenario, start]);

  return {
    capacity,
    run,
    scenario,
    evaluation,
    context,
    completedIds,
    overrides,
    start,
    abort,
    restart,
    elapsedSeconds,
  };
}
