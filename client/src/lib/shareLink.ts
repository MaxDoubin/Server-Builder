/**
 * Share a floor layout in a URL fragment.
 *
 * A layout is up to 500 racks of 42 units each. Serialising that as JSON runs
 * to megabytes, so the link stores a recipe instead of a copy: the procedural
 * parameters that generate the baseline floor, plus a delta list of the racks
 * that differ from it. An untouched 500 rack floor encodes in about thirty
 * characters.
 *
 * FORMAT
 *   dc1.<pool>.<visible>.<seed>.<fillx10>.<catalogLen>~<delta>_<delta>...
 * All numbers are base 36. The delta list is optional. Each delta is one of:
 *   r<idx>                     procedural rack idx deleted
 *   a<x>,<y>,<items>           a rack added at grid position x,y
 *   e<idx>,<x>,<y>,<items>     procedural rack idx moved or re-equipped
 * <items> is a run of fixed width triples: two base 36 characters of U start
 * followed by one base 36 character of catalog index. Fixed width because a
 * separator per item costs more than the padding does.
 *
 * The catalog index is positional, so a link is only valid against the
 * catalog it was made with. The catalog length travels in the header and a
 * mismatch is rejected rather than silently decoded into the wrong hardware.
 *
 * Anything that will not fit is refused with a reason. A URL that a browser
 * or a proxy truncates is worse than no link at all.
 */

import type { Equipment, InstalledEquipment, Rack } from "@shared/schema";
import { generateProceduralRacks } from "@/components/3d/ProceduralRacks";
import { logWarning } from "@/lib/error-log";

/** Generation options game-context uses. The baseline has to match exactly. */
export const BASELINE_OPTIONS = {
  seed: 42,
  fillRateMultiplier: 2,
  errorRate: 1,
  tempBase: 20,
  dense: true,
} as const;

/** Racks game-context generates up front, before any user edits. */
export const BASELINE_POOL_SIZE = 500;

/**
 * Longest fragment we will produce.
 *
 * Browsers handle far more, but proxies, chat clients and mail clients all
 * cut links at various points well under 2000 characters, and a half copied
 * layout decodes into nonsense. 1800 leaves room for the origin and path.
 */
export const MAX_HASH_LENGTH = 1800;

const PREFIX = "dc1";
/**
 * Base 36, non negative. Grid positions off the left or back edge of the
 * floor clamp to zero rather than growing a sign character, which costs one
 * misplaced rack in an edge case instead of a longer link for every rack.
 */
