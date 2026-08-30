/**
 * Which node group in the Cisco model is which device.
 *
 * The devices themselves live in the rack definition, because the model
 * and the elevation are two drawings of the same rack and must not be
 * allowed to disagree about what is in it. Group names in the GLB were
 * chosen to match the device ids exactly, so this is a filter rather than
 * a second copy of the data: anything in the rack is selectable, anything
 * else in the file is structure.
 */

import { ciscoEnterpriseRack } from "@/lib/racks/ciscoEnterprise";
import type { HeroPart } from "./types";

export const CISCO_SCENERY = new Set([
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

export const CISCO_PARTS: HeroPart[] = ciscoEnterpriseRack.devices.map((device) => ({
  group: device.id,
  device,
}));
