/**
 * The file drawn as what it is: a strip of blocks, some of which are not there.
 *
 * Everything on this surface is the gap between a length and an allocation, so
 * the drawing is the strip twice: as the file sits, and as the copy left it.
 * A hole is drawn empty, a block of zeros is drawn faintly, a block holding
 * something is drawn solid. The runs are proportional, so a gigabyte of hole
 * with one block on the end reads as one thin mark at the far right, which is
 * what it is.
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
  allocatedKib,
  apparentKib,
  asSize,
  asSparse,
  asTool,
  blocksFor,
  built,
  copied,
  copiedKib,
  correctOption,
  fillsHoles,
  fits,
  huntsZeros,
  loadSolvedSparse,
  recordSolvedSparse,
  stillSparse,
  type Case,
  type File,
} from "@/lib/sparse/index";

const SITE_URL = "https://maxdoubin.com";

function severity(item: Case): StageAccent {
  if (!fits(item.setup)) return "danger";
  return copiedKib(item.setup) > allocatedKib(item.setup) ? "amber" : "signal";
}

/** The strip: one segment per run, as wide as the run is long. */
function Strip({ file, blocks, label }: { file: File; blocks: number; label: string }) {
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span className="w-[74px] shrink-0 text-right font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
        {label}
      </span>
      <span className="flex h-4 min-w-0 flex-1 overflow-hidden rounded-[2px] border border-[hsl(var(--brand-iron))]">
        {blocks === 0 ? (
          <span className="block h-full w-full bg-[hsl(var(--brand-obsidian))]" />
        ) : (
          file.runs.map((run) => (
            <span
              key={`${run.from}-${run.state}`}
              className={`block h-full ${
                run.state === "hole"
                  ? "bg-[hsl(var(--brand-obsidian))]"
                  : run.state === "zeros"
                    ? "bg-[hsl(var(--brand-cyan)/0.35)]"
                    : "bg-[hsl(var(--brand-signal)/0.75)]"
              }`}
              style={{ width: `${Math.max(0.4, ((run.to - run.from) / blocks) * 100)}%` }}
            />
          ))
        )}
      </span>
    </div>
  );
}