const b36 = (value: number) => Math.max(0, Math.round(value)).toString(36);
const fromB36 = (value: string) => {
  const parsed = parseInt(value, 36);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const RACK_ID_PATTERN = /^rack-gen-(\d+)-(\d+)$/;

/** Procedural rack ids encode their own index: rack-gen-<row>-<col>, 25 wide. */
function proceduralIndexFromId(id: string): number | null {
  const match = RACK_ID_PATTERN.exec(id);
  if (!match) return null;
  return Number(match[1]) * 25 + Number(match[2]);
}

function encodeItems(rack: Rack, codeByEquipmentId: Map<string, number>): string | null {
  const sorted = [...rack.installedEquipment].sort((a, b) => a.uStart - b.uStart);
  let out = "";
  for (const installed of sorted) {
    const code = codeByEquipmentId.get(installed.equipmentId);
    if (code === undefined) return null;
    const u = b36(installed.uStart).padStart(2, "0");
    if (u.length !== 2 || code > 35) return null;
    out += u + b36(code);
  }
  return out;
}

function decodeItems(
  encoded: string,
  catalog: Equipment[],
  rackId: string,
  totalUs: number,
): InstalledEquipment[] {
  const items: InstalledEquipment[] = [];
  for (let i = 0; i + 3 <= encoded.length; i += 3) {
    const uStart = fromB36(encoded.slice(i, i + 2));
    const code = fromB36(encoded.slice(i + 2, i + 3));
    const equipment = catalog[code];
    if (!equipment || !Number.isFinite(uStart)) continue;
    const uEnd = uStart + Math.max(1, equipment.uHeight) - 1;
    if (uStart < 1 || uEnd > totalUs) continue;
    items.push({
      id: `share-${rackId}-${uStart}-${code}`,
      equipmentId: equipment.id,
      uStart,
      uEnd,
      status: "online",
      cpuLoad: 40,
      memoryUsage: 45,
      networkActivity: 30,
    });
  }
  return items;
}

/** Signature used to decide whether a rack differs from its baseline. */
function equipmentSignature(rack: Rack): string {
  return [...rack.installedEquipment]
    .sort((a, b) => a.uStart - b.uStart)
    .map((item) => `${item.uStart}:${item.equipmentId}`)
    .join("|");
}

export interface EncodeResult {
  ok: boolean;
  /** The fragment, without the leading hash. Present when ok. */
  hash?: string;
  length: number;
  /** Racks that differ from the baseline and had to be spelled out. */
  deltaCount: number;
  reason?: string;
}

export function encodeLayout(
  racks: Rack[],
  visibleCount: number,
  catalog: Equipment[],
): EncodeResult {
  if (catalog.length > 36) {
    return {
      ok: false,
      length: 0,
      deltaCount: 0,
      reason:
        "The equipment catalog has grown past 36 entries, which this link format cannot address.",
    };
  }

  const codeByEquipmentId = new Map(catalog.map((item, index) => [item.id, index]));
  const baseline = generateProceduralRacks(BASELINE_POOL_SIZE, catalog, BASELINE_OPTIONS);
  const baselineByIndex = new Map(baseline.map((rack, index) => [index, rack]));

  const deltas: string[] = [];
  const seenProcedural = new Set<number>();
  let unencodable = 0;

  for (const rack of racks) {
    const index = proceduralIndexFromId(rack.id);
    const items = encodeItems(rack, codeByEquipmentId);
    if (items === null) {
      // Equipment the catalog does not know about cannot be addressed by
      // index. A procedural rack keeps its generated contents rather than
      // falling through to the removal pass and vanishing from the link.
      unencodable += 1;
      if (index !== null && baselineByIndex.has(index)) seenProcedural.add(index);
      continue;
    }
    if (index === null || !baselineByIndex.has(index)) {
      deltas.push(`a${b36(rack.positionX)},${b36(rack.positionY)},${items}`);
      continue;
    }
    seenProcedural.add(index);
    const base = baselineByIndex.get(index)!;
    const moved = base.positionX !== rack.positionX || base.positionY !== rack.positionY;
    const changed = equipmentSignature(base) !== equipmentSignature(rack);
    if (moved || changed) {
      deltas.push(`e${b36(index)},${b36(rack.positionX)},${b36(rack.positionY)},${items}`);
    }
  }

  for (let index = 0; index < baseline.length; index += 1) {
    if (!seenProcedural.has(index)) deltas.push(`r${b36(index)}`);
  }

  const header = [
    PREFIX,
    b36(BASELINE_POOL_SIZE),
    b36(Math.max(0, visibleCount)),
    b36(BASELINE_OPTIONS.seed),
    b36(Math.round(BASELINE_OPTIONS.fillRateMultiplier * 10)),
    b36(catalog.length),
  ].join(".");
  const hash = deltas.length > 0 ? `${header}~${deltas.join("_")}` : header;

  if (hash.length > MAX_HASH_LENGTH) {
    return {
      ok: false,
      length: hash.length,
      deltaCount: deltas.length,
      reason: `This layout needs ${hash.length.toLocaleString()} characters to describe and the limit is ${MAX_HASH_LENGTH.toLocaleString()}. ${deltas.length.toLocaleString()} racks differ from the generated floor. Save it as a named layout instead, or share a smaller part of it.`,
    };
  }

  return {
    ok: true,
    hash,
    length: hash.length,
    deltaCount: deltas.length,
    reason:
      unencodable > 0
        ? `${unencodable} rack${unencodable === 1 ? "" : "s"} used equipment that is not in the catalog and were left out.`
        : undefined,
  };
}

export interface DecodedLayout {
  racks: Rack[];
  visibleCount: number;
}

export function decodeLayout(hash: string, catalog: Equipment[]): DecodedLayout | null {
  try {
    const clean = hash.replace(/^#/, "");
    if (!clean.startsWith(`${PREFIX}.`)) return null;
    const [header, deltaPart = ""] = clean.split("~");
    const parts = header.split(".");
    if (parts.length < 6) return null;

    const pool = fromB36(parts[1]);
    const visibleCount = fromB36(parts[2]);
    const seed = fromB36(parts[3]);
    const fill = fromB36(parts[4]) / 10;
    const catalogLen = fromB36(parts[5]);

    if (!Number.isFinite(pool) || pool <= 0 || pool > 2000) return null;
    if (!Number.isFinite(visibleCount) || visibleCount < 0) return null;
    if (catalogLen !== catalog.length) {
      logWarning("Share link was made against a different equipment catalog.", undefined, {
        expected: catalog.length,
        found: catalogLen,
      });
      return null;
    }

    const racks = generateProceduralRacks(pool, catalog, {
      ...BASELINE_OPTIONS,
      seed: Number.isFinite(seed) ? seed : BASELINE_OPTIONS.seed,
      fillRateMultiplier: Number.isFinite(fill) && fill > 0 ? fill : BASELINE_OPTIONS.fillRateMultiplier,
    });
    const byIndex = new Map(racks.map((rack, index) => [index, rack]));
    const removed = new Set<number>();
    const added: Rack[] = [];

    const deltas = deltaPart ? deltaPart.split("_") : [];
    for (const delta of deltas) {
      if (!delta) continue;
      const kind = delta[0];
      const body = delta.slice(1);

      if (kind === "r") {
        const index = fromB36(body);
        if (Number.isFinite(index)) removed.add(index);
        continue;
      }

      if (kind === "a") {
        const [x, y, items = ""] = body.split(",");
        const positionX = fromB36(x);
        const positionY = fromB36(y);
        if (!Number.isFinite(positionX) || !Number.isFinite(positionY)) continue;
        const id = `share-add-${added.length}-${positionX}-${positionY}`;
        const installed = decodeItems(items, catalog, id, 42);
        added.push(
          finishRack(
            {
              id,
              name: `Shared ${added.length + 1}`,
              type: "enclosed_42U",
              totalUs: 42,
              slots: [],
              installedEquipment: installed,
              powerCapacity: 12000,
              currentPowerDraw: 0,
              inletTemp: 22,
              exhaustTemp: 24,
              airflowRestriction: 0.1,
              positionX,
              positionY,
            },
            catalog,
          ),
        );
        continue;
      }

      if (kind === "e") {
        const [rawIndex, x, y, items = ""] = body.split(",");
        const index = fromB36(rawIndex);
        const base = byIndex.get(index);
        if (!base) continue;
        const positionX = fromB36(x);
        const positionY = fromB36(y);
        const installed = decodeItems(items, catalog, base.id, base.totalUs);
        byIndex.set(
          index,
          finishRack(
            {
              ...base,
              positionX: Number.isFinite(positionX) ? positionX : base.positionX,
              positionY: Number.isFinite(positionY) ? positionY : base.positionY,
              installedEquipment: installed,
            },
            catalog,
          ),
        );
      }
    }

    const rebuilt: Rack[] = [];
    for (let index = 0; index < racks.length; index += 1) {
      if (removed.has(index)) continue;
      const rack = byIndex.get(index);
      if (rack) rebuilt.push(rack);
    }

    return { racks: [...added, ...rebuilt], visibleCount };
  } catch (error) {
    logWarning("Could not decode a shared layout.", error);
    return null;
  }
}

/** Rebuild the slot map and power draw so a decoded rack is internally consistent. */
function finishRack(rack: Rack, catalog: Equipment[]): Rack {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const slots = Array.from({ length: rack.totalUs }, (_, index) => ({
    uPosition: index + 1,
    equipmentInstanceId: null as string | null,
  }));
  let power = 0;
  for (const installed of rack.installedEquipment) {
    const equipment = byId.get(installed.equipmentId);
    power += equipment?.powerDraw ?? 0;
    for (let u = installed.uStart; u <= installed.uEnd; u += 1) {
      const slot = slots[u - 1];
      if (slot) slot.equipmentInstanceId = installed.id;
    }
  }
  return { ...rack, slots, currentPowerDraw: Math.round(power) };
}

/** Full URL for a fragment, safe to call during a render on the server. */
export function shareUrlForHash(hash: string): string {
  if (typeof window === "undefined") return `#${hash}`;
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}#${hash}`;
}

/** Reads a layout fragment from the current URL, if there is one. */
export function readLayoutHash(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "");
  return raw.startsWith(`${PREFIX}.`) ? raw : null;
}

/** Drops the layout fragment without adding a history entry. */
export function clearLayoutHash() {
  if (typeof window === "undefined") return;
  try {
    const { origin, pathname, search } = window.location;
    window.history.replaceState(null, "", `${origin}${pathname}${search}`);
  } catch (error) {
    logWarning("Could not clear the layout fragment.", error);
  }
}
