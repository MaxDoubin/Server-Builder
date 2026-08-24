/**
 * Rack geometry constants in meters, loosely mapped to real server dimensions.
 *
 * 1U = 1.75in ≈ 0.04445m. Rack internal width 19in ≈ 0.4826m.
 * We use a rounded internal width of 0.48m and add outer posts.
 */
export const U = 0.04445;
export const RACK_INNER_WIDTH = 0.482;
export const RACK_POST_WIDTH = 0.030;
export const RACK_TOTAL_WIDTH = RACK_INNER_WIDTH + RACK_POST_WIDTH * 2;
export const RACK_DEPTH = 0.92;
export const RACK_UNITS = 42;
export const RACK_INTERNAL_HEIGHT = RACK_UNITS * U;
export const RACK_FEET_HEIGHT = 0.06;
export const RACK_FRAME_TOP = 0.04;
export const RACK_TOTAL_HEIGHT = RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT + RACK_FRAME_TOP;

export type GearKind =
  | "blank"
  | "server-1u"
  | "server-2u"
  | "server-gpu-4u"
  | "storage-2u"
  | "storage-4u"
  | "switch-1u"
  | "patch-panel-1u"
  | "switch-core-2u"
  | "ups-2u"
  | "kvm-1u"
  | "blade-chassis-7u";

export interface GearSlot {
  /** U position (1 = bottom-most slot). */
  u: number;
  /** Height in U. */
  size: number;
  kind: GearKind;
  label?: string;
  /** Dominant accent color for LEDs. */
  accent?: "signal" | "amber" | "cyan" | "danger";
}

/**
 * A denser, more visibly alive mixed-workload rack for the cinematic hero.
 */
export const RACK_LAYOUT: GearSlot[] = [
  { u: 1,  size: 2, kind: "ups-2u",           label: "UPS · 3kVA",                 accent: "amber" },
  { u: 3,  size: 4, kind: "storage-4u",       label: "Archive Pool · RAIDZ2",      accent: "cyan" },
  { u: 7,  size: 2, kind: "storage-2u",       label: "Flash Cache · NVMe",         accent: "signal" },
  { u: 9,  size: 2, kind: "server-2u",        label: "PVE · Compute 01",           accent: "signal" },
  { u: 11, size: 2, kind: "server-2u",        label: "PVE · Compute 02",           accent: "cyan" },
  { u: 13, size: 1, kind: "server-1u",        label: "Edge Security",              accent: "amber" },
  { u: 14, size: 1, kind: "switch-1u",        label: "ToR Fabric A",               accent: "cyan" },
  { u: 15, size: 1, kind: "switch-1u",        label: "ToR Fabric B",               accent: "signal" },
  { u: 16, size: 1, kind: "patch-panel-1u",   label: "Fiber Field",                accent: "cyan" },
  { u: 17, size: 4, kind: "server-gpu-4u",    label: "GPU Node · L40S",            accent: "signal" },
  { u: 21, size: 2, kind: "server-2u",        label: "Automation Cluster",         accent: "signal" },
  { u: 23, size: 7, kind: "blade-chassis-7u", label: "Blade Fabric · 8 nodes",     accent: "signal" },
  { u: 30, size: 2, kind: "switch-core-2u",   label: "Core Switch · 100G",         accent: "cyan" },
  { u: 32, size: 1, kind: "patch-panel-1u",   label: "Uplink Patch",               accent: "signal" },
  { u: 33, size: 1, kind: "server-1u",        label: "Observability",              accent: "cyan" },
  { u: 34, size: 1, kind: "server-1u",        label: "Identity",                   accent: "signal" },
  { u: 35, size: 1, kind: "switch-1u",        label: "Mgmt Fabric",                accent: "amber" },
  { u: 36, size: 1, kind: "kvm-1u",           label: "KVM · Console",              accent: "cyan" },
  { u: 37, size: 1, kind: "patch-panel-1u",   label: "Copper Patch",               accent: "amber" },
  { u: 38, size: 1, kind: "server-1u",        label: "Build Runner",               accent: "signal" },
  { u: 39, size: 1, kind: "server-1u",        label: "Metrics",                    accent: "cyan" },
  { u: 40, size: 1, kind: "patch-panel-1u",   label: "Optics Field",               accent: "signal" },
  { u: 41, size: 2, kind: "server-2u",        label: "Reserve Capacity",           accent: "amber" },
];

export const ACCENT_HEX = {
  signal: "#c7f000",
  amber:  "#ff9a1f",
  cyan:   "#64e6ff",
  danger: "#ff3c4a",
} as const;
