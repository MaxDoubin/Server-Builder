/**
 * A strip of pages, and the two places the answer can change.
 *
 * Every question on this surface is decided by which page the access lands in,
 * so the drawing is the address space laid out one page at a time: the pages
 * the file backs, the pages inside the mapping with nothing behind them, and
 * the first page past the mapping. The access sits on it as a mark, and the
 * end of the file sits inside whichever page it stops in.
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
  asKind,
  asLength,
  asMapped,
  asOutcome,
  backed,
  correctOption,
  covers,
  inTheTail,
  lastSafe,
  loadSolvedMapped,
  outcome,
  persists,
  reads,
  recordSolvedMapped,
  resized,
  type Case,
  type Setup,
} from "@/lib/mapped/index";

const SITE_URL = "https://maxdoubin.com";

function severity(item: Case): StageAccent {
  const result = outcome(item.setup);
  if (result === "segv") return "danger";
  if (result === "sigbus") return "amber";
  /* The access completed. The quiet failure is the store nobody kept. */
  if (item.setup.writing && !persists(item.setup)) return "amber";
  return "signal";
}

/** How the pages of one mapping stand, read off the model's two boundaries. */
function strip(setup: Setup) {
  const mapped = covers(setup) / setup.pageBytes;
  const withFile = backed(setup) / setup.pageBytes;
  const shown = Math.min(mapped + 1, 6);
  const pages = [];
  for (let page = 0; page < shown; page += 1) {
    pages.push({
      page,
      from: page * setup.pageBytes,
      state: page >= mapped ? "outside" : page < withFile ? "backed" : "nopage",
      here: Math.floor(setup.at / setup.pageBytes) === page,
      endsHere: setup.resizedTo > page * setup.pageBytes && setup.resizedTo <= (page + 1) * setup.pageBytes,
    });
  }
  return { pages, mapped, withFile, clipped: mapped + 1 > shown };
}

