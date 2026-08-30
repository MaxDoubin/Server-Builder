import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "@/lib/game-context";
import { DatacenterScene, type LightingMode, type SceneCapture } from "@/components/3d/DatacenterScene";
import { GameHUD } from "@/components/3d/GameHUD";
import { RackDetailPanel } from "@/components/3d/RackDetailPanel";
import { BuildToolbar } from "@/components/3d/BuildToolbar";
import { CapacityMeters } from "@/components/3d/CapacityMeters";
import { CostSummary } from "@/components/3d/CostSummary";
import { ScenarioPanel } from "@/components/3d/ScenarioPanel";
import { LayoutManager } from "@/components/3d/LayoutManager";
import { AchievementNotice, AchievementsPanel } from "@/components/3d/AchievementsPanel";
import { ShortcutsDialog } from "@/components/3d/ShortcutsDialog";
import { GuidedTour, hasSeenTour } from "@/components/3d/GuidedTour";
import { InstantShell } from "@/components/ui/instant-shell";
import { WelcomeScreen } from "@/components/ui/welcome-screen";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DebugOverlay } from "@/components/ui/debug-overlay";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { GameHeader } from "@/components/layout/game-header";
import { useToast } from "@/hooks/use-toast";
import { deriveCapacity, facilityPue, formatWatts } from "@/lib/capacity";
import { estimateBuildCost } from "@/lib/buildCosts";
import { SCENARIOS, type Scenario } from "@/lib/scenarios";
import { useScenarioRun } from "@/lib/useScenarioRun";
import {
  longestContiguousRow,
  useAchievementAutoDismiss,
  useAchievements,
  type AchievementContext,
} from "@/lib/achievements";
import { ambientHum, isAmbientAudioSupported } from "@/lib/ambient-audio";
import type { Equipment, Rack } from "@shared/schema";
import { useBuild } from "@/lib/build-context";
import { useLocation } from "wouter";
import { usePrefersReducedMotion } from "@/lib/motion";
import type { GameRenderProfile } from "@/lib/webgl-support";

type CameraMode = "orbit" | "auto" | "cinematic";
type SessionMode = "build" | "explore";
type DockTab = "cost" | "scenarios" | "layouts" | "awards";

/*
  Routes that are already a request for the simulator, so the entry gate has
  nothing left to ask. It rendered over the scene as a full-bleed landing
  screen (site name, tagline, credential badges, three profile cards), which
  made /game read as the home page rather than the game: the visitor asked
  for the game by name and got asked again what they wanted. Build is the
  mode its Build button chose, and Explore is one click away in the control
  dock once the scene is up, so nothing the gate offered is lost.
*/
const DIRECT_ENTRY_PATHS = new Set(["/game", "/legacy/game", "/floor"]);

const DOCK_TABS: Array<{ id: DockTab; label: string; tour?: string }> = [
  { id: "scenarios", label: "Scenarios", tour: "scenarios" },
  { id: "cost", label: "Cost" },
  { id: "layouts", label: "Layouts" },
  { id: "awards", label: "Awards" },
];

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

