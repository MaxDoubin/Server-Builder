/**
 * Three thresholds, drawn as the one bar they actually are.
 *
 * The argument is that people think of this table as having a size, and it
 * has three, each of which does something different: a floor below which the
 * collector sleeps, a soft limit above which it works on every allocation,
 * and a hard limit that refuses. Put all three on one axis with the entry
 * count as a fill, and every case reads off it.
 *
 * The second drawing is the one people do not expect: the same table, the
 * same count, with the entries old enough to reclaim and not. Overflow needs
 * both.
 *
 * Nothing is drawn before an answer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  RECLAIM_AGE_SECONDS,
  asCounts,
  asDmesg,
  asSysctl,
  canReclaim,
  correctOption,
  entries,
  headroom,
  loadSolvedNeigh,
  overflows,
  periodicRuns,
  recordSolvedNeigh,
  state,
  tableId,
  thresh3Needed,
  type Case,
} from "@/lib/neigh/index";

const SITE_URL = "https://maxdoubin.com";

/** A table refusing neighbors is the alarming one; constant forced collection is amber. */
function severity(item: Case): StageAccent {
  if (overflows(item.setup)) return "danger";
  if (state(item.setup) === "forced-collection") return "amber";
  return "signal";
}

const STATE_LABEL: Record<string, string> = {
  "never-collected": "never collected",
  "collected-normally": "collected normally",
  "forced-collection": "forced collection on every allocation",
  overflowing: "overflowing",
};

