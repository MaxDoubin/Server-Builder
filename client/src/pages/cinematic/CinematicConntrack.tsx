/**
 * The table, drawn as a bar with the eviction rule written on it.
 *
 * Everything on this surface follows from two pictures nobody has seen. The
 * first is the limit: a bar of entries held against a bar of entries allowed,
 * where the second is computed by a formula whose factor depends on whether
 * anybody ever touched a modprobe file. The second is the eviction rule, and
 * it is one bit: how much of the table early_drop is permitted to take, which
 * on a host doing real work is none of it.
 *
 * Above them, the two sysctls, because these are numbers every host has and
 * nobody has read.
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
  EVICTION_RANGE,
  asCounters,
  asSysctl,
  buckets,
  correctOption,
  count,
  earlyDropHelps,
  entriesHeld,
  human,
  loadSolvedConntrack,
  maxEntries,
  maxFactor,
  overflows,
  recordSolvedConntrack,
  timeoutSeconds,
  type Case,
} from "@/lib/conntrack/index";

const SITE_URL = "https://maxdoubin.com";

/** A table that overflows with no eviction possible is the alarming one. */
function severity(item: Case): StageAccent {
  if (!overflows(item.setup)) return "signal";
  return earlyDropHelps(item.setup) ? "amber" : "danger";
}

