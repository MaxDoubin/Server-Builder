/**
 * Two pictures of the same heap.
 *
 * A ledger bar, which is where the peak went: what free() handed back, what a
 * trim could still reach, and what nothing can. And a strip of pages at one
 * cell per page, which is the reason the ledger comes out as it does. The
 * strip is the whole surface: two heaps holding wildly different amounts can
 * look identical in the ledger's first two segments and completely different
 * here, because what decides it is spacing.
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
  PAGE,
  afterFree,
  asBytes,
  asMalloctrim,
  asPattern,
  asSource,
  chunkSpan,
  correctOption,
  dense,
  freeReturns,
  held,
  heldAfterTrim,
  liveCount,
  loadSolvedMalloctrim,
  offsetOf,
  peak,
  recordSolvedMalloctrim,
  source,
  strideChunks,
  topFree,
  trimHelps,
  trimThreshold,
  type Case,
  type Setup,
} from "@/lib/malloctrim/index";

const SITE_URL = "https://maxdoubin.com";

/** How many pages the strip draws, one cell each. */
const STRIP = 120;

function severity(item: Case): StageAccent {
  if (!trimHelps(item.setup) && held(item.setup) > peak(item.setup) / 2) return "danger";
  if (freeReturns(item.setup) === 0) return "amber";
  return "signal";
}

/**
 * Which of the strip's pages something live is sitting in.
 *
 * At one cell per page and no sampling, because a sampled strip marks a cell
 * whenever anything in its range is live, which paints every case solid and
 * hides the only thing worth looking at. The window starts two pages before
 * the first survivor so that the survivor is always on screen, and the
 * caption says where it starts.
 */
function stripOf(setup: Setup): { from: number; cells: boolean[] } {
  const live = liveCount(setup);
  const span = chunkSpan(setup);
  const from = live > 0 ? Math.max(0, Math.floor(offsetOf(setup, 0) / PAGE) - 2) : 0;
  const cells: boolean[] = [];
  for (let p = from; p < from + STRIP; p += 1) {
    const lo = p * PAGE;
    const hi = lo + PAGE;
    let occupied = false;
    for (let k = 0; k < live; k += 1) {
      const at = offsetOf(setup, k);
      if (at >= hi) break;
      if (at + span > lo) {
        occupied = true;
        break;
      }
    }
    cells.push(occupied);
  }
  return { from, cells };
}

/** One segment of the ledger bar, sized against the peak. */
function Segment({ bytes, of, tone, label }: { bytes: number; of: number; tone: string; label: string }) {
  if (bytes <= 0 || of <= 0) return null;
  return (
    <span
      title={`${label}, ${asBytes(bytes)}`}
      className={`block h-full ${tone}`}
      style={{ width: `${(bytes / of) * 100}%` }}
    />
  );
}

