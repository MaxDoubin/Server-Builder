/**
 * Power and cooling budgets for the simulated hall.
 *
 * The 3D floor had no ceiling of any kind: you could slide to 500 dense racks
 * and nothing said the utility feed or the chiller plant had run out. Every
 * number below is an explicit, stated assumption so the simulation can be
 * argued with rather than just believed.
 *
 * WATTS PER U
 * The catalog's 1U enterprise servers draw 400 to 500 W each, so where the
 * actual installed equipment is unknown this module assumes 450 W per
 * occupied U. A fully populated 42U rack is therefore about 19 kW, which
 * matches what the procedural generator actually produces (9 to 20 kW per
 * rack, averaging around 15.6 kW).
 *
 * HEAT
 * Essentially all electrical power drawn by IT equipment leaves the rack as
 * heat, so heat in watts is treated as equal to power in watts. The catalog
 * states the same figure in BTU/hr (a 450 W server lists 1535 BTU/hr, and
 * 450 * 3.412 = 1535), so heatOutput is used where it exists because it also
 * covers gear with zero powerDraw but real losses, such as a PDU or a UPS.
 *
 * PLANT SIZING
 * These are the design numbers for the imaginary hall. They are fixed, which
 * is the whole point: a ceiling that grew with the load would never be hit.
 */

import type { Equipment, Rack } from "@shared/schema";

/** 1 W = 3.412142 BTU/hr. */
export const BTU_PER_WATT = 3.412142;

/** One ton of refrigeration is 12,000 BTU/hr, so 3,517 W of heat removal. */
export const WATTS_PER_COOLING_TON = 12_000 / BTU_PER_WATT;

/** Assumed draw of one occupied rack unit when the real equipment is unknown. */
export const ASSUMED_WATTS_PER_U = 450;

/** Sensible cooling capacity of one CRAH unit in this hall. */
export const CRAH_UNIT_CAPACITY_W = 350_000;

/** CRAH units installed. 26 x 350 kW gives 9.1 MW of nameplate cooling. */
export const CRAH_UNITS_INSTALLED = 26;

/**
 * Utility feed available to IT load, in watts.
 *
 * 8 MW sits just above a completely full floor (500 dense racks land near
 * 7.8 MW), so the ceiling is reachable rather than theoretical.
 */
export const DESIGN_IT_CEILING_W = 8_000_000;

/**
 * Heat produced inside the room that is not IT equipment: in-room PDU and UPS
 * losses, lighting, and people. Six percent on top of IT load.
 */
export const IN_ROOM_LOSS_FACTOR = 1.06;

/**
 * Top of the per-rack heatmap scale, in watts of heat.
 *
 * 25 kW is the point at which a rack in this sim is treated as beyond what
 * contained aisle airflow will carry. Density bands used by the ramp:
 * under 5 kW low, 5 to 10 standard, 10 to 15 high, 15 to 20 very high,
 * above 20 extreme.
 */
export const HEAT_SCALE_MAX_W = 25_000;

/** Restricted airflow recirculates exhaust, so effective rack heat rises. */
const AIRFLOW_PENALTY_AT_FULL_RESTRICTION = 0.35;

export interface CapacityOverrides {
  /** CRAH units a scenario has taken out of service. */
  crahUnitsOffline?: number;
  /** Fraction of the utility feed still energised. 1 is a healthy feed. */
  powerFeedFraction?: number;
  /** A scenario budget in watts that replaces the utility feed ceiling. */
  powerCeilingOverrideW?: number;
}

