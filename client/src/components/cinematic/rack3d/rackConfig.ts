/**
 * Rack geometry constants — meters, loosely mapped to real server dimensions.
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
  | "blank"           // blanking panel
  | "server-1u"       // dense 1U pizza box
  | "server-2u"       // 2U general compute (Dell R7x0-like)
  | "server-gpu-4u"   // GPU server, heavy front vents
  | "storage-2u"      // 2U SFF storage array, 24 drive bays
  | "storage-4u"      // 4U LFF storage (12 × 3.5in bays)
  | "switch-1u"       // 48-port 1U switch
  | "switch-core-2u"  // 2U chassis switch
  | "ups-2u"          // UPS
  | "kvm-1u"          // KVM/console drawer
  | "blade-chassis-7u"; // blade chassis

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
 * A realistic-ish mixed-workload rack.
 * Bottom-up ordering makes heavy gear (UPS, storage) at the base.
 */
export const RACK_LAYOUT: GearSlot[] = [
  { u: 1,  size: 2, kind: "ups-2u",          label: "UPS · 3kVA",   accent: "amber" },
  { u: 3,  size: 4, kind: "storage-4u",      label: "ZFS Pool · Raidz2", accent: "cyan" },
  { u: 7,  size: 2, kind: "storage-2u",      label: "Cache · NVMe 24x", accent: "signal" },
  { u: 9,  size: 1, kind: "blank" },
  { u: 10, size: 2, kind: "server-2u",       label: "PVE · 01",      accent: "signal" },
  { u: 12, size: 2, kind: "server-2u",       label: "PVE · 02",      accent: "signal" },
  { u: 14, size: 1, kind: "switch-1u",       label: "ToR · Catalyst 9300", accent: "cyan" },
  { u: 15, size: 1, kind: "switch-1u",       label: "Mgmt · 1G",     accent: "amber" },
  { u: 16, size: 1, kind: "blank" },
  { u: 17, size: 4, kind: "server-gpu-4u",   label: "GPU · 8x L40S", accent: "signal" },
  { u: 21, size: 1, kind: "blank" },
  { u: 22, size: 7, kind: "blade-chassis-7u", label: "Blade · 8 nodes", accent: "signal" },
  { u: 29, size: 1, kind: "blank" },
  { u: 30, size: 2, kind: "switch-core-2u",  label: "Core · Nexus 9K", accent: "cyan" },
  { u: 32, size: 1, kind: "server-1u",       label: "Edge · FortiGate", accent: "amber" },
  { u: 33, size: 1, kind: "server-1u",       label: "DNS · Unbound", accent: "signal" },
  { u: 34, size: 1, kind: "server-1u",       label: "NTP · chrony",  accent: "signal" },
  { u: 35, size: 1, kind: "blank" },
  { u: 36, size: 1, kind: "kvm-1u",          label: "KVM · Console", accent: "cyan" },
  { u: 37, size: 1, kind: "blank" },
  { u: 38, size: 1, kind: "server-1u",       label: "Build · Runner", accent: "signal" },
  { u: 39, size: 1, kind: "server-1u",       label: "Metrics · VictoriaMetrics", accent: "cyan" },
  { u: 40, size: 1, kind: "blank" },
  { u: 41, size: 2, kind: "server-2u",       label: "Reserve · Capacity", accent: "amber" },
];

export const ACCENT_HEX = {
  signal: "#c7f000",
  amber:  "#ff9a1f",
  cyan:   "#64e6ff",
  danger: "#ff3c4a",
} as const;
