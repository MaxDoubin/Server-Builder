/**
 * Publishes the simulator's equipment catalog as an open dataset.
 *
 * A clean rack-hardware table with power, heat, height and port count is
 * genuinely hard to find openly licensed, and this site already maintains
 * one because the simulator needs it to model a floor.
 *
 * HONESTY, which is the whole reason this file has a long comment. These are
 * MODELLING figures, not vendor spec sheets and not measurements:
 *   - manufacturer and model name a real product
 *   - powerDraw is a representative steady-state figure for that class of
 *     hardware, not a nameplate rating and not something anyone metered
 *   - heatOutput is derived, not independently sourced: watts x 3.412, the
 *     W to BTU/hr identity, for everything that draws IT load
 *   - PDUs and UPSs carry powerDraw 0, because they distribute load rather
 *     than consuming it, with a small standing figure for conversion loss
 *   - price is order-of-magnitude, for capacity exercises, not a quote
 * The emitted files say all of this in their own header so the statement
 * travels with the data if someone downloads it and forgets where it came
 * from.
 */

import { writeFile, mkdir } from "fs/promises";
import path from "path";

const OUT_DIR = path.resolve("dist/public/data");

const PROVENANCE = {
  source: "https://maxdoubin.com/data",
  generator: "maxdoubin.com datacenter simulator equipment catalog",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "Max Doubin, maxdoubin.com",
  disclaimer:
    "Modelling figures, not vendor specifications and not measurements. powerDraw is a representative steady-state value for the class of hardware named, not a nameplate rating. heatOutput is derived as watts multiplied by 3.412 (the W to BTU/hr identity) rather than independently sourced. PDUs and UPSs report powerDraw 0 because they distribute load rather than consume it, and carry a small standing heat figure for conversion loss. price is order of magnitude, intended for capacity planning exercises, not a quotation. Do not cite these as manufacturer data.",
  fields: {
    id: "stable identifier within this dataset",
    name: "product name",
    manufacturer: "manufacturer name",
    model: "model designation",
    type: "equipment class used by the simulator",
    uHeight: "rack units occupied",
    powerDraw: "representative steady-state draw, watts",
    heatOutput: "derived thermal output, BTU per hour",
    price: "order-of-magnitude cost, USD",
    portCount: "front-facing network ports, where applicable",
  },
} as const;

/**
 * The rack library, published as data.
 *
 * A different kind of dataset from the equipment catalog above, and the
 * distinction matters enough to keep the two provenance blocks apart. The
 * catalog is modelling figures for a simulator. This is the rack library,
 * where every rack unit height and port count was read off a vendor
 * datasheet and every device carries the page it came from, and where a
 * device that publishes no consumption figure says so rather than
 * carrying a number somebody estimated.
 *
 * Publishing it is also what keeps the models honest. The elevation, the
 * procedural view and the authored GLB all claim to draw the same rack,
 * and the CI check that proves it needs the real device list rather than
 * a regex over the source: a rack whose panels come from a local helper
 * has devices that no amount of pattern matching will find.
 */
const RACK_PROVENANCE = {
  source: "https://maxdoubin.com/racks",
  generator: "maxdoubin.com rack library",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "Max Doubin, maxdoubin.com",
  disclaimer:
    "Vendor published figures, cited per device, not measurements and not estimates. watts is null wherever the vendor publishes a power supply rating or a PoE budget rather than the device's own consumption, which is most of the enterprise hardware here: quoting a supply rating as a draw would overstate a rack's load several times over. Port link state and drive bay occupancy are illustrative, stated as such on the pages, and describe a plausible fit-out rather than a measured one. Product names are third-party trademarks used to identify the hardware being described.",
  fields: {
    rack: "rack slug, as used in the page URL",
    rackName: "rack display name",
    rackUnits: "height of the frame in rack units",
    position: "rack units from the top of the frame to the top of this device",
    id: "device identifier, unique within its rack and matching the 3D model's node group",
    u: "rack units occupied",
    vendor: "manufacturer, or Generic for unbranded passive hardware",
    model: "model designation",
    family: "what kind of device this is",
    watts: "vendor published consumption, or null where the vendor publishes none",
    ports: "front connector count",
    bays: "front drive bay count, where the face is storage",
    source: "the vendor page the figures came from",
  },
} as const;

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function generateDataPack(): Promise<void> {
  const { staticEquipmentCatalog } = await import(
    "../client/src/lib/static-equipment.ts"
  );

  const rows = staticEquipmentCatalog.map((e) => ({
    id: e.id,
    name: e.name,
    manufacturer: e.manufacturer,
    model: e.model,
    type: e.type,
    uHeight: e.uHeight,
    powerDraw: e.powerDraw,
    heatOutput: e.heatOutput,
    price: e.price,
    portCount: e.portCount,
  }));

  await mkdir(OUT_DIR, { recursive: true });

  await writeFile(
    path.join(OUT_DIR, "equipment-catalog.json"),
    JSON.stringify({ ...PROVENANCE, count: rows.length, equipment: rows }, null, 2),
    "utf-8",
  );

  const cols = Object.keys(rows[0]) as Array<keyof (typeof rows)[number]>;
  const csv = [
    `# ${PROVENANCE.generator}`,
    `# ${PROVENANCE.license} - ${PROVENANCE.attribution} - ${PROVENANCE.source}`,
    `# ${PROVENANCE.disclaimer}`,
    cols.join(","),
    ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")),
  ].join("\n");
  await writeFile(path.join(OUT_DIR, "equipment-catalog.csv"), `${csv}\n`, "utf-8");

  const { RACKS } = await import("../client/src/lib/racks/index.ts");

  const rackRows = RACKS.flatMap((rack) => {
    let fromTop = 0;
    return rack.devices.map((d) => {
      const row = {
        rack: rack.slug,
        rackName: rack.name,
        rackUnits: rack.height,
        position: fromTop,
        id: d.id,
        u: d.u,
        vendor: d.vendor,
        model: d.model,
        family: d.family,
        watts: d.watts ?? null,
        ports: d.ports?.length ?? 0,
        bays: d.bays?.count ?? 0,
        source: d.url ?? "",
      };
      fromTop += d.u;
      return row;
    });
  });

  await writeFile(
    path.join(OUT_DIR, "rack-library.json"),
    JSON.stringify(
      { ...RACK_PROVENANCE, rackCount: RACKS.length, count: rackRows.length, devices: rackRows },
      null,
      2,
    ),
    "utf-8",
  );

  const rackCols = Object.keys(rackRows[0]) as Array<keyof (typeof rackRows)[number]>;
  const rackCsv = [
    `# ${RACK_PROVENANCE.generator}`,
    `# ${RACK_PROVENANCE.license} - ${RACK_PROVENANCE.attribution} - ${RACK_PROVENANCE.source}`,
    `# ${RACK_PROVENANCE.disclaimer}`,
    rackCols.join(","),
    ...rackRows.map((r) => rackCols.map((c) => csvCell(r[c])).join(",")),
  ].join("\n");
  await writeFile(path.join(OUT_DIR, "rack-library.csv"), `${rackCsv}\n`, "utf-8");

  console.log(
    `data pack: ${rows.length} equipment rows, ${rackRows.length} rack devices across ${RACKS.length} racks, as JSON and CSV`,
  );
}
