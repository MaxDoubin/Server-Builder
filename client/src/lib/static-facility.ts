/**
 * Simulated facility state for the static build.
 *
 * The site ships as static files, so game-context runs with useStaticData
 * and generates its racks locally. Everything else the API would have
 * supplied stayed empty, which left the ops dashboards reporting a data
 * centre with 500 racks, no network, no alerts and no incidents. These
 * builders fill that in from the racks that actually exist.
 *
 * Everything here is deterministic: the same rack count always produces the
 * same topology and the same incidents. A dashboard that reshuffled itself
 * on every navigation would read as noise rather than state.
 */

import type {
  Alert,
  Incident,
  NetworkLink,
  NetworkNode,
  Rack,
} from "@shared/schema";

/**
 * Small deterministic PRNG (mulberry32). Seeded per collection so adding a
 * rack does not reshuffle the incident list.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(items: readonly T[], r: () => number): T =>
  items[Math.floor(r() * items.length) % items.length];

/** Minutes ago, as an ISO string, relative to when the page loaded. */
function minutesAgo(base: number, minutes: number): string {
  return new Date(base - minutes * 60_000).toISOString();
}

/**
 * A spine and leaf fabric sized to the floor.
 *
 * Two spines, then one leaf per group of racks, then a top-of-rack switch
 * per leaf. Positions are laid out in tiers so the topology view has
 * something sensible to draw.
 */
export function buildNetwork(rackCount: number): {
  nodes: NetworkNode[];
  links: NetworkLink[];
} {
  const r = rng(0x5eed + rackCount);
  const leafCount = Math.max(2, Math.min(12, Math.ceil(rackCount / 48)));
  const torCount = Math.max(leafCount, Math.min(24, Math.ceil(rackCount / 24)));
  const nodes: NetworkNode[] = [];
  const links: NetworkLink[] = [];

  const spread = (index: number, count: number) =>
    count <= 1 ? 50 : 8 + (index * 84) / (count - 1);

  const spineCount = 2;
  for (let i = 0; i < spineCount; i += 1) {
    nodes.push({
      id: `spine-${i + 1}`,
      name: `spine-${String(i + 1).padStart(2, "0")}`,
      type: "spine",
      ports: 64,
      usedPorts: Math.min(64, leafCount * 2),
      status: "online",
      throughput: Math.round(180 + r() * 90),
      packetLoss: Number((r() * 0.01).toFixed(4)),
      positionX: spread(i, spineCount),
      positionY: 12,
    });
  }

  for (let i = 0; i < leafCount; i += 1) {
    const id = `leaf-${i + 1}`;
    // One degraded leaf keeps the topology view from being a flat wall of
    // green, and gives the alert list something real to point at.
    const degraded = i === leafCount - 2 && leafCount > 2;
    nodes.push({
      id,
      name: `leaf-${String(i + 1).padStart(2, "0")}`,
      type: "leaf",
      ports: 48,
      usedPorts: Math.round(24 + r() * 20),
      status: degraded ? "warning" : "online",
      throughput: Math.round(60 + r() * 70),
      packetLoss: Number((degraded ? 0.4 + r() * 0.3 : r() * 0.02).toFixed(4)),
      positionX: spread(i, leafCount),
      positionY: 44,
    });
    for (let s = 0; s < spineCount; s += 1) {
      links.push({
        id: `${id}-spine-${s + 1}`,
        sourceId: `spine-${s + 1}`,
        targetId: id,
        bandwidth: 100,
        utilization: Math.round(28 + r() * 46),
        latency: Number((0.08 + r() * 0.14).toFixed(3)),
        status: degraded ? "degraded" : "active",
      });
    }
  }

  for (let i = 0; i < torCount; i += 1) {
    const id = `tor-${i + 1}`;
    const leafId = `leaf-${(i % leafCount) + 1}`;
    nodes.push({
      id,
      name: `tor-${String(i + 1).padStart(2, "0")}`,
      type: "tor",
      ports: 48,
      usedPorts: Math.round(30 + r() * 16),
      status: "online",
      throughput: Math.round(18 + r() * 34),
      packetLoss: Number((r() * 0.02).toFixed(4)),
      positionX: spread(i, torCount),
      positionY: 76,
    });
    links.push({
      id: `${id}-${leafId}`,
      sourceId: leafId,
      targetId: id,
      bandwidth: 25,
      utilization: Math.round(22 + r() * 52),
      latency: Number((0.05 + r() * 0.1).toFixed(3)),
      status: "active",
    });
  }

  return { nodes, links };
}

