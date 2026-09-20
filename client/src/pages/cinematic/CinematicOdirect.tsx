/**
 * The page the buffer sits in, with the transfer drawn across it.
 *
 * Two of the three requirements are arithmetic a reader can do in their head.
 * The third is not, so the drawing is the one that needs drawing: the page,
 * where in it the buffer starts, how far the transfer reaches, and whether it
 * runs off the end. A reader who can see the transfer leaving the page has
 * the answer to the only hard case here.
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
  accepted,
  asAddress,
  asBytes,
  asOdirect,
  blame,
  blksizeMisleads,
  correctOption,
  direct,
  insideOnePage,
  largest,
  lengthOk,
  loadSolvedOdirect,
  memAligned,
  offsetOk,
  outcome,
  recordSolvedOdirect,
  violations,
  type Case,
} from "@/lib/odirect/index";

const SITE_URL = "https://maxdoubin.com";

function severity(item: Case): StageAccent {
  if (accepted(item.setup)) return "signal";
  /* The one that fails only above a size is the one worth flagging loudest. */
  return memAligned(item.setup) ? "amber" : "danger";
}

export function CinematicOdirect() {
  useSEO({
    title: "Three Alignments And One Errno: O_DIRECT | Max Doubin",
    description:
      "O_DIRECT wants the file offset, the transfer length and the buffer address aligned, and every violation is the same EINVAL. A misaligned buffer is tolerated while the transfer stays inside one page, so the same code writes 2 KiB and refuses 4 KiB. Ten measured writes.",
    canonical: `${SITE_URL}/odirect`,
    ogImage: `${SITE_URL}/images/og/odirect.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedOdirect());
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
        recordSolvedOdirect(active.slug);
        setSolved(loadSolvedOdirect());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  /* The page, with the transfer laid across it, capped so it stays drawable. */
  const reach = Math.min(setup.memOffset + setup.length, setup.pageBytes * 2);
  const scale = (value: number) => Math.min(100, (value / (setup.pageBytes * 1.5)) * 100);
  const wanted = violations(setup);

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
              · {CASES.length} writes, one question each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Three alignments, one errno.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten writes through <code>O_DIRECT</code>, one question each. Work out whether the
              kernel takes it, and which of the three requirements is the one that stopped it.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The file offset and the transfer length must be multiples of the device&apos;s block
              size. The buffer address must be too, except that a misaligned buffer is tolerated
              while the whole transfer stays inside the page it started in. Every violation
              returns <code>EINVAL</code>, and nothing anywhere says which one it was.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="odirect-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`odirect-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.length} bytes at +{item.setup.memOffset}
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
              data-testid="odirect-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="odirect-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asOdirect(setup)
  .map((line) => `${line.name.padEnd(14)} ${line.value.padStart(20)}  # ${line.unit}`)
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
                    data-testid={`odirect-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="odirect-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} {outcome(setup)}.{" "}
                  {accepted(setup)
                    ? "All three requirements are met."
                    : `What is wrong is ${blame(setup)}, and the errno says none of that.`}
                </p>

                {/* ── the page, and the transfer across it ── */}
                <div data-testid="odirect-page">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      the page the buffer starts in, {setup.pageBytes} bytes
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      the transfer reaches byte {setup.memOffset + setup.length}
                    </span>
                  </div>
                  <div className="relative mt-2.5 h-7 w-full rounded-[3px] bg-[hsl(var(--brand-iron)/0.3)]">
                    {/* the page itself */}
                    <span
                      className="absolute top-0 h-7 rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))]"
                      style={{ left: 0, width: `${scale(setup.pageBytes)}%` }}
                    />
                    {/* the transfer */}
                    <span
                      className={`absolute top-1.5 h-4 rounded-[2px] ${
                        memAligned(setup) || insideOnePage(setup)
                          ? "bg-[hsl(var(--brand-signal)/0.7)]"
                          : "bg-[hsl(var(--brand-danger)/0.6)]"
                      }`}
                      style={{
                        left: `${scale(setup.memOffset)}%`,
                        width: `${Math.max(0.6, scale(reach) - scale(setup.memOffset))}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                    <span>buffer {asAddress(setup)}</span>
                    <span>the page ends at {setup.pageBytes}</span>
                    <span>
                      largest length from here {asBytes(largest(setup))}
                    </span>
                  </div>
                  <p className="mt-2.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {memAligned(setup)
                      ? `The buffer starts on a block boundary, so the page does not bound it at all and the transfer may run as far as it likes. The drawing stops at one and a half pages; the write does not.`
                      : insideOnePage(setup)
                        ? `The buffer is not on a block boundary, so the transfer has to finish inside the page, and it does, with ${setup.pageBytes - setup.memOffset - setup.length} bytes of the page to spare.`
                        : `The buffer is not on a block boundary and the transfer runs ${setup.memOffset + setup.length - setup.pageBytes} bytes past the end of the page, which is the one thing a misaligned buffer may not do.`}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="odirect-ledger"
                  >
{`the three requirements

  the offset      ${String(setup.at).padEnd(10)} over ${setup.blockAlign} leaves ${String(setup.at % setup.blockAlign).padEnd(6)} ${offsetOk(setup) ? "ok" : "NOT ALIGNED"}
  the length      ${String(setup.length).padEnd(10)} over ${setup.blockAlign} leaves ${String(setup.length % setup.blockAlign).padEnd(6)} ${lengthOk(setup) ? "ok" : "NOT ALIGNED"}
  the address     ${`+${setup.memOffset}`.padEnd(10)} over ${setup.blockAlign} leaves ${String(setup.memOffset % setup.blockAlign).padEnd(6)} ${memAligned(setup) ? "ok" : insideOnePage(setup) ? "not aligned, but the transfer stays in the page" : "NOT ALIGNED, and the transfer leaves the page"}

what the figures are

  the block size  ${String(setup.blockAlign).padEnd(10)} what statx calls stx_dio_offset_align
  st_blksize      ${String(setup.reportedBlksize).padEnd(10)} ${blksizeMisleads(setup) ? "not the alignment, and using it hides the rule" : "the same as the alignment, which is not true everywhere"}
  the page        ${String(setup.pageBytes).padEnd(10)} what a misaligned buffer may not cross

the call

  returns         ${outcome(setup)}
  requirements wrong  ${wanted.length === 0 ? "none" : `${wanted.length}, ${blame(setup)}`}
  what errno says     ${accepted(setup) ? "nothing, it succeeded" : "EINVAL, the same as all three"}
  bypasses the cache  ${direct(setup) ? "yes, mincore finds none of the file's pages resident" : "it never happened"}`}
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
                  data-testid="odirect-fix"
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
                  data-testid="odirect-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above. Take the offset and the length over the block
                size first, because those are the easy two. Then look at the buffer: if it starts
                on a block boundary you are done, and if it does not, the only question left is
                whether the transfer finishes before the end of the page. The page is drawn once
                you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="odirect-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} writes`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, Linux 6.18.44, ext4 on a device whose
            logical block size is 512, with 4 kB pages, measured by pwriting through a descriptor
            opened O_DIRECT at a grid of offsets, lengths and buffer misalignments. statx reports
            stx_dio_mem_align and stx_dio_offset_align both as 512 and st_blksize separately as
            4096, which is the figure people reach for and is four times too big, so using it works
            and hides the rule. Lengths of 1, 100, 255, 256, 511, 513, 4095 and 4097 return EINVAL
            and 512, 1024 and 4096 write; the offsets behave identically. A misaligned buffer is
            tolerated while the whole transfer stays inside its page, and the largest length from a
            buffer N bytes into a page is 4096 minus N rounded down to a block: 3584 from +1, +7,
            +64, +100 and +511, then 3072 from +513 and +1000, 2048 from +2000, 1024 from +3000,
            and nothing at all from +4000. At the boundary, from +1, a length of 3584 writes and
            4096 does not. An accepted write really is direct: mincore finds none of the file's
            pages resident afterwards, against sixteen for the same write without the flag. Three
            measurement mistakes were made getting here and are recorded in the notes: reading
            errno in the same argument list as the call, which printed success for every failure;
            testing "misaligned" offsets that were all multiples of 512; and testing the one page
            rule with those same offsets. CI recomputes every answer by cutting the transfer into
            the device's blocks and asking of each piece whether it could be handed over, across
            3640 combinations. A device with 4096 byte blocks, any filesystem other than ext4,
            reads rather than writes, the end of the file, and io_uring's registered buffers are
            not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what O_DIRECT is usually reached for,{" "}
            <Link
              href="/pagecache"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the cache you cannot drop
            </Link>{" "}
            is what the page cache does with your writes, and{" "}
            <Link
              href="/writeback"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              not written down
            </Link>{" "}
            is how long a buffered write can sit there.
          </p>

          <ReadAboutThis href="/odirect" />

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
