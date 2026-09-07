import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import {
  DEFAULT_FRAME,
  FRAME_SIZES,
  STARTER,
  buildWeight,
  decodeBuild,
  encodeBuild,
  firstFreeSlot,
  fits,
  mb,
  occupancy,
  unitsOf,
  unitsUsed,
  type Catalogue,
  type CatalogueDevice,
  type FrameSize,
  type Placement,
} from "@/lib/rackBuilder";
import { LoadProgress } from "@/components/racks/LoadProgress";

const BuilderScene = lazy(() =>
  import("@/components/racks/BuilderScene").then((m) => ({ default: m.BuilderScene })),
);

const STORE_KEY = "rack-builder-v1";

/**
 * Build a rack out of real hardware.
 *
 * Every other rack on this site is one somebody already decided on. This is
 * the one where the deciding is the point, which changes what the page has
 * to be honest about: a static elevation can quietly omit that a build is
 * 60MB of models, and an interactive one cannot, because the reader is the
 * person who will wait for it. So the weight of the build is on screen next
 * to the unit count, and it is counted the way a browser counts it: bytes
 * once per distinct file, triangles once per placement.
 */
export function CinematicRackBuilder() {
  useSEO({
    title: "Rack builder | Max Doubin",
    description:
      "Build a rack from fifty one real UniFi devices in 3D. Pick hardware, stack it, see what it weighs in rack units and megabytes, and share the build as a link.",
    canonical: "https://maxdoubin.com/racks/build",
  });

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [frame, setFrame] = useState<FrameSize>(DEFAULT_FRAME);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("All");
  const [vendor, setVendor] = useState<string>("All");
  const [nextId, setNextId] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /*
    Two catalogues, because there are two kinds of hardware here and the
    difference is worth keeping: Ubiquiti's own exports, and the devices
    modelled here from photographs and dimensioned drawings. They are merged
    into one palette because nobody building a rack cares which of us drew
    the switch, but the entries stay tagged so the page can say.

    Both are awaited together. Loading one first would give a palette that
    grows under the cursor while somebody is reading it.
  */
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/data/ubiquiti-catalogue.json").then((r) => r.json()),
      fetch("/data/own-catalogue.json").then((r) => r.json()),
    ])
      .then(([vendor, own]: [Catalogue, Catalogue]) => {
        if (!live) return;
        setCatalogue({
          ...vendor,
          count: vendor.devices.length + own.devices.length,
          devices: [
            ...vendor.devices,
            ...own.devices.map((d) => ({ ...d, own: true as const })),
          ],
        });
      })
      .catch(() => {
        if (live) setMessage("The catalogue did not load. Reload the page to try again.");
      });
    return () => {
      live = false;
    };
  }, []);

  const rackDevices = useMemo(
    () => (catalogue?.devices ?? []).filter((d) => d.mount === "rack"),
    [catalogue],
  );

  /* Vendor is the axis people actually shop along, so it gets its own row. */
  const vendors = useMemo(() => {
    const set = new Set(rackDevices.map((d) => d.vendor ?? "Ubiquiti"));
    return ["All", ...[...set].sort()];
  }, [rackDevices]);

  const byslug = useMemo(
    () => new Map(rackDevices.map((d) => [d.slug, d] as const)),
    [rackDevices],
  );

  const groups = useMemo(() => {
    const set = new Set(rackDevices.map((d) => d.group));
    return ["All", ...[...set].sort()];
  }, [rackDevices]);

  /*
    Restore in one pass once the catalogue is in, because both sources need
    it: a link has to be checked against the real catalogue, and a saved build
    has to be too, since the catalogue can be regenerated between visits.
    decodeBuild takes the whole device map rather than a set of slugs because
    checking a placement means knowing how tall the device is.
  */
  useEffect(() => {
    if (!catalogue || placements.length > 0) return;

    const fromUrl = new URLSearchParams(window.location.search).get("b");
    const saved = (() => {
      try {
        return window.localStorage.getItem(STORE_KEY);
      } catch {
        return null;
      }
    })();

    const restored = (fromUrl && decodeBuild(fromUrl, byslug)) || (saved && decodeBuild(saved, byslug));
    if (restored && restored.placements.length > 0) {
      setFrame(restored.frame);
      setPlacements(restored.placements);
      setNextId(restored.placements.length + 1);
      return;
    }

    const starter = STARTER.filter(([slug]) => byslug.has(slug)).map(([slug, at], i) => ({
      id: i + 1,
      slug,
      at,
    }));
    setPlacements(starter);
    setNextId(starter.length + 1);
  }, [catalogue, byslug, placements.length]);

  /* Save on every change, so a reload never loses a build. */
  useEffect(() => {
    if (placements.length === 0 && !catalogue) return;
    try {
      window.localStorage.setItem(STORE_KEY, encodeBuild(frame, placements));
    } catch {
      // A private window refuses storage. The build still works, it just
      // will not survive a reload, which is not worth an error for.
    }
  }, [frame, placements, catalogue]);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 3200);
    return () => window.clearTimeout(t);
  }, [message]);

  const used = useMemo(() => occupancy(placements, frame, byslug), [placements, frame, byslug]);
  const filled = unitsUsed(placements, byslug);
  const weight = buildWeight(placements, byslug);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rackDevices
      .filter((d) => vendor === "All" || (d.vendor ?? "Ubiquiti") === vendor)
      .filter((d) => group === "All" || d.group === group)
      .filter(
        (d) =>
          !q ||
          d.name.toLowerCase().includes(q) ||
          d.sku.toLowerCase().includes(q) ||
          d.short.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rackDevices, group, vendor, query]);

  const add = useCallback(
    (d: CatalogueDevice) => {
      const height = unitsOf(d);
      const at = firstFreeSlot(occupancy(placements, frame, byslug), height);
      if (at === null) {
        setMessage(
          height > 1
            ? `No ${height} free units together. Remove something, or use a taller frame.`
            : "The frame is full. Remove something, or use a taller frame.",
        );
        return;
      }
      const id = nextId;
      setNextId(id + 1);
      setPlacements((p) => [...p, { id, slug: d.slug, at }]);
      setSelected(id);
    },
    [placements, frame, byslug, nextId],
  );

  const remove = useCallback((id: number) => {
    setPlacements((p) => p.filter((x) => x.id !== id));
    setSelected((s) => (s === id ? null : s));
  }, []);

  /**
   * Move a device by one unit, if the unit it would move into is free.
   *
   * Nudging by one rather than swapping with the neighbour, because a 1U
   * moving past a 4U should take four presses and end up somewhere
   * predictable, not teleport above it.
   */
  const nudge = useCallback(
    (id: number, delta: number) => {
      setPlacements((prev) => {
        const target = prev.find((p) => p.id === id);
        const d = target && byslug.get(target.slug);
        if (!target || !d) return prev;
        const at = target.at + delta;
        if (!fits(occupancy(prev, frame, byslug, id), at, unitsOf(d))) return prev;
        return prev.map((p) => (p.id === id ? { ...p, at } : p));
      });
    },
    [byslug, frame],
  );

  const share = useCallback(() => {
    const url = `${window.location.origin}/racks/build?b=${encodeURIComponent(
      encodeBuild(frame, placements),
    )}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => setMessage("Could not reach the clipboard. The build is in the address bar."),
    );
    window.history.replaceState(null, "", `/racks/build?b=${encodeBuild(frame, placements)}`);
  }, [frame, placements]);

  const ordered = useMemo(() => [...placements].sort((a, b) => a.at - b.at), [placements]);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-24 pt-28 md:px-10">
        <div className="mx-auto max-w-[1500px]">
          <header className="max-w-[72ch]">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Racks · Builder
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Build a rack.
            </h1>
            <p className="mt-6 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Seventy five rack mountable devices from six vendors, and an empty frame. Fifty
              are Ubiquiti's own published geometry and the rest were modelled here from
              photographs and dimensioned drawings. Pick something and it lands in the highest
              free slot that fits it. A 2U will not go into a 1U gap, because a 2U does not go
              into a 1U gap. What you build is saved in your browser and can be shared as a link.
            </p>
          </header>

          <dl className="mt-8 grid max-w-[64rem] grid-cols-2 gap-px overflow-hidden rounded border border-[hsl(var(--brand-iron)/0.6)] bg-[hsl(var(--brand-iron)/0.6)] sm:grid-cols-4">
            {[
              [`${filled} of ${frame}U`, "occupied"],
              [`${placements.length}`, "devices"],
              [`${weight.triangles.toLocaleString()}`, "triangles"],
              [mb(weight.bytes), `over ${weight.files} file${weight.files === 1 ? "" : "s"}`],
            ].map(([value, label]) => (
              <div key={label} className="bg-[hsl(var(--brand-void))] px-4 py-3">
                <dt className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                  {label}
                </dt>
                <dd className="mt-1 font-display text-xl text-[hsl(var(--brand-bone))]">{value}</dd>
              </div>
            ))}
          </dl>

          {/*
            min-w-0 on the columns, because a grid item's default min-width is
            auto, which means a track refuses to shrink below the widest
            unbreakable thing inside it. One long device name in the palette
            was pushing the single mobile column to 381px inside a 342px
            container, so the search box and the filter chips ran fifteen
            pixels off the right of a phone with no way to scroll to them: the
            page itself did not overflow, only the content did.
          */}
          <div className="mt-8 grid gap-6 xl:grid-cols-[300px_1fr_290px]">
            {/* Palette */}
            <aside className="flex min-w-0 flex-col gap-3">
              <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
                · Hardware
              </div>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${rackDevices.length || 51} devices`}
                aria-label="Search hardware"
                className="w-full rounded border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-void))] px-3 py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              />
              <div className="flex flex-wrap gap-1.5">
                {vendors.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVendor(v)}
                    aria-pressed={vendor === v}
                    className={`rounded-full border px-2.5 py-1 font-mono-tight text-[10px] transition-colors ${
                      vendor === v
                        ? "border-[hsl(var(--brand-signal))] text-[hsl(var(--brand-signal))]"
                        : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone-dim))]"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroup(g)}
                    aria-pressed={group === g}
                    className={`rounded-full border px-2.5 py-1 font-mono-tight text-[10px] transition-colors ${
                      group === g
                        ? "border-[hsl(var(--brand-signal))] text-[hsl(var(--brand-signal))]"
                        : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone-dim))]"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <ul className="flex max-h-[560px] flex-col divide-y divide-[hsl(var(--brand-iron)/0.5)] overflow-y-auto rounded border border-[hsl(var(--brand-iron)/0.6)]">
                {visible.map((d) => (
                  <li key={d.slug}>
                    <button
                      type="button"
                      onClick={() => add(d)}
                      className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--brand-iron)/0.3)]"
                      data-testid={`add-${d.slug}`}
                    >
                      {/*
                        A missing thumbnail hides the image rather than
                        showing a broken one. Renders are generated per model
                        and a device can land in the catalogue before its
                        thumbnail does; a grey box in that gap is fine, a
                        broken image icon is not.
                      */}
                      <img
                        src={d.thumb}
                        alt=""
                        loading="lazy"
                        width={64}
                        height={22}
                        onError={(e) => {
                          e.currentTarget.style.visibility = "hidden";
                        }}
                        className="h-5 w-16 shrink-0 rounded-[2px] bg-white/85 object-contain"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono-tight text-[11px] text-[hsl(var(--brand-bone))]">
                          {d.name}
                        </span>
                        <span className="block font-mono-tight text-[10px] text-[hsl(var(--brand-ash))]">
                          {unitsOf(d)}U · {mb(d.bytes)}
                          {d.own ? " · built here" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono-tight text-sm text-[hsl(var(--brand-ash))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                        +
                      </span>
                    </button>
                  </li>
                ))}
                {catalogue && visible.length === 0 ? (
                  <li className="px-3 py-6 text-center font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                    Nothing matches that.
                  </li>
                ) : null}
                {!catalogue ? (
                  <li className="px-3 py-6 text-center font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                    Loading the catalogue...
                  </li>
                ) : null}
              </ul>
            </aside>

            {/* The rack */}
            <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-[hsl(var(--brand-iron)/0.6)] bg-[hsl(var(--brand-void))]">
              <div className="relative aspect-[4/5] w-full sm:aspect-[4/3] xl:aspect-[3/4]">
                {catalogue ? (
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                        Starting the renderer...
                      </div>
                    }
                  >
                    <BuilderScene
                      frame={frame}
                      placements={placements}
                      byslug={byslug}
                      selected={selected}
                      onPick={setSelected}
                      used={used}
                    />
                  </Suspense>
                ) : (
                  <div className="flex h-full items-center justify-center font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    Loading the catalogue...
                  </div>
                )}
                <LoadProgress />
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-[hsl(var(--brand-iron)/0.6)] px-4 py-3">
                <span className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                  Frame
                </span>
                {FRAME_SIZES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFrame(n)}
                    aria-pressed={frame === n}
                    disabled={placements.some((p) => {
                      const d = byslug.get(p.slug);
                      return d ? p.at + unitsOf(d) > n : false;
                    })}
                    className={`rounded border px-2.5 py-1 font-mono-tight text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                      frame === n
                        ? "border-[hsl(var(--brand-signal))] text-[hsl(var(--brand-signal))]"
                        : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-bone-dim))]"
                    }`}
                  >
                    {n}U
                  </button>
                ))}
                <span className="ml-auto font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                  Drag to orbit, click a device to select it.
                </span>
              </div>
            </div>

            {/* Elevation */}
            <aside className="flex min-w-0 flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
                  · Elevation
                </div>
                {placements.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPlacements([]);
                      setSelected(null);
                    }}
                    className="inline-flex min-h-[24px] items-center font-mono-tight text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-signal))]"
                  >
                    Empty it
                  </button>
                ) : null}
              </div>

              <ol className="flex flex-col divide-y divide-[hsl(var(--brand-iron)/0.5)] overflow-hidden rounded border border-[hsl(var(--brand-iron)/0.6)]">
                {ordered.map((p) => {
                  const d = byslug.get(p.slug);
                  if (!d) return null;
                  const on = selected === p.id;
                  return (
                    <li
                      key={p.id}
                      className={on ? "bg-[hsl(var(--brand-signal)/0.12)]" : undefined}
                    >
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setSelected(on ? null : p.id)}
                          aria-pressed={on}
                          className="flex min-h-[24px] min-w-0 flex-1 items-center text-left"
                        >
                          <span className="flex items-baseline gap-2">
                            <span className="font-mono-tight text-[10px] tabular-nums text-[hsl(var(--brand-ash))]">
                              U{frame - p.at}
                            </span>
                            <span
                              className={`min-w-0 truncate font-mono-tight text-[11px] ${
                                on
                                  ? "text-[hsl(var(--brand-signal))]"
                                  : "text-[hsl(var(--brand-bone-dim))]"
                              }`}
                            >
                              {d.name}
                            </span>
                          </span>
                        </button>
                        <span className="shrink-0 font-mono-tight text-[10px] text-[hsl(var(--brand-ash))]">
                          {unitsOf(d)}U
                        </span>
                        {/*
                          Six by six, not the glyph's own size.

                          These were 19 by 21 CSS pixels, which is under the
                          24 by 24 that WCAG 2.2 asks of a target and, more to
                          the point, too small to hit reliably with a thumb
                          while three of them sit side by side. The arrows
                          have not changed size; the box around them has.
                        */}
                        <span className="flex shrink-0 gap-0.5">
                          <button
                            type="button"
                            onClick={() => nudge(p.id, -1)}
                            aria-label={`Move ${d.name} up`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded font-mono-tight text-[11px] text-[hsl(var(--brand-ash))] transition-colors hover:bg-[hsl(var(--brand-iron)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => nudge(p.id, 1)}
                            aria-label={`Move ${d.name} down`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded font-mono-tight text-[11px] text-[hsl(var(--brand-ash))] transition-colors hover:bg-[hsl(var(--brand-iron)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(p.id)}
                            aria-label={`Remove ${d.name}`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded font-mono-tight text-[11px] text-[hsl(var(--brand-ash))] transition-colors hover:bg-[hsl(0_60%_40%/0.35)] hover:text-[hsl(var(--brand-bone))]"
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                    </li>
                  );
                })}
                {placements.length === 0 ? (
                  <li className="px-3 py-8 text-center font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash))]">
                    Empty frame. Pick something from the list on the left.
                  </li>
                ) : null}
              </ol>

              <button
                type="button"
                onClick={share}
                disabled={placements.length === 0}
                className="rounded border border-[hsl(var(--brand-iron))] px-3 py-2 font-mono-tight text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal))] hover:text-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {copied ? "Link copied" : "Copy a link to this build"}
              </button>

              {message ? (
                <p
                  role="status"
                  className="rounded border border-[hsl(var(--brand-iron))] px-3 py-2 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                >
                  {message}
                </p>
              ) : null}

              {selected !== null
                ? (() => {
                    const p = placements.find((x) => x.id === selected);
                    const d = p && byslug.get(p.slug);
                    if (!d) return null;
                    return (
                      <div className="rounded border border-[hsl(var(--brand-iron)/0.6)] px-3 py-3">
                        <div className="font-mono-tight text-[11px] text-[hsl(var(--brand-bone))]">
                          {d.name}
                        </div>
                        <p className="mt-1.5 font-mono-tight text-[10px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                          {d.short}
                        </p>
                        {d.store ? (
                          <a
                            href={d.store}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-block font-mono-tight text-[10px] text-[hsl(var(--brand-signal))] underline underline-offset-4"
                          >
                            {d.sku} at Ubiquiti
                          </a>
                        ) : (
                          <span className="mt-2 block font-mono-tight text-[10px] text-[hsl(var(--brand-ash))]">
                            {d.vendor} {d.sku}. Modelled here from photographs.
                          </span>
                        )}
                      </div>
                    );
                  })()
                : null}
            </aside>
          </div>

          <section className="mt-14 max-w-[72ch]">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Builder · How it works
            </div>
            <h2 className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]">
              A rack is a list of occupied units, not a list of devices
            </h2>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              That distinction is most of the code behind this page. Treat a rack as a list and a
              2U dropped between two 1U devices either overlaps one of them or silently pushes it
              down, and both are wrong, because real hardware does neither. It either fits in the
              gap or it does not go in. So every placement asks whether a specific run of units is
              free, and refuses when it is not, which is why the frame buttons grey out when
              something in the build would hang below a shorter frame.
            </p>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The weight is on screen because this page cannot hide it. A drawn elevation costs a
              reader nothing whatever it contains, and this one costs them a download per distinct
              device. Bytes are counted once per file, because the browser caches it, and
              triangles once per placement, because two of the same switch are two of the same
              switch as far as the GPU is concerned. Reporting one figure for both would be wrong
              in one direction or the other.
            </p>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Nothing here is patched, and that is not an omission. A vendor model is a closed box
              that does not know where its own jacks are. The{" "}
              <Link
                href="/racks/wired"
                className="text-[hsl(var(--brand-signal))] underline underline-offset-4"
              >
                wired rack
              </Link>{" "}
              manages it only because its build is fixed and every port position was measured off
              a render by hand, which cannot be done for a rack assembled while you watch. The
              other elevations are in the{" "}
              <Link
                href="/racks"
                className="text-[hsl(var(--brand-signal))] underline underline-offset-4"
              >
                library
              </Link>
              .
            </p>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The 3D models are Ubiquiti's work and their copyright, used here to show their
              hardware.
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}