export function CinematicMalloctrim() {
  useSEO({
    title: "The Memory You Freed And Still Hold: glibc malloc And RSS | Max Doubin",
    description:
      "free() returned twenty megabytes to the kernel in one run and nothing at all in the next, and the only difference was one surviving kilobyte. Ten heaps, one question each: work out what comes back, what malloc_trim can still reach, and what nothing can.",
    canonical: `${SITE_URL}/malloctrim`,
    ogImage: `${SITE_URL}/images/og/malloctrim.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedMalloctrim());
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
        recordSolvedMalloctrim(active.slug);
        setSolved(loadSolvedMalloctrim());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const strip = useMemo(() => (answered ? stripOf(setup) : null), [answered, setup]);
  const returned = freeReturns(setup);
  const reachable = Math.max(0, afterFree(setup) - heldAfterTrim(setup));
  const stuck = heldAfterTrim(setup);

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
              · {CASES.length} heaps, one question each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The memory you freed and still hold.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten heaps, one question each. Work out what <code>free()</code> gives back to the
              kernel, what <code>malloc_trim</code> can still reach, and what nothing can.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Measured, twenty thousand kilobyte chunks: freeing every one of them handed twenty
              megabytes back with no other call, and keeping one of them handed back nothing at
              all. What decides it is not how much you freed. It is what is left, and where.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="malloctrim-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`malloctrim-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {asBytes(peak(item.setup))}, {asPattern(item.setup.pattern)}
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
              data-testid="malloctrim-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="malloctrim-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asMalloctrim(setup)
  .map((line) => `${line.name.padEnd(22)} ${line.value.padStart(26)}  # ${line.unit}`)
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
                    data-testid={`malloctrim-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="malloctrim-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} Of the {asBytes(peak(setup))} at the peak,{" "}
                  <code>free()</code> gave back {asBytes(returned)},{" "}
                  {reachable > 0
                    ? `a trim could still reach ${asBytes(reachable)},`
                    : "a trim could reach nothing more,"}{" "}
                  and {asBytes(stuck)} is pinned by what is still live.
                </p>

                {/* ── where the peak went ── */}
                <div data-testid="malloctrim-ledger">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      {asBytes(peak(setup))} at the peak, {asBytes(held(setup))} held when it is done
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {Math.round((held(setup) / Math.max(1, peak(setup))) * 100)}% still resident
                    </span>
                  </div>
                  <div className="mt-3 flex h-5 w-full overflow-hidden rounded-[3px] bg-[hsl(var(--brand-obsidian))]">
                    <Segment bytes={returned} of={peak(setup)} label="returned by free()" tone="bg-[hsl(var(--brand-signal)/0.65)]" />
                    <Segment bytes={reachable} of={peak(setup)} label="a trim could reach it" tone="bg-[hsl(var(--brand-cyan)/0.45)]" />
                    <Segment bytes={stuck} of={peak(setup)} label="pinned by something live" tone="bg-[hsl(var(--brand-amber)/0.7)]" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                    {/*
                      A swatch for a segment the bar never drew would promise a
                      color that is not in it, so a zero reads as an outline.
                    */}
                    <span>
                      <span
                        className={`mr-1.5 inline-block h-2 w-2 rounded-[1px] ${
                          returned > 0
                            ? "bg-[hsl(var(--brand-signal)/0.65)]"
                            : "border border-[hsl(var(--brand-iron))]"
                        }`}
                      />
                      free() returned {asBytes(returned)}
                    </span>
                    <span>
                      <span
                        className={`mr-1.5 inline-block h-2 w-2 rounded-[1px] ${
                          reachable > 0
                            ? "bg-[hsl(var(--brand-cyan)/0.45)]"
                            : "border border-[hsl(var(--brand-iron))]"
                        }`}
                      />
                      a trim reaches {asBytes(reachable)}
                    </span>
                    <span>
                      <span
                        className={`mr-1.5 inline-block h-2 w-2 rounded-[1px] ${
                          stuck > 0
                            ? "bg-[hsl(var(--brand-amber)/0.7)]"
                            : "border border-[hsl(var(--brand-iron))]"
                        }`}
                      />
                      pinned {asBytes(stuck)}
                    </span>
                  </div>
                </div>

                {/* ── the heap, one cell per page ── */}
                {strip && source(setup) === "heap" ? (
                  <div data-testid="malloctrim-pages">
                    <p className="font-mono-tight text-[0.71875rem] text-[hsl(var(--brand-bone-dim))]">
                      {STRIP} pages of the heap, one cell each, from byte {strip.from * PAGE}
                    </p>
                    <div className="mt-2 flex gap-[1px]" style={{ height: 18 }}>
                      {strip.cells.map((occupied, k) => (
                        <span
                          key={k}
                          className={`min-w-0 flex-1 rounded-[1px] ${
                            occupied
                              ? "bg-[hsl(var(--brand-amber)/0.75)]"
                              : "bg-[hsl(var(--brand-iron)/0.7)]"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="mt-2.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                      {liveCount(setup) === 0
                        ? "Nothing is live, so every page in the heap is free and there is nothing to work around. This is the only arrangement where free() alone empties the heap."
                        : dense(setup)
                          ? `The survivors leave ${asBytes((strideChunks(setup) - 1) * chunkSpan(setup))} between them and not one whole page of it is free, so every cell has something live in it.${
                              (strideChunks(setup) - 1) * chunkSpan(setup) >= PAGE
                                ? " There is more than a page of room and still no page, because a gap only holds one when it lines up with one."
                                : ""
                            }`
                          : `The survivors leave ${asBytes((strideChunks(setup) - 1) * chunkSpan(setup))} between them, and whole pages fall inside that, so MADV_DONTNEED can take those. Amber is pinned by something live, iron is free and reachable. Neither color is about how many bytes are live.`}
                    </p>
                  </div>
                ) : null}

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="malloctrim-accounts"
                  >
{`the working set

  chunks                ${String(setup.chunks).padEnd(12)} of ${asBytes(setup.chunkBytes)} asked for
  each one costs        ${asBytes(chunkSpan(setup)).padEnd(12)} the request plus eight, rounded to sixteen
  from                  ${asSource(source(setup))}
  at the peak           ${asBytes(peak(setup))}

what is left in it

  live chunks           ${String(liveCount(setup)).padEnd(12)} ${asPattern(setup.pattern)}
  live bytes            ${asBytes(liveCount(setup) * chunkSpan(setup))}
  pages they sit in     ${asBytes(heldAfterTrim(setup)).padEnd(12)} nothing releases a page with anything live in it

what comes back

  free() returned       ${asBytes(returned).padEnd(12)} ${
    source(setup) === "mmap"
      ? "every freed chunk was its own mapping, and free() unmaps"
      : returned > 0
        ? `${asBytes(topFree(setup))} at the top passed the ${asBytes(trimThreshold(setup))} threshold`
        : `${asBytes(topFree(setup))} at the top, under the ${asBytes(trimThreshold(setup))} threshold`
  }
  malloc_trim would     ${asBytes(reachable).padEnd(12)} ${trimHelps(setup) ? "whole free pages, anywhere in the arena" : "nothing, there is no whole free page"}
  ${(setup.trims ? "and it was called" : "and it was not called").padEnd(21)} ${asBytes(held(setup)).padEnd(12)} still held`}
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
                  data-testid="malloctrim-fix"
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
                  data-testid="malloctrim-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above. Ask two separate questions. Does the free
                space reach the top of the heap, which is the only place <code>brk</code> moves, and
                is there more of it there than the trim threshold. Then, separately, is there a
                whole page anywhere with nothing live in it, which is all that
                <code> malloc_trim</code> can hand back. The pictures are drawn once you have
                committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="malloctrim-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} heaps`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, Linux 6.18.44 with glibc 2.39, x86-64,
            4 kB pages, single threaded. Twenty thousand kilobyte chunks allocated and touched came
            to 22092 kB resident; freeing every one of them took it to 1912 kB with no other call,
            and freeing all but the last took it to 22088 kB, which is nowhere. Keeping every
            hundredth and calling malloc_trim left 2788 kB, keeping every tenth left 11892 kB, and
            keeping every other one left 22084 kB, not one page recovered, while holding five times
            as much live data as the run that recovered ten megabytes. A 10 MB buffer mapped
            10489856 bytes and gave all of it back, and the identical call a moment later reported
            no mappings and gave back nothing, because freeing the first raised the threshold above
            the second. One allocate and free between 10 and 31 mebibytes switched the automatic
            trim off for the rest of the process and 32 did not. The first probe read RSS with
            fopen, which allocates a stdio buffer, so every reading after a free came out 64 kB
            higher than the one before it and the trim looked as if it never fired. CI recomputes
            every answer by walking the heap a page at a time, from the pages rather than from the
            survivors, across 6048 combinations. Threads and their per-thread arenas, allocators
            other than glibc, MALLOC_ARENA_MAX, huge pages, and whether the returned pages help
            under real pressure are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other side of the same accounting,{" "}
            <Link
              href="/pss"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              four processes, one copy
            </Link>{" "}
            is what RSS counts twice, and{" "}
            <Link
              href="/overcommit"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the allocation that succeeded
            </Link>{" "}
            is what the kernel promised before any of this was touched.
          </p>

          <ReadAboutThis href="/malloctrim" />

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
