/**
 * The rack library gallery: every elevation the site can draw, as cards.
 *
 * Each card is a real render of the rack's data at thumbnail scale, not a
 * screenshot, so the gallery can never drift from the detail pages. The
 * honesty rules the data files follow are stated once, up top, because they
 * are the point: this is reference material, not decoration.
 *
 * Two of the racks here are a different kind of thing and lead the page for
 * that reason: they are real 3D, built out of geometry the vendors
 * themselves published rather than out of a drawing of it. The counts on
 * their cards are read from the same data the pages render, so a device
 * added to the wired rack or a part added to the teardown shows up here
 * without anybody remembering to update a number.
 */

import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { RACKS, connectorCount, publishedWatts, unitsUsed } from "@/lib/racks";
import { RackElevation } from "@/components/racks/RackElevation";
import { WIRED_DEVICES, WIRED_PATCHES, WIRED_RACK_UNITS } from "@/lib/unifiWiredRack";
import { TEARDOWN_PARTS } from "@/components/teardown/teardownParts";

const SITE_URL = "https://maxdoubin.com";

/**
 * The hue a port glows, stepped across a bank.
 *
 * The same sweep the wired rack renders in 3D, restated here rather than
 * imported, because the module it lives in pulls in three.js and this page
 * has no business loading an engine to draw eleven dots.
 */
const portHue = (i: number, n: number) => `hsl(${Math.round(4 + (i / (n - 1)) * 236)}, 92%, 62%)`;

/**
 * A part filled frame, which is what the builder looks like on arrival.
 *
 * Deliberately not full. The card has to say "there is room here" in the
 * one glance somebody gives it, and a rack drawn full says the opposite.
 */
function BuilderMini() {
  const u = 8.4;
  const filled = [0, 1, 2, 4];
  return (
    <svg viewBox="0 0 220 150" className="h-full w-full" role="img" aria-label="A part filled rack">
      <rect x="34" y="6" width="152" height={12 * u + 8} rx="3" className="fill-[hsl(220_10%_9%)] stroke-[hsl(var(--brand-iron))]" strokeWidth="1" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect
          key={i}
          x="42"
          y={10 + i * u}
          width="136"
          height={u - 1.6}
          rx="1.2"
          className={
            filled.includes(i)
              ? "fill-[hsl(220_8%_20%)] stroke-[hsl(var(--brand-iron))]"
              : "fill-none stroke-[hsl(var(--brand-iron)/0.45)]"
          }
          strokeWidth="0.6"
          strokeDasharray={filled.includes(i) ? undefined : "2 2.5"}
        />
      ))}
      <g className="fill-[hsl(var(--brand-signal))]">
        <rect x="150" y={10 + 5 * u + u / 2 - 5} width="10" height="1.6" rx="0.8" />
        <rect x="154.2" y={10 + 5 * u + u / 2 - 9.2} width="1.6" height="10" rx="0.8" />
      </g>
    </svg>
  );
}

/**
 * A patched rack at card scale, drawn rather than photographed.
 *
 * Same rule as the elevations below: the thumbnail is the data, so it
 * cannot drift from the page it links to. The device bars come from the
 * real build, at their real heights and positions in the frame.
 */
