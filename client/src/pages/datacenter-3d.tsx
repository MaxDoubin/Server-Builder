import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useGame } from "@/lib/game-context";
import { DatacenterScene } from "@/components/3d/DatacenterScene";
import { GameHUD } from "@/components/3d/GameHUD";
import { RackDetailPanel } from "@/components/3d/RackDetailPanel";
import { MiniMap } from "@/components/3d/MiniMap";
import { BuildToolbar } from "@/components/3d/BuildToolbar";
import { InstantShell } from "@/components/ui/instant-shell";
import { WelcomeScreen } from "@/components/ui/welcome-screen";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DebugOverlay } from "@/components/ui/debug-overlay";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { GameHeader } from "@/components/layout/game-header";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme-provider";
import { buildSummaryText, downloadBuildSummary } from "@/lib/export";
import {
  loadAutosaveSnapshots,
  loadSaveSlots,
  rollbackAutosaveSnapshot,
  saveSlot,
} from "@/lib/save-system";
import type { Rack } from "@shared/schema";
import type { AutosaveSnapshot, SaveSlot } from "@/lib/save-system";
import { useBuild } from "@/lib/build-context";
import { useLocation } from "wouter";
import { usePrefersReducedMotion } from "@/lib/motion";

type CameraMode = "orbit" | "auto" | "cinematic";
type SessionMode = "build" | "explore";

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

