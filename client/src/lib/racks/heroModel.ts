/**
 * What each part of the hero model actually is.
 *
 * The model view picks parts by their top level group name, and a name is
 * not information: clicking a switch has to open the switch's real figures
 * or the whole interaction is decoration. This is the table that turns
 * `USW_PRO_24_POE` into a device the existing detail panel can render.
 *
 * Same discipline as the rest of the library. Where the product is real and
 * Ubiquiti publish a number, the number is here with the page it came from.
 * Where the model shows a part that is not a shipping product under that
 * name, it says so, and it does not get a fabricated model number or a
 * fabricated wattage. Three of the ten are in that category: the model is
 * an illustration of a full power chain, and inventing SKUs to label its
 * parts would be worse than admitting they are generic.
 *
 * `watts` is null wherever Ubiquiti publish a supply rating or a PoE budget
 * rather than the device's own draw, which is most of the time.
 */

import type { RackDevice } from "@/lib/rackTypes";

export interface HeroPart {
  /** Top level node group in the GLB. */
  group: string;
  device: RackDevice;
}

/** Groups that are structure or cabling, not equipment. Never selectable. */
export const HERO_SCENERY = new Set([
  "RACK_FRAME",
  "RACK_HOLES",
  "MOUNTING_RAILS",
  "SIDE_BRACES",
  "SIDE_EAR_BRACKETS",
  "TOP_HANDLE",
  "CASTERS",
  "CASTER_BRAKES",
  "CASTER_TREAD",
  "BOTTOM_SHELF",
  "SHELF_FEET",
  "FRAME_EDGE_HIGHLIGHTS",
  "PATCH_CABLES_WHITE",
  "PATCH_CABLES_BLUE",
  "BLUE_UPLINKS",
  "LONG_WHITE_SERVICE_CABLE",
  "PDU_RIGHT_POWER_CORD",
  "POWER_MATRIX_CORDS",
  "POWER_MATRIX_BOOT_RINGS",
  "TRANSFER_POWER_CORD",
  "UPS_POWER_CORD",
  "REAR_DATA_TRUNK",
  "REAR_LACING_BARS",
  "REAR_LACING_RINGS",
  "REAR_POWER_BUNDLE",
  "world",
]);

const ACCENT = {
  gateway: "#4cf1f1",
  switch: "#ccff00",
  storage: "#7c9cff",
  passive: "#8a93a6",
  power: "#9234ea",
};

