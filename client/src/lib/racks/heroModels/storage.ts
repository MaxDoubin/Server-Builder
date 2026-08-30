/**
 * Which node group in the storage model is which device.
 *
 * The devices live in the rack definition; group names in the GLB match
 * the device ids, so this is a filter rather than a second copy.
 */

import { storageDenseRack } from "@/lib/racks/storageDense";
import type { HeroPart } from "./types";

export const STORAGE_SCENERY = new Set([
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

export const STORAGE_PARTS: HeroPart[] = storageDenseRack.devices.map((device) => ({
  group: device.id,
  device,
}));
