import { useMemo } from "react";
import type { Rack, Equipment, InstalledEquipment } from "@shared/schema";

const EQUIPMENT_TEMPLATES = [
  { id: "eq-srv-1u-dell", weight: 20 },
  { id: "eq-srv-1u-hp", weight: 18 },
  { id: "eq-srv-2u-dell", weight: 15 },
  { id: "eq-srv-2u-hp", weight: 12 },
  { id: "eq-srv-4u-dell", weight: 5 },
  { id: "eq-sw-1u-cisco", weight: 10 },
  { id: "eq-sw-1u-arista", weight: 8 },
  { id: "eq-stor-2u-netapp", weight: 8 },
  { id: "eq-stor-4u-pure", weight: 4 },
  { id: "eq-pdu-1u", weight: 6 },
  { id: "eq-ups-2u", weight: 4 },
  { id: "eq-patch-1u", weight: 5 },
];

const RACK_TEMPLATES = [
  { name: "Compute Heavy", types: ["server"], fillRate: 0.85 },
  { name: "Storage Focus", types: ["server", "storage"], fillRate: 0.75 },
  { name: "Network Core", types: ["switch", "router", "firewall"], fillRate: 0.6 },
  { name: "Mixed Workload", types: ["server", "switch", "storage"], fillRate: 0.7 },
  { name: "Edge Pod", types: ["server", "switch", "ups"], fillRate: 0.65 },
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = Math.sin(s * 9999) * 10000;
    return s - Math.floor(s);
  };
}

function generateRackId(index: number): string {
  const row = Math.floor(index / 25);
  const col = index % 25;
  return `rack-gen-${row}-${col}`;
}

function generateRackName(index: number): string {
  const row = String.fromCharCode(65 + Math.floor(index / 25));
  const col = (index % 25) + 1;
  return `${row}${col.toString().padStart(2, '0')}`;
}

export function generateProceduralRacks(
  count: number,
  equipmentCatalog: Equipment[],
  options: {
    seed?: number;
    fillRateMultiplier?: number;
    errorRate?: number;
    tempBase?: number;
    dense?: boolean;
  } = {}
): Rack[] {
  const {
    seed = 42,
    fillRateMultiplier = 1,
    errorRate = 1,
    tempBase = 20,
    dense = false,
  } = options;
  const random = seededRandom(seed);
  const racks: Rack[] = [];
  
  const gridCols = Math.ceil(Math.sqrt(count * 1.5));
  const gridRows = Math.ceil(count / gridCols);

  for (let i = 0; i < count; i++) {
    const rackRandom = seededRandom(seed + i * 131);
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    const aisleOffset = Math.floor(col / 2) * 2;
    
    const template = RACK_TEMPLATES[Math.floor(rackRandom() * RACK_TEMPLATES.length)];
    const fillRate = Math.min(1, template.fillRate * fillRateMultiplier * (0.9 + rackRandom() * 0.2));
    const slots = Array.from({ length: 42 }, (_, j) => ({
      uPosition: j + 1,
      equipmentInstanceId: null,
    }));
    
    const installedEquipment: InstalledEquipment[] = [];
    let currentU = 1;
    const targetFill = Math.floor(42 * fillRate);
    
    while (currentU <= targetFill) {
      const eligibleEquipment = equipmentCatalog.filter(eq => {
        const isTypeMatch = template.types.some(t => eq.type.includes(t));
        const fitsInRack = currentU + eq.uHeight - 1 <= 42;
        return isTypeMatch && fitsInRack;
      });
      
      if (eligibleEquipment.length === 0) break;
      
      const eq = eligibleEquipment[Math.floor(rackRandom() * eligibleEquipment.length)];
      
      installedEquipment.push({
        id: `inst-${eq.id}-${i}-${currentU}-${Math.random().toString(36).substr(2, 4)}`,
        equipmentId: eq.id,
        uStart: currentU,
        uEnd: currentU + eq.uHeight - 1,
        status: rackRandom() > (0.95 / errorRate) ? "warning" : rackRandom() > (0.98 / errorRate) ? "critical" : "online",
        cpuLoad: rackRandom() * 80 + 10,
        memoryUsage: rackRandom() * 70 + 15,
        networkActivity: rackRandom() * 100,
      });
      
      currentU += eq.uHeight;
      
      if (!dense && rackRandom() > 0.7) currentU += 1;
    }
    
    const basePower = installedEquipment.reduce((sum, inst) => {
      const eq = equipmentCatalog.find(e => e.id === inst.equipmentId);
      return sum + (eq?.powerDraw || 0);
    }, 0);
    
    const variance = 0.85 + rackRandom() * 0.3;
    const inletTemp = tempBase + rackRandom() * 5;
    // Exhaust rise over inlet. The coefficient was 0.0034, which at a
    // typical rack load put every rack about 51 C above inlet and pinned
    // the whole floor above the 40 C warning threshold, with the heat
    // shimmer permanently on. A real hot aisle runs 10 to 15 C above inlet.
    const heatLoad = basePower * 0.0009 * variance;
    
    racks.push({
      id: generateRackId(i),
      name: generateRackName(i),
      type: "enclosed_42U",
      totalUs: 42,
      slots,
      installedEquipment,
      powerCapacity: 25000,
      currentPowerDraw: Math.round(basePower * variance),
      inletTemp: Math.round(inletTemp * 10) / 10,
      exhaustTemp: Math.round((inletTemp + heatLoad) * 10) / 10,
      airflowRestriction: Math.round(random() * 30),
      positionX: col,
      positionY: row,
    });
  }
  
  return racks;
}

export function useProceduralRacks(
  count: number,
  equipmentCatalog: Equipment[],
  enabled: boolean = false
): Rack[] {
  return useMemo(() => {
    if (!enabled || !equipmentCatalog.length) return [];
    return generateProceduralRacks(count, equipmentCatalog);
  }, [count, equipmentCatalog, enabled]);
}

export function getRackGridDimensions(rackCount: number): { cols: number; rows: number; spacing: { x: number; z: number } } {
  const cols = Math.ceil(Math.sqrt(rackCount * 1.5));
  const rows = Math.ceil(rackCount / cols);
  return {
    cols,
    rows,
    spacing: { x: 1.2, z: 2.5 },
  };
}
