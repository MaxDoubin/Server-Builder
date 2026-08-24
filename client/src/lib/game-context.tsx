import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { generateProceduralRacks } from "@/components/3d/ProceduralRacks";
import { staticEquipmentCatalog, enhanceEquipmentCatalogItem, type EquipmentCatalogItem } from "@/lib/static-equipment";
import { addAutosaveSnapshot, loadAutosaveSnapshots, sanitizeRacks } from "@/lib/save-system";
import { logError, logWarning } from "@/lib/error-log";
import {
  buildAlerts,
  buildIncidents,
  buildNetwork,
} from "@/lib/static-facility";
import type { 
  GameMode, 
  GameState, 
  Rack, 
  ServerConfig, 
  Alert, 
  Incident,
  NetworkNode,
  NetworkLink,
  FacilityMetrics,
  CPU,
  RAM,
  Storage,
  NIC,
  RAIDController,
  Equipment
} from "@shared/schema";

interface GameContextType {
  isLoading: boolean;
  isStaticMode: boolean;
  gameState: GameState;
  setGameMode: (mode: GameMode) => void;
  
  racks: Rack[];
  servers: ServerConfig[];
  alerts: Alert[];
  incidents: Incident[];
  networkNodes: NetworkNode[];
  networkLinks: NetworkLink[];
  facilityMetrics: FacilityMetrics;
  equipmentCatalog: EquipmentCatalogItem[];
  preloadQueue: Equipment[];
  
  inventory: {
    cpus: CPU[];
    rams: RAM[];
    storage: Storage[];
    nics: NIC[];
    raidControllers: RAIDController[];
  };
  
  selectedRackId: string | null;
  setSelectedRackId: (id: string | null) => void;
  selectedServerId: string | null;
  setSelectedServerId: (id: string | null) => void;
  
  acknowledgeAlert: (id: string) => void;
  updateIncidentStatus: (id: string, status: Incident["status"]) => void;
  
  generateMaxedDatacenter: () => Promise<boolean>;
  isGeneratingMaxed: boolean;
  refetchRacks: () => void;
  addEquipmentToRack: (rackId: string, equipmentId: string, uStart: number) => boolean;
  removeEquipmentFromRack: (rackId: string, equipmentInstanceId: string) => boolean;
  updateRackPosition: (rackId: string, positionX: number, positionY: number) => boolean;
  addEmptyRack: () => void;
  addEmptyRackAtPosition: (positionX: number, positionY: number) => void;
  deleteRacks: (rackIds: string[]) => void;
  duplicateRacks: (rackIds: string[]) => void;
  setRacksFromSave: (racks: Rack[]) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

interface InitData {
  gameState: GameState;
  racks: Rack[];
  servers: ServerConfig[];
  alerts: Alert[];
  incidents: Incident[];
  networkNodes: NetworkNode[];
  networkLinks: NetworkLink[];
  facilityMetrics: FacilityMetrics;
  inventory: {
    cpus: CPU[];
    rams: RAM[];
    storage: Storage[];
    nics: NIC[];
    raidControllers: RAIDController[];
  };
}

const defaultGameState: GameState = {
  currentMode: "noc",
  money: 0,
  reputation: 0,
  tier: "garage",
  contracts: [],
};

const defaultMetrics: FacilityMetrics = {
  totalPower: 0,
  itLoad: 0,
  pue: 1,
  coolingCapacity: 0,
  coolingLoad: 0,
  uptime: 0,
  activeAlerts: 0,
  criticalAlerts: 0,
  serverCount: 0,
  rackCount: 0,
  networkDevices: 0,
  storageCapacity: 0,
  storageUsed: 0,
};

/**
 * Facility metrics computed from the racks actually on the floor.
 *
 * The site deploys as static files, so the /api/init query is disabled and
 * `data` is undefined. facilityMetrics fell back to defaultMetrics, which is
 * all zeroes, and every dashboard KPI read zero: uptime 0.00%, no power, no
 * PUE. StatusBar masked it with `metric || derived` fallbacks of its own,
 * which is why the top strip looked right while the NOC card directly under
 * it read 0.00%. Deriving here gives every consumer the same real numbers.
 */
function deriveMetrics(racks: Rack[], alerts: Alert[]): FacilityMetrics {
  const rackCount = racks.length;
  const serverCount = racks.reduce(
    (sum, rack) => sum + rack.installedEquipment.length,
    0,
  );
  const itLoad = Math.max(1800, serverCount * 45 + rackCount * 120);
  const pue = 1.12 + Math.min(0.28, rackCount / 400);
  const storageCapacity = Math.max(100, serverCount * 4);
  const unacknowledged = alerts.filter((alert) => !alert.acknowledged);
  return {
    totalPower: Math.round(itLoad * pue),
    itLoad,
    pue: Number(pue.toFixed(3)),
    coolingCapacity: Math.round(itLoad * 1.35),
    coolingLoad: Math.round(itLoad * 0.86),
    uptime: 99.98,
    activeAlerts: unacknowledged.length,
    criticalAlerts: unacknowledged.filter((a) => a.severity === "critical").length,
    serverCount,
    rackCount,
    networkDevices: Math.max(2, Math.round(rackCount * 2.5)),
    storageCapacity,
    storageUsed: Math.round(
      storageCapacity * Math.min(0.92, 0.42 + (serverCount % 30) / 100),
    ),
  };
}

const defaultInventory = {
  cpus: [],
  rams: [],
  storage: [],
  nics: [],
  raidControllers: [],
};

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [preloadQueue, setPreloadQueue] = useState<Equipment[]>([]);
  const useStaticData = true;
  const staticRacks = useMemo(
    () =>
      generateProceduralRacks(500, staticEquipmentCatalog, {
        seed: 42,
        fillRateMultiplier: 2,
        errorRate: 1,
        tempBase: 20,
        dense: true,
      }),
    []
  );
  const [staticRacksState, setStaticRacksState] = useState<Rack[]>(staticRacks);
  const autosaveTimer = useRef<number | null>(null);
  const hasLoadedAutosave = useRef(false);

