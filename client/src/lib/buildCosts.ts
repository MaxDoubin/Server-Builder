/**
 * Cost estimator for a build.
 *
 * EVERY FIGURE HERE IS A ROUGH ORDER OF MAGNITUDE FOR A SIMULATION.
 * They are not quotes, not list prices, and not anyone's actual spend. Real
 * hardware is bought at negotiated discounts off list, real power is bought
 * on a tariff with demand charges, and both move year to year. The numbers
 * are here so the floor has a sense of scale and so a design decision has a
 * visible price, not so anyone can budget from them.
 *
 * The estimate covers hardware and racks only. Shell, generators, UPS plant,
 * chillers and fit-out are excluded, and at real build costs of several
 * dollars per watt of IT capacity they would dwarf everything shown here.
 */

import type { Equipment, EquipmentType, Rack } from "@shared/schema";

/**
 * Capital cost per equipment type, in US dollars.
 *
 * Used when a catalog entry has no price of its own. Where the catalog does
 * carry a price, that wins, because it is per model rather than per class.
 */
export const CAPEX_BY_TYPE: Record<EquipmentType, number> = {
  server_1u: 8_000,
  server_2u: 15_000,
  server_4u: 48_000,
  switch_1u: 19_000,
  switch_2u: 85_000,
  storage_2u: 38_000,
  storage_4u: 135_000,
  pdu_1u: 2_500,
  patch_panel_1u: 450,
  ups_2u: 3_200,
  ups_4u: 8_500,
  router_1u: 28_000,
  router_2u: 45_000,
  firewall_1u: 32_000,
  firewall_2u: 65_000,
  kvm_1u: 4_500,
  console_1u: 3_800,
  blank_1u: 25,
  cable_management_1u: 75,
};

/**
 * An empty enclosed cabinet with rails, blanking, two switched PDUs and
 * containment panels. Roughly four thousand dollars a rack.
 */
export const RACK_CAPEX_USD = 4_000;

/** Blended commercial electricity rate assumed by the sim, US dollars per kWh. */
export const ELECTRICITY_USD_PER_KWH = 0.11;

/** Hours in a year, for a plant that never turns off. */
export const HOURS_PER_YEAR = 8_760;

/**
 * Running cost of one kilowatt held for a year.
 *
 * 0.11 USD/kWh x 8760 h = 963.60 USD per kW-year. This is energy only. It
 * excludes demand charges, maintenance contracts, and staff.
 */
export const OPEX_USD_PER_KW_YEAR = ELECTRICITY_USD_PER_KWH * HOURS_PER_YEAR;

export interface BuildCostEstimate {
  /** Hardware in the racks. */
  equipmentCapexUsd: number;
  /** Empty cabinets, rails and rack PDUs. */
  rackCapexUsd: number;
  hardwareCapexUsd: number;
  /** IT load only, in kW. */
  itLoadKw: number;
  /** IT load multiplied by PUE: what the meter actually turns. */
  facilityLoadKw: number;
  annualPowerOpexUsd: number;
  firstYearTotalUsd: number;
  /** Equipment items the catalog could not resolve, priced at zero. */
  unpricedItems: number;
}

/** Capital cost of one catalog item. */
export function equipmentCapex(equipment: Equipment): number {
  if (Number.isFinite(equipment.price) && equipment.price > 0) return equipment.price;
  return CAPEX_BY_TYPE[equipment.type] ?? 0;
}

/**
 * Cost a build.
 *
 * itLoadW should be the same IT load the capacity meters use, and pue the
 * facility PUE, so the opex line and the power meter agree with each other.
 */
export function estimateBuildCost(
  racks: Rack[],
  catalog: Map<string, Equipment>,
  itLoadW: number,
  pue: number,
): BuildCostEstimate {
  let equipmentCapexUsd = 0;
  let unpricedItems = 0;

  for (const rack of racks) {
    for (const installed of rack.installedEquipment) {
      const equipment = catalog.get(installed.equipmentId);
      if (!equipment) {
        unpricedItems += 1;
        continue;
      }
      equipmentCapexUsd += equipmentCapex(equipment);
    }
  }

  const rackCapexUsd = racks.length * RACK_CAPEX_USD;
  const hardwareCapexUsd = equipmentCapexUsd + rackCapexUsd;
  const itLoadKw = Math.max(0, itLoadW) / 1000;
  const safePue = Number.isFinite(pue) && pue > 0 ? pue : 1;
  const facilityLoadKw = itLoadKw * safePue;
  const annualPowerOpexUsd = facilityLoadKw * OPEX_USD_PER_KW_YEAR;

  return {
    equipmentCapexUsd,
    rackCapexUsd,
    hardwareCapexUsd,
    itLoadKw,
    facilityLoadKw,
    annualPowerOpexUsd,
    firstYearTotalUsd: hardwareCapexUsd + annualPowerOpexUsd,
    unpricedItems,
  };
}

/** Compact currency, because a floor of 500 racks runs into nine figures. */
export function formatUsd(value: number): string {
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value);
  if (amount >= 1_000_000_000) return `${sign}$${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `${sign}$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${sign}$${(amount / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(amount)}`;
}