export function CinematicSparse() {
  useSEO({
    title: "A Gigabyte In One Block: Sparse Files, du And ls | Max Doubin",
    description:
      "A file can be a gigabyte long and occupy four kilobytes, because a hole is a range nobody wrote and the filesystem allocates nothing for it. ls reports the length and du reports the blocks, and which tool you copy it with decides whether the copy is four kilobytes or a gigabyte.",
    canonical: `${SITE_URL}/sparse`,
    ogImage: `${SITE_URL}/images/og/sparse.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedSparse());
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
        recordSolvedSparse(active.slug);
        setSolved(loadSolvedSparse());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const before = built(setup);
  const after = copied(setup);
  const blocks = blocksFor(before.apparentBytes, setup.blockBytes);
  const apparent = apparentKib(setup);
  const allocated = allocatedKib(setup);
  const ended = copiedKib(setup);

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
              · {CASES.length} files, two numbers each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              A gigabyte in one block.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten files, one question each. Work out what <code>ls</code> says, what <code>du</code>{" "}
              says, and what happens to the difference when somebody copies the thing.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              A hole is a range nobody wrote. It reads back as zeros and costs nothing, so a file
              can be as long as you like and occupy one block. What it cannot survive is a tool that
              reads it, gets those zeros, and writes them out, which is most of them.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="sparse-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`sparse-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {asSize(apparentKib(item.setup))} long,{" "}
                      {item.setup.copiedWith === "none" ? "not copied" : asTool(item.setup.copiedWith, item.setup.ddBytes).split(",")[0]}
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
              data-testid="sparse-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="sparse-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asSparse(setup)
  .map((line) => `${line.name.padEnd(20)} ${line.value.padStart(34)}  # ${line.unit}`)
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
                    data-testid={`sparse-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="sparse-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The file is {asSize(apparent)} long and holds{" "}
                  {asSize(allocated)}.{" "}
                  {setup.copiedWith === "none"
                    ? "Nothing has copied it."
                    : `After ${asTool(setup.copiedWith, setup.ddBytes)} the copy holds ${asSize(ended)}, and it ${fits(setup) ? "fits" : "does not fit"} in the ${asSize(setup.freeKib)} free.`}
                </p>

                {/* ── the file as a strip of blocks ── */}
                <div data-testid="sparse-strip">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      {blocks} blocks of {setup.blockBytes} bytes, end to end
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {asSize(allocated)} of {asSize(apparent)} allocated
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <Strip file={before} blocks={blocks} label="as written" />
                    {setup.copiedWith !== "none" ? (
                      <Strip file={after} blocks={blocks} label="the copy" />
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-4 rounded-[1px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]" />
                      hole, costs nothing
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-4 rounded-[1px] bg-[hsl(var(--brand-cyan)/0.35)]" />
                      allocated, reads as zeros
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-4 rounded-[1px] bg-[hsl(var(--brand-signal)/0.75)]" />
                      allocated, holds something
                    </span>
                  </div>
                  <p className="mt-2.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {allocated < apparent
                      ? `${asSize(apparent - allocated)} of this file was never written, so the filesystem never gave it a block. ls adds it to the length anyway, because the length is the offset of the last byte and not a count of what is there.`
                      : "Every block of this file is allocated, so the two numbers agree and there is nothing here for a copy to lose."}
                    {fillsHoles(setup.copiedWith)
                      ? ` ${asTool(setup.copiedWith, setup.ddBytes)} reads a hole, gets the zeros a hole returns, and writes them, which is how ${asSize(allocated)} becomes ${asSize(ended)}.`
                      : ""}
                    {huntsZeros(setup.copiedWith)
                      ? ` ${asTool(setup.copiedWith, setup.ddBytes)} is one of the two that look at the contents rather than at the map, so it can give back blocks that were never a hole.`
                      : ""}
                    {setup.copiedWith === "cp" || setup.copiedWith === "tar-sparse"
                      ? " This tool reproduces the map it was given, so whatever the source had, the copy has."
                      : ""}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="sparse-ledger"
                  >
{`the two numbers

  ls -l              ${String(before.apparentBytes).padEnd(14)} bytes, the last byte written plus one
  du -k              ${String(allocated).padEnd(14)} KiB, ${allocated / (setup.blockBytes / 1024)} block${allocated / (setup.blockBytes / 1024) === 1 ? "" : "s"} of ${setup.blockBytes} bytes
  never written      ${asSize(apparent - allocated).padEnd(14)} ${apparent > allocated ? "which ls counts and du does not" : "nothing; the file is solid"}

the copy

  tool               ${asTool(setup.copiedWith, setup.ddBytes)}
  du -k afterwards   ${String(ended).padEnd(14)} KiB${ended === allocated ? "   <- unchanged" : ended > allocated ? `   <- ${asSize(ended - allocated)} more than the original` : `   <- ${asSize(allocated - ended)} less than the original`}
  still has holes    ${stillSparse(setup) ? "yes" : "no "}
  free where it goes ${String(setup.freeKib).padEnd(14)} KiB
  it fits            ${fits(setup) ? "yes" : "no, and this is where the disk fills up"}`}
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
                  data-testid="sparse-fix"
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
                  data-testid="sparse-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: what was done to the file, in order, the block
                size, and what copied it afterwards. Work in blocks rather than bytes, because a
                block is what gets allocated and touching one byte of it costs the whole thing. Then
                ask whether the tool reproduces the map, reads the contents, or neither. The file is
                drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="sparse-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} files`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, kernel 6.18.44, on ext4 with a 4096
            byte block, measured by making files with dd, truncate and fallocate and reading both
            numbers back with stat and du after a sync. truncate -s 1G gave an apparent 1073741824
            and du 0K. One byte at offset 0 gave 4K, one byte at 4095 gave 4K, one byte at 4096 gave
            4K, and one byte at each of 0 and 4096 gave 8K: what costs a block is touching it. Ten
            mebibytes of real zeros gave 10240K, and so did a fallocate of the same length, because
            a hole is made by not writing rather than by writing nothing. Punching bytes 100 to 8100
            of a four block file freed nothing, because no block lies entirely inside that range,
            while punching 4096 to 12288 freed two. A punch never changes the length: punching 0 to
            100000 of a one byte file left it one byte long and freed its only block. Truncating
            32768 down to 8192 went from 32K to 8K and growing it back to a million bytes left it at
            8K. The same 1 GiB file holding one byte came out of cp at 4K, out of tar cSf at 4K, and
            out of cp --sparse=never, cat, plain tar and plain dd at 1048580K. dd conv=sparse gave
            4K, 64K, 1024K and 8192K at buffers of 4096, 65536, 1M and 8M, because its holes are one
            buffer wide. Sixty four mebibytes of real zeros came out of cp at 65536K and out of cp
            --sparse=always at 0K. CI keeps one entry per block and replays the operations over it
            rather than doing the same run arithmetic twice, across 23328 sequences. The extent tree
            is not modeled: four extents fit in an ext4 inode and the fifth costs a 4 KiB index
            block, which is the four kilobytes over a round gigabyte in the figures above.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other way these two numbers come apart,{" "}
            <Link
              href="/space"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              no space left on device
            </Link>{" "}
            is six filesystems and six different things to do about it, and{" "}
            <Link
              href="/pss"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              four processes, one copy
            </Link>{" "}
            is the same shape of mistake made about memory.
          </p>

          <ReadAboutThis href="/sparse" />

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
