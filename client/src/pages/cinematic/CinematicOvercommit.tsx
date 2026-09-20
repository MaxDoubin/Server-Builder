/**
 * The wall and the hardware on one axis, so the gap between them is visible.
 *
 * The picture nobody draws is CommitLimit beside MemTotal. They are measured
 * in the same unit, they are printed four lines apart in /proc/meminfo, and
 * on a stock host with no swap one of them is half the other. Put them on the
 * same axis with the reservations stacked against them and the case everybody
 * meets becomes a thing you can see: a request that crosses the wall while
 * staying well under the memory.
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
  asSysctl,
  commitLimitKb,
  committedPercentOfLimit,
  committedPercentOfRam,
  correctOption,
  headroomKb,
  human,
  limitPercentOfRam,
  loadSolvedOvercommit,
  modeName,
  oomPossible,
  recordSolvedOvercommit,
  refuses,
  refusesWithMemoryFree,
  type Case,
} from "@/lib/overcommit/index";

const SITE_URL = "https://maxdoubin.com";

/** Refusing while the memory is there is the loud one. */
function severity(item: Case): StageAccent {
  if (refusesWithMemoryFree(item.setup)) return "danger";
  return oomPossible(item.setup) ? "amber" : "signal";
}

export function CinematicOvercommit() {
  useSEO({
    title: "CommitLimit Is Half the Memory, and It Is Not a Memory Limit | Max Doubin",
    description:
      "vm.overcommit_ratio defaults to 50 and applies to RAM alone, so a machine with no swap has a CommitLimit of half its memory. Turn on strict accounting and a 5 GiB allocation is refused with 13.92 GiB free. Ten machines on what the limit is, which mode reads it, and why Committed_AS is not usage.",
    canonical: `${SITE_URL}/overcommit`,
    ogImage: `${SITE_URL}/images/og/overcommit.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedOvercommit());
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
        recordSolvedOvercommit(active.slug);
        setSolved(loadSolvedOvercommit());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const limit = commitLimitKb(setup);
  const headroom = headroomKb(setup);
  const refused = refuses(setup);
  const wastefully = refusesWithMemoryFree(setup);
  const asking = setup.committedKb + setup.wantKb;

  /* The wall, the hardware and the reservations on one axis. */
  const span = Math.max(limit, setup.ramKb + setup.swapKb, asking) * 1.06;
  const pct = (n: number) => Math.max(0.5, Math.min(100, (n / span) * 100));

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
              · {CASES.length} machines, one allocation each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Half a machine.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten machines, ten allocations, one question each. Work out what the limit is, whether
              anything is reading it, and whether the request in front of you gets the memory.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              <code>vm.overcommit_ratio</code> defaults to 50 and applies to RAM alone, with swap
              added whole, so a machine with no swap has a <code>CommitLimit</code> of half its
              memory. In the default mode nothing reads that number and{" "}
              <code>Committed_AS</code> passes it without comment. Set{" "}
              <code>vm.overcommit_memory</code> to 2 to stop the out of memory killer and it
              becomes a wall, refusing a 5 GiB allocation on a host with 13.92 GiB free.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="overcommit-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`overcommit-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      mode {item.setup.mode} {modeName(item.setup)} · ratio {item.setup.ratio}
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
              data-testid="overcommit-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="overcommit-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asSysctl(setup)
  .map((line) => `${line.name.padEnd(22)} ${line.value.padStart(10)}  # ${line.unit}`)
  .join("\n")}
{`

# the next allocation asks for ${setup.wantKb} kB, ${human(setup.wantKb)}`}
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
                    data-testid={`overcommit-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="overcommit-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} CommitLimit is {human(limit)}, which is{" "}
                  {limitPercentOfRam(setup)} percent of the machine's memory, and{" "}
                  {human(setup.committedKb)} of that is already reserved. The mode is{" "}
                  {setup.mode}, {modeName(setup)}.{" "}
                  {refused
                    ? `The request for ${human(setup.wantKb)} is refused against ${human(headroom)} of headroom.`
                    : `Nothing refuses the request for ${human(setup.wantKb)}.`}{" "}
                  {wastefully
                    ? `MemAvailable is ${human(setup.availableKb)}, so the memory is there and the accounting is what said no.`
                    : ""}
                </p>

                {/* ── the wall against the hardware ── */}
                <div data-testid="overcommit-axis">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">the wall, the hardware, and what is being asked</span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {refused ? "refused" : "allowed"}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {[
                      { name: "MemTotal", value: setup.ramKb + setup.swapKb, lit: false, note: "the hardware, swap included" },
                      { name: "CommitLimit", value: limit, lit: refused, note: `${limitPercentOfRam(setup)}% of RAM` },
                      { name: "reserved", value: setup.committedKb, lit: false, note: `${committedPercentOfLimit(setup)}% of the limit` },
                      { name: "reserved + ask", value: asking, lit: refused, note: refused ? "over the wall" : "under the wall" },
                      { name: "MemAvailable", value: setup.availableKb, lit: wastefully, note: "what is really there" },
                    ].map((row) => (
                      <div key={row.name} className="flex items-center gap-3">
                        <span className="w-[6.5rem] shrink-0 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]">
                          {row.name}
                        </span>
                        <span className="relative h-5 flex-1 overflow-hidden rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                          <span
                            style={{ width: `${pct(row.value)}%` }}
                            className={`absolute inset-y-0 left-0 block ${
                              row.lit
                                ? wastefully
                                  ? "bg-[hsl(var(--brand-danger)/0.5)]"
                                  : "bg-[hsl(var(--brand-signal)/0.45)]"
                                : "bg-[hsl(var(--brand-iron)/0.7)]"
                            }`}
                          />
                        </span>
                        <span className="w-[8.5rem] shrink-0 text-right font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-bone-dim))]">
                          {human(row.value)} · {row.note}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {refused
                      ? "The lit bars are the wall and the thing that crossed it. Notice where MemTotal sits: the request did not run out of memory, it ran out of permission to promise."
                      : "Nothing is refused here, so the wall is drawn only to show where it is. In the default mode it is a number nobody reads."}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="overcommit-counters"
                  >
{`CommitLimit   = SwapTotal + MemTotal * ratio / 100, computed in PAGES
              = ${setup.swapKb} + ${setup.ramKb} * ${setup.ratio} / 100
              = ${limit} kB   (${human(limit)}, ${limitPercentOfRam(setup)}% of RAM)

Committed_AS  ${String(setup.committedKb).padStart(12)} kB   ${committedPercentOfLimit(setup)}% of the limit, ${committedPercentOfRam(setup)}% of RAM
headroom      ${String(headroom).padStart(12)} kB   ${human(headroom)}
this request  ${String(setup.wantKb).padStart(12)} kB   ${human(setup.wantKb)}
MemAvailable  ${String(setup.availableKb).padStart(12)} kB   ${human(setup.availableKb)}

mode ${setup.mode} (${modeName(setup)}) -> ${refused ? "REFUSED" : "allowed"}
the killer can still run: ${oomPossible(setup) ? "yes, the limit is above RAM plus swap" : "not from this accounting alone"}`}
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
                  data-testid="overcommit-fix"
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
                  data-testid="overcommit-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the three knobs with their units written out,
                the four figures /proc/meminfo prints, and what the next allocation asks for. The
                limit comes from the ratio and the swap, whether anything reads it comes from the
                mode, and MemAvailable is in there to be ignored or not. The axis is drawn once you
                have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="overcommit-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} machines`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model is a transcription of vm_commit_limit and the mode check around it, and it
            reproduces the host it was written on: MemTotal 16481980 kB, no swap, Committed_AS
            4006572 kB, CommitLimit 8240988 kB. Walking vm.overcommit_ratio across 25, 50, 80, 100
            and 150 gave 4120492, 8240988, 13185584, 16481980 and 24722968 kB, and the model lands
            on all five exactly, which a formula written in kilobytes does not: the kernel floors a
            page count and then multiplies, so it reads 8240988 where the obvious arithmetic says
            8240990. The mode was never changed, because putting a live container into strict
            accounting to watch it refuse things is not a measurement worth taking, so the refusals
            here are computed rather than observed. CI counts the pages a block at a time, walks
            all 301 ratios, and ties each mode's name to what that mode does, after swapping two of
            the names left every case with exactly one answer and the whole set wrong.
            vm.admin_reserve_kbytes, per cgroup memory.max, hugetlb pages and the heuristic's own
            single request rule are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what happens when the pages are finally touched,{" "}
            <Link
              href="/oom"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              something has to die
            </Link>{" "}
            is the arithmetic the killer actually uses, and{" "}
            <Link
              href="/throttle"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              thirty percent, and stalling
            </Link>{" "}
            is the other wall that is a policy rather than a shortage.
          </p>

          <ReadAboutThis href="/overcommit" />

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
