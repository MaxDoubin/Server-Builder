/**
 * A 42U Juniper service provider edge rack.
 *
 * Juniper's range splits differently from Cisco's, and this rack is drawn
 * to show that rather than restating it in a different grey. Two five
 * rack unit modular chassis sit in the middle and are the reason it
 * exists: an EX9204 switching and an MX240 routing. Everything above them
 * is access and leaf switching that feeds them; everything below is
 * security and power that serves them.
 *
 * Rack unit heights are Juniper's published figures. The MX240 is 5U and
 * the EX9204 is 5U, a four slot chassis with one dedicated host subsystem
 * slot, two dedicated line card slots and one multifunction slot that
 * takes either; QFX5120 and SRX4600 are both 1U. Cited below.
 *
 * `watts` is null throughout for the same reason as the Cisco racks:
 * vendors at this end publish power supply ratings and maximum system
 * budgets, not what a given configuration draws.
 */

import type { LedState, RackDefinition, RackDevice, RackPatch, RackPort } from "@/lib/rackTypes";

const pad2 = (n: number): string => String(n).padStart(2, "0");
const activityFor = (n: number): number => Math.round((((n * 41) % 59) / 58) * 100) / 100;

function run(
  kind: RackPort["kind"],
  count: number,
  label: (n: number) => string,
  patched: number,
  linkColour: LedState = "green",
): RackPort[] {
  return Array.from({ length: count }, (_, i): RackPort => {
    const n = i + 1;
    return n <= patched
      ? { kind, label: label(n), led: linkColour, activity: activityFor(n) }
      : { kind, label: label(n), led: "off" };
  });
}

const passive = (kind: RackPort["kind"], count: number, label: (n: number) => string): RackPort[] =>
  Array.from({ length: count }, (_, i): RackPort => ({ kind, label: label(i + 1) }));

const ACCENT = {
  access: "#ffa114",
  fabric: "#4cf1f1",
  chassis: "#ccff00",
  edge: "#7c9cff",
  passive: "#8a93a6",
  power: "#9234ea",
} as const;

const blank = (id: string, u: number, role: string, look: RackDevice["look"] = "solid"): RackDevice => ({
  id,
  u,
  vendor: "Generic",
  // Solid and vented are different products for different problems, and
  // the name has to say which one this is.
  model: look === "vented" ? `${u}U vented blanking panel` : `${u}U blanking panel`,
  role,
  family: "blank",
  look,
  watts: null,
  accent: ACCENT.passive,
});

