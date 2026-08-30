/**
 * The racks that ship an authored model.
 *
 * Not every rack has one, and the ones that do are not interchangeable: a
 * UniFi studio frame and a Cisco 42U enterprise rack are different objects
 * with different parts in them, so each carries its own file and its own
 * part table. The detail page reads this to decide whether to offer the
 * model tab at all.
 */

import type { HeroModel } from "./types";
import { UNIFI_PARTS, UNIFI_SCENERY } from "./unifi";
import { CISCO_PARTS, CISCO_SCENERY } from "./cisco";
import { JUNIPER_PARTS, JUNIPER_SCENERY } from "./juniper";

export type { HeroModel, HeroPart } from "./types";

export const HERO_MODELS: Record<string, HeroModel> = {
  "unifi-12u": {
    url: "/models/unifi-hero-rack.glb",
    parts: UNIFI_PARTS,
    scenery: UNIFI_SCENERY,
    note: "A UniFi studio frame on casters, patched one to one across 24 ports.",
  },
  "juniper-core-42u": {
    url: "/models/juniper-core-42u.glb",
    parts: JUNIPER_PARTS,
    scenery: JUNIPER_SCENERY,
    note: "A 42U Juniper service provider edge: access, a spine and leaf fabric, an EX9204 and an MX240, firewalls and power.",
  },
  "cisco-enterprise-42u": {
    url: "/models/cisco-enterprise-42u.glb",
    parts: CISCO_PARTS,
    scenery: CISCO_SCENERY,
    note: "A full 42U Cisco enterprise rack: access, core, spine, a modular chassis, routers, a firewall and UCS compute.",
  },
};

export const heroModelFor = (slug: string): HeroModel | undefined => HERO_MODELS[slug];

/** Part lookup for one model, built once per model rather than per click. */
const indexes = new Map<string, Map<string, HeroModel["parts"][number]>>();
export function heroPartIndex(model: HeroModel): Map<string, HeroModel["parts"][number]> {
  let idx = indexes.get(model.url);
  if (!idx) {
    idx = new Map(model.parts.map((p) => [p.group, p]));
    indexes.set(model.url, idx);
  }
  return idx;
}

/** Every part across every model, for resolving a `?device=` from a link. */
export const ALL_HERO_PARTS = new Map(
  Object.values(HERO_MODELS).flatMap((m) => m.parts.map((p) => [p.group, p] as const)),
);