function WiredMini() {
  const u = 8.4;
  const top = 10;
  /* Two device faces two units apart, patched port for port, which is the
     one bundle on the real page worth showing at this size. */
  const rowA = top + 4 * u + u / 2;
  const rowB = top + 6 * u + u / 2;
  const belly = rowB + 11;
  const n = 11;

  return (
    <svg viewBox="0 0 220 150" className="h-full w-full" role="img" aria-label="A patched UniFi rack">
      <rect
        x="34"
        y="6"
        width="152"
        height={WIRED_RACK_UNITS * u + 8}
        rx="3"
        className="fill-[hsl(220_10%_9%)] stroke-[hsl(var(--brand-iron))]"
        strokeWidth="1"
      />
      {WIRED_DEVICES.map((d, i) => (
        <rect
          key={`${d.slug}-${i}`}
          x="42"
          y={top + (WIRED_RACK_UNITS - d.at - d.u) * u}
          width="136"
          height={d.u * u - 1.6}
          rx="1.2"
          className="fill-[hsl(220_8%_16%)] stroke-[hsl(var(--brand-iron))]"
          strokeWidth="0.6"
        />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const ax = 48 + i * 11.4;
        const bx = ax + 5;
        const hue = portHue(i, n);
        return (
          <g key={i}>
            <path
              d={`M ${ax} ${rowA} C ${ax} ${belly}, ${bx} ${belly}, ${bx} ${rowB}`}
              fill="none"
              stroke={hue}
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.55"
            />
            <circle cx={ax} cy={rowA} r="2.3" fill={hue} />
            <circle cx={bx} cy={rowB} r="2.3" fill={hue} />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * A chassis coming apart, at card scale.
 *
 * Eight plates for the teardown's eight waves, each one lifted further
 * than the last, which is the shape the animation actually makes.
 */
function TeardownMini() {
  return (
    <svg viewBox="0 0 220 150" className="h-full w-full" role="img" aria-label="A server coming apart">
      {Array.from({ length: 8 }, (_, i) => {
        const lift = i * 12.5;
        const inset = i * 3.5;
        return (
          <g key={i} opacity={0.5 + i * 0.062}>
            <path
              d={`M ${34 + inset} ${118 - lift} L ${110} ${100 - lift} L ${186 - inset} ${118 - lift} L ${110} ${136 - lift} Z`}
              className="fill-[hsl(220_8%_15%)] stroke-[hsl(var(--brand-iron))]"
              strokeWidth="0.8"
            />
            {i === 4 ? (
              <path
                d={`M ${76} ${112 - lift} L ${110} ${104 - lift} L ${144} ${112 - lift} L ${110} ${120 - lift} Z`}
                className="fill-[hsl(var(--brand-signal)/0.35)] stroke-[hsl(var(--brand-signal)/0.7)]"
                strokeWidth="0.8"
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function CinematicRacks() {
  /*
    Counts read from the same modules the pages render, so a device added to
    the wired rack or a part added to the teardown updates this card by
    itself. Both modules are plain data with no imports of their own, so
    naming them here costs the page nothing.
  */
  const fibre = WIRED_PATCHES.filter((p) => p.fibre).length;
  const FEATURED = [
    {
      slug: "build",
      href: "/racks/build",
      kicker: "Build your own",
      title: "The rack builder",
      blurb:
        "Seventy five rack mountable devices from six vendors and an empty frame. Pick hardware, stack it, and see what the build weighs. Saves in your browser and shares as a link.",
      stats: ["75 devices", "6U to 42U", "shareable"],
      art: <BuilderMini />,
    },
    {
      slug: "wired",
      href: "/racks/wired",
      kicker: "Ubiquiti geometry",
      title: "The wired UniFi rack",
      blurb:
        "Sixteen units of UniFi, patched the way somebody would actually patch it, out of the same models Ubiquiti's store loads into its own 3D viewer. Every port that carries a lead lights it.",
      stats: [
        `${WIRED_DEVICES.length} devices`,
        `${WIRED_PATCHES.length - fibre} copper`,
        `${fibre} fibre`,
        `${WIRED_RACK_UNITS}U frame`,
      ],
      art: <WiredMini />,
    },
    {
      slug: "teardown",
      href: "/teardown",
      kicker: "Dell service geometry",
      title: "A PowerEdge, opened",
      blurb:
        "An R760 coming apart in the order a technician would take it apart, out of the model behind Dell's own repair guides. Scrub the slider, or pick a part to isolate it.",
      stats: [`${TEARDOWN_PARTS.length} assemblies`, "8 waves", "2U", "4.2MB"],
      art: <TeardownMini />,
    },
  ];

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

          <section className="mt-14">
            <div className="flex items-baseline gap-4">
              {/*
                A heading, not a styled div. It reads as the section's title
                and it labels the cards below it, and while it was a div the
                document outline went straight from the page h1 to the h3 on
                each card with nothing in between: a screen reader listing the
                headings saw a level skipped and no name for the group. The
                type is unchanged.
              */}
              <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · In 3D · Vendor geometry
              </h2>
              <div className="h-px flex-1 bg-[hsl(var(--brand-iron))]" />
            </div>
            <p className="mt-4 max-w-3xl font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
              These three are not drawings of hardware. They are the hardware, from geometry
              Ubiquiti and Dell publish themselves, which means the panels are the panels and the
              parts are the parts. The first one is yours to fill. All three run in the browser
              and all three take a while to load, so they sit apart from the elevations rather
              than in the grid with them.
            </p>

            <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {FEATURED.map((f) => (
                <Link
                  key={f.href}
                  href={f.href}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))] transition-colors hover:border-[hsl(var(--brand-signal))] focus-visible:border-[hsl(var(--brand-signal))]"
                  data-testid={`link-featured-${f.slug}`}
                >
                  <div className="aspect-[22/15] border-b border-[hsl(var(--brand-iron)/0.7)] bg-[hsl(var(--brand-void))] p-3 transition-transform duration-300 motion-safe:group-hover:scale-[1.015]">
                    {f.art}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="font-techno text-[9px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
                      {f.kicker}
                    </div>
                    <h3 className="mt-2 font-display text-xl font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                      {f.title}
                    </h3>
                    <p className="mt-2 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {f.blurb}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-techno text-[10px] uppercase tracking-[0.25em] text-[hsl(var(--brand-ash))]">
                      {f.stats.map((stat) => (
                        <span key={stat}>{stat}</span>
                      ))}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <div className="mt-16 flex items-baseline gap-4">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Elevations · Drawn from datasheets
            </div>
            <div className="h-px flex-1 bg-[hsl(var(--brand-iron))]" />
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {RACKS.map((rack) => {
              const power = publishedWatts(rack);
              return (
                <Link
                  key={rack.slug}
                  href={`/racks/${rack.slug}`}
                  className="group rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))] p-5 transition-colors hover:border-[hsl(var(--brand-signal))] focus-visible:border-[hsl(var(--brand-signal))]"
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