export const juniperCoreRack: RackDefinition = {
  slug: "juniper-core-42u",
  name: "Juniper Core 42U",
  blurb:
    "A service provider edge built the way Juniper's range actually splits, and the one rack here that carries the whole line at once. Two five rack unit modular chassis sit in the middle, an EX9204 switching and an MX240 routing; above them is access and leaf switching feeding those, and below them the edge and transport tier they feed, down to an eight unit MX480 on the floor because weight goes low. The MX240's fan tray is a tall column on the right rather than a row along the bottom, which is the fastest way to tell it from a switch of the same height.",
  height: 42,
  /*
    Thirty one of the forty two units are populated and the bottom eleven
    are deliberately empty. Nobody fits an eleven rack unit blanking
    panel: below the last device you leave rack, because that is where
    cold air enters and a rack filled to the floor starves itself.
  */

  devices: [
    {
      id: "PATCH_PANEL_A",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel A",
      role: "Where the building's cabling lands before it reaches anything with a fan in it.",
      family: "patch",
      finish: "dark",
      groupsOf: 6,
      ports: passive("rj45", 24, (n) => `A${pad2(n)}`),
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "EX4400_48MP",
      u: 1,
      vendor: "Juniper",
      model: "EX4400-48MP",
      role: "The access switch: 48 multigigabit PoE ports in two rows, with an uplink module at the right carrying four 25G SFP28. Multigigabit matters here because a Wi-Fi 6E access point can exceed a gigabit and a 1G switch port becomes the bottleneck in its own ceiling.",
      family: "switch",
      finish: "dark",
      groupsOf: 6,
      moduleBay: true,
      ports: [
        ...run("rj45", 48, (n) => `ge-0/0/${n - 1}`, 40, "amber"),
        ...run("sfp28", 4, (n) => `et-0/1/${n - 1}`, 2, "blue"),
      ],
      watts: null,
      accent: ACCENT.access,
      url: "https://www.juniper.net/us/en/products/switches/ex-series/ex4400-ethernet-switch-datasheet.html",
    },
    {
      id: "PATCH_PANEL_B",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel B",
      role: "The second field. Sixteen punched down, eight left as capacity, which is cheaper to buy now than to retrofit later.",
      family: "patch",
      finish: "dark",
      groupsOf: 6,
      ports: [
        ...passive("rj45", 16, (n) => `B${pad2(n)}`),
        ...passive("blank", 8, (n) => `B${pad2(n + 16)}`),
      ],
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "EX4300_48T",
      u: 1,
      vendor: "Juniper",
      model: "EX4300-48T",
      role: "The second access switch, non-PoE: 48 gigabit copper for the printers, lab machines and desk phones that carry their own power. Two 40G QSFP+ ports handle the uplink.",
      family: "switch",
      finish: "dark",
      groupsOf: 6,
      ports: [
        ...run("rj45", 48, (n) => `ge-0/0/${n - 1}`, 32),
        ...run("qsfp", 2, (n) => `et-0/1/${n - 1}`, 1, "blue"),
      ],
      watts: null,
      accent: ACCENT.access,
      url: "https://www.juniper.net/us/en/products/switches/ex-series/ex4300-ethernet-switch-datasheet.html",
    },
    {
      id: "CABLE_MANAGER_TOP",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "D-rings between the access layer and the fabric. The difference between this rack and a bad one is mostly this panel.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "QFX5120_A",
      u: 1,
      vendor: "Juniper",
      model: "QFX5120-48Y (leaf A)",
      role: "A leaf switch: 48 SFP28 at 25G and eight QSFP28 at 100G, on a 1U platform with no copper on it anywhere. In a spine and leaf fabric the leaf is where servers attach and the spine is all it talks to.",
      family: "switch",
      finish: "dark",
      ports: [
        ...run("sfp28", 48, (n) => `xe-0/0/${n - 1}`, 30, "blue"),
        ...run("qsfp", 8, (n) => `et-0/0/${n + 47}`, 4, "blue"),
      ],
      watts: null,
      accent: ACCENT.fabric,
      url: "https://www.juniper.net/us/en/products/switches/qfx-series/qfx5120-ethernet-switch-datasheet.html",
    },
    {
      id: "QFX5120_B",
      u: 1,
      vendor: "Juniper",
      model: "QFX5120-48Y (leaf B)",
      role: "The paired leaf. Leaves come in pairs so a server can be dual homed and survive losing one of them, and that pairing is the whole reason the fabric is shaped the way it is.",
      family: "switch",
      finish: "dark",
      ports: [
        ...run("sfp28", 48, (n) => `xe-0/0/${n - 1}`, 28, "blue"),
        ...run("qsfp", 8, (n) => `et-0/0/${n + 47}`, 4, "blue"),
      ],
      watts: null,
      accent: ACCENT.fabric,
      url: "https://www.juniper.net/us/en/products/switches/qfx-series/qfx5120-ethernet-switch-datasheet.html",
    },
    {
      id: "QFX5220_32CD",
      u: 1,
      vendor: "Juniper",
      model: "QFX5220-32CD",
      role: "The spine: 32 QSFP28-DD cages and nothing else on the face. Every leaf connects to every spine and nothing connects to a leaf's neighbour, which is what keeps the hop count flat however wide the fabric grows.",
      family: "switch",
      finish: "black",
      ports: run("qsfp", 32, (n) => `et-0/0/${n - 1}`, 18, "blue"),
      watts: null,
      accent: ACCENT.fabric,
      url: "https://www.juniper.net/us/en/products/switches/qfx-series/qfx5220-switch-datasheet.html",
    },
    {
      id: "CABLE_MANAGER_MID",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "The second manager, keeping fibre runs off the copper ones. Fibre has a real minimum bend radius and a manager is how you respect it.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "EX9204",
      cards: true,
      u: 5,
      vendor: "Juniper",
      model: "EX9204 modular chassis",
      role: "Five rack units of modular switching. Four slots: one dedicated to the host subsystem, two dedicated to line cards, and one multifunction slot that takes either. Cards come out on a single long lever rather than a pair of ejectors, which is a small thing you notice immediately if you have worked on both vendors.",
      family: "switch",
      finish: "dark",
      ports: [
        ...run("sfp", 2, (n) => `RE${n}`, 1),
        ...run("sfp28", 12, (n) => `1/${n - 1}`, 8, "blue"),
        ...run("sfp28", 12, (n) => `2/${n - 1}`, 7, "blue"),
        ...run("sfp28", 12, (n) => `3/${n - 1}`, 5, "blue"),
      ],
      watts: null,
      accent: ACCENT.chassis,
      url: "https://www.juniper.net/documentation/us/en/hardware/ex9204/topics/topic-map/ex9204-system-overview.html",
    },
    {
      id: "MX240",
      cards: true,
      u: 5,
      vendor: "Juniper",
      model: "MX240 universal routing platform",
      role: "Five rack units of routing, and the one device here you can identify from across a room without reading anything: its fan tray is a tall column on the right hand side rather than a row along the bottom. Two MPC slots carry the interfaces, the third is the routing engine.",
      family: "router",
      finish: "black",
      ports: [
        ...run("sfp", 8, (n) => `xe-0/0/${n - 1}`, 5, "blue"),
        ...run("qsfp", 2, (n) => `et-0/1/${n - 1}`, 1, "blue"),
        ...run("sfp", 8, (n) => `xe-1/0/${n - 1}`, 4, "blue"),
        ...run("qsfp", 2, (n) => `et-1/1/${n - 1}`, 1, "blue"),
        ...run("rj45", 2, (n) => `RE${n}`, 1),
      ],
      watts: null,
      accent: ACCENT.chassis,
      url: "https://www.juniper.net/documentation/en_US/release-independent/junos/topics/reference/specifications/mx240-physical.html",
    },
    {
      id: "MX204",
      u: 1,
      vendor: "Juniper",
      model: "MX204",
      role: "The compact router: four 100G QSFP28 and eight 10G SFP+ in one rack unit. Everything the MX240 does at a fraction of the height, for a site that does not need slots.",
      family: "router",
      finish: "black",
      ports: [...run("qsfp", 4, (n) => `et-0/0/${n - 1}`, 2, "blue"), ...run("sfp-plus", 8, (n) => `xe-0/1/${n - 1}`, 5, "blue")],
      watts: null,
      accent: ACCENT.edge,
      url: "https://www.juniper.net/us/en/products/routers/mx-series/mx-204-240-480-960-series-universal-routing-platforms-datasheet.html",
    },
    {
      id: "SRX4600",
      u: 1,
      vendor: "Juniper",
      model: "SRX4600",
      role: "The perimeter firewall: four 100G and eight 10G, in a 1U chassis. Everything leaving this rack for the internet goes through it.",
      family: "firewall",
      finish: "black",
      ports: [...run("qsfp", 4, (n) => `et-0/0/${n - 1}`, 2, "blue"), ...run("sfp-plus", 8, (n) => `xe-0/0/${n + 3}`, 4, "blue")],
      watts: null,
      accent: ACCENT.edge,
      url: "https://www.juniper.net/documentation/us/en/hardware/srx4600/topics/topic-map/srx4600-rack-cabinet-requirements.html",
    },
    {
      id: "SRX1500",
      u: 1,
      vendor: "Juniper",
      model: "SRX1500",
      role: "The internal firewall, segmenting the rack from itself. Sixteen copper interfaces and four SFP+, which is the shape of a device that polices traffic between zones rather than at the edge.",
      family: "firewall",
      finish: "black",
      ports: [...run("rj45", 16, (n) => `ge-0/0/${n - 1}`, 8), ...run("sfp-plus", 4, (n) => `xe-0/0/${n + 15}`, 2, "blue")],
      watts: null,
      accent: ACCENT.edge,
      url: "https://www.juniper.net/us/en/products/security/srx-series/srx1500-firewall-datasheet.html",
    },
    {
      id: "CONSOLE_SERVER",
      u: 1,
      vendor: "Generic",
      model: "16-port console server",
      role: "Out of band access. Sixteen serial ports, one to each device's console, reachable over its own network so a misconfigured routing engine can still be fixed without a drive to site. This is the panel nobody thinks about until the day it is the only thing working.",
      family: "server",
      finish: "dark",
      ports: [...run("rj45", 16, (n) => `S${pad2(n)}`, 11), ...run("rj45", 1, () => "MGMT", 1)],
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "QFX10002_60C",
      u: 2,
      vendor: "Juniper",
      model: "QFX10002-60C",
      role: "Sixty 100G cages in two rack units, which is a wall of ports and a class above the QFX5120 leaves seven units up. Deep buffers are the reason it exists: a spine that can absorb a burst rather than drop it.",
      family: "switch",
      finish: "black",
      ports: run("qsfp", 60, (n) => `et-0/0/${n - 1}`, 34, "blue"),
      watts: null,
      accent: ACCENT.fabric,
      url: "https://www.juniper.net/documentation/us/en/hardware/qfx10002/topics/topic-map/qfx10002-system-overview.html",
    },
    {
      id: "MX304",
      cards: true,
      u: 2,
      vendor: "Juniper",
      model: "MX304 universal routing platform",
      role: "The step the rack skipped between the 1U MX204 and the 5U MX240, and it is two rack units rather than one: Juniper call it a compact 2U router, and the second unit is what pays for two routing engines you can pull from the front. Nothing on it is reached from the back.",
      family: "router",
      finish: "black",
      ports: [
        ...run("qsfp", 4, (n) => `et-0/0/${n - 1}`, 2, "blue"),
        ...run("qsfp", 4, (n) => `et-0/1/${n - 1}`, 2, "blue"),
        ...run("rj45", 2, (n) => `RE${n - 1} MGMT`, 1),
        ...run("console", 2, (n) => `RE${n - 1} CONSOLE`, 1),
      ],
      watts: null,
      accent: ACCENT.chassis,
      url: "https://www.juniper.net/documentation/us/en/hardware/mx304/topics/topic-map/mx304-chassis.html",
    },
    {
      id: "PTX10001_36MR",
      u: 1,
      vendor: "Juniper",
      model: "PTX10001-36MR",
      role: "The densest single unit in the rack: twenty four 400G cages and twelve 100G, and the two are physically different cages. Telling them apart on a faceplate is the difference between a port that will take the optic in your hand and one that will not.",
      family: "router",
      finish: "black",
      ports: [
        ...run("qsfp", 24, (n) => `et-0/0/${n - 1}`, 9, "blue"),
        ...run("qsfp", 12, (n) => `et-0/0/${n + 23}`, 4, "blue"),
      ],
      watts: null,
      accent: ACCENT.edge,
      url: "https://www.juniper.net/documentation/us/en/hardware/ptx10001/topics/topic-map/ptx10001-36mr-system-overview.html",
    },
    {
      id: "MX480",
      cards: true,
      u: 8,
      vendor: "Juniper",
      model: "MX480 universal routing platform",
      role: "Six line card slots against the MX240's two, which is the whole reason both are in this rack: the difference between the two ends of one product line is a thing you can see from across a room and cannot read off a spec sheet. Eight rack units is Juniper's own figure, from a chassis they give as 14.0 inches and call approximately 8U.",
      family: "router",
      finish: "black",
      ports: [
        ...run("sfp-plus", 8, (n) => `xe-0/0/${n - 1}`, 4, "blue"),
        ...run("sfp-plus", 8, (n) => `xe-1/0/${n - 1}`, 4, "blue"),
        ...run("sfp-plus", 8, (n) => `xe-2/0/${n - 1}`, 4, "blue"),
        ...run("sfp-plus", 8, (n) => `xe-3/0/${n - 1}`, 3, "blue"),
        ...run("rj45", 2, (n) => `RE${n - 1} MGMT`, 1),
      ],
      watts: null,
      accent: ACCENT.chassis,
      url: "https://www.juniper.net/documentation/us/en/hardware/mx480/topics/topic-map/mx480-site-guidelines.html",
    },
    {
      id: "JUNIPER_PDU",
      u: 2,
      vendor: "Generic",
      model: "Switched rack PDU, 16 outlets",
      role: "Mains distribution with per-outlet switching, because a chassis that will not come back from a reboot is a very different problem when you can cycle its supply from a browser.",
      family: "pdu",
      finish: "black",
      display: "ups",
      ports: passive("power", 16, (n) => `${pad2(n)}`),
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "JUNIPER_UPS",
      u: 4,
      vendor: "Generic",
      model: "Rack UPS with external battery tray",
      role: "Ride-through for the chassis pair. Its draw depends entirely on the load it carries, so no single consumption figure would be honest here.",
      family: "ups",
      finish: "black",
      display: "ups",
      leds: ["green", "green", "off"],
      watts: null,
      accent: ACCENT.power,
    },
  ],

  patches: [
    ...Array.from({ length: 24 }, (_, i) => ({
      from: { device: "PATCH_PANEL_A", port: i },
      to: { device: "EX4400_48MP", port: i },
      jacket: (i >= 18 ? "yellow" : "blue") as RackPatch["jacket"],
    })),
    ...Array.from({ length: 16 }, (_, i) => ({
      from: { device: "PATCH_PANEL_B", port: i },
      to: { device: "EX4300_48T", port: i },
      jacket: "grey" as const,
    })),
  ],

  sources: [
    {
      label: "Juniper: MX240 physical specifications (5U)",
      url: "https://www.juniper.net/documentation/en_US/release-independent/junos/topics/reference/specifications/mx240-physical.html",
    },
    {
      label: "Juniper: EX9204 system overview (5U, four slot)",
      url: "https://www.juniper.net/documentation/us/en/hardware/ex9204/topics/topic-map/ex9204-system-overview.html",
    },
    {
      label: "Juniper datasheet: QFX5120 Ethernet Switch (1U)",
      url: "https://www.juniper.net/us/en/products/switches/qfx-series/qfx5120-ethernet-switch-datasheet.html",
    },
    {
      label: "Juniper: SRX4600 rack and cabinet requirements (1U)",
      url: "https://www.juniper.net/documentation/us/en/hardware/srx4600/topics/topic-map/srx4600-rack-cabinet-requirements.html",
    },
    {
      label: "Juniper datasheet: MX 204/240/480/960 Universal Routing Platforms",
      url: "https://www.juniper.net/us/en/products/routers/mx-series/mx-204-240-480-960-series-universal-routing-platforms-datasheet.html",
    },
    {
      label: "Juniper datasheet: EX4400 Ethernet Switch",
      url: "https://www.juniper.net/us/en/products/switches/ex-series/ex4400-ethernet-switch-datasheet.html",
    },
    {
      label: "Juniper datasheet: EX4300 Ethernet Switch",
      url: "https://www.juniper.net/us/en/products/switches/ex-series/ex4300-ethernet-switch-datasheet.html",
    },
  ],
};
