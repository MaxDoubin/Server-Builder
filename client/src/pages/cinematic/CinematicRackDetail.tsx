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
/*
  The hero model is a separate chunk again, and a separate view. It is one
  authored GLB shown exactly as authored rather than the procedural
  renderer, and only the UniFi rack has one, so the tab only appears there.
*/
const HeroRackModel = lazy(() => import("@/components/racks/HeroRackModel"));

type RackView = "elevation" | "3d" | "model";

const VIEW_LABELS: Record<RackView, string> = {
  elevation: "Elevation",
  "3d": "3D",
  model: "Hero model",
};

/* Light, because both 3D views are a white studio. A dark placeholder
   flashed black for the second the three.js chunk took to arrive. */
function ModelLoading() {
  return (
    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-[hsl(var(--brand-iron))] bg-[#eef0f3] font-techno text-[10px] uppercase tracking-[0.3em] text-[#5c6472]">
      Loading model
    </div>
  );
}
import { DeviceDetailPanel } from "@/components/racks/DeviceDetailPanel";
import { ALL_HERO_PARTS, heroModelFor } from "@/lib/racks/heroModels";

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
  const [view, setViewState] = useState<RackView>(() => {
    if (typeof window === "undefined") return "elevation";
    const q = new URLSearchParams(window.location.search).get("view");
    return q === "3d" || q === "model" ? q : "elevation";
  });
  const setView = useCallback((v: RackView) => {
    setViewState(v);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (v === "elevation") url.searchParams.delete("view");
    else url.searchParams.set("view", v);
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

  /*
    Which vendors in this rack decline to publish a draw. Naming them
    beats a fixed list: the note used to say "Cisco, Juniper and Dell" on
    every page including the MikroTik one, where none of the three appear.
  */
  const silentVendors = Array.from(
    new Set(
      rack.devices
        .filter((d) => d.watts === null && d.vendor !== "Generic" && d.family !== "patch" && d.family !== "blank")
        .map((d) => d.vendor),
    ),
  );

  const heroModel = heroModelFor(rack.slug);
  const views: RackView[] = heroModel ? ["elevation", "3d", "model"] : ["elevation", "3d"];
  /*
    The model's parts carry their own device records, because the model
    shows hardware the elevation does not: a recorder, an RPS, a transfer
    stage. Look there first when the model view is the one selecting.
  */
  const selected =
    rack.devices.find((d) => d.id === selectedId) ??
    ALL_HERO_PARTS.get(selectedId ?? "")?.device ??
    null;
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
              to pull it out and read its details. Switch to the 3D model to
              walk around the same rack: every device is built from the same
              datasheet figures, down to the port pitch and the chassis depth.
            </p>
          </header>

          <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div className="lg:sticky lg:top-24">
              <div className="mb-3 flex gap-2" role="group" aria-label="View">
                {views.map((v) => (
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
                    {VIEW_LABELS[v]}
                  </button>
                ))}
              </div>
              {view === "elevation" ? (
                <RackElevation rack={rack} selectedId={selectedId} onSelect={(id) => select(id)} />
              ) : view === "model" && heroModel ? (
                <Suspense fallback={<ModelLoading />}>
                  <HeroRackModel model={heroModel} selectedId={selectedId} onSelect={(id) => select(id)} />
                </Suspense>
              ) : (
                <Suspense fallback={<ModelLoading />}>
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

                  {/*
                    Why that row is empty, said out loud.

                    Five of the six racks here report no consumption figure
                    at all, and without this the page reads as though the
                    data is missing. It is not: the vendors publish a power
                    supply rating and a PoE budget, which are both capacity
                    and neither of them draw. A 715W supply is not a 715W
                    switch. Leaving the row blank is the honest answer and
                    explaining it is what makes it legible as an answer.
                  */}
                  {power.unpublished > 0 && (
                    <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
                      {power.total > 0
                        ? `${power.unpublished} device${power.unpublished === 1 ? "" : "s"} here publish${power.unpublished === 1 ? "es" : ""} no consumption figure.`
                        : "Nothing here publishes a consumption figure."}{" "}
                      {silentVendors.length > 0 ? (
                        <>
                          That is the vendors' doing, not an omission on this page.{" "}
                          {silentVendors.join(", ")} publish what a device's power supply
                          is rated for, which is capacity rather than draw: a 715W supply
                          is not a 715W device. Quoting one as the other would overstate a
                          rack's load several times over, so it reads as not published,
                          which is true.
                        </>
                      ) : (
                        <>
                          Those are the power distribution and battery units, and there is
                          nothing to publish: a PDU passes through whatever is plugged into
                          it and a UPS draws whatever it is carrying, so neither has a
                          consumption figure of its own. The number above is the equipment
                          they feed.
                        </>
                      )}
                    </p>
                  )}

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
