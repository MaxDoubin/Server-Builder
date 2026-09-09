/**
 * The hardware catalog: every vendor model on this site, browsable.
 *
 * This page exists because the models were already here and nothing showed
 * them. The rack builder uses the fifty one devices that mount in a rack and
 * ignores the other two hundred and one, which is correct for a rack builder
 * and leaves most of the catalog invisible: access points that go on a
 * ceiling, cameras that go on a wall, door readers, handhelds, the little
 * desk gateways. Every one of them is a real model with real measurements
 * and nothing was linking to any of it.
 *
 * WHAT IS TRUE HERE. Dimensions are read out of the model's own bounding
 * box, not out of a datasheet, so they are the size of the geometry the page
 * will actually load. Triangle counts and file sizes are the real ones. The
 * group and the mounting position come from the vendor's own catalog,
 * because a store knows better than a bounding box whether a thing is meant
 * for a ceiling or a desk. Nothing here is an estimate, and where a model
 * has no thumbnail the card says so rather than showing an empty rectangle.
 *
 * WHY THE CARDS ARE NOT ALL THE SAME SHAPE. Because the hardware is not. A
 * 48 port switch is nine times wider than it is tall and a wall mounted
 * camera is nearly square. Forcing both into one box means one of them is
 * mostly empty space, so each thumbnail is trimmed to what was drawn and the
 * card follows it.
 */

import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import type { Catalogue, CatalogueDevice } from "@/lib/rackBuilder";

/*
  Loaded only when somebody opens a device. The catalog is 112MB of
  geometry and three.js is most of a megabyte on its own, so browsing the
  grid should cost thumbnails and nothing else.
*/
const DeviceViewer = lazy(() =>
  import("@/components/racks/DeviceViewer").then((m) => ({ default: m.DeviceViewer })),
);

const SITE_URL = "https://maxdoubin.com";

/**
 * Where a thing goes, in the order you would meet it walking a site: the
 * rack in the closet, then what hangs off it, then what sits on a desk.
 */
const MOUNTS: { key: string; label: string; note: string }[] = [
  { key: "rack", label: "Rack", note: "Mounts in a 19 inch frame" },
  { key: "wall", label: "Wall", note: "Bracketed to a wall or a pole" },
  { key: "ceiling", label: "Ceiling", note: "Above the space it covers" },
  { key: "desk", label: "Desk", note: "Sits on a surface" },
  { key: "accessory", label: "Accessory", note: "Parts, mounts and modules" },
];

/** Millimetres, rounded the way a datasheet rounds them. */
function mm(metres: number): number {
  return Math.round(metres * 1000);
}

/** The stored bounding box, as a printable width by depth by height. */
function dimensions(d: CatalogueDevice): string {
  const [x, y, z] = d.sizeM;
  /*
    Ubiquiti export Y up and our own generators emit Z up, so which axis is
    the height depends on the file. Printing them in the stored order would
    describe half the catalog standing on its side.
  */
  const [w, depth, h] = d.up === "z" ? [x, y, z] : [x, z, y];
  return `${mm(w)} × ${mm(depth)} × ${mm(h)} mm`;
}