export function CinematicNeigh() {
  useSEO({
    title: "Neighbor Table Overflow, on a Network With Nothing Wrong | Max Doubin",
    description:
      "The ARP cache holds 1024 entries by default and an IPv6 host costs at least two of them, so a flat /22 with 900 dual stack machines is over the hard limit before anybody has done anything unusual. Overflow also takes a failed garbage collection, not just a full table. Ten segments here, and the question is which of them fails.",
    canonical: `${SITE_URL}/neigh`,
    ogImage: `${SITE_URL}/images/og/neigh.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedNeigh());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedNeigh(active.slug);
        setSolved(loadSolvedNeigh());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const held = entries(setup);
  /* The axis runs to whichever is larger, so a table over its limit is drawn over it. */
  const span = Math.max(setup.thresh3, held) * 1.08;
  const at = (n: number) => `${Math.min(100, (n / span) * 100)}%`;

  return (
    <CinematicLayout>
      <PracticeStage
        accent={answered ? severity(active) : "signal"}
        mood={!answered ? "calm" : correct ? "recovering" : "tense"}
        flashKey={0}
      />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1040px]">
          <header>
            <div className="font-techno text-[0.625rem] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {CASES.length} segments, three thresholds each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Neighbor table overflow.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten segments and one neighbor table each. Work out how many entries it holds, which
              of its three thresholds that crosses, and whether a new neighbor can be added at all.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The ARP cache is not unbounded. <code>gc_thresh1</code> is 128,{" "}
              <code>gc_thresh2</code> is 512 and <code>gc_thresh3</code> is 1024, shipped, and the
              IPv6 table has the same three. An IPv6 host answers to a link local address and a
              global one, so it costs at least two entries, which puts a flat /22 with 900 dual
              stack machines over the hard limit before anybody has done anything unusual. And
              being at the hard limit is not enough on its own: the kernel tries a forced
              collection first, and that may only take entries untouched for{" "}
              {RECLAIM_AGE_SECONDS} seconds. So the same table fails after a power cut and runs
              fine all afternoon.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="neigh-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`neigh-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.family === "ipv4" ? "arp_cache" : "ndisc_cache"} ·{" "}
                      {item.setup.hosts} host{item.setup.hosts === 1 ? "" : "s"}
                      {item.setup.arrivedInABurst ? " · all at once" : ""}
                    </span>
                    {mounted && solved.includes(item.slug) ? (
                      <span className="font-techno text-[0.59375rem] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
                        done
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 font-mono-tight text-[0.78125rem] leading-snug text-[hsl(var(--brand-bone))]">
                    {item.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <section className="mt-8 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
              {active.name}
            </h2>
            <p
              className="mt-3 font-mono-tight text-[0.84375rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="neigh-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="neigh-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ sysctl -a | grep neigh.default.gc_thresh
${asSysctl(setup)}

# ${setup.hosts} host${setup.hosts === 1 ? "" : "s"} on the segment, ${setup.addressesPerHost} ${setup.family === "ipv4" ? "address" : "addresses"} each in this family${
  setup.transient > 0 ? `\n# plus ${setup.transient} addresses being resolved with nothing behind them` : ""
}${setup.permanent > 0 ? `\n# plus ${setup.permanent} static entries added with nud permanent` : ""}
# they arrived ${setup.arrivedInABurst ? "all at once, inside a few seconds" : "gradually, over hours"}`}
              </pre>
            </div>

            <h3 className="mt-7 font-techno text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
              · {active.question}
            </h3>
            <div className="mt-3 space-y-2">
              {active.options.map((option) => {
                const chose = picked === option.id;
                const isRight = option.id === right?.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => pick(option.id)}
                    disabled={answered}
                    data-testid={`neigh-option-${option.id}`}
                    className={`block w-full rounded-xl border px-4 py-3 text-left font-mono-tight text-[0.8125rem] leading-relaxed transition-colors disabled:cursor-default ${
                      !answered
                        ? "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                        : isRight
                          ? "border-[hsl(var(--brand-signal)/0.8)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                          : chose
                            ? "border-[hsl(var(--brand-danger)/0.8)] bg-[hsl(var(--brand-danger)/0.1)] text-[hsl(var(--brand-bone))]"
                            : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                    }`}
                  >
                    {option.claim}
                  </button>
                );
              })}
            </div>

            {answered ? (
              <div className="mt-6 space-y-5" data-testid="neigh-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The {tableId(setup.family)} holds {held} counted
                  entr{held === 1 ? "y" : "ies"}
                  {setup.permanent > 0 ? `, plus ${setup.permanent} permanent ones that no threshold can see,` : ""}{" "}
                  against thresholds of {setup.thresh1}, {setup.thresh2} and {setup.thresh3}. It is{" "}
                  {STATE_LABEL[state(setup)]}
                  {overflows(setup)
                    ? ", so a new neighbor cannot be created and the packet is dropped."
                    : canReclaim(setup)
                      ? `, surviving its own size because a forced collection has entries older than ${RECLAIM_AGE_SECONDS} seconds to take.`
                      : "."}
                </p>

                {/* ── the three thresholds on one axis ── */}
                <div data-testid="neigh-bar">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">entries against the three thresholds</span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {held} held, {headroom(setup)} of headroom
                    </span>
                  </div>
                  <div className="relative mt-2 h-12 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    <span
                      style={{ width: at(held) }}
                      className={`absolute inset-y-0 left-0 block ${
                        overflows(setup)
                          ? "bg-[hsl(var(--brand-danger)/0.55)]"
                          : state(setup) === "forced-collection"
                            ? "bg-[hsl(var(--brand-amber)/0.45)]"
                            : "bg-[hsl(var(--brand-signal)/0.35)]"
                      }`}
                    />
                    {([
                      ["gc_thresh1", setup.thresh1, "hsl(var(--brand-ash))"],
                      ["gc_thresh2", setup.thresh2, "hsl(var(--brand-amber))"],
                      ["gc_thresh3", setup.thresh3, "hsl(var(--brand-danger))"],
                    ] as const).map(([label, value, color]) => (
                      <span key={label} style={{ left: at(value) }} className="absolute inset-y-0 block">
                        <span style={{ backgroundColor: color }} className="absolute inset-y-0 block w-[2px]" />
                        <span
                          style={{ color }}
                          className="absolute bottom-0.5 left-1 whitespace-nowrap font-mono-tight text-[0.59375rem]"
                        >
                          {label} {value}
                        </span>
                      </span>
                    ))}
                    <span className="absolute left-1.5 top-1 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-bone))]">
                      {held} entries
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {!periodicRuns(setup)
                      ? "Below the first mark the periodic collector returns without walking the table, so nothing here is ever aged out."
                      : state(setup) === "collected-normally"
                        ? "Between the first two marks: the collector ages entries out on its schedule and nothing is under pressure."
                        : overflows(setup)
                          ? "Past the third mark with nothing reclaimable. Allocations are refused and the kernel logs the overflow, rate limited."
                          : "Past the second mark, so every allocation attempts a forced collection first, under a one millisecond budget. This costs latency and is never logged."}
                  </p>
                </div>

                {/* ── the second condition, which is about age rather than count ── */}
                <div data-testid="neigh-age">
                  <div className="font-mono-tight text-[0.71875rem] text-[hsl(var(--brand-bone-dim))]">
                    the same {held} entries, arriving two ways
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {([
                      ["all at once, inside 5 s", true],
                      ["gradually, over hours", false],
                    ] as const).map(([label, burst]) => {
                      const would = overflows({ ...setup, arrivedInABurst: burst });
                      const isThis = setup.arrivedInABurst === burst;
                      return (
                        <div
                          key={label}
                          className={`rounded-lg border px-3 py-2 font-mono-tight text-[0.71875rem] ${
                            isThis
                              ? "border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-signal)/0.06)]"
                              : "border-[hsl(var(--brand-iron))]"
                          }`}
                        >
                          <span className="text-[hsl(var(--brand-ash))]">{label}</span>
                          <span
                            className={`mt-1 block ${
                              would ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-signal))]"
                            }`}
                          >
                            {would ? "overflow: allocations refused" : "no overflow"}
                          </span>
                          {isThis ? (
                            <span className="mt-0.5 block text-[0.625rem] text-[hsl(var(--brand-ash)/0.8)]">this case</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {overflows({ ...setup, arrivedInABurst: true }) === overflows({ ...setup, arrivedInABurst: false })
                      ? "This table is far enough from the hard limit that arrival speed makes no difference to it."
                      : `Same count, same limit, opposite outcome. A forced collection may only take entries untouched for ${RECLAIM_AGE_SECONDS} seconds, and a burst has none.`}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="neigh-counts"
                  >
{`${asCounts(setup)}

$ dmesg | tail
${asDmesg(setup)}`}
                  </pre>
                </div>

                <p className="font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]" data-testid="neigh-sizing">
                  Sized properly, this segment wants gc_thresh3 at {thresh3Needed(setup)}, with
                  gc_thresh1 and gc_thresh2 raised to keep their shape.
                </p>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="neigh-fix"
                >
                  <span className="font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-cyan))]">
                    What to do ·{" "}
                  </span>
                  {active.fix}
                </p>
                <p className="border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                    The belief this breaks ·{" "}
                  </span>
                  {active.breaks}.
                </p>
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="neigh-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the three thresholds as this machine has
                them, how many hosts are on the segment, how many entries each costs in this
                family, and how fast they arrived. The thresholds are drawn once you have
                committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="neigh-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} segments`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI recomputes each table's state as four independent predicates and requires exactly one
            to be true, checks that the set contains a pair of tables identical but for how fast
            their entries arrived and opposite in outcome, and proves on every case that permanent
            entries change nothing, because exempt_from_gc means they never reach the counter. Per
            device overrides, the unres_qlen backlog and hash table resizing are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the segment this table belongs to,{" "}
            <Link
              href="/allocate"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the plan that has to grow
            </Link>{" "}
            is how a flat /22 gets chosen in the first place, and{" "}
            <Link
              href="/leases"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              forty minutes dark
            </Link>{" "}
            is what the same segment does to an address pool.
          </p>

          <ReadAboutThis href="/neigh" />

          <p className="mt-10 font-mono-tight text-[0.78125rem] text-[hsl(var(--brand-ash))]">
            <Link href="/practice" className="underline decoration-dotted hover:text-[hsl(var(--brand-bone))]">
              All practice material
            </Link>
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