  // Fetch initial game data
  const { data, isLoading, refetch: refetchInit } = useQuery<InitData>({
    queryKey: ["/api/init"],
    staleTime: 30000,
    enabled: !useStaticData,
    onError: (error) => {
      logError("Failed to load initial game data.", error);
    },
  });

  // Separate racks query for more granular updates
  const { data: racksData, refetch: refetchRacksQuery } = useQuery<Rack[]>({
    queryKey: ["/api/racks"],
    staleTime: 5000,
    enabled: !useStaticData,
    onError: (error) => {
      logError("Failed to load racks.", error);
    },
  });

  // Equipment catalog query
  const { data: equipmentData } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
    staleTime: 60000,
    enabled: !useStaticData,
    onError: (error) => {
      logError("Failed to load equipment catalog.", error);
    },
  });

  useEffect(() => {
    const catalog = useStaticData ? staticEquipmentCatalog : equipmentData ?? [];
    setPreloadQueue(catalog);
  }, [equipmentData, useStaticData]);

  const refetchRacks = useCallback(() => {
    refetchRacksQuery();
    refetchInit();
  }, [refetchRacksQuery, refetchInit]);

  // Generate maxed datacenter
  const [isGeneratingMaxed, setIsGeneratingMaxed] = useState(false);
  
  const generateMaxedDatacenter = useCallback(async () => {
    if (useStaticData) {
      return false;
    }
    setIsGeneratingMaxed(true);
    try {
      await apiRequest("POST", "/api/datacenter/generate-maxed", {});
      await refetchRacks();
      return true;
    } catch (error) {
      logError("Failed to generate maxed datacenter.", error);
      return false;
    } finally {
      setIsGeneratingMaxed(false);
    }
  }, [refetchRacks]);

  // Local game mode state for immediate UI updates
  const [localGameMode, setLocalGameMode] = useState<GameMode>("noc");

  // Sync local state when data loads
  useEffect(() => {
    if (data?.gameState?.currentMode) {
      setLocalGameMode(data.gameState.currentMode);
    }
  }, [data?.gameState?.currentMode]);

  // Update game mode mutation
  const gameModeMutation = useMutation({
    mutationFn: async (mode: GameMode) => {
      const result = await apiRequest("PATCH", "/api/game-state", { currentMode: mode });
      return result.json();
    },
    onMutate: async (newMode) => {
      // Optimistic update
      setLocalGameMode(newMode);
    },
    onError: (_error, _newMode, _context) => {
      // Revert on error
      if (data?.gameState?.currentMode) {
        setLocalGameMode(data.gameState.currentMode);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/init"] });
    },
  });

  const setGameMode = useCallback((mode: GameMode) => {
    gameModeMutation.mutate(mode);
  }, [gameModeMutation]);

  // Acknowledge alert mutation
  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await apiRequest("PATCH", `/api/alerts/${id}/acknowledge`, {});
      return result.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/init"] });
    },
  });

  const acknowledgeAlert = useCallback((id: string) => {
    acknowledgeAlertMutation.mutate(id);
  }, [acknowledgeAlertMutation]);

  // Update incident status mutation
  const updateIncidentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Incident["status"] }) => {
      const result = await apiRequest("PATCH", `/api/incidents/${id}/status`, { status });
      return result.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/init"] });
    },
  });

  const updateIncidentStatus = useCallback((id: string, status: Incident["status"]) => {
    updateIncidentMutation.mutate({ id, status });
  }, [updateIncidentMutation]);

  const addEquipmentToRack = useCallback(
    (rackId: string, equipmentId: string, uStart: number) => {
      if (!useStaticData) return false;
      const equipment = staticEquipmentCatalog.find((item) => item.id === equipmentId);
      if (!equipment) return false;
      if (!Number.isFinite(uStart)) return false;
      const uEnd = uStart + equipment.uHeight - 1;
      let didAdd = false;
      setStaticRacksState((prev) =>
        prev.map((rack) => {
          if (rack.id !== rackId) return rack;
          if (uStart < 1 || uEnd > rack.totalUs) return rack;

          // Use installedEquipment as the single source of truth for overlap detection.
          // Slot-level equipmentInstanceId can become stale after removal, so we check
          // the authoritative installedEquipment list directly.
          const overlappingInstalled = rack.installedEquipment.filter((inst) => {
            if (!inst.id || inst.uStart === undefined || inst.uEnd === undefined) return false;
            return !(uEnd < inst.uStart || uStart > inst.uEnd);
          });

          const equipmentById = new Map(staticEquipmentCatalog.map((item) => [item.id, item]));
          const overlappingInstanceIds = new Set(overlappingInstalled.map((inst) => inst.id));

          const cleanedInstalled = rack.installedEquipment.filter(
            (item) => !overlappingInstanceIds.has(item.id)
          );
          const removedPower = overlappingInstalled.reduce((acc, item) => {
            const removed = equipmentById.get(item.equipmentId);
            return acc + (removed?.powerDraw ?? 0);
          }, 0);

          didAdd = true;
          const instanceId = `inst-${equipment.id}-${uStart}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

          // Update metrics
          const newCurrentPowerDraw = Math.max(0, rack.currentPowerDraw - removedPower + equipment.powerDraw);

          // Update slots: assign new instance to target range, clear any stale references
          const updatedSlots = rack.slots.map((slot) => {
            if (slot.uPosition >= uStart && slot.uPosition <= uEnd) {
              return { ...slot, equipmentInstanceId: instanceId };
            }
            if (slot.equipmentInstanceId && overlappingInstanceIds.has(slot.equipmentInstanceId)) {
              return { ...slot, equipmentInstanceId: null };
            }
            return slot;
          });

          return {
            ...rack,
            slots: updatedSlots,
            installedEquipment: [
              ...cleanedInstalled,
              {
                id: instanceId,
                equipmentId: equipment.id,
                uStart,
                uEnd,
                status: "online",
                cpuLoad: Math.random() * 80 + 10,
                memoryUsage: Math.random() * 70 + 20,
                networkActivity: Math.random() * 90 + 5,
              },
            ],
            currentPowerDraw: newCurrentPowerDraw,
            // Force a property update to trigger React re-render for both 2D and 3D
            _lastUpdate: Date.now(),
          };
        })
      );
      // Trigger a state refresh for anything listening to the entire racks array
      setStaticRacksState(prev => [...prev]);
      return didAdd;
    },
    [useStaticData]
  );

  const removeEquipmentFromRack = useCallback(
    (rackId: string, equipmentInstanceId: string) => {
      if (!useStaticData) return false;
      const equipmentById = new Map(staticEquipmentCatalog.map((item) => [item.id, item]));
      let didRemove = false;
      setStaticRacksState((prev) =>
        prev.map((rack) => {
          if (rack.id !== rackId) return rack;
          const installed = rack.installedEquipment.find((item) => item.id === equipmentInstanceId);
          if (!installed) return rack;
          didRemove = true;
          const equipment = equipmentById.get(installed.equipmentId);

          // Clear all slots that reference this equipment instance, AND also clear
          // any slots in the U-range that might have stale references from prior state.
          const updatedSlots = rack.slots.map((slot) => {
            if (slot.equipmentInstanceId === equipmentInstanceId) {
              return { ...slot, equipmentInstanceId: null };
            }
            if (slot.uPosition >= installed.uStart && slot.uPosition <= installed.uEnd) {
              return { ...slot, equipmentInstanceId: null };
            }
            return slot;
          });

          return {
            ...rack,
            slots: updatedSlots,
            installedEquipment: rack.installedEquipment.filter(
              (item) => item.id !== equipmentInstanceId
            ),
            currentPowerDraw: Math.max(
              0,
              rack.currentPowerDraw - (equipment?.powerDraw ?? 0)
            ),
          };
        })
      );
      return didRemove;
    },
    [useStaticData]
  );

  const updateRackPosition = useCallback(
    (rackId: string, positionX: number, positionY: number) => {
      if (!useStaticData) return false;
      if (!Number.isFinite(positionX) || !Number.isFinite(positionY)) return false;
      let didMove = false;
      setStaticRacksState((prev) =>
        prev.map((rack) => {
          if (rack.id !== rackId) return rack;
          didMove = true;
          return {
            ...rack,
            positionX: Math.round(positionX),
            positionY: Math.round(positionY),
          };
        })
      );
      return didMove;
    },
    [useStaticData]
  );

  const addEmptyRack = useCallback(() => {
    if (!useStaticData) return;
    setStaticRacksState((prev) => {
      const maxCol = Math.max(...prev.map((rack) => rack.positionX), 0);
      const maxRow = Math.max(...prev.map((rack) => rack.positionY), 0);
      const nextPositionX = maxCol + 1;
      const nextPositionY = maxRow;
      const slots = Array.from({ length: 42 }).map((_, index) => ({
        uPosition: index + 1,
        equipmentInstanceId: null,
      }));
      const newRack: Rack = {
        id: `empty-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Sandbox ${prev.length + 1}`,
        type: "enclosed_42U",
        totalUs: 42,
        slots,
        installedEquipment: [],
        powerCapacity: 12000,
        currentPowerDraw: 0,
        inletTemp: 22,
        exhaustTemp: 24,
        airflowRestriction: 0.1,
        positionX: nextPositionX,
        positionY: nextPositionY,
      };
      return [newRack, ...prev];
    });
  }, [useStaticData]);

  const addEmptyRackAtPosition = useCallback(
    (positionX: number, positionY: number) => {
      if (!useStaticData) return;
      if (!Number.isFinite(positionX) || !Number.isFinite(positionY)) return;
      setStaticRacksState((prev) => {
        const slots = Array.from({ length: 42 }).map((_, index) => ({
          uPosition: index + 1,
          equipmentInstanceId: null,
        }));
        const newRack: Rack = {
          id: `empty-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: `Sandbox ${prev.length + 1}`,
          type: "enclosed_42U",
          totalUs: 42,
          slots,
          installedEquipment: [],
          powerCapacity: 12000,
          currentPowerDraw: 0,
          inletTemp: 22,
          exhaustTemp: 24,
          airflowRestriction: 0.1,
          positionX: Math.round(positionX),
          positionY: Math.round(positionY),
        };
        return [newRack, ...prev];
      });
    },
    [useStaticData]
  );

  const deleteRacks = useCallback(
    (rackIds: string[]) => {
      if (!useStaticData) return;
      if (!rackIds.length) return;
      setStaticRacksState((prev) => prev.filter((rack) => !rackIds.includes(rack.id)));
    },
    [useStaticData]
  );

  const duplicateRacks = useCallback(
    (rackIds: string[]) => {
      if (!useStaticData) return;
      if (!rackIds.length) return;
      setStaticRacksState((prev) => {
        const toClone = prev.filter((rack) => rackIds.includes(rack.id));
        const clones = toClone.map((rack, index) => ({
          ...rack,
          id: `dup-${rack.id}-${Date.now()}-${index}`,
          name: `${rack.name} Copy`,
          positionX: rack.positionX + 1 + index,
          positionY: rack.positionY,
          slots: rack.slots.map((slot) => ({ ...slot })),
          installedEquipment: rack.installedEquipment.map((item) => ({
            ...item,
            id: `dup-${item.id}-${Date.now()}-${index}`,
          })),
        }));
        return [...clones, ...prev];
      });
    },
    [useStaticData]
  );

  const setRacksFromSave = useCallback((racks: Rack[]) => {
    if (!useStaticData) return;
    const sanitized = sanitizeRacks(racks);
    if (sanitized.length === 0 && racks.length > 0) {
      logWarning("Save data rejected due to invalid rack payload.");
      return;
    }
    setStaticRacksState(sanitized);
  }, [useStaticData]);

  useEffect(() => {
    if (!useStaticData || hasLoadedAutosave.current) return;
    const snapshots = loadAutosaveSnapshots();
    if (snapshots.length > 0) {
      const sanitized = sanitizeRacks(snapshots[0].racks);
      if (sanitized.length === 0 && snapshots[0].racks.length > 0) {
        logWarning("Autosave payload invalid. Skipping restore.");
      } else {
        setStaticRacksState(sanitized);
      }
    }
    hasLoadedAutosave.current = true;
  }, [useStaticData]);

  useEffect(() => {
    if (!useStaticData) return;
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = window.setTimeout(() => {
      addAutosaveSnapshot(staticRacksState);
    }, 1200);
    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
      }
    };
  }, [staticRacksState, useStaticData]);

  const resolvedRacks = useStaticData
    ? staticRacksState
    : racksData ?? data?.racks ?? [];

  /**
   * The rest of the facility, for the static build.
   *
   * useStaticData disables the API queries, so alerts, incidents and the
   * network topology all arrived empty. The ops dashboards then described a
   * 500 rack site with no network, no alerts and no open incidents. These
   * derive from the racks that exist and are deterministic, so the numbers
   * hold still between navigations.
   *
   * The timestamps are relative to first render rather than to now, which is
   * why the clock is read once here instead of inside the builders.
   */
  const staticClock = useRef(Date.now());
  const staticAlerts = useMemo(
    () => (useStaticData ? buildAlerts(resolvedRacks, staticClock.current) : []),
    [useStaticData, resolvedRacks],
  );
  const staticIncidents = useMemo(
    () => (useStaticData ? buildIncidents(staticClock.current) : []),
    [useStaticData],
  );
  const staticNetwork = useMemo(
    () =>
      useStaticData
        ? buildNetwork(resolvedRacks.length)
        : { nodes: [], links: [] },
    [useStaticData, resolvedRacks.length],
  );

  const resolvedAlerts = data?.alerts ?? staticAlerts;
  const derivedMetrics = useMemo(
    () => deriveMetrics(resolvedRacks, resolvedAlerts),
    [resolvedRacks, resolvedAlerts],
  );

  const contextValue: GameContextType = {
    isLoading,
    isStaticMode: useStaticData,
    gameState: {
      ...(data?.gameState ?? defaultGameState),
      currentMode: localGameMode,
    },
    setGameMode,
    racks: resolvedRacks,
    servers: data?.servers ?? [],
    alerts: resolvedAlerts,
    incidents: data?.incidents ?? staticIncidents,
    networkNodes: data?.networkNodes ?? staticNetwork.nodes,
    networkLinks: data?.networkLinks ?? staticNetwork.links,
    facilityMetrics: data?.facilityMetrics ?? derivedMetrics,
    equipmentCatalog: useMemo(() => {
      if (useStaticData) {
        return staticEquipmentCatalog;
      }
      return (equipmentData ?? []).map((equipment) => enhanceEquipmentCatalogItem(equipment));
    }, [equipmentData, useStaticData]),
    preloadQueue,
    inventory: data?.inventory ?? defaultInventory,
    selectedRackId,
    setSelectedRackId,
    selectedServerId,
    setSelectedServerId,
    acknowledgeAlert,
    updateIncidentStatus,
    generateMaxedDatacenter,
    isGeneratingMaxed,
    refetchRacks,
    addEquipmentToRack,
    removeEquipmentFromRack,
    updateRackPosition,
    addEmptyRack,
    addEmptyRackAtPosition,
    deleteRacks,
    duplicateRacks,
    setRacksFromSave,
  };

  return (
    <GameContext.Provider value={contextValue}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
}