function kb(bytes: number): string {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.round(bytes / 1000)} KB`;
}

function matches(d: CatalogueDevice, query: string): boolean {
  const haystack = `${d.name} ${d.sku} ${d.group} ${d.short} ${d.slug}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function CinematicGear() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [failed, setFailed] = useState(false);
  /*
    Seeded from ?q=, so the command palette can send a reader straight to one
    device rather than to the top of a list of two hundred and forty nine and
    a suggestion that they look for it.
  */
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") ?? "";
  });
  const [mount, setMount] = useState<string>("all");
  const [group, setGroup] = useState<string>("all");
  /* Which card is showing its model. One at a time: a grid of live canvases
     is a grid of WebGL contexts, and browsers cap those at around sixteen. */
  const [open, setOpen] = useState<string | null>(null);

  useSEO({
    title: "Hardware catalog | Max Doubin",
    description:
      "Every UniFi model on this site, measured: switches, access points, cameras, gateways and door hardware, with real dimensions, triangle counts and file sizes taken from the geometry itself.",
    canonical: `${SITE_URL}/gear`,
  });

  useEffect(() => {
    let live = true;
    fetch("/data/ubiquiti-catalogue.json")
      .then((r) => r.json())
      .then((data: Catalogue) => {
        if (live) setCatalogue(data);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const devices = catalogue?.devices ?? [];

  /* Groups in size order, because the long ones are the ones worth filtering. */
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of devices) counts.set(d.group, (counts.get(d.group) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [devices]);

  const rackCount = useMemo(
    () => devices.filter((d) => d.mount === "rack").length,
    [devices],
  );

  const mountCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of devices) counts.set(d.mount, (counts.get(d.mount) ?? 0) + 1);
    return counts;
  }, [devices]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return devices.filter(
      (d) =>
        (mount === "all" || d.mount === mount) &&
        (group === "all" || d.group === group) &&
        (q === "" || matches(d, q)),
    );
  }, [devices, query, mount, group]);

  /* Grouped for display, so a long list still has somewhere to look. */
  const sections = useMemo(() => {
    const by = new Map<string, CatalogueDevice[]>();
    for (const d of filtered) {
      const bucket = by.get(d.group);
      if (bucket) bucket.push(d);
      else by.set(d.group, [d]);
    }
    return [...by.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, items]) => [name, [...items].sort((a, b) => a.name.localeCompare(b.name))] as const);
  }, [filtered]);

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 font-techno text-[10px] uppercase tracking-[0.22em] transition-colors ${
      active
        ? "border-[hsl(var(--brand-signal))] text-[hsl(var(--brand-bone))]"
        : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
    }`;

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1180px]">
          <header className="max-w-[62ch]">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Hardware · Measured
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The catalogue.
            </h1>
            {/*
              The counts come from the data rather than the prose. An earlier
              draft said "fifty one" and three duplicate entries were dropped
              the same afternoon, which made the sentence wrong without making
              anything fail. A number in a paragraph is a number that has to be
              maintained, and this one now cannot go stale.
            */}
            <p className="mt-6 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Every UniFi model this site can draw, which is rather more than the racks use.
              {catalogue ? ` ${rackCount} of these ` : " Some of these "}
              mount in a nineteen inch frame and the rest do not: access points for a ceiling,
              cameras for a wall, door readers, handhelds, the small gateways that live on a
              desk. The rack builder only ever needed the first group, so the other
              {catalogue ? ` ${devices.length - rackCount} ` : " two hundred "}
              were here and invisible.
            </p>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The measurements are the model's own bounding box rather than a figure copied
              off a datasheet, so they describe the geometry your browser will actually load.
              Triangle counts and file sizes are real for the same reason. Each thumbnail is
              rendered from the model with its background cut away, which is why they are not
              all the same shape: the card follows the hardware. Click any of them to load the
              model itself and turn it around.
            </p>
          </header>

          {failed ? (
            <p
              role="status"
              data-testid="text-gear-error"
              className="mt-12 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
            >
              The catalogue did not load. Reload the page to try again.
            </p>
          ) : null}

          {catalogue ? (
            <>
              {/*
                The search box and the mount/group chips are controls, and a
                printed page has nothing to click. Left in, they put a dead
                search field and twenty dead chips ahead of the catalog.
                The "N of M models" line below survives, so a reader who
                printed a filtered view can still see it is a filtered view.
              */}
              <div
                data-print-hide
                className="mt-12 grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]"
              >
                <div>
                  <label
                    htmlFor="gear-search"
                    className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
                  >
                    Search
                  </label>
                  <input
                    id="gear-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="camera, poe, u6, door..."
                    data-testid="input-gear-search"
                    className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                      Mounts
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setMount("all")} className={chip(mount === "all")}>
                        All {devices.length}
                      </button>
                      {MOUNTS.filter((m) => mountCounts.has(m.key)).map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          title={m.note}
                          onClick={() => setMount(m.key)}
                          data-testid={`filter-mount-${m.key}`}
                          className={chip(mount === m.key)}
                        >
                          {m.label} {mountCounts.get(m.key)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                      Groups
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setGroup("all")} className={chip(group === "all")}>
                        All
                      </button>
                      {groups.map(([name, n]) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setGroup(name)}
                          className={chip(group === name)}
                        >
                          {name} {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <p
                role="status"
                data-testid="text-gear-count"
                className="mt-6 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
              >
                {filtered.length} of {devices.length} models
                {mount === "rack" ? (
                  <>
                    {" · "}
                    <Link href="/racks/build" className="text-[hsl(var(--brand-signal))] hover:underline">
                      build a rack from these
                    </Link>
                  </>
                ) : null}
              </p>

              {filtered.length === 0 ? (
                <div
                  data-testid="text-no-gear"
                  className="mt-12 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-8 text-center backdrop-blur-sm"
                >
                  <p className="font-display text-xl text-[hsl(var(--brand-bone))]">
                    Nothing matches that.
                  </p>
                  <p className="mt-2 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                    Try a product line, an SKU, or what the thing is for.
                  </p>
                </div>
              ) : null}

              <div className="mt-12 space-y-14">
                {sections.map(([name, items]) => (
                  <section key={name} aria-labelledby={`gear-${name.replace(/\W+/g, "-")}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 border-b border-[hsl(var(--brand-iron))] pb-3">
                      <h2
                        id={`gear-${name.replace(/\W+/g, "-")}`}
                        className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]"
                      >
                        {name}
                      </h2>
                      <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                        {items.length} {items.length === 1 ? "model" : "models"}
                      </span>
                    </div>

                    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((d) => (
                        <li key={d.slug}>
                          <article
                            data-testid={`gear-card-${d.slug}`}
                            className="flex h-full flex-col overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] transition-colors hover:border-[hsl(var(--brand-signal))]"
                          >
                            {open === d.slug ? (
                              <Suspense
                                fallback={
                                  <div className="flex h-40 items-center justify-center bg-[hsl(var(--brand-obsidian)/0.55)] font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                                    Loading the model...
                                  </div>
                                }
                              >
                                <DeviceViewer url={d.model} up={d.up} mount={d.mount} label={d.sku ?? d.name} />
                              </Suspense>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setOpen(d.slug)}
                                aria-label={`Open the 3D model of ${d.name}`}
                                data-testid={`open-model-${d.slug}`}
                                className="group flex h-40 w-full items-center justify-center bg-[hsl(var(--brand-obsidian)/0.55)] p-4 transition-colors hover:bg-[hsl(var(--brand-obsidian)/0.8)]"
                              >
                                {d.thumb ? (
                                  <img
                                    src={d.thumb}
                                    alt={`${d.name}, rendered from the model`}
                                    loading="lazy"
                                    decoding="async"
                                    className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
                                  />
                                ) : (
                                  <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                                    No render
                                  </span>
                                )}
                              </button>
                            )}
                            {open === d.slug ? (
                              <button
                                type="button"
                                onClick={() => setOpen(null)}
                                className="border-b border-[hsl(var(--brand-iron))] px-4 py-2 text-left font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                              >
                                Close the model
                              </button>
                            ) : null}

                            <div className="flex flex-1 flex-col gap-2 p-4">
                              {/*
                                Wraps, and the SKU can break.

                                shrink-0 kept the SKU from being squeezed to
                                nothing beside a long name, and in doing so
                                made it unbounded. At the 130% text size this
                                site offers, on a 375px screen,
                                UA-Retrofit-Reader-Fingerprint ran 42px past
                                the card, which is overflow-hidden, so it was
                                simply cut. It drops to its own line now, and
                                overflow-wrap breaks it there only if it
                                still does not fit.
                              */}
                              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <h3 className="font-display text-base font-medium leading-tight text-[hsl(var(--brand-bone))]">
                                  {d.name}
                                </h3>
                                <span className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] [overflow-wrap:anywhere]">
                                  {d.sku}
                                </span>
                              </div>

                              <p className="line-clamp-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                                {d.short}
                              </p>

                              <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-1 pt-2 font-mono-tight text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">
                                <div className="col-span-2 flex justify-between">
                                  <dt>Size</dt>
                                  <dd className="text-[hsl(var(--brand-bone-dim))]">{dimensions(d)}</dd>
                                </div>
                                {d.u ? (
                                  <div className="col-span-2 flex justify-between">
                                    <dt>Rack units</dt>
                                    <dd className="text-[hsl(var(--brand-bone-dim))]">{d.u}U</dd>
                                  </div>
                                ) : null}
                                <div className="flex justify-between">
                                  <dt>Tris</dt>
                                  <dd className="text-[hsl(var(--brand-bone-dim))]">
                                    {d.triangles.toLocaleString()}
                                  </dd>
                                </div>
                                <div className="flex justify-between">
                                  <dt>File</dt>
                                  <dd className="text-[hsl(var(--brand-bone-dim))]">{kb(d.bytes)}</dd>
                                </div>
                              </dl>

                              {d.store ? (
                                <a
                                  href={d.store}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2 inline-flex min-h-[24px] items-center font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] hover:underline"
                                >
                                  Vendor page →
                                </a>
                              ) : null}
                            </div>
                          </article>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              <footer className="mt-20 border-t border-[hsl(var(--brand-iron))] pt-8">
                <p className="max-w-[70ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {catalogue.credit}
                </p>
                {catalogue.note ? (
                  <p className="mt-3 max-w-[70ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {catalogue.note}
                  </p>
                ) : null}
                <p className="mt-4 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                  <Link
                    href="/data"
                    className="inline-flex min-h-[24px] items-center text-[hsl(var(--brand-signal))] hover:underline"
                  >
                    The same figures as a dataset
                  </Link>
                </p>
              </footer>
            </>
          ) : failed ? null : (
            /*
              Hold the page's height open while the catalog is in flight.

              The list arrives by fetch, so the first paint was a header and
              one line of text, which put the footer squarely in the viewport.
              Two hundred and forty nine cards then landed above it and shoved
              it off the bottom of the screen: a 0.25 layout shift, and the
              single worst number anywhere on the site. Reserving a screen of
              height means the footer starts below the fold, and a shift of
              something nobody could see does not count and, more to the
              point, is not one.

              The skeleton is the same shape as the cards that replace it, so
              what settles into place is what was already there.
            */
            <div className="mt-12 min-h-screen">
              <p role="status" className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
                Loading the catalogue...
              </p>
              <ul aria-hidden className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <li
                    key={i}
                    className="h-[19rem] animate-pulse rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.35)]"
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </CinematicLayout>
  );
}

export default CinematicGear;