export function DataCenter3D() {
  const {
    isLoading,
    racks,
    isStaticMode,
    setRacksFromSave,
    addEmptyRack,
    addEmptyRackAtPosition,
  } = useGame();
  const { selectedIds, selectRack, clearSelection, undo, redo, canUndo, canRedo } = useBuild();
  const { fontScale, setFontScale, highContrast, toggleHighContrast } = useTheme();
  const { toast } = useToast();
  const [location] = useLocation();
  const prefersReducedMotion = usePrefersReducedMotion();

  const [sessionMode, setSessionMode] = useState<SessionMode | null>(null);
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
  const [rackScale, setRackScale] = useState(1);
  const [controlDockOpen, setControlDockOpen] = useState(true);
  const [placingRack, setPlacingRack] = useState(false);

  const [fastRamp, setFastRamp] = useState(false);
  const fastRampTimer = useRef<number | null>(null);
  const rackUpdateTimer = useRef<number | null>(null);
  const [lodResetToken, setLodResetToken] = useState(0);

  const [proceduralOptions, setProceduralOptions] = useState({
    seed: 42,
    fillRateMultiplier: 1,
    errorRate: 1,
    tempBase: 20,
  });

  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>(() => loadSaveSlots());
  const [autosaves, setAutosaves] = useState<AutosaveSnapshot[]>(() => loadAutosaveSnapshots());
  const [slotLabels, setSlotLabels] = useState<Record<string, string>>(() => {
    const slots = loadSaveSlots();
    const defaults = ["slot-1", "slot-2", "slot-3"];
    return defaults.reduce<Record<string, string>>((acc, id, index) => {
      const match = slots.find((slot) => slot.id === id);
      acc[id] = match?.label ?? `Slot ${index + 1}`;
      return acc;
    }, {});
  });

  const selectedRackId = selectedIds[0] ?? null;
  const visibleRacks = isStaticMode ? racks.slice(0, rackCount) : racks;
  const selectedRack = visibleRacks?.find((r) => r.id === selectedRackId) || null;
  const effectiveEffects = showEffects && !fastRamp && !prefersReducedMotion;



  const validateBuild = () => {
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
  };

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
    const clamped = Math.min(500, Math.max(1, Math.round(next)));
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

  const handleShowIntro = () => {
    setSessionMode(null);
    setFocusMode(false);
    setShowOverlays(true);
    setShowToolbars(true);
    setShowPerfOverlay(false);
  };

  const handleSetMode = useCallback((mode: SessionMode) => {
    setSessionMode(mode);
    if (mode === "explore") {
      setFocusMode(true);
      setShowOverlays(false);
      setShowToolbars(false);
      setCameraMode("cinematic");
      setShowHUD(true);
      setShowEffects(true);
    } else {
      setFocusMode(false);
      setShowOverlays(true);
      setShowToolbars(true);
      setCameraMode("orbit");
      setShowHUD(true);
      setShowEffects(true);
    }
  }, []);

  useEffect(() => {
    if (location === "/floor") {
      handleSetMode("build");
    }
    if (location === "/") {
      setSessionMode(null);
    }
  }, [handleSetMode, location]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (isTypingTarget(event.target)) return;
      if (introVisible) return;

      if (event.key === "1") setCameraMode("orbit");
      if (event.key === "2") setCameraMode("auto");
      if (event.key === "3") setCameraMode("cinematic");

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
  }, [introVisible, redo, undo]);

  const sceneCameraMode: CameraMode = prefersReducedMotion
    ? "orbit"
    : introVisible
      ? "cinematic"
      : cameraMode;
  const showInstantShell = isLoading && racks.length === 0;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-transparent">
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
        showEffects={introVisible ? true : effectiveEffects}
        showHUD={introVisible ? false : showHUD}
        showPerfOverlay={showPerfOverlay}
        rackScale={rackScale}
        rackCount={rackCount}
        proceduralOptions={proceduralOptions}
        showHeatmap={showHeatmap}
        qualityMode={qualityMode}
        visibleRacks={visibleRacks}
        forceSimplified={isStaticMode && fastRamp}
        lodResetToken={lodResetToken}
        onPerfWarningChange={setPerfWarning}
        onPointerGridConfirm={(positionX, positionY) => {
          if (!placingRack) return;
          addEmptyRackAtPosition(positionX, positionY);
          setPlacingRack(false);
        }}
      />

      {!introVisible && (
        <>
          <div className="fixed top-0 left-0 right-0 z-40">
            <GameHeader />
          </div>
          <div
            data-ui="true"
            className={`fixed top-20 left-4 z-50 w-[320px] rounded-2xl border border-cyan-500/30 bg-black/60 p-4 shadow-[0_0_24px_rgba(34,211,238,0.2)] backdrop-blur-lg transition-transform ${
              controlDockOpen ? "translate-x-0" : "-translate-x-[110%]"
            }`}
          >
            <button
              type="button"
              className="absolute -right-6 top-6 h-8 w-8 rounded-full border border-cyan-500/30 bg-black/70 text-cyan-200 shadow-md"
              onClick={() => setControlDockOpen((prev) => !prev)}
            >
              {controlDockOpen ? "◀" : "▶"}
            </button>
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
              <div>
                <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/60">
                  <span>Rack density</span>
                  <span className="text-cyan-200">{sliderValue}</span>
                </div>
                <Slider
                  value={[sliderValue]}
                  min={1}
                  max={500}
                  step={1}
                  onValueChange={(value) => handleRackCountChange(value[0])}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleSetMode("build")}
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
                  className={`bg-white/10 text-white hover:bg-white/20 ${
                    sessionMode === "explore" ? "border border-purple-400/60" : ""
                  }`}
                >
                  Explore Mode
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleShowIntro}
                  className="bg-white/10 text-white hover:bg-white/20"
                >
                  Intro
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowDiagnostics((prev) => !prev)}
                  className="bg-white/10 text-white hover:bg-white/20"
                >
                  Diagnostics
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowPerfOverlay((prev) => !prev)}
                  className="bg-white/10 text-white hover:bg-white/20"
                >
                  Perf HUD
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
                  onClick={() => setRackScale((prev) => Math.min(1.6, prev + 0.1))}
                  className="bg-white/10 text-white hover:bg-white/20"
                >
                  Scale +
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setRackScale((prev) => Math.max(0.6, prev - 0.1))}
                  className="bg-white/10 text-white hover:bg-white/20"
                >
                  Scale -
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (placingRack) {
                      setPlacingRack(false);
                      return;
                    }
                    addEmptyRack();
                  }}
                  className="bg-white/10 text-white hover:bg-white/20"
                >
                  {placingRack ? "Cancel Placement" : "Spawn Empty Rack"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPlacingRack((prev) => !prev)}
                  className="bg-white/10 text-white hover:bg-white/20"
                >
                  {placingRack ? "Click to Place Rack" : "Place Rack"}
                </Button>
              </div>
            </div>
          </div>

          {showDiagnostics && (
            <div className="fixed top-20 right-4 z-50 w-[260px]">
              <button
                type="button"
                className="absolute -left-6 top-6 h-8 w-8 rounded-full border border-cyan-500/30 bg-black/70 text-cyan-200 shadow-md"
                onClick={() => setShowDiagnostics(false)}
              >
                ▶
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

      {!introVisible && showOverlays && !focusMode && (
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

      {selectedRack && showOverlays && !focusMode && (
        <RackDetailPanel rack={selectedRack} onClose={clearSelection} isUnlocked={isUnlocked} />
      )}

      {showDiagnostics && perfWarning && (
        <div className="fixed bottom-28 right-4 rounded-md border border-orange-400/30 bg-orange-500/10 p-2 text-[10px] text-orange-200">
          {perfWarning}
        </div>
      )}
    </div>
  );
}
