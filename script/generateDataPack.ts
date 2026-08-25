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

  console.log(`data pack: ${rows.length} equipment rows as JSON and CSV`);
}
