/**
 * Two columns of bars, one per process, and the two columns disagree.
 *
 * Everything on this surface is double counting, so the drawing is the double
 * count: the same four processes measured twice, RSS above PSS, on one scale.
 * The RSS bars are all the same length and the PSS bars are a quarter of them,
 * and underneath, the two columns added up against the page frames that
 * actually exist.
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
  alive,
  asMib,
  asPss,
  copies,
  correctOption,
  grew,
  loadSolvedPss,
  mib,
  pagesMib,
  physicalPages,
  pssChildKib,
  pssParentKib,
  pssSumKib,
  recordSolvedPss,
  rssChildPages,
  rssParentPages,
  rssSumPages,
  touched,
  type Case,
} from "@/lib/pss/index";

const SITE_URL = "https://maxdoubin.com";

function severity(item: Case): StageAccent {
  /* The gap between what a column of RSS says and what the machine holds. */
  const over = pagesMib(rssSumPages(item.setup)) / Math.max(1, pagesMib(physicalPages(item.setup)));
  if (over >= 4) return "danger";
  return over > 1 ? "amber" : "signal";
}

/** One labeled bar, drawn against the widest thing on the chart. */
function Bar({
  label,
  value,
  of,
  tone,
}: {
  label: string;
  value: number;
  of: number;
  tone: "rss" | "pss" | "frames";
}) {
  const width = of > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / of) * 100) : 0;
  const color =
    tone === "rss"
      ? "bg-[hsl(var(--brand-danger)/0.55)]"
      : tone === "pss"
        ? "bg-[hsl(var(--brand-signal)/0.65)]"
        : "bg-[hsl(var(--brand-cyan)/0.55)]";
  return (
    <div className="flex items-center gap-2 py-[2px]">
      <span className="w-[84px] shrink-0 text-right font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
        {label}
      </span>
      <span className="h-3 min-w-0 flex-1 rounded-[2px] bg-[hsl(var(--brand-iron)/0.4)]">
        <span className={`block h-3 rounded-[2px] ${color}`} style={{ width: `${width}%` }} />
      </span>
      <span className="w-[76px] shrink-0 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-bone-dim))]">
        {asMib(value)}
      </span>
    </div>
  );
}