const ALERT_TEMPLATES: ReadonlyArray<{
  severity: Alert["severity"];
  sourceType: Alert["sourceType"];
  message: string;
}> = [
  { severity: "critical", sourceType: "cooling", message: "Hot aisle inlet temperature above threshold for 6 minutes" },
  { severity: "warning", sourceType: "network", message: "Uplink error counters incrementing on leaf uplink" },
  { severity: "warning", sourceType: "power", message: "PDU branch circuit above 80 percent of rated load" },
  { severity: "info", sourceType: "server", message: "Firmware baseline drift detected during nightly audit" },
  { severity: "warning", sourceType: "storage", message: "Array rebuild running, reduced redundancy until complete" },
  { severity: "info", sourceType: "network", message: "BGP session re-established after maintenance window" },
  { severity: "critical", sourceType: "power", message: "UPS transferred to battery, generator start requested" },
  { severity: "info", sourceType: "cooling", message: "CRAH unit returned to normal after filter change" },
];

/** A plausible alert feed for the floor as it currently stands. */
export function buildAlerts(racks: Rack[], now: number): Alert[] {
  const r = rng(0xa1e7 + racks.length);
  const count = Math.min(9, Math.max(4, Math.round(racks.length / 90) + 4));
  return Array.from({ length: count }, (_, i) => {
    const template = ALERT_TEMPLATES[i % ALERT_TEMPLATES.length];
    const rack = racks.length ? racks[Math.floor(r() * racks.length)] : undefined;
    return {
      id: `alert-${i + 1}`,
      timestamp: minutesAgo(now, Math.round(3 + i * 17 + r() * 9)),
      severity: template.severity,
      source: rack?.name ?? `zone-${(i % 4) + 1}`,
      sourceType: template.sourceType,
      message: template.message,
      // The oldest few have been seen; the recent ones have not.
      acknowledged: i >= count - 3 ? false : r() > 0.45,
    };
  });
}

const INCIDENT_TEMPLATES: ReadonlyArray<{
  title: string;
  severity: Incident["severity"];
  status: Incident["status"];
  description: string;
  systems: string[];
}> = [
  {
    title: "Elevated inlet temperature in cold aisle B",
    severity: "P2",
    status: "mitigating",
    description:
      "Two CRAH units in aisle B dropped below expected airflow after a filter change. Inlet temperatures climbed roughly four degrees before the spare unit was brought online.",
    systems: ["cooling", "aisle-b"],
  },
  {
    title: "Packet loss on leaf uplink",
    severity: "P3",
    status: "investigating",
    description:
      "One leaf switch is showing sustained loss on a single uplink. Traffic has been drained to the second spine while the optic is swapped.",
    systems: ["network", "leaf-fabric"],
  },
  {
    title: "Storage array rebuild after disk replacement",
    severity: "P4",
    status: "open",
    description:
      "A drive failed predictive checks and was replaced during the maintenance window. The array is rebuilding and redundancy is reduced until it finishes.",
    systems: ["storage"],
  },
  {
    title: "Branch circuit approaching rated load",
    severity: "P3",
    status: "open",
    description:
      "Recent installs pushed one PDU branch to 82 percent of rated load. Capacity planning is redistributing the next batch of servers across adjacent circuits.",
    systems: ["power", "pdu"],
  },
];

/** The open incident list. Deterministic, so it does not churn on navigation. */
export function buildIncidents(now: number): Incident[] {
  return INCIDENT_TEMPLATES.map((template, i) => ({
    id: `incident-${i + 1}`,
    title: template.title,
    severity: template.severity,
    status: template.status,
    affectedSystems: template.systems,
    createdAt: minutesAgo(now, 90 + i * 55),
    updatedAt: minutesAgo(now, 8 + i * 13),
    description: template.description,
    timeline: [
      {
        timestamp: minutesAgo(now, 90 + i * 55),
        action: "Alert raised by monitoring",
        actor: "monitoring",
      },
      {
        timestamp: minutesAgo(now, 70 + i * 45),
        action: "Acknowledged and triaged",
        actor: "on-call",
      },
      {
        timestamp: minutesAgo(now, 8 + i * 13),
        action:
          template.status === "mitigating"
            ? "Mitigation applied, monitoring for recovery"
            : "Investigation continuing",
        actor: "on-call",
      },
    ],
  }));
}
