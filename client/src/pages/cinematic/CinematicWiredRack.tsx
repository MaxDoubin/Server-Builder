import { Suspense, lazy, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { WIRED_DEVICES, WIRED_PATCHES, WIRED_RACK_UNITS } from "@/lib/unifiWiredRack";

const WiredRackScene = lazy(() =>
  import("@/components/racks/WiredRackScene").then((m) => ({ default: m.WiredRackScene })),
);

/**
 * A UniFi rack, fully patched, built out of Ubiquiti's own geometry.
 *
 * Every other rack on this site is hardware we modelled. This one is the
 * hardware, from the models Ubiquiti serve to their own store pages, which
 * means the ports are where the ports are and the sheet metal is the sheet
 * metal. What is ours is the build: what goes in it, where, and how it is
 * patched.
 */
export function CinematicWiredRack() {
  useSEO({
    title: "The wired UniFi rack | Max Doubin",
    description:
      "A fourteen unit UniFi rack in real 3D, built from Ubiquiti's own product models and fully patched: two PoE switches down to surge panels, fibre uplinks to the aggregation switch, and every power lead landing in the distribution unit.",
    canonical: "https://maxdoubin.com/racks/wired",
  });

  const [picked, setPicked] = useState<string | null>(null);
  const copper = WIRED_PATCHES.filter((p) => !p.fibre).length;
  const fibre = WIRED_PATCHES.length - copper;
  const used = WIRED_DEVICES.reduce((n, d) => n + d.u, 0);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-24 pt-28 md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <header className="max-w-[72ch]">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Racks · Wired
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The wired rack.
            </h1>
            <p className="mt-6 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Fourteen units of UniFi, patched the way somebody would actually patch it. The
              hardware is Ubiquiti's own geometry, the same models their store loads into its 3D
              viewer, so the panels are the panels and the ports are where the ports are. The
              build is mine: two PoE switches coming down to surge panels, fibre uplinks to the
              aggregation switch, storage taking copper straight to the nearest switch, and every
              power lead running down the side of the frame into the distribution unit.
            </p>
          </header>

          <dl className="mt-8 grid max-w-[52rem] grid-cols-2 gap-px overflow-hidden rounded border border-[hsl(var(--brand-iron)/0.6)] bg-[hsl(var(--brand-iron)/0.6)] sm:grid-cols-4">
            {[
              [`${used} of ${WIRED_RACK_UNITS}U`, "occupied"],
              [`${WIRED_DEVICES.length}`, "devices"],
              [`${copper}`, "copper leads"],
              [`${fibre}`, "fibre uplinks"],
            ].map(([value, label]) => (
              <div key={label} className="bg-[hsl(var(--brand-void))] px-4 py-3">
                <dt className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                  {label}
                </dt>
                <dd className="mt-1 font-display text-xl text-[hsl(var(--brand-bone))]">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
            <div className="overflow-hidden rounded-lg border border-[hsl(var(--brand-iron)/0.6)] bg-[hsl(var(--brand-void))]">
              <div className="aspect-[3/4] w-full sm:aspect-[4/3] lg:aspect-[5/4]">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      Loading nine Ubiquiti models...
                    </div>
                  }
                >
                  <WiredRackScene onPick={setPicked} />
                </Suspense>
              </div>
              <p className="border-t border-[hsl(var(--brand-iron)/0.6)] px-5 py-3 font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                Drag to orbit, scroll to zoom, click a device to isolate it.
              </p>
            </div>

            <aside className="flex flex-col gap-3">
              <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
                · Elevation
              </div>
              <ol className="overflow-hidden rounded border border-[hsl(var(--brand-iron)/0.6)] divide-y divide-[hsl(var(--brand-iron)/0.5)]">
                {WIRED_DEVICES.map((d, i) => {
                  const on = d.label === picked;
                  return (
                    <li key={`${d.slug}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setPicked(on ? null : d.label)}
                        aria-pressed={on}
                        className={`flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors ${
                          on
                            ? "bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                            : "text-[hsl(var(--brand-bone-dim))] hover:bg-[hsl(var(--brand-iron)/0.28)]"
                        }`}
                      >
                        <span className="w-10 shrink-0 font-mono-tight text-[10px] tabular-nums text-[hsl(var(--brand-ash))]">
                          U{WIRED_RACK_UNITS - d.at}
                        </span>
                        <span className="font-mono-tight text-xs leading-snug">{d.label}</span>
                        <span className="ml-auto font-mono-tight text-[10px] text-[hsl(var(--brand-ash))]">
                          {d.u}U
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className="font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash))]">
                All but one of these is an Ubiquiti model. The distribution unit is not: Ubiquiti
                publish no model for it, so it is built by hand from their own dimensioned
                elevation.
              </p>
            </aside>
          </div>

          <section className="mt-14 max-w-[72ch]">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Wired · How the cabling works
            </div>
            <h2 className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]">
              Why it looks combed instead of tangled
            </h2>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The first version of this cabling let every lead find its own way from A to B, and
              the result was a bowl of spaghetti across the front of the rack. A dressed bundle is
              four moves and every lead makes the same four: out of the jack along the plug's
              axis, a turn down into a service loop, a run along the bottom of that loop to get
              under the far port, and back up into it. Because every lead turns at the same
              standoff and drops to the same belly, the vertical runs come out parallel. The only
              variation is how far out each one stands, and a long lead has to cross the ones
              underneath it, so it is layered further out.
            </p>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Power leads do none of that. They are thicker, they will not bend as tightly, and
              nobody dresses a C13 across the face of their switches, so they drop out of the
              inlet, run to whichever side of the frame is nearer, and travel vertically down to
              the outlet they land in. Getting that wrong is what makes a rendered rack look
              rendered.
            </p>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The 3D models are Ubiquiti's work and their copyright, used here to show their
              hardware. The other racks in the{" "}
              <Link
                href="/racks"
                className="text-[hsl(var(--brand-signal))] underline underline-offset-4"
              >
                library
              </Link>{" "}
              are modelled from photographs instead, and there is a{" "}
              <Link
                href="/teardown"
                className="text-[hsl(var(--brand-signal))] underline underline-offset-4"
              >
                PowerEdge teardown
              </Link>{" "}
              built the same way from Dell's service geometry.
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}