export interface FacilityCapacity {
  rackCount: number;
  equipmentCount: number;
  /** Distinct equipment types installed anywhere on the visible floor. */
  equipmentTypesUsed: number;
  itLoadW: number;
  powerCeilingW: number;
  /** Negative when the build is over budget. */
  powerHeadroomW: number;
  powerUtilization: number;
  overPower: boolean;
  coolingLoadW: number;
  coolingCapacityW: number;
  coolingHeadroomW: number;
  coolingUtilization: number;
  overCooling: boolean;
  crahUnitsOnline: number;
  hottestRackHeatW: number;
  /** Name of the hottest rack, so a scenario can send you to find it. */
  hottestRackName: string | null;
  averageRackW: number;
  maxInletTempC: number;
  avgInletTempC: number;
  /** Racks drawing more than 90 percent of their own rated power capacity. */
  racksNearOwnCapacity: number;
  /** Racks in a critical state: failed gear, over capacity, or over 32 C inlet. */
  criticalRacks: number;
  /** Installed item counts by equipment class, for objectives that count gear. */
  serverCount: number;
  switchCount: number;
  routerCount: number;
  firewallCount: number;
  storageCount: number;
}

/**
 * The airflow restriction field is written two different ways by the code that
 * creates racks: the procedural generator stores an integer 0 to 30 meaning
 * percent, and hand-placed racks store 0.1 meaning a tenth. Reading "1" as a
 * whole 100 percent restriction inflated one rack in thirty by a third, so
 * integers are read as percent and fractions are read as fractions.
 */
function airflowFraction(rack: Rack): number {
  const raw = Number.isFinite(rack.airflowRestriction) ? rack.airflowRestriction : 0;
  const fraction = Number.isInteger(raw) ? raw / 100 : raw;
  return Math.min(1, Math.max(0, fraction));
}

/** Heat in watts produced by one piece of equipment. */
export function equipmentHeatW(equipment: Equipment): number {
  if (Number.isFinite(equipment.heatOutput) && equipment.heatOutput > 0) {
    return equipment.heatOutput / BTU_PER_WATT;
  }
  return Math.max(0, equipment.powerDraw);
}

/**
 * Heat a rack puts into the room, derived from the equipment actually in it.
 *
 * Two details matter here. First, the generator multiplies a rack's recorded
 * currentPowerDraw by a per-rack variance of 0.85 to 1.15, so summing catalog
 * power alone produced racks that rejected more heat than they drew, which is
 * not physical. The equipment sum is therefore reconciled to the recorded
 * draw. Second, a PDU or a UPS lists zero powerDraw but real losses, so those
 * items contribute their stated heat on top.
 *
 * Falls back to the recorded draw when nothing in the rack resolves against
 * the catalog, so a restored save with unknown gear still reads as hot rather
 * than as empty.
 */
export function rackHeatW(rack: Rack, catalog: Map<string, Equipment>): number {
  let resolved = 0;
  let drawingPowerW = 0;
  let lossOnlyW = 0;
  for (const installed of rack.installedEquipment) {
    const equipment = catalog.get(installed.equipmentId);
    if (!equipment) continue;
    resolved += 1;
    if (equipment.powerDraw > 0) {
      drawingPowerW += equipment.powerDraw;
    } else {
      lossOnlyW += equipmentHeatW(equipment);
    }
  }
  const recorded = Math.max(0, rack.currentPowerDraw);
  const base = resolved === 0 ? recorded : (drawingPowerW > 0 ? recorded : 0) + lossOnlyW;
  return base * (1 + airflowFraction(rack) * AIRFLOW_PENALTY_AT_FULL_RESTRICTION);
}

/**
 * Rack heat as a 0 to 1 position on the heatmap scale, quantised to twelfths.
 *
 * Quantising matters: the colour feeds a pooled three.js material keyed on its
 * parameters, so a continuous value would mint a new material per rack and
 * defeat the pool at 500 racks. Twelve steps is enough to read a gradient.
 */
export function rackHeatLevel(rack: Rack, catalog: Map<string, Equipment>): number {
  const level = rackHeatW(rack, catalog) / HEAT_SCALE_MAX_W;
  const clamped = Math.min(1, Math.max(0, level));
  return Math.round(clamped * 12) / 12;
}

const HEAT_STOPS: ReadonlyArray<{ at: number; rgb: [number, number, number] }> = [
  { at: 0, rgb: [37, 99, 235] },
  { at: 0.22, rgb: [6, 182, 212] },
  { at: 0.42, rgb: [34, 197, 94] },
  { at: 0.62, rgb: [234, 179, 8] },
  { at: 0.82, rgb: [249, 115, 22] },
  { at: 1, rgb: [239, 68, 68] },
];

