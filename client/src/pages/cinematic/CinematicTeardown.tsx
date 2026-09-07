import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { TEARDOWN_PARTS } from "@/components/teardown/teardownParts";
import { LoadProgress } from "@/components/racks/LoadProgress";

/*
  The viewer pulls in three.js, so it is loaded only when this page is, and
  the page is already a lazy route. Nothing about the 4MB model or the
  engine behind it reaches a reader who never comes here.
*/
const TeardownViewer = lazy(() =>
  import("@/components/teardown/TeardownViewer").then((m) => ({ default: m.TeardownViewer })),
);

/**
 * A real PowerEdge R760, taken apart.
 *
 * Every other exploded server on this site is a drawing of one: a chassis
 * somebody modelled by hand, with the parts they thought to include. This
 * one is Dell's, out of the service model behind their repair guides, so
 * the parts are the parts, in the positions they actually occupy, under the
 * names a technician would use on the phone to support.
 */
export function CinematicTeardown() {
  useSEO({
    title: "PowerEdge R760 teardown | Max Doubin",
    description:
      "A Dell PowerEdge R760 taken apart in the browser, thirty four assemblies at a time, using Dell's own service geometry: bezel, cover, shrouds, drives, fans, GPUs, four expansion risers, memory, heatsinks, power supplies and system board.",
    canonical: "https://maxdoubin.com/teardown",
  });

  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const set = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    progressRef.current = clamped;
    setProgress(clamped);
  }, []);

  /*
    Playback runs off the ref rather than React state so a dropped frame
    never queues a re-render storm; the slider label is the only thing that
    needs the state, and it can lag a frame without anyone noticing.
  */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = progressRef.current + dt / 7;
      if (next >= 1) {
        set(1);
        setPlaying(false);
        return;
      }
      set(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, set]);

  const active = TEARDOWN_PARTS.find((p) => p.label === selected);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-24 pt-28 md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <header className="max-w-[70ch]">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Hardware · Teardown
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              A PowerEdge, opened.
            </h1>
            <p className="mt-6 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              This is a Dell PowerEdge R760 coming apart in the order a technician would take it
              apart, and the geometry is Dell's own. Their repair guides are built on a service
              model of the machine as thirty four named assemblies, so these are the real parts
              in their real positions, not a chassis drawn from a photograph. A 2U rather than a
              1U on purpose: the GPUs, the four expansion risers, the RAID controller and the
              rear drive cage are the parts that do not fit in a 1U at all, and they are the
              ones worth watching come out. Drag the slider, or press play, and pick any part to
              read what it does.
            </p>
          </header>

          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="relative overflow-hidden rounded-lg border border-[hsl(var(--brand-iron)/0.6)] bg-[hsl(var(--brand-void))]">
              <div className="relative aspect-[16/10] w-full">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      Loading four megabytes of Dell...
                    </div>
                  }
                >
                  <TeardownViewer
                    progressRef={progressRef}
                    selected={selected}
                    onSelect={setSelected}
                  />
                </Suspense>
                <LoadProgress label="parts" />
              </div>

              {/*
                Transport for the 3D view. The view itself is a <canvas>,
                which print already drops, so on paper this was a play button
                and a scrub bar for a model that is not there. The "order of
                removal" list below prints, and that is the part worth having
                on paper next to the machine.
              */}
              <div
                data-print-hide
                className="flex flex-wrap items-center gap-4 border-t border-[hsl(var(--brand-iron)/0.6)] px-5 py-4"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (progressRef.current >= 1) set(0);
                    setPlaying((p) => !p);
                  }}
                  className="rounded border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal))] hover:text-[hsl(var(--brand-signal))]"
                >
                  {playing ? "Pause" : progress >= 1 ? "Replay" : "Play"}
                </button>
                <label className="flex flex-1 items-center gap-3">
                  <span className="sr-only">Teardown progress</span>
                  <input
                    type="range"
                    min={0}
                    max={1000}
                    value={Math.round(progress * 1000)}
                    onChange={(e) => {
                      setPlaying(false);
                      set(Number(e.target.value) / 1000);
                    }}
                    className="h-1 w-full cursor-pointer appearance-none rounded bg-[hsl(var(--brand-iron))] accent-[hsl(var(--brand-signal))]"
                  />
                </label>
                <span className="w-16 text-right font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-ash))]">
                  {Math.round(progress * 100)}%
                </span>
              </div>
            </div>

            <aside className="flex flex-col gap-3">
              <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
                · Order of removal
              </div>
              <ol className="flex flex-col divide-y divide-[hsl(var(--brand-iron)/0.5)] overflow-hidden rounded border border-[hsl(var(--brand-iron)/0.6)]">
                {TEARDOWN_PARTS.map((part) => {
                  const on = part.label === selected;
                  return (
                    <li key={part.match}>
                      <button
                        type="button"
                        onClick={() => setSelected(on ? null : part.label)}
                        aria-pressed={on}
                        className={`flex w-full items-baseline gap-3 px-4 py-2.5 text-left transition-colors ${
                          on
                            ? "bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                            : "text-[hsl(var(--brand-bone-dim))] hover:bg-[hsl(var(--brand-iron)/0.28)]"
                        }`}
                      >
                        <span className="font-mono-tight text-[10px] tabular-nums text-[hsl(var(--brand-ash))]">
                          {String(part.wave + 1).padStart(2, "0")}
                        </span>
                        <span className="font-mono-tight text-xs">{part.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              <div className="min-h-[92px] rounded border border-[hsl(var(--brand-iron)/0.6)] px-4 py-3">
                {active ? (
                  <>
                    <div className="font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {active.label}
                    </div>
                    <p className="mt-2 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {active.note ??
                        "Comes out in step " + (active.wave + 1) + " of the sequence."}
                    </p>
                  </>
                ) : (
                  <p className="font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash))]">
                    Pick a part, in the list or in the model, to isolate it.
                  </p>
                )}
              </div>
            </aside>
          </div>

          <section className="mt-14 max-w-[70ch]">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Teardown · Provenance
            </div>
            <h2 className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]">
              Where the geometry came from
            </h2>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Dell publish WebXR repair guides for a handful of PowerEdge platforms, and behind
              each one is a glTF scene of the machine. It is not offered as a download and nothing
              links to it: the guide list is a POST only endpoint, the viewer is a lazily loaded
              iframe, and the scene name sits inside a hashed JavaScript bundle. What ships here
              is that scene with the Unity furniture removed, a camera, several lights and an
              alternate parts tree of 37 duplicate assemblies that render inside the real
              components. That took 55.9MB to 31.8MB, still over what a static host will serve
              as one file, and then the useful discovery: 94 percent of what was left was 77
              textures against 1.9MB of actual geometry. Resized to 1024 and encoded webp, the
              whole machine is 4.2MB, smaller than the 1U it replaced.
            </p>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The 3D model is Dell's work and their copyright, used here to show their hardware.
              The teardown order, the travel directions and the notes are mine. There is more on
              what other vendors publish, and what they do not, in the{" "}
              <Link
                href="/racks"
                className="text-[hsl(var(--brand-signal))] underline underline-offset-4"
              >
                rack library
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}