export const HERO_PARTS: HeroPart[] = [
  {
    group: "UDM_PRO_MAX",
    device: {
      id: "UDM_PRO_MAX",
      u: 1,
      vendor: "Ubiquiti",
      model: "Dream Machine Pro",
      role: "The gateway: routing, firewall, IDS and the UniFi Network controller in one 1U box, with a bay for a hard disk so Protect can record without a separate recorder. Everything else in this rack is behind it.",
      family: "router",
      finish: "silver",
      display: "unifi",
      watts: null,
      accent: ACCENT.gateway,
      url: "https://techspecs.ui.com/unifi/cloud-gateways/udm-pro",
    },
  },
  {
    group: "PATCH_PANEL_24",
    device: {
      id: "PATCH_PANEL_24",
      u: 1,
      vendor: "Ubiquiti",
      model: "24-port keystone patch panel",
      role: "Where the building's cabling lands. Every wall drop is punched down to a position here and patched across to a switch port, so a bad drop is traced by pulling one lead rather than by chasing cable through a ceiling.",
      family: "patch",
      finish: "silver",
      watts: null,
      accent: ACCENT.passive,
      url: "https://techspecs.ui.com/unifi/accessories/uacc-rack-panel-patch-blank-24",
    },
  },
  {
    group: "USW_PRO_24_POE",
    device: {
      id: "USW_PRO_24_POE",
      u: 1,
      vendor: "Ubiquiti",
      model: "Switch Pro 24 PoE (USW-Pro-24-PoE)",
      role: "The access switch: 24 gigabit ports carrying PoE to the access points, cameras and phones, with two 10G SFP+ uplinks to the aggregation layer. All 24 jacks sit in a single row across the panel, which is a UniFi signature.",
      family: "switch",
      finish: "silver",
      display: "unifi",
      // Ubiquiti publish a 400W PoE budget and a supply rating, not the
      // switch's own consumption, so this stays null rather than quoting a
      // budget as a draw.
      watts: null,
      accent: ACCENT.switch,
      url: "https://techspecs.ui.com/unifi/switching/usw-pro-24-poe",
    },
  },
  {
    group: "CABLE_MANAGER",
    device: {
      id: "CABLE_MANAGER",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "A row of open D-rings between the patch field and the switch. Bundles drop in from above and are retained without being clamped, and the open side is the point: a lead can be added later without unthreading the rack.",
      family: "blank",
      look: "fingers",
      finish: "silver",
      watts: null,
      accent: ACCENT.passive,
    },
  },
  {
    group: "USP_RPS_PRO",
    device: {
      id: "USP_RPS_PRO",
      u: 1,
      vendor: "Ubiquiti",
      model: "SmartPower RPS Pro (USP-RPS-Pro)",
      role: "Redundant DC power. Devices below it draw from this instead of their own wall adapters, so a failed brick does not take a switch down and there is one thing to monitor rather than six.",
      family: "pdu",
      finish: "silver",
      watts: null,
      accent: ACCENT.power,
      url: "https://techspecs.ui.com/unifi/power-tech/usp-rps-pro",
    },
  },
  {
    group: "UNVR_PRO_7",
    device: {
      id: "UNVR_PRO_7",
      u: 2,
      vendor: "Ubiquiti",
      model: "Network Video Recorder Pro (UNVR Pro)",
      role: "Camera storage: seven drive bays running UniFi Protect, sized so a site's cameras retain for weeks rather than days. Recording is the part of a camera system that actually costs money.",
      family: "storage",
      finish: "silver",
      bays: { count: 7, occupied: 5, label: "3.5 inch bays" },
      watts: null,
      accent: ACCENT.storage,
      url: "https://techspecs.ui.com/unifi/protect/unvr-pro",
    },
  },
  {
    group: "SMARTPOWER_MATRIX",
    device: {
      id: "SMARTPOWER_MATRIX",
      u: 2,
      vendor: "Generic",
      model: "Managed DC distribution shelf",
      role: "Illustrative. The model shows a managed DC distribution stage between the mains feed and the equipment; it is not drawn from a shipping product, so it carries no model number and no power figure. In a real build this role is filled by the RPS above it or by the PDU below.",
      family: "pdu",
      finish: "silver",
      watts: null,
      accent: ACCENT.power,
    },
  },
  {
    group: "USP_PDU_PRO",
    device: {
      id: "USP_PDU_PRO",
      u: 1,
      vendor: "Ubiquiti",
      model: "Power Distribution Pro (USP-PDU-Pro)",
      role: "Mains distribution with per-outlet monitoring and switching. Being able to power cycle one outlet remotely is the difference between a five minute fix and a drive across town.",
      family: "pdu",
      finish: "silver",
      display: "unifi",
      watts: null,
      accent: ACCENT.power,
      url: "https://techspecs.ui.com/unifi/power-tech/usp-pdu-pro",
    },
  },
  {
    group: "UPS_COOLING_MODULE",
    device: {
      id: "UPS_COOLING_MODULE",
      u: 1,
      vendor: "Generic",
      model: "Battery and thermal module",
      role: "Illustrative. The model pairs a battery stage with active cooling in one chassis. Ubiquiti do not ship that combination under a single name, so it is described for what it does rather than given a SKU it does not have.",
      family: "ups",
      finish: "silver",
      watts: null,
      accent: ACCENT.power,
    },
  },
  {
    group: "TRANSFER_FAN_SWITCH",
    device: {
      id: "TRANSFER_FAN_SWITCH",
      u: 1,
      vendor: "Generic",
      model: "Automatic transfer switch",
      role: "Illustrative. An ATS moves the load between two independent feeds when one fails, which is the piece that makes redundant power actually redundant. Shown generically for the same reason as the two above.",
      family: "pdu",
      finish: "silver",
      watts: null,
      accent: ACCENT.power,
    },
  },
];

export const heroPartByGroup = new Map(HERO_PARTS.map((p) => [p.group, p]));