export function CinematicConntrack() {
  useSEO({
    title: "The Table Is Full and the Kernel Cannot Shrink It | Max Doubin",
    description:
      "nf_conntrack: table full, dropping packet does not mean the table hit its limit. It means the kernel hit the limit, tried to evict something, and found nothing it was allowed to take. Ten hosts here, and the questions are what the limit actually is, how long an entry holds its slot, and whether early_drop can save you.",
    canonical: `${SITE_URL}/conntrack`,
    ogImage: `${SITE_URL}/images/og/conntrack.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedConntrack());
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
        recordSolvedConntrack(active.slug);
        setSolved(loadSolvedConntrack());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const held = entriesHeld(setup);
  const limit = maxEntries(setup);
  const over = overflows(setup);
  const evictable = earlyDropHelps(setup);

  /* The bar runs to whichever is larger, so both the limit and the demand fit. */
  const span = Math.max(held, limit) * 1.04;
  const pct = (n: number) => Math.min(100, (n / span) * 100);

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
              · {CASES.length} hosts, one table each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Table full.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten hosts, ten workloads, one question each. Work out what the limit on this machine
              actually is, how many entries the traffic holds, and whether the kernel can do
              anything about it when the two meet.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              <code>nf_conntrack: table full, dropping packet</code> is one of the few kernel
              messages that names its own cause, which is why it is usually misread. It does not
              mean the table reached its limit. <code>early_drop</code> runs first, and the message
              is printed only when it comes back empty handed. What it is allowed to take is a
              single bit: anything marked assured is skipped, and a connection becomes assured once
              it has carried traffic both ways. So the eviction path clears out scans and abandoned
              handshakes, and can do nothing whatever about a table full of working connections.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="conntrack-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`conntrack-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.ramGiB} GiB · {item.setup.flowsPerSecond}/s {item.setup.flow}
                    </span>
                    {mounted && solved.includes(item.slug) ? (
                      <span className="font-techno text-[0.625rem] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
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
              data-testid="conntrack-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="conntrack-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`${asSysctl(setup)}

# arriving: ${setup.flowsPerSecond} new ${setup.flow} flows a second${setup.activeSeconds > 0 ? `, ${setup.activeSeconds}s of traffic each` : ", one packet each"}
# an entry lives ${human(timeoutSeconds(setup))} after the last packet on its flow`}
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
                    data-testid={`conntrack-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="conntrack-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {setup.forcedBuckets === null
                    ? `Nothing forced the hash size, so the kernel sized it from ${setup.ramGiB} GiB to ${count(buckets(setup))} buckets and max_factor stayed at 1: the limit is ${count(limit)}.`
                    : `The hash size was forced to ${count(setup.forcedBuckets)}, which skips the branch that would have set max_factor to 1, so the limit is 8 times it: ${count(limit)}.`}{" "}
                  {setup.flowsPerSecond} a second holding a slot for {human(setup.activeSeconds + timeoutSeconds(setup))} is{" "}
                  {count(held)} entries.{" "}
                  {over
                    ? evictable
                      ? "That is over the limit, and early_drop can take these, so the count pins at the ceiling and nothing is dropped."
                      : "That is over the limit, and every entry is assured, so early_drop finds nothing and packets are refused."
                    : "Comfortably inside the limit."}
                </p>

                {/* ── the table, and what early_drop may take of it ── */}
                <div data-testid="conntrack-table">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">entries held against the limit</span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {count(held)} / {count(limit)}
                    </span>
                  </div>
                  <div className="relative mt-2 h-10 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    <span
                      style={{ width: `${pct(held)}%` }}
                      className={`absolute inset-y-0 left-0 block ${
                        over
                          ? evictable
                            ? "bg-[hsl(var(--brand-amber)/0.45)]"
                            : "bg-[hsl(var(--brand-danger)/0.45)]"
                          : "bg-[hsl(var(--brand-signal)/0.4)]"
                      }`}
                    />
                    <span
                      style={{ left: `${pct(limit)}%` }}
                      className="absolute inset-y-0 block w-[2px] bg-[hsl(var(--brand-bone))]"
                    />
                    <span
                      style={{ left: `${pct(limit)}%` }}
                      className="absolute top-1 ml-1.5 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-bone))]"
                    >
                      nf_conntrack_max
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {evictable
                      ? `These entries are not assured, so early_drop may take them. It looks in ${EVICTION_RANGE} buckets from the new packet's own hash and takes the first one it is allowed to, which is why a table like this sits at the ceiling without dropping anything.`
                      : `Every entry here is assured. early_drop looks in ${EVICTION_RANGE} buckets and skips all of them, and eight buckets or eight hundred makes no difference when nothing in the table is eligible.`}{" "}
                    {timeoutSeconds(setup) >= 86_400
                      ? `Each one holds its slot for ${human(timeoutSeconds(setup))} after the last packet, which is the shipped default and the reason a modest arrival rate reaches these numbers.`
                      : `Each one holds its slot for ${human(timeoutSeconds(setup))} after the last packet.`}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="conntrack-counters"
                  >
{asCounters(setup)}
                  </pre>
                </div>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="conntrack-fix"
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
                  {active.breaks}
                </p>
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="conntrack-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the memory, whether anybody forced the hash
                size, the arrival rate and what kind of flow it is. The limit comes from the first
                two, the occupancy from the last two, and whether the kernel can help comes from
                one bit on the entry. The table is drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="conntrack-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} hosts`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model is a transcription of nf_conntrack_init_start and early_drop_list from
            net/netfilter/nf_conntrack_core.c, and it reproduces the host it was written on: 15 GiB
            of memory, nf_conntrack_max 262144 against nf_conntrack_buckets 262144, and
            nf_conntrack_tcp_timeout_established 432000. With that limit lowered to 20 and the
            table filled with established connections, the measured counters were 296 drops against
            zero early drops, which is the claim this surface is built on. CI re-derives the sizing
            by walking memory a gibibyte at a time rather than by branching, checks the assured
            rule against the definition of assured rather than the model's table, and asserts the
            measurements. The gc worker, conntrack helpers and per-zone accounting are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other tables that fill up quietly,{" "}
            <Link
              href="/neigh"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the neighbor table
            </Link>{" "}
            has three thresholds and a garbage collector with its own opinion, and{" "}
            <Link
              href="/ports"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              port exhaustion
            </Link>{" "}
            is the same shape of arithmetic on a smaller number.
          </p>

          <ReadAboutThis href="/conntrack" />

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