export function DataCenter3D({
  renderProfile = "cinematic",
}: {
  renderProfile?: GameRenderProfile;
}) {
  const {
    isLoading,
    racks,
    isStaticMode,
    equipmentCatalog,
    facilityMetrics,
    setRacksFromSave,
    addEmptyRack,
    addEmptyRackAtPosition,
    sharedLayoutVisibleCount,
  } = useGame();
  const { selectedIds, selectRack, clearSelection, undo, redo } = useBuild();
  const { toast } = useToast();
  const [location] = useLocation();
  const prefersReducedMotion = usePrefersReducedMotion();

  // Seeded rather than set from the effect below so the gate never gets a
  // frame of its own on the way in.
  const [sessionMode, setSessionMode] = useState<SessionMode | null>(() =>
    DIRECT_ENTRY_PATHS.has(location) ? "build" : null,
  );
  const introVisible = sessionMode === null;
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [showEffects, setShowEffects] = useState(true);
  const [showHUD, setShowHUD] = useState(true);
  const [rackCount, setRackCount] = useState(1);
  const [sliderValue, setSliderValue] = useState(1);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [qualityMode, setQualityMode] = useState<"low" | "high">("high");
  const [showOverlays, setShowOverlays] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [showToolbars, setShowToolbars] = useState(true);
  const [showPerfOverlay, setShowPerfOverlay] = useState(false);
  const [perfWarning, setPerfWarning] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [rackScale] = useState(1);
  const [controlDockOpen, setControlDockOpen] = useState(true);
  const [placingRack, setPlacingRack] = useState(false);

  const [activeTab, setActiveTab] = useState<DockTab>("scenarios");
  const [lightingMode, setLightingMode] = useState<LightingMode>("night");
  const [audioOn, setAudioOn] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [capacityAlert, setCapacityAlert] = useState<string | null>(null);

  const [fastRamp, setFastRamp] = useState(false);
  const fastRampTimer = useRef<number | null>(null);
  const rackUpdateTimer = useRef<number | null>(null);
  const capacityAlertTimer = useRef<number | null>(null);
  const [lodResetToken, setLodResetToken] = useState(0);

  const sceneRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<SceneCapture | null>(null);

  const [proceduralOptions] = useState({
    seed: 42,
    fillRateMultiplier: 1,
    errorRate: 1,
    tempBase: 20,
  });

  const selectedRackId = selectedIds[0] ?? null;
  const visibleRacks = useMemo(
    () => (isStaticMode ? racks.slice(0, rackCount) : racks),
    [isStaticMode, rackCount, racks],
  );
  const selectedRack = visibleRacks?.find((r) => r.id === selectedRackId) || null;
  const effectiveEffects =
    renderProfile !== "compatibility" && showEffects && !fastRamp && !prefersReducedMotion;

  const catalogMap = useMemo(() => {
    const map = new Map<string, Equipment>();
    (equipmentCatalog ?? []).forEach((item) => map.set(item.id, item));
    return map;
  }, [equipmentCatalog]);

  const catalogList = useMemo<Equipment[]>(() => equipmentCatalog ?? [], [equipmentCatalog]);
  const equipmentTypesTotal = useMemo(
    () => new Set(catalogList.map((item) => item.type)).size,
    [catalogList],
  );

  const applyRackCount = useCallback((next: number) => {
    const clamped = Math.max(1, Math.round(next));
    setSliderValue(clamped);
    setRackCount(clamped);
    setLodResetToken((prev) => prev + 1);
  }, []);

  const handleScenarioSetup = useCallback(
    (scenario: Scenario) => {
      if (scenario.setup.rackCount !== undefined) {
        applyRackCount(scenario.setup.rackCount);
      }
      setControlDockOpen(true);
      setActiveTab("scenarios");
    },
    [applyRackCount],
  );

  const handleScenarioComplete = useCallback(
    (scenarioId: string) => {
      const scenario = SCENARIOS.find((item) => item.id === scenarioId);
      toast({
        title: "Scenario complete",
        description: scenario
          ? `${scenario.title}: every objective is holding. The debrief is in the scenarios panel.`
          : "Every objective is holding.",
      });
    },
    [toast],
  );

  const scenarioRun = useScenarioRun({
    visibleRacks,
    catalog: catalogMap,
    heatmapOn: showHeatmap,
    criticalAlerts: facilityMetrics.criticalAlerts,
    onApplySetup: handleScenarioSetup,
    onComplete: handleScenarioComplete,
  });
  const capacity = scenarioRun.capacity;

  /*
    PUE for the floor you can see, not for the 500 rack pool behind it. The
    context's facilityMetrics covers the whole pool, which would peg PUE at
    1.40 no matter how far down the density slider went, and both the cost
    line and the efficiency achievement are about the build in front of you.
  */
  const visiblePue = useMemo(() => facilityPue(capacity.rackCount), [capacity.rackCount]);

  const costEstimate = useMemo(
    () => estimateBuildCost(visibleRacks, catalogMap, capacity.itLoadW, visiblePue),
    [capacity.itLoadW, catalogMap, visiblePue, visibleRacks],
  );

  const achievements = useAchievements();
  const achievementContext = useMemo<AchievementContext>(
    () => ({
      rackCount: capacity.rackCount,
      pue: visiblePue,
      criticalRacks: capacity.criticalRacks,
      equipmentTypesUsed: capacity.equipmentTypesUsed,
      equipmentTypesTotal,
      longestRow: longestContiguousRow(visibleRacks),
      completedScenarios: scenarioRun.completedIds.length,
      totalScenarios: SCENARIOS.length,
    }),
    [
      capacity.criticalRacks,
      capacity.equipmentTypesUsed,
      capacity.rackCount,
      equipmentTypesTotal,
      scenarioRun.completedIds.length,
      visiblePue,
      visibleRacks,
    ],
  );

  const { evaluate: evaluateAchievements, unlock: unlockAchievement } = achievements;
  useEffect(() => {
    if (introVisible) return;
    evaluateAchievements(achievementContext);
  }, [achievementContext, evaluateAchievements, introVisible]);

  useAchievementAutoDismiss(achievements.pending, achievements.dismiss, !photoMode);

  /*
    A capacity ceiling only helps if crossing it says so. The meters carry
    the standing state; this fires once on the transition, in words, wherever
    the user is looking.
  */
  const wasOverBudget = useRef(false);
  useEffect(() => {
    const over = capacity.overPower || capacity.overCooling;
    if (over && !wasOverBudget.current) {
      const parts: string[] = [];
      if (capacity.overPower) {
        parts.push(`${formatWatts(-capacity.powerHeadroomW)} over the power feed`);
      }
      if (capacity.overCooling) {
        parts.push(`${formatWatts(-capacity.coolingHeadroomW)} over cooling capacity`);
      }
      setCapacityAlert(
        `This build is now ${parts.join(" and ")}. Reduce rack density or take equipment out.`,
      );
      if (capacityAlertTimer.current) window.clearTimeout(capacityAlertTimer.current);
      capacityAlertTimer.current = window.setTimeout(() => setCapacityAlert(null), 9000);
    }
    if (!over && wasOverBudget.current) {
      setCapacityAlert(null);
    }
    wasOverBudget.current = over;
  }, [
    capacity.coolingHeadroomW,
    capacity.overCooling,
    capacity.overPower,
    capacity.powerHeadroomW,
  ]);

  useEffect(
    () => () => {
      if (capacityAlertTimer.current) window.clearTimeout(capacityAlertTimer.current);
      if (fastRampTimer.current) window.clearTimeout(fastRampTimer.current);
      if (rackUpdateTimer.current) window.clearTimeout(rackUpdateTimer.current);
    },
    [],
  );

  // A layout arriving by link decides its own density, once.
  const appliedSharedCount = useRef(false);
  useEffect(() => {
    if (appliedSharedCount.current || sharedLayoutVisibleCount === null) return;
    appliedSharedCount.current = true;
    applyRackCount(sharedLayoutVisibleCount);
    toast({
      title: "Shared layout loaded",
      description: `${sharedLayoutVisibleCount.toLocaleString()} racks restored from the link.`,
    });
  }, [applyRackCount, sharedLayoutVisibleCount, toast]);

  const validateBuild = useCallback(() => {
    const powerViolations = racks.filter((rack) => rack.currentPowerDraw > rack.powerCapacity);
    const slotViolations = racks.filter((rack) => {
      const usedSlots =
        rack.installedEquipment?.reduce((acc, eq) => acc + (eq.uEnd - eq.uStart + 1), 0) || 0;
      return usedSlots > rack.totalUs;
    });

    if (powerViolations.length === 0 && slotViolations.length === 0) {
      toast({
        title: "Validation passed",
        description: "All racks are within power and capacity limits.",
      });
      return true;
    }

    toast({
      title: "Validation found issues",
      description: `${powerViolations.length} power alerts · ${slotViolations.length} capacity alerts.`,
      variant: "destructive",
    });
    return false;
  }, [racks, toast]);

  useEffect(() => {
    if (renderProfile !== "compatibility") return;
    setShowEffects(false);
    setCameraMode("orbit");
    setQualityMode("low");
    setShowPerfOverlay(false);
    setFocusMode(false);
    setShowOverlays(true);
    setShowToolbars(true);
  }, [renderProfile]);

  useEffect(() => {
    if (isStaticMode) {
      setIsUnlocked(true);
      return;
    }
    const savedUnlock = localStorage.getItem("hyperscale_unlocked");
    if (savedUnlock === "true") setIsUnlocked(true);
  }, [isStaticMode]);

  const handleUnlock = () => {
    if (isStaticMode) return;
    setIsUnlocked(true);
    localStorage.setItem("hyperscale_unlocked", "true");
  };

  const handleSelectRack = (rack: Rack | null) => {
    if (introVisible) return;
    if (!rack) {
      clearSelection();
      return;
    }
    selectRack(rack.id);
  };

  const handleRackCountChange = (next: number) => {
    const clamped = Math.min(Math.max(500, racks.length), Math.max(1, Math.round(next)));
    setSliderValue(clamped);
    if (rackUpdateTimer.current) window.clearTimeout(rackUpdateTimer.current);
    rackUpdateTimer.current = window.setTimeout(() => {
      setRackCount(clamped);
      setLodResetToken((prev) => prev + 1);
    }, 120);
    setFastRamp(true);
    if (fastRampTimer.current) window.clearTimeout(fastRampTimer.current);
    fastRampTimer.current = window.setTimeout(() => setFastRamp(false), 500);
  };

  /*
    Spawning prepends a rack to the pool, and the floor is the first
    rackCount of that pool, so without widening the slice the new cabinet
    would push the last one out of view. That also quietly moved the load,
    which a scenario budget is measured against.
  */
  const handleSpawnRack = () => {
    addEmptyRack();
    applyRackCount(rackCount + 1);
  };

  const handleSetMode = useCallback(
    (mode: SessionMode) => {
      setSessionMode(mode);
      if (mode === "explore") {
        setFocusMode(true);
        setShowOverlays(false);
        setShowToolbars(false);
        setCameraMode(renderProfile === "compatibility" ? "orbit" : "cinematic");
        setShowHUD(true);
        setShowEffects(renderProfile !== "compatibility");
      } else {
        setFocusMode(false);
        setShowOverlays(true);
        setShowToolbars(true);
        setCameraMode("orbit");
        setShowHUD(true);
        setShowEffects(renderProfile !== "compatibility");
      }
    },
    [renderProfile],
  );

  useEffect(() => {
    if (DIRECT_ENTRY_PATHS.has(location)) {
      handleSetMode("build");
      return;
    }
    if (location === "/") {
      setSessionMode(null);
    }
  }, [handleSetMode, location]);

  // First run only, and only once the entry screen is out of the way.
  useEffect(() => {
    if (introVisible || photoMode) return;
    if (hasSeenTour()) return;
    const timer = window.setTimeout(() => setTourOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [introVisible, photoMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (isTypingTarget(event.target)) return;

      // The shortcut sheet answers for itself even from the entry screen,
      // and Escape has to reach it before the intro guard below.
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }
      if (event.key === "Escape" && shortcutsOpen) {
        setShortcutsOpen(false);
        return;
      }
      if (introVisible) return;

      if (event.key === "1") setCameraMode("orbit");
      if (event.key === "2") setCameraMode(renderProfile === "compatibility" ? "orbit" : "auto");
      if (event.key === "3") setCameraMode(renderProfile === "compatibility" ? "orbit" : "cinematic");

      if (event.key.toLowerCase() === "h") setShowHUD((p) => !p);
      if (event.key.toLowerCase() === "e") setShowEffects((p) => !p);
      if (event.key.toLowerCase() === "g") setFocusMode((p) => !p);
      if (event.key.toLowerCase() === "f") setShowPerfOverlay((p) => !p);
      if (event.key.toLowerCase() === "o") setShowOverlays((p) => !p);
      if (event.key.toLowerCase() === "t") setShowToolbars((p) => !p);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [introVisible, redo, renderProfile, shortcutsOpen, undo]);

  const handleToggleAudio = useCallback(async () => {
    if (audioOn) {
      await ambientHum.stop();
      setAudioOn(false);
      return;
    }
    const started = await ambientHum.start();
    setAudioOn(started);
    if (!started) {
      toast({
        title: "Audio unavailable",
        description: "This browser would not open an audio context for the room tone.",
        variant: "destructive",
      });
    }
  }, [audioOn, toast]);

  // Never leave a hum running behind a closed scene.
  useEffect(
    () => () => {
      void ambientHum.dispose();
    },
    [],
  );

  const handlePhotoMode = useCallback(async () => {
    if (photoBusy) return;
    if (!captureRef.current) {
      toast({
        title: "Photo mode unavailable",
        description: "The renderer has not finished starting up.",
        variant: "destructive",
      });
      return;
    }
    setPhotoBusy(true);
    setPhotoMode(true);
    try {
      // One beat for the overlays to come down and the camera to reframe.
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      const blob = await captureRef.current?.();
      if (!blob) {
        toast({
          title: "Could not capture the canvas",
          description: "The browser returned an empty image.",
          variant: "destructive",
        });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `datacenter-${capacity.rackCount}-racks-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      unlockAchievement("photo-mode");
      toast({
        title: "Photo saved",
        description: `A PNG of ${capacity.rackCount.toLocaleString()} racks is in your downloads.`,
      });
    } finally {
      setPhotoMode(false);
      setPhotoBusy(false);
    }
  }, [capacity.rackCount, photoBusy, toast, unlockAchievement]);

  const handleStartScenario = useCallback(
    (scenario: Scenario) => {
      const target = scenario.setup.rackCount ?? rackCount;
      const slice = isStaticMode ? racks.slice(0, target) : racks;
      const baseline = deriveCapacity(slice, catalogMap, scenario.setup.overrides ?? {});
      scenarioRun.start(scenario, baseline);
    },
    [catalogMap, isStaticMode, rackCount, racks, scenarioRun],
  );

  const handleTourStep = useCallback(() => setControlDockOpen(true), []);

  const handleLoadLayout = useCallback(
    (loaded: Rack[], visibleCount: number) => {
      setRacksFromSave(loaded);
      applyRackCount(Math.max(1, visibleCount));
      clearSelection();
    },
    [applyRackCount, clearSelection, setRacksFromSave],
  );

  const scenarioNote = useMemo(() => {
    if (!scenarioRun.run || !scenarioRun.scenario) return null;
    const parts: string[] = [];
    const overrides = scenarioRun.overrides;
    if (overrides.crahUnitsOffline) {
      parts.push(`${overrides.crahUnitsOffline} CRAH units are offline for this scenario`);
    }
    if (overrides.powerFeedFraction !== undefined && overrides.powerFeedFraction < 1) {
      parts.push(
        `the feed is at ${Math.round(overrides.powerFeedFraction * 100)} percent of its rating`,
      );
    }
    if (overrides.powerCeilingOverrideW !== undefined) {
      parts.push(`the power ceiling is a tenant budget of ${formatWatts(overrides.powerCeilingOverrideW)}`);
    }
    if (parts.length === 0) return null;
    return `Scenario in progress: ${parts.join(", ")}.`;
  }, [scenarioRun.overrides, scenarioRun.run, scenarioRun.scenario]);

  const sceneCameraMode: CameraMode =
    renderProfile === "compatibility"
      ? "orbit"
      : prefersReducedMotion
        ? "orbit"
        : introVisible
          ? "cinematic"
          : cameraMode;
  const showInstantShell = isLoading && racks.length === 0;
  const chromeVisible = !introVisible && !photoMode;
  const audioSupported = isAmbientAudioSupported();

  return (
    <div
      ref={sceneRef}
      className="relative w-full h-full min-h-[520px] overflow-hidden bg-transparent"
      data-tour="scene"
    >
      {showInstantShell && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          <InstantShell className="pointer-events-none" />
        </div>
      )}
      <DatacenterScene
        onSelectRack={handleSelectRack}
        selectedRackId={selectedRackId}
        isUnlocked={isUnlocked}
        cameraMode={sceneCameraMode}
        showEffects={introVisible ? renderProfile !== "compatibility" : effectiveEffects}
        showHUD={introVisible || photoMode ? false : showHUD}
        showPerfOverlay={showPerfOverlay && !photoMode}
        rackScale={rackScale}
        rackCount={rackCount}
        proceduralOptions={proceduralOptions}
        showHeatmap={showHeatmap}
        lightingMode={lightingMode}
        photoFraming={photoMode}
        captureRef={captureRef}
        qualityMode={renderProfile === "compatibility" ? "low" : qualityMode}
        visibleRacks={visibleRacks}
        forceSimplified={renderProfile === "compatibility" || (isStaticMode && fastRamp)}
        lodResetToken={lodResetToken}
        renderProfile={renderProfile}
        onPerfWarningChange={setPerfWarning}
        onPointerGridConfirm={(positionX, positionY) => {
          if (!placingRack) return;
          addEmptyRackAtPosition(positionX, positionY);
          applyRackCount(rackCount + 1);
          setPlacingRack(false);
        }}
      />

      {chromeVisible && (
        <>
          <div className="absolute top-0 left-0 right-0 z-40">
            <GameHeader />
          </div>
          <div
            data-ui="true"
            data-tour="dock"
            className={`absolute top-20 left-4 z-50 flex max-h-[calc(100%-6.5rem)] w-[320px] flex-col rounded-2xl border border-cyan-500/30 bg-black/85 shadow-[0_0_24px_rgba(34,211,238,0.2)] backdrop-blur-lg transition-transform ${
              controlDockOpen ? "translate-x-0" : "-translate-x-[110%]"
            }`}
          >
            <button
              type="button"
              className="absolute -right-6 top-6 h-8 w-8 rounded-full border border-cyan-500/30 bg-black/70 text-cyan-200 shadow-md"
              onClick={() => setControlDockOpen((prev) => !prev)}
              aria-label={controlDockOpen ? "Collapse the control dock" : "Expand the control dock"}
              aria-expanded={controlDockOpen}
            >
              <span aria-hidden>{controlDockOpen ? "◀" : "▶"}</span>
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">
                    Hyperscale Control
                  </div>
                  <div className="text-xl font-semibold text-white">Datacenter Command</div>
                  <div className="text-[10px] text-white/60">
                    Live orchestration for power, thermals, and topology. Created by Max Doubin.
                  </div>
                </div>
                <ThemeToggle />
              </div>

              <div className="mt-4 space-y-3">
                {/*
                  The shared Slider puts its props on the Radix root rather
                  than the thumb, so an aria-label on it would not reach the
                  control. A labelled group is what is available without
                  changing a component the whole site uses.
                */}
                <div role="group" aria-label={`Rack density, ${sliderValue} racks`}>
                  <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/60">
                    <span>Rack density</span>
                    <span className="text-cyan-200">{sliderValue}</span>
                  </div>
                  <Slider
                    value={[sliderValue]}
                    min={1}
                    max={Math.max(500, racks.length)}
                    step={1}
                    onValueChange={(value) => handleRackCountChange(value[0])}
                  />
                </div>

                <CapacityMeters
                  capacity={capacity}
                  heatmapOn={showHeatmap}
                  scenarioNote={scenarioNote}
                />

                <div className="flex flex-wrap gap-2" data-tour="modes">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowHeatmap((p) => !p)}
                    aria-pressed={showHeatmap}
                    className={`bg-white/10 text-white hover:bg-white/20 ${showHeatmap ? "border border-orange-400/60 shadow-[0_0_8px_rgba(251,146,60,0.4)]" : ""}`}
                  >
                    Heatmap: {showHeatmap ? "ON" : "OFF"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowHUD((p) => !p)}
                    aria-pressed={showHUD}
                    className={`bg-white/10 text-white hover:bg-white/20 ${showHUD ? "border border-cyan-400/60" : ""}`}
                  >
                    HUD: {showHUD ? "ON" : "OFF"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSetMode("build")}
                    aria-pressed={sessionMode === "build"}
                    className={`bg-white/10 text-white hover:bg-white/20 ${
                      sessionMode === "build" ? "border border-cyan-400/60" : ""
                    }`}
                  >
                    Build Mode
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSetMode("explore")}
                    aria-pressed={sessionMode === "explore"}
                    className={`bg-white/10 text-white hover:bg-white/20 ${
                      sessionMode === "explore" ? "border border-purple-400/60" : ""
                    }`}
                  >
                    Explore Mode
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setQualityMode((prev) => (prev === "high" ? "low" : "high"))}
                    className="bg-white/10 text-white hover:bg-white/20"
                  >
                    Quality: {qualityMode.toUpperCase()}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (placingRack) {
                        setPlacingRack(false);
                        return;
                      }
                      handleSpawnRack();
                    }}
                    className="bg-white/10 text-white hover:bg-white/20"
                  >
                    {placingRack ? "Cancel" : "Spawn Rack"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPlacingRack((prev) => !prev)}
                    aria-pressed={placingRack}
                    className={`bg-white/10 text-white hover:bg-white/20 ${placingRack ? "border border-green-400/60" : ""}`}
                  >
                    {placingRack ? "Drop Mode" : "Place Rack"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setLightingMode((prev) => (prev === "night" ? "day" : "night"))
                    }
                    className="bg-white/10 text-white hover:bg-white/20"
                  >
                    Lighting: {lightingMode === "day" ? "DAY" : "NIGHT"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleToggleAudio}
                    aria-pressed={audioOn}
                    disabled={!audioSupported}
                    className={`bg-white/10 text-white hover:bg-white/20 ${audioOn ? "border border-cyan-400/60" : ""}`}
                  >
                    {audioSupported ? `Room tone: ${audioOn ? "ON" : "OFF"}` : "Room tone: n/a"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handlePhotoMode}
                    disabled={photoBusy}
                    className="bg-white/10 text-white hover:bg-white/20"
                  >
                    {photoBusy ? "Capturing" : "Photo mode"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={validateBuild}
                    className="bg-white/10 text-white hover:bg-white/20"
                  >
                    Validate
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShortcutsOpen(true)}
                    className="bg-white/10 text-white hover:bg-white/20"
                  >
                    Shortcuts (?)
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowDiagnostics((prev) => !prev)}
                    aria-pressed={showDiagnostics}
                    className="bg-white/10 text-white hover:bg-white/20"
                  >
                    Diagnostics
                  </Button>
                </div>
              </div>

              <div className="mt-4 border-t border-white/10 pt-3">
                <div
                  className="flex flex-wrap gap-1"
                  role="tablist"
                  aria-label="Control dock panels"
                >
                  {DOCK_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`dock-tab-${tab.id}`}
                      aria-selected={activeTab === tab.id}
                      aria-controls="dock-panel"
                      data-tour={tab.tour}
                      onClick={() => setActiveTab(tab.id)}
                      className={`min-h-[28px] rounded-full px-2.5 text-[10px] uppercase tracking-widest transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
                        activeTab === tab.id
                          ? "bg-cyan-500/25 text-cyan-100"
                          : "bg-white/5 text-white/50 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div
                  className="mt-3"
                  role="tabpanel"
                  id="dock-panel"
                  aria-labelledby={`dock-tab-${activeTab}`}
                >
                  {activeTab === "scenarios" && (
                    <ScenarioPanel
                      scenarios={SCENARIOS}
                      run={scenarioRun.run}
                      scenario={scenarioRun.scenario}
                      evaluation={scenarioRun.evaluation}
                      completedIds={scenarioRun.completedIds}
                      elapsedSeconds={scenarioRun.elapsedSeconds}
                      onStart={handleStartScenario}
                      onAbort={scenarioRun.abort}
                      onRestart={() => {
                        // Re-measure against the floor as it stands now. A
                        // retry that scored against the original baseline
                        // would count work already done.
                        if (scenarioRun.scenario) handleStartScenario(scenarioRun.scenario);
                      }}
                    />
                  )}
                  {activeTab === "cost" && <CostSummary estimate={costEstimate} />}
                  {activeTab === "layouts" && (
                    <LayoutManager
                      racks={racks}
                      visibleCount={rackCount}
                      catalog={catalogList}
                      onLoad={handleLoadLayout}
                      onShareCopied={() => unlockAchievement("shared-layout")}
                    />
                  )}
                  {activeTab === "awards" && (
                    <AchievementsPanel
                      achievements={achievements.achievements}
                      unlocked={achievements.unlocked}
                      context={achievementContext}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {showDiagnostics && (
            <div className="absolute top-20 right-4 z-50 w-[260px]">
              <button
                type="button"
                className="absolute -left-6 top-6 h-8 w-8 rounded-full border border-cyan-500/30 bg-black/70 text-cyan-200 shadow-md"
                onClick={() => setShowDiagnostics(false)}
                aria-label="Close diagnostics"
              >
                <span aria-hidden>▶</span>
              </button>
              <DebugOverlay visible />
            </div>
          )}
        </>
      )}

      <WelcomeScreen
        isVisible={introVisible}
        onStart={(mode) => {
          handleSetMode(mode);
        }}
      />

      {chromeVisible && capacityAlert && (
        <div
          role="alert"
          data-ui="true"
          className="absolute left-1/2 top-16 z-[70] w-[min(420px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-rose-500/60 bg-black/90 px-3 py-2 text-[11px] leading-relaxed text-rose-100 shadow-[0_0_24px_rgba(244,63,94,0.25)] backdrop-blur"
        >
          <span className="mr-1 font-semibold uppercase tracking-widest text-rose-300">
            Over capacity
          </span>
          {capacityAlert}
        </div>
      )}

      {chromeVisible && showOverlays && !focusMode && (
        <>
          {sessionMode === "build" && showToolbars && <BuildToolbar />}
          <GameHUD
            isUnlocked={isUnlocked}
            onUnlock={handleUnlock}
            showUnlock={!isStaticMode}
            hideBottomBar={sessionMode === "build"}
          />
        </>
      )}

      {chromeVisible && selectedRack && showOverlays && !focusMode && (
        <RackDetailPanel
          rack={selectedRack}
          onClose={clearSelection}
          isUnlocked={isUnlocked}
          capacity={capacity}
        />
      )}

      {chromeVisible && (
        <AchievementNotice achievement={achievements.pending[0]} onDismiss={achievements.dismiss} />
      )}

      {chromeVisible && (
        <GuidedTour
          open={tourOpen}
          containerRef={sceneRef}
          onFinish={() => setTourOpen(false)}
          onStepChange={handleTourStep}
        />
      )}

      <ShortcutsDialog
        open={shortcutsOpen && !photoMode}
        onClose={() => setShortcutsOpen(false)}
        compatibilityMode={renderProfile === "compatibility"}
      />

      {chromeVisible && showDiagnostics && perfWarning && (
        <div className="absolute bottom-28 right-4 rounded-md border border-orange-400/30 bg-orange-500/10 p-2 text-[10px] text-orange-200">
          {perfWarning}
        </div>
      )}
    </div>
  );
}