export function CinematicPss() {
  useSEO({
    title: "Four Processes, One Copy: RSS, PSS And fork | Max Doubin",
    description:
      "Four processes sharing one 64 MiB mapping report 64 MiB of RSS each, and adding that column up gives 258 MiB of memory that does not exist. PSS is the same measurement with each page divided by the number of processes that map it, and it adds up to the truth.",
    canonical: `${SITE_URL}/pss`,
    ogImage: `${SITE_URL}/images/og/pss.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedPss());
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
        recordSolvedPss(active.slug);
        setSolved(loadSolvedPss());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const live = alive(setup);
  const rssParent = pagesMib(rssParentPages(setup));
  const rssChild = pagesMib(rssChildPages(setup));
  const pssParent = mib(pssParentKib(setup));
  const pssChild = mib(pssChildKib(setup));
  const rssTotal = pagesMib(rssSumPages(setup));
  const pssTotal = mib(pssSumKib(setup));
  const frames = pagesMib(physicalPages(setup));
  const widest = Math.max(rssParent, rssChild, pssParent, pssChild);

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
              · {CASES.length} forks, one reading each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Four processes, one copy.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten mappings, one question each. Work out what each process is charged for, and what
              the machine actually has to find room for.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              RSS is not wrong about any one process: each of them really can reach that many
              resident pages. It is wrong the moment you add two of them together, because the same
              page frame appears in both at full price. PSS is the same measurement with each page
              divided by the number of processes that map it, which is the only reason it exists.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="pss-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`pss-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {asMib(pagesMib(item.setup.pages))} {item.setup.kind}, {item.setup.children}{" "}
                      forked
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
              data-testid="pss-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="pss-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asPss(setup)
  .map((line) => `${line.name.padEnd(18)} ${line.value.padStart(29)}  # ${line.unit}`)
  .join("\n")}
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
                    data-testid={`pss-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="pss-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The RSS column adds up to {asMib(rssTotal)}, the PSS
                  column to {asMib(pssTotal)}, and {asMib(frames)} of page frames exist.{" "}
                  {grew(setup)
                    ? `The ${asMib(frames - pagesMib(setup.pages))} above the mapping is what the writes copied.`
                    : "Nothing that happened after the fork cost a single frame."}
                </p>

                {/* ── the same processes, measured twice ── */}
                <div data-testid="pss-bars">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      {1 + live} processes, each measured both ways
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {asMib(rssTotal)} of RSS over {asMib(frames)} of memory
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <Bar label="parent RSS" value={rssParent} of={widest} tone="rss" />
                    <Bar label="parent PSS" value={pssParent} of={widest} tone="pss" />
                    {Array.from({ length: live }, (_, index) => (
                      <div key={index} className="mt-1.5">
                        <Bar label={`child ${index} RSS`} value={rssChild} of={widest} tone="rss" />
                        <Bar label={`child ${index} PSS`} value={pssChild} of={widest} tone="pss" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-[hsl(var(--brand-iron))] pt-3">
                    <Bar label="RSS added up" value={rssTotal} of={Math.max(rssTotal, frames)} tone="rss" />
                    <Bar label="PSS added up" value={pssTotal} of={Math.max(rssTotal, frames)} tone="pss" />
                    <Bar label="frames" value={frames} of={Math.max(rssTotal, frames)} tone="frames" />
                  </div>
                  <p className="mt-2.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {rssTotal > frames
                      ? `The red column adds up to ${asMib(rssTotal)} for ${asMib(frames)} of memory, because every page shared by ${1 + live} processes is in ${1 + live} of those bars at full price. The blue column is the same pages divided by the number of processes holding them, and it lands on the frames that exist.`
                      : "Here the two columns agree, because almost nothing in this mapping is shared by more than one process at a time."}
                    {setup.kind === "shared" && touched(setup) < setup.pages
                      ? " The children are short because a shared anonymous mapping has its page tables built by faulting rather than by fork, so a child holds only what it has touched."
                      : ""}
                    {copies(setup)
                      ? " The frames bar is longer than the mapping because each writing child took a private copy of the pages it wrote."
                      : ""}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="pss-ledger"
                  >
{`the frames

  the mapping                 ${asMib(pagesMib(setup.pages)).padEnd(12)} ${setup.pages} pages, touched in full before the fork
  copies the writes made      ${asMib(frames - pagesMib(setup.pages)).padEnd(12)} ${copies(setup) ? `${live} ${live === 1 ? "child" : "children"} at ${asMib(pagesMib(setup.touchPages))} each` : "nothing was written to a private page"}
  frames in memory            ${asMib(frames).padEnd(12)} this is what the machine has to find

each process

  parent            RSS       ${asMib(rssParent).padEnd(12)} PSS ${asMib(pssParent)}
  a child           RSS       ${asMib(rssChild).padEnd(12)} PSS ${asMib(pssChild)}${live === 0 ? "   <- none are left" : ""}
  ${String(live).padEnd(2)}${live === 1 ? "child" : "children"} still running${live === 1 ? "  " : ""}

added up

  RSS                         ${asMib(rssTotal).padEnd(12)} ${rssTotal > frames ? `${asMib(rssTotal - frames)} of this is the same pages counted again` : "nothing here is shared, so it happens to be right"}
  PSS                         ${asMib(pssTotal).padEnd(12)} ${pssTotal === frames ? "exactly the frames in use" : `${asMib(frames - pssTotal)} under the frames, lost to the kernel's fixed point`}
  frames                      ${asMib(frames)}`}
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
                  data-testid="pss-fix"
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
                  data-testid="pss-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: how big the mapping is, which flags it was
                made with, how many processes are left, and what each of them has touched since the
                fork. Ask how many processes map a given page first, because that is the divisor,
                and then ask whether anything was written to a private page, because that is the
                only thing here that costs a frame. The bars are drawn once you have committed to an
                answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="pss-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} forks`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, kernel 6.18.44, measured with a C
            program that maps one region, touches every page, forks, and reads Rss and Pss for that
            one mapping out of /proc/self/smaps in each process. A 64 MiB private anonymous mapping
            shared by four processes gave 65536 kB of RSS and 16384 kB of PSS in every one of them,
            and ps reported the same four as 66948, 65828, 65828 and 65828 kB of RSS against 16492,
            16435, 16435 and 16435 of PSS: 258.2 MiB added up one way and 64.3 MiB the other, for
            64 MiB of memory. Children that read 16 MiB each changed nothing at all, because fork
            had already put those pages in their page tables; children that wrote 16 MiB each took
            48 MiB of copies and moved every PSS to 28672 kB. Writing one range each rather than
            the same range cost exactly the same 48 MiB and moved the parent to 20479 kB and each
            child to 31402. The same region mapped MAP_SHARED behaved differently at the fork: a
            child that touched nothing reported an RSS of zero for a region it maps in full, because
            Linux does not copy the page tables of a shared anonymous mapping, and a child that read
            16 MiB reported 16384 kB. Killing one of four raised the survivors from 16384 kB to
            21845 with nothing allocated and nothing freed. CI rebuilds the page table one page at a
            time and counts who holds which frame rather than doing the same region arithmetic
            twice, across 28242 combinations. Swap, file backed mappings, huge pages, KSM and cgroup
            accounting are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other number everybody reads wrong,{" "}
            <Link
              href="/free"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              two hundred megabytes free
            </Link>{" "}
            is why the free column was always going to be small, and{" "}
            <Link
              href="/overcommit"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              half a machine
            </Link>{" "}
            is what the kernel thinks it has promised.
          </p>

          <ReadAboutThis href="/pss" />

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
