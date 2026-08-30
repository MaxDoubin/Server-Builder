/**
 * The rack library gallery: every elevation the site can draw, as cards.
 *
 * Each card is a real render of the rack's data at thumbnail scale, not a
 * screenshot, so the gallery can never drift from the detail pages. The
 * honesty rules the data files follow are stated once, up top, because they
 * are the point: this is reference material, not decoration.
 */

import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { RACKS, connectorCount, publishedWatts, unitsUsed } from "@/lib/racks";
import { RackElevation } from "@/components/racks/RackElevation";

const SITE_URL = "https://maxdoubin.com";

export function CinematicRacks() {
  useSEO({
    title: "Rack Library | Max Doubin",
    description:
      "Annotated rack elevations for Ubiquiti, Cisco, MikroTik and homelab builds. Click any rack, then any device, to read what it is, what it draws, and where every figure came from.",
    canonical: `${SITE_URL}/racks`,
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1100px]">
          <header className="max-w-3xl">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Hardware · Rack Elevations
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The rack library.
            </h1>
            <p className="mt-6 font-mono-tight text-base leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Complete racks, drawn from their datasheets: a full Ubiquiti
              deployment, a Cisco access closet, a MikroTik ISP stack, and the
              homelab most people build first. Open a rack and click any device
              to pull it out of the frame and read what it is, what it draws,
              and what every port on its face does.
            </p>
            <p className="mt-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
              Every port count, rack unit and wattage is the vendor's published
              figure, linked at the bottom of each rack. Where a vendor
              publishes no consumption figure, the page says "not published"
              rather than guessing. Link lights and traffic are illustrative,
              and say so.
            </p>
          </header>

          <div className="mt-16 grid gap-6 md:grid-cols-2">
            {RACKS.map((rack) => {
              const power = publishedWatts(rack);
              return (
                <Link
                  key={rack.slug}
                  href={`/racks/${rack.slug}`}
                  className="group rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(220_10%_6%)] p-5 transition-colors hover:border-[hsl(var(--brand-signal))] focus-visible:border-[hsl(var(--brand-signal))]"
                  data-testid={`link-rack-${rack.slug}`}
                >
                  <div className="mx-auto max-w-[300px] transition-transform duration-300 motion-safe:group-hover:scale-[1.02]">
                    <RackElevation rack={rack} mini />
                  </div>
                  <h2 className="mt-5 font-display text-xl font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                    {rack.name}
                  </h2>
                  <p className="mt-2 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
                    {rack.blurb}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-techno text-[10px] uppercase tracking-[0.25em] text-[hsl(var(--brand-ash))]">
                    <span>{rack.height}U frame</span>
                    <span>{unitsUsed(rack)}U mounted</span>
                    <span>{connectorCount(rack)} connectors</span>
                    <span>
                      {power.total > 0 ? `${power.total}W published` : "power not published"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          <section className="mt-20 max-w-3xl">
            <h2 className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]">
              Why elevations, and why these rules
            </h2>
            <p className="mt-4 font-mono-tight text-[14px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A rack elevation is how real deployments get planned: one drawing
              that answers what goes where, what it weighs on the circuit, and
              which port feeds which panel. Learning to read one is faster with
              a rack you can interrogate, which is what these are for. The same
              discipline the drawings follow, published figures or an explicit
              "not published", is the habit worth taking to real hardware,
              because a rack plan built on guessed wattage fails on the day the
              PoE budget runs out.
            </p>
            <p className="mt-4 font-mono-tight text-[14px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              To plan a build of your own, the{" "}
              <Link href="/tools/rack-budget" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
                rack budget tool
              </Link>{" "}
              does the power and heat arithmetic, and the{" "}
              <Link href="/data" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
                open equipment dataset
              </Link>{" "}
              has the raw numbers as JSON and CSV. The{" "}
              <Link href="/game" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
                build simulator
              </Link>{" "}
              is the same idea with consequences.
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}

export default CinematicRacks;
