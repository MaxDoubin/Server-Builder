/**
 * Open data pack at /data.
 *
 * The simulator needs a table of rack hardware with power, heat, height and
 * port count, so this site maintains one. That table is hard to find openly
 * licensed anywhere, which makes publishing it the single most linkable
 * thing here.
 *
 * The page leads with what the numbers are and are not. Publishing modelling
 * figures under a manufacturer's name without saying so would create exactly
 * the kind of authoritative-looking fabrication the rest of this site has
 * been busy removing.
 */

import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { staticEquipmentCatalog } from "@/lib/static-equipment";
import { BTU_PER_WATT } from "@/lib/capacity";

const SITE_URL = "https://maxdoubin.com";

export function CinematicData() {
  const count = staticEquipmentCatalog.length;

  useSEO({
    title: "Open rack hardware dataset | Max Doubin",
    description: `An openly licensed table of ${count} rack-mount devices with power draw, heat output, rack units, port count and indicative cost, as JSON and CSV under CC BY 4.0.`,
    canonical: `${SITE_URL}/data`,
    schema: {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "Rack hardware power and thermal catalog",
      description: `Modelling figures for ${count} rack-mount devices: power draw in watts, derived heat output in BTU per hour, rack units, port count and indicative cost.`,
      url: `${SITE_URL}/data`,
      license: "https://creativecommons.org/licenses/by/4.0/",
      creator: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `${SITE_URL}/data/equipment-catalog.json`,
        },
        {
          "@type": "DataDownload",
          encodingFormat: "text/csv",
          contentUrl: `${SITE_URL}/data/equipment-catalog.csv`,
        },
      ],
    },
    schemaId: "dataset-schema",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Open data
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Rack hardware dataset
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {count} rack-mount devices with power draw, heat output, rack
              units, port count and indicative cost. It is the table the
              datacenter simulator on this site runs on, published because a
              clean openly licensed version of it is genuinely hard to find.
            </p>
          </header>

          <section className="mt-10 rounded-xl border border-[hsl(var(--brand-signal)/0.35)] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <h2 className="font-display text-lg text-[hsl(var(--brand-bone))]">
              What these numbers are, and are not
            </h2>
            <ul className="mt-4 space-y-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <li>
                Manufacturer and model name a real product. Everything else is
                a modelling figure.
              </li>
              <li>
                <strong className="text-[hsl(var(--brand-bone))]">powerDraw</strong>{" "}
                is a representative steady-state value for that class of
                hardware. It is not a nameplate rating and nobody metered it.
              </li>
              <li>
                <strong className="text-[hsl(var(--brand-bone))]">heatOutput</strong>{" "}
                is derived, not independently sourced: watts multiplied by{" "}
                {BTU_PER_WATT}, the W to BTU/hr identity.
              </li>
              <li>
                PDUs and UPSs report powerDraw 0, because they distribute load
                rather than consume it, and carry a small standing figure for
                conversion loss.
              </li>
              <li>
                <strong className="text-[hsl(var(--brand-bone))]">price</strong>{" "}
                is order of magnitude, for capacity exercises. It is not a
                quotation.
              </li>
            </ul>
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Useful for teaching, coursework, capacity planning practice and
              seeding your own simulator. Do not cite it as manufacturer data,
              because it is not.
            </p>
          </section>

          <section className="mt-10 flex flex-wrap gap-3">
            <a
              href="/data/equipment-catalog.json"
              download
              data-testid="download-json"
              className="inline-flex min-h-[24px] items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)]"
            >
              equipment-catalog.json
            </a>
            <a
              href="/data/equipment-catalog.csv"
              download
              data-testid="download-csv"
              className="inline-flex min-h-[24px] items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)]"
            >
              equipment-catalog.csv
            </a>
          </section>

          <p className="mt-6 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
            Licensed{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer noopener"
              className="text-[hsl(var(--brand-signal))] hover:text-[hsl(var(--brand-bone))]"
            >
              CC BY 4.0
            </a>
            . Use it anywhere, credit Max Doubin and link back. The same
            disclaimer above is embedded in both files.
          </p>

          <section className="mt-12">
            <h2 className="font-display text-xl text-[hsl(var(--brand-bone))]">
              The table
            </h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))]">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[hsl(var(--brand-graphite)/0.7)]">
                    {["Device", "U", "Watts", "BTU/hr", "Ports", "USD"].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="whitespace-nowrap px-4 py-3 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staticEquipmentCatalog.map((e) => (
                    <tr key={e.id} className="border-t border-[hsl(var(--brand-iron))]">
                      <th
                        scope="row"
                        className="px-4 py-2.5 text-left font-display text-sm font-normal text-[hsl(var(--brand-bone))]"
                      >
                        {e.name}
                      </th>
                      {[e.uHeight, e.powerDraw, e.heatOutput, e.portCount, e.price].map((v, i) => (
                        <td
                          key={i}
                          className="whitespace-nowrap px-4 py-2.5 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
                        >
                          {typeof v === "number" ? v.toLocaleString("en-US") : v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}