export function CinematicMapped() {
  useSEO({
    title: "Three Boundaries, Three Outcomes: mmap, SIGBUS And SIGSEGV | Max Doubin",
    description:
      "A 100 byte file mapped for two pages reads byte 4095 without a signal and takes SIGBUS at 4096, a length of 100 rounds up to a whole page and SIGSEGV waits just past it, and a store past the end of the file is thrown away without a word. Ten measured accesses through a mapping.",
    canonical: `${SITE_URL}/mapped`,
    ogImage: `${SITE_URL}/images/og/mapped.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedMapped());
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
        recordSolvedMapped(active.slug);
        setSolved(loadSolvedMapped());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const result = outcome(setup);
  const laid = useMemo(() => strip(setup), [setup]);

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
              · {CASES.length} accesses through a mapping
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Three boundaries, three outcomes.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten mappings, one access each. Work out whether the byte comes back, comes back as
              zero, or kills the process, and which of the two signals does it.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              There are two edges and they are rarely in the same place. Past the end of the mapping
              is <code>SIGSEGV</code>, because nothing is there. Inside the mapping but past the
              file&apos;s last page is <code>SIGBUS</code>, because something is there and has
              nothing behind it. And the stretch between the end of the file and the end of the page
              it stops in reads as zero and takes stores that go nowhere.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="mapped-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`mapped-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {asLength(item.setup.fileBytes)} file, {asLength(item.setup.mappedBytes)} asked
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
              data-testid="mapped-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="mapped-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asMapped(setup)
  .map((line) => `${line.name.padEnd(18)} ${line.value.padStart(24)}  # ${line.unit}`)
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
                    data-testid={`mapped-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="mapped-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The {setup.writing ? "store" : "read"} at byte{" "}
                  {setup.at} is in page {Math.floor(setup.at / setup.pageBytes)}, the mapping covers{" "}
                  {covers(setup)} bytes and the file backs {backed(setup)} of them, so{" "}
                  {asOutcome(result)}
                  {result === "ok"
                    ? setup.writing
                      ? persists(setup)
                        ? " and the byte is in the file."
                        : " and the byte is thrown away."
                      : ` and it reads ${reads(setup)}.`
                    : "."}
                </p>

                {/* ── the address space, one page at a time ── */}
                <div data-testid="mapped-strip">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      {laid.withFile} of {laid.mapped} mapped {laid.mapped === 1 ? "page" : "pages"} backed by the file
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      last safe byte {lastSafe(setup)}
                    </span>
                  </div>
                  <div className="mt-2.5 flex gap-1">
                    {laid.pages.map((page) => (
                      <span key={page.page} className="min-w-0 flex-1">
                        <span
                          className={`block h-9 rounded-[3px] border ${
                            page.state === "backed"
                              ? "border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.22)]"
                              : page.state === "nopage"
                                ? "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.16)]"
                                : "border-dashed border-[hsl(var(--brand-iron))] bg-transparent"
                          }`}
                        >
                          {page.here ? (
                            <span className="flex h-full items-center justify-center font-mono-tight text-[0.625rem] text-[hsl(var(--brand-bone))]">
                              byte {setup.at}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-1 block truncate font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                          {page.from}
                          {page.endsHere ? ` · eof ${setup.resizedTo}` : ""}
                        </span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-2.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    Filled pages are backed by the file, outlined pages are inside the mapping with
                    nothing behind them, and the dashed one past the end is not mapped at all.{" "}
                    {result === "segv"
                      ? "The access is in the dashed page, which no mapping covers, so it is SIGSEGV and the file's size has nothing to do with it."
                      : result === "sigbus"
                        ? "The access is inside the mapping and past the file's last page, which is the only thing SIGBUS means here."
                        : inTheTail(setup)
                          ? "The access is in the file's last page but past the end of the file, which is real memory, reads as zero and keeps nothing."
                          : "The access is inside the file, which is the one arrangement where a mapping behaves the way it looks like it behaves."}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="mapped-ledger"
                  >
{`what was asked for

  file at mmap time           ${String(setup.fileBytes).padEnd(12)} bytes
  length passed to mmap       ${String(setup.mappedBytes).padEnd(12)} bytes
  flags                       ${asKind(setup.kind).padEnd(12)} ${setup.kind === "shared" ? "stores are meant to reach the file" : "stores stay in this process"}
  page size                   ${String(setup.pageBytes).padEnd(12)} bytes

where the two edges landed

  the mapping covers          ${String(covers(setup)).padEnd(12)} bytes, ${laid.mapped} whole ${laid.mapped === 1 ? "page" : "pages"}
  the file now                ${String(setup.resizedTo).padEnd(12)} bytes${resized(setup) ? `, resized from ${setup.fileBytes} under the mapping` : ", unchanged since it was mapped"}
  backed by the file          ${String(backed(setup)).padEnd(12)} bytes, ${laid.withFile} whole ${laid.withFile === 1 ? "page" : "pages"}
  last byte with no signal    ${String(lastSafe(setup)).padEnd(12)}
  first byte with no mapping  ${String(covers(setup)).padEnd(12)}

the access

  ${setup.writing ? "store at" : "read at"}                    ${String(setup.at).padEnd(12)} page ${Math.floor(setup.at / setup.pageBytes)}
  outcome                     ${asOutcome(result)}
  what comes back             ${reads(setup)}
  in the file afterwards      ${setup.writing ? (persists(setup) ? "yes" : "no, and nothing said so") : "not a store"}`}
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
                  data-testid="mapped-fix"
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
                  data-testid="mapped-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above. Round the length up to a whole page and you
                have the end of the mapping; round the file&apos;s current size up to a whole page
                and you have the end of what is behind it. Then ask which side of each the access
                falls on, in that order, because the mapping is checked first and neither flags nor
                a page you have already touched moves either edge. The strip is drawn once you have
                committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="mapped-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} mappings`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, kernel 6.18.44 on ext4 with 4096 byte
            pages, measured by mapping files in C, installing handlers for both signals and touching
            one byte at a time. A 100 byte file mapped with a length of 8192 reads byte 99, byte 100
            and byte 4095 without a signal, gives zero for everything past byte 99, and takes SIGBUS
            at byte 4096. A 16384 byte file mapped with a length of 100 reads byte 4095 and takes
            SIGSEGV at byte 4096, measured inside an eight page PROT_NONE reservation so that a
            neighboring mapping could not occupy the address: without the reservation the first
            attempt reported the access as fine, which is the sort of thing that makes this
            difficult to measure. A store at byte 200 of the 100 byte file completes, survives an
            msync, leaves the file 100 bytes long, and reads back as zero once the file is grown, so
            it was thrown away. Growing the file from 100 to 4106 under the live mapping makes byte
            4096 readable with no call by the mapping process, and shrinking it back makes that byte
            SIGBUS again, including on a MAP_PRIVATE mapping whose process had already written to
            that page and therefore owned a private copy of it. CI recomputes every answer by laying
            the address space out one page at a time and reading the outcome off the page the access
            lands in, across 12320 combinations of page size, file size, length, resize and offset.
            Network filesystems, huge pages, MAP_POPULATE and mlock, and what a SIGBUS handler can
            usefully do to recover are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other way a file can be shorter than it looks,{" "}
            <Link
              href="/sparse"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              a gigabyte in one block
            </Link>{" "}
            is where <code>ls</code> and <code>du</code> disagree, and{" "}
            <Link
              href="/pss"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              four processes and 258 MiB
            </Link>{" "}
            is what happens when you add the same shared pages up more than once.
          </p>

          <ReadAboutThis href="/mapped" />

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
