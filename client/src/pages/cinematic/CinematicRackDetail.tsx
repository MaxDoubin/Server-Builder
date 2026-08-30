/**
 * One rack, full size, with a panel that any device slides out into.
 *
 * The elevation is the navigation: every device in the SVG is a button,
 * and selecting one slides it out of the frame and swaps the right-hand
 * panel from the rack's summary to that device's detail.
 *
 * Selection is held in the query string rather than component state, so a
 * device is a linkable thing. "Look at the 9300 in the Catalyst rack"
 * should be a URL that opens on the 9300, not a URL plus instructions.
 */

import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { publishedWatts, rackBySlug, unitsUsed } from "@/lib/racks";
import { RackElevation } from "@/components/racks/RackElevation";

/*
  three.js is a large dependency and the elevation is the primary drawing,
  so the 3D view arrives on its own chunk and only when asked for.
*/
const Rack3DView = lazy(() => import("@/components/racks/Rack3DView"));
import { DeviceDetailPanel } from "@/components/racks/DeviceDetailPanel";

const SITE_URL = "https://maxdoubin.com";

export function CinematicRackDetail() {
  const [, params] = useRoute("/racks/:slug");
  const rack = rackBySlug(params?.slug ?? "");
  /*
    Selection lives in the query string so a device is linkable. Sending
    someone "the 9300 in the Catalyst rack" should open on that device
    rather than on the rack with instructions to go find it.
  */
  /*
    Which drawing is showing lives in the query string alongside the
    selected device, so "look at this rack in 3D" is a link rather than a
    link plus instructions.
  */
  const [view, setViewState] = useState<"elevation" | "3d">(() => {
    if (typeof window === "undefined") return "elevation";
    return new URLSearchParams(window.location.search).get("view") === "3d" ? "3d" : "elevation";
  });
  const setView = useCallback((v: "elevation" | "3d") => {
    setViewState(v);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (v === "3d") url.searchParams.set("view", "3d");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("device");
  });

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("device", id);
    else url.searchParams.delete("device");
    window.history.replaceState(null, "", url);
  }, []);

  // Escape closes the panel, matching every other dismissible surface here.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, select]);

  useSEO({
    title: rack ? `${rack.name} rack | Max Doubin` : "Rack not found | Max Doubin",
    description: rack
      ? `An annotated ${rack.name} rack elevation: every device, port count and published wattage, with sources. Click any device to learn what it does.`
      : "This rack is not in the library.",
    canonical: `${SITE_URL}/racks/${params?.slug ?? ""}`,
  });

  if (!rack) {
    return (
      <CinematicLayout>
        <div className="relative px-6 pb-32 pt-40 md:px-10">
          <div className="mx-auto max-w-[700px] text-center">
            <h1 className="font-display text-3xl font-medium text-[hsl(var(--brand-bone))]">
              No rack at this address.
            </h1>
            <p className="mt-4 font-mono-tight text-[14px] text-[hsl(var(--brand-bone-dim))]">
              The rack library has moved on, or this link never pointed at one.
            </p>
            <Link
              href="/racks"
              className="mt-8 inline-block rounded-full border border-[hsl(var(--brand-iron))] px-5 py-2 font-techno text-[11px] uppercase tracking-[0.25em] text-[hsl(var(--brand-bone))] hover:border-[hsl(var(--brand-signal))]"
            >
              Back to the library
            </Link>
          </div>
        </div>
      </CinematicLayout>
    );
  }

  const selected = rack.devices.find((d) => d.id === selectedId) ?? null;
  const power = publishedWatts(rack);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1200px]">
          <header className="max-w-3xl">
            <nav aria-label="Breadcrumb" className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              <Link href="/racks" className="transition-colors hover:text-[hsl(var(--brand-signal))]">
                Rack Library
              </Link>
              <span aria-hidden="true"> / </span>
              <span className="text-[hsl(var(--brand-signal))]">{rack.name}</span>
            </nav>
            <h1 className="mt-4 font-display text-[clamp(2.2rem,5vw,3.6rem)] font-medium leading-[0.98] tracking-[-0.03em] text-[hsl(var(--brand-bone))]">
              {rack.name}.
            </h1>
            <p className="mt-5 font-mono-tight text-[15px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {rack.blurb}
            </p>
            <p className="mt-3 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
              Click any device in the elevation, or Tab to it and press Enter,
              to pull it out and read its details.
            </p>
          </header>

          <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div className="lg:sticky lg:top-24">
              <div className="mb-3 flex gap-2" role="group" aria-label="View">
                {(["elevation", "3d"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={`rounded-full border px-3 py-1.5 font-techno text-[10px] uppercase tracking-[0.25em] transition-colors ${
                      view === v
                        ? "border-[hsl(var(--brand-signal))] text-[hsl(var(--brand-bone))]"
                        : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                    }`}
                  >
                    {v === "elevation" ? "Elevation" : "3D"}
                  </button>
                ))}
              </div>
              {view === "elevation" ? (
                <RackElevation rack={rack} selectedId={selectedId} onSelect={(id) => select(id)} />
              ) : (
                <Suspense
                  fallback={
                    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(220_14%_4%)] font-techno text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                      Loading 3D
                    </div>
                  }
                >
                  <Rack3DView rack={rack} />
                </Suspense>
              )}
            </div>

            <aside aria-live="polite">
              {selected ? (
                <div key={selected.id}>
                  <DeviceDetailPanel rack={rack} device={selected} onClose={() => select(null)} />
                </div>
              ) : (
                <div>
                  <h2 className="font-display text-xl font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                    The build, in numbers
                  </h2>
                  <dl className="mt-4">
                    {[
                      ["Frame", `${rack.height} rack units`],
                      ["Mounted", `${unitsUsed(rack)}U across ${rack.devices.length} devices`],
                      [
                        "Published draw",
                        power.total > 0
                          ? `${power.total}W across the devices that publish one${power.unpublished > 0 ? `, ${power.unpublished} not published` : ""}`
                          : "No device here publishes a consumption figure",
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-baseline justify-between gap-4 border-b border-[hsl(var(--brand-iron))] py-2.5">
                        <dt className="shrink-0 font-techno text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">{label}</dt>
                        <dd className="text-right font-mono-tight text-[13px] text-[hsl(var(--brand-bone))]">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <h2 className="mt-10 font-display text-lg font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                    Top to bottom
                  </h2>
                  <ol className="mt-3 space-y-1.5">
                    {rack.devices.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => select(d.id)}
                          className="group flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[hsl(220_10%_9%)]"
                        >
                          <span className="font-mono-tight text-[13px] text-[hsl(var(--brand-bone-dim))] transition-colors group-hover:text-[hsl(var(--brand-bone))]">
                            {d.vendor === "Generic" ? d.model : `${d.vendor} ${d.model}`}
                          </span>
                          <span className="shrink-0 font-techno text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                            {d.u}U
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>

                  <h2 className="mt-10 font-display text-lg font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                    Where the numbers come from
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {rack.sources.map((s) => (
                      <li key={s.url} className="font-mono-tight text-[13px] leading-relaxed">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
                        >
                          {s.label}
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>

          <nav className="mt-20 flex flex-wrap gap-3" aria-label="Rack library">
            <Link
              href="/racks"
              className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-techno text-[10px] uppercase tracking-[0.25em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal))] hover:text-[hsl(var(--brand-bone))]"
            >
              All racks
            </Link>
            <Link
              href="/tools/rack-budget"
              className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-techno text-[10px] uppercase tracking-[0.25em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal))] hover:text-[hsl(var(--brand-bone))]"
            >
              Rack budget tool
            </Link>
            <Link
              href="/game"
              className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-techno text-[10px] uppercase tracking-[0.25em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal))] hover:text-[hsl(var(--brand-bone))]"
            >
              Build simulator
            </Link>
          </nav>
        </div>
      </div>
    </CinematicLayout>
  );
}

export default CinematicRackDetail;
