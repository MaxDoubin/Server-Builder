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
import { RACKS } from "@/lib/racks";
import { BTU_PER_WATT } from "@/lib/capacity";

const SITE_URL = "https://maxdoubin.com";

export function CinematicData() {
  const count = staticEquipmentCatalog.length;
  const rackDevices = RACKS.reduce((n, r) => n + r.devices.length, 0);
  const rackSourced = RACKS.reduce((n, r) => n + r.devices.filter((d) => d.url).length, 0);
  const creator = { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" };

  useSEO({
    title: "Open rack hardware datasets | Max Doubin",
    description: `Two CC BY 4.0 datasets as JSON and CSV: ${count} rack-mount devices with power draw, heat output, rack units and port count, and ${rackDevices} devices across ${RACKS.length} rack elevations with the vendor figures and datasheet pages behind them.`,
    canonical: `${SITE_URL}/data`,
    schema: {
      "@context": "https://schema.org",
      "@type": "DataCatalog",
      name: "Max Doubin open rack data",
      description: `Two openly licensed datasets: modelling figures for ${count} rack-mount devices, and ${rackDevices} devices across ${RACKS.length} rack elevations with their vendor published figures.`,
      url: `${SITE_URL}/data`,
      license: "https://creativecommons.org/licenses/by/4.0/",
      creator: creator,
      dataset: [
        {
          "@type": "Dataset",
          name: "Rack hardware power and thermal catalog",
          description: `Modelling figures for ${count} rack-mount devices: power draw in watts, derived heat output in BTU per hour, rack units, port count and indicative cost. Representative values for a class of hardware, not vendor specifications and not measurements.`,
          license: "https://creativecommons.org/licenses/by/4.0/",
          creator,
          distribution: [
            { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${SITE_URL}/data/equipment-catalog.json` },
            { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE_URL}/data/equipment-catalog.csv` },
          ],
        },
        {
          "@type": "Dataset",
          name: "Rack library elevations",
          description: `${rackDevices} devices across ${RACKS.length} rack elevations with vendor, model, rack units, position and published draw. Vendor published figures, cited per device, with a null draw wherever the vendor publishes a supply rating rather than a consumption figure.`,
          license: "https://creativecommons.org/licenses/by/4.0/",
          creator,
          distribution: [
            { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${SITE_URL}/data/rack-library.json` },
            { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE_URL}/data/rack-library.csv` },
          ],
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
              Rack hardware datasets
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Two of them, and they are honest about different things. First,{" "}
              {count} rack-mount devices with power draw, heat output, rack
              units, port count and indicative cost: the table the datacenter
              simulator on this site runs on, published because a clean openly
              licensed version of it is genuinely hard to find. Second, the{" "}
              {rackDevices} devices in this site&rsquo;s {RACKS.length} rack
              elevations, where the figures are the vendors&rsquo; own and each
              one carries the page it came from.
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

          <section className="mt-14 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.35)] p-6">
            <h2 className="font-display text-xl text-[hsl(var(--brand-bone))]">
              And the rack library, which is a different kind of data
            </h2>
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {rackDevices} devices across {RACKS.length} rack elevations, and
              the distinction from the table above is the whole point of
              publishing them separately. Those are modelling figures for a
              simulator. These are vendor published figures: {rackSourced} of
              the {rackDevices} carry the datasheet page their numbers came
              from, and a device whose vendor publishes no consumption figure
              says so rather than carrying one somebody estimated.
            </p>
            <ul className="mt-4 space-y-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <li>
                <strong className="text-[hsl(var(--brand-bone))]">watts</strong>{" "}
                is null wherever the vendor publishes a supply rating or a PoE
                budget rather than the device&rsquo;s own draw, which is most
                of the enterprise hardware here. A 715W supply is not a 715W
                switch, and quoting one as the other would overstate a
                rack&rsquo;s load several times over.
              </li>
              <li>
                <strong className="text-[hsl(var(--brand-bone))]">position</strong>{" "}
                and <strong className="text-[hsl(var(--brand-bone))]">u</strong>{" "}
                are the real elevation: every rack&rsquo;s devices add up to
                its frame, and CI fails the build if they stop doing so.
              </li>
              <li>
                Link state and drive bay occupancy on the pages are
                illustrative, described as such there, and are not in this
                file.
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="/data/rack-library.json"
                download
                data-testid="download-racks-json"
                className="inline-flex min-h-[24px] items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)]"
              >
                rack-library.json
              </a>
              <a
                href="/data/rack-library.csv"
                download
                data-testid="download-racks-csv"
                className="inline-flex min-h-[24px] items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)]"
              >
                rack-library.csv
              </a>
            </div>
          </section>

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