const toHex = (value: number) => Math.round(value).toString(16).padStart(2, "0");

/** Blue through red ramp for a 0 to 1 heat level. */
export function heatLevelColor(level: number): string {
  const t = Math.min(1, Math.max(0, level));
  let lower = HEAT_STOPS[0];
  let upper = HEAT_STOPS[HEAT_STOPS.length - 1];
  for (let i = 0; i < HEAT_STOPS.length - 1; i += 1) {
    if (t >= HEAT_STOPS[i].at && t <= HEAT_STOPS[i + 1].at) {
      lower = HEAT_STOPS[i];
      upper = HEAT_STOPS[i + 1];
      break;
    }
  }
  const span = upper.at - lower.at || 1;
  const k = (t - lower.at) / span;
  const channel = (index: 0 | 1 | 2) => lower.rgb[index] + (upper.rgb[index] - lower.rgb[index]) * k;
  return `#${toHex(channel(0))}${toHex(channel(1))}${toHex(channel(2))}`;
}

/** Plain words for a heat level, so the heatmap is not colour only. */
export function heatLevelLabel(heatW: number): string {
  const kw = heatW / 1000;
  if (kw < 5) return "low density";
  if (kw < 10) return "standard density";
  if (kw < 15) return "high density";
  if (kw < 20) return "very high density";
  return "extreme density";
}

/**
 * Budget position of a build.
 *
 * Pass the racks that are actually on the floor. The scene slices the rack
 * array by the density slider, and the meters describe what you can see, so
 * both sides have to be handed the same slice.
 */
export function deriveCapacity(
  racks: Rack[],
  catalog: Map<string, Equipment>,
  overrides: CapacityOverrides = {},
): FacilityCapacity {
  const rackCount = racks.length;
  let itLoadW = 0;
  let equipmentCount = 0;
  let hottestRackHeatW = 0;
  let hottestRackName: string | null = null;
  let inletSum = 0;
  let maxInletTempC = 0;
  let racksNearOwnCapacity = 0;
  let criticalRacks = 0;
  let serverCount = 0;
  let switchCount = 0;
  let routerCount = 0;
  let firewallCount = 0;
  let storageCount = 0;
  const types = new Set<string>();

  for (const rack of racks) {
    itLoadW += Math.max(0, rack.currentPowerDraw);
    equipmentCount += rack.installedEquipment.length;
    const heat = rackHeatW(rack, catalog);
    if (heat > hottestRackHeatW) {
      hottestRackHeatW = heat;
      hottestRackName = rack.name;
    }
    const inlet = Number.isFinite(rack.inletTemp) ? rack.inletTemp : 0;
    inletSum += inlet;
    if (inlet > maxInletTempC) maxInletTempC = inlet;
    if (rack.powerCapacity > 0 && rack.currentPowerDraw > rack.powerCapacity * 0.9) {
      racksNearOwnCapacity += 1;
    }
    // Same rule the 3D rack uses for its status light, so the count and the
    // colour on the floor cannot disagree.
    let isCritical =
      inlet > 32 || (rack.powerCapacity > 0 && rack.currentPowerDraw > rack.powerCapacity * 0.98);
    for (const installed of rack.installedEquipment) {
      if (installed.status === "critical") isCritical = true;
      const equipment = catalog.get(installed.equipmentId);
      if (!equipment) continue;
      types.add(equipment.type);
      if (equipment.type.startsWith("server")) serverCount += 1;
      else if (equipment.type.startsWith("switch")) switchCount += 1;
      else if (equipment.type.startsWith("router")) routerCount += 1;
      else if (equipment.type.startsWith("firewall")) firewallCount += 1;
      else if (equipment.type.startsWith("storage")) storageCount += 1;
    }
    if (isCritical) criticalRacks += 1;
  }

  const crahUnitsOnline = Math.max(
    0,
    CRAH_UNITS_INSTALLED - Math.max(0, Math.round(overrides.crahUnitsOffline ?? 0)),
  );
  const coolingCapacityW = crahUnitsOnline * CRAH_UNIT_CAPACITY_W;
  const coolingLoadW = itLoadW * IN_ROOM_LOSS_FACTOR;

  const feedFraction = Math.min(1, Math.max(0, overrides.powerFeedFraction ?? 1));
  const powerCeilingW =
    overrides.powerCeilingOverrideW !== undefined
      ? Math.max(0, overrides.powerCeilingOverrideW)
      : DESIGN_IT_CEILING_W * feedFraction;

  return {
    rackCount,
    equipmentCount,
    equipmentTypesUsed: types.size,
    itLoadW,
    powerCeilingW,
    powerHeadroomW: powerCeilingW - itLoadW,
    powerUtilization: powerCeilingW > 0 ? itLoadW / powerCeilingW : 0,
    overPower: itLoadW > powerCeilingW,
    coolingLoadW,
    coolingCapacityW,
    coolingHeadroomW: coolingCapacityW - coolingLoadW,
    coolingUtilization: coolingCapacityW > 0 ? coolingLoadW / coolingCapacityW : 0,
    overCooling: coolingLoadW > coolingCapacityW,
    crahUnitsOnline,
    hottestRackHeatW,
    hottestRackName,
    averageRackW: rackCount > 0 ? itLoadW / rackCount : 0,
    maxInletTempC,
    avgInletTempC: rackCount > 0 ? inletSum / rackCount : 0,
    racksNearOwnCapacity,
    criticalRacks,
    serverCount,
    switchCount,
    routerCount,
    firewallCount,
    storageCount,
  };
}

