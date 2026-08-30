/**
 * The rack library: every elevation the site can draw, in gallery order.
 *
 * Each rack lives in its own file so a new vendor can be added from its
 * datasheets without touching any other rack, and everything downstream,
 * the gallery, the detail pages, the prerenderer and the sitemap, derives
 * from this one list. Adding a rack here is the whole registration step.
 */

import type { RackDefinition, RackDevice } from "@/lib/rackTypes";
import { ubiquitiRack } from "./ubiquiti";
import { ciscoRack } from "./cisco";
import { mikrotikRack } from "./mikrotik";
import { homelabRack } from "./homelab";
import { juniperRack } from "./juniper";
import { serverRack } from "./server";
import { storageRack } from "./storage";

export const RACKS: RackDefinition[] = [
  ubiquitiRack,
  ciscoRack,
  juniperRack,
  mikrotikRack,
  serverRack,
  storageRack,
  homelabRack,
];

export function rackBySlug(slug: string): RackDefinition | undefined {
  return RACKS.find((r) => r.slug === slug);
}

/** Rack units occupied by hardware, as opposed to the enclosure's height. */
export function unitsUsed(rack: RackDefinition): number {
  return rack.devices.reduce((sum, d) => sum + d.u, 0);
}

/**
 * The sum of published draws, and how many devices publish none. Both
 * numbers matter: "104W published, 3 not published" is an honest power
 * story where a single total would quietly pretend to completeness.
 */
export function publishedWatts(rack: RackDefinition): {
  total: number;
  unpublished: number;
} {
  let total = 0;
  let unpublished = 0;
  for (const d of rack.devices) {
    if (typeof d.watts === "number") total += d.watts;
    else if (d.family !== "patch" && d.family !== "blank") unpublished += 1;
  }
  return { total, unpublished };
}

/** Total port and bay positions across the rack, open holes excluded. */
export function connectorCount(rack: RackDefinition): number {
  return rack.devices.reduce((sum, d) => {
    const ports = (d.ports ?? []).filter((p) => p.kind !== "blank").length;
    return sum + ports + (d.bays?.count ?? 0);
  }, 0);
}

/**
 * Ports grouped for a spec table: total positions and how many show link,
 * per connector kind, in front panel order. Open keystones count as
 * capacity, so they are reported as their own row rather than hidden.
 */
export function portSummary(
  device: RackDevice,
): Array<{ kind: string; total: number; lit: number }> {
  const order: string[] = [];
  const byKind = new Map<string, { total: number; lit: number }>();
  for (const p of device.ports ?? []) {
    if (!byKind.has(p.kind)) {
      byKind.set(p.kind, { total: 0, lit: 0 });
      order.push(p.kind);
    }
    const row = byKind.get(p.kind)!;
    row.total += 1;
    if (p.led && p.led !== "off") row.lit += 1;
  }
  return order.map((kind) => ({ kind, ...byKind.get(kind)! }));
}

/** Human name for a connector kind, for spec tables and aria labels. */
export const KIND_LABELS: Record<string, string> = {
  rj45: "RJ45",
  sfp: "SFP",
  "sfp-plus": "SFP+",
  sfp28: "SFP28",
  qsfp: "QSFP+",
  power: "outlet",
  usb: "USB",
  console: "console",
  blank: "open keystone",
};
