/**
 * Which node group in the MikroTik model is which device.
 *
 * The devices live in the rack definition; group names in the GLB match
 * the device ids, so this is a filter rather than a second copy.
 */

import { mikrotikIspRack } from "@/lib/racks/mikrotikIsp";
import type { HeroPart } from "./types";

export const MIKROTIK_SCENERY = new Set([
  "RACK_FRAME",
  "RACK_HOLES",
  "MOUNTING_RAILS",
  "SIDE_BRACES",
  "FRAME_EDGE_HIGHLIGHTS",
  "SHELF_FEET",
  "PATCH_CABLES_WHITE",
  "PATCH_CABLES_BLUE",
  "BLUE_UPLINKS",
  "LONG_WHITE_SERVICE_CABLE",
  "world",
]);

export const MIKROTIK_PARTS: HeroPart[] = mikrotikIspRack.devices.map((device) => ({
  group: device.id,
  device,
}));