/**
 * Power usage effectiveness for a floor of this size.
 *
 * A small floor shares its cooling and distribution losses across less IT
 * load, but a very large one runs its plant closer to design and stops
 * getting worse, hence the cap. Shared so the NOC dashboard and the cost
 * estimator cannot drift apart.
 */
export function facilityPue(rackCount: number): number {
  return 1.12 + Math.min(0.28, Math.max(0, rackCount) / 400);
}

/**
 * Would adding this load push the build past a ceiling?
 *
 * Returns a sentence rather than a boolean because the warning has to say
 * what is wrong in words, not only in red.
 */
export function placementWarning(
  capacity: FacilityCapacity,
  addedLoadW: number,
): string | null {
  const nextIt = capacity.itLoadW + addedLoadW;
  const nextCooling = nextIt * IN_ROOM_LOSS_FACTOR;
  const overBy = nextIt - capacity.powerCeilingW;
  const coolingOverBy = nextCooling - capacity.coolingCapacityW;

  if (overBy > 0 && coolingOverBy > 0) {
    return `Over budget: this would put the floor ${formatWatts(overBy)} past the ${formatWatts(
      capacity.powerCeilingW,
    )} power feed and ${formatWatts(coolingOverBy)} past cooling capacity.`;
  }
  if (overBy > 0) {
    return `Over power budget: this would draw ${formatWatts(
      nextIt,
    )} against a ${formatWatts(capacity.powerCeilingW)} feed, ${formatWatts(overBy)} too much.`;
  }
  if (coolingOverBy > 0) {
    return `Over cooling capacity: this would reject ${formatWatts(
      nextCooling,
    )} of heat into a plant rated for ${formatWatts(capacity.coolingCapacityW)}.`;
  }
  return null;
}

/** Watts with a sensible unit. Handles negatives, which headroom needs. */
export function formatWatts(watts: number): string {
  const sign = watts < 0 ? "-" : "";
  const value = Math.abs(watts);
  if (value >= 1_000_000) return `${sign}${(value / 1_000_000).toFixed(2)} MW`;
  if (value >= 1_000) return `${sign}${(value / 1_000).toFixed(1)} kW`;
  return `${sign}${Math.round(value)} W`;
}

/** Percentage as a whole number, for text alongside a bar. */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return "0%";
  return `${Math.round(fraction * 100)}%`;
}
