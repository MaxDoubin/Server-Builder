/**
 * Which node group in the Juniper model is which device.
 *
 * Same arrangement as the Cisco model: the devices live in the rack
 * definition, group names in the GLB match the device ids, and this is a
 * filter rather than a second copy of the data.
 */

import { juniperCoreRack } from "@/lib/racks/juniperCore";
import type { HeroPart } from "./types";

export const JUNIPER_SCENERY = new Set([
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

export const JUNIPER_PARTS: HeroPart[] = juniperCoreRack.devices.map((device) => ({
  group: device.id,
  device,
}));
