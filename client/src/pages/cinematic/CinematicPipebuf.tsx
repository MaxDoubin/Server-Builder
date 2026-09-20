/**
 * One capacity of pipe, with the records tiled across it.
 *
 * The mechanism is entirely visible once you draw it this way: lay the records
 * end to end inside one capacity and look at what happens at the right hand
 * edge. If the records divide the capacity, the last one ends exactly on the
 * boundary and nobody is ever interrupted. If they do not, one record straddles
 * it, and that record is the one that comes out with somebody else's bytes in
 * the middle.
 *
 * The straddling block is drawn in the danger color and clipped at the edge,
 * because that is literally what happens to it.
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
  PIPE_BUF,
  PIPE_MAX_SIZE,
  alignsWithCapacity,
  asSetup,
  atRisk,
  because,
  correctOption,
  granted,
  guaranteed,
  humanSize,
  loadSolvedPipebuf,
  recordSolvedPipebuf,
  recordsAtRisk,
  refused,
  tears,
  tearsHere,
  uniform,
  type Case,
} from "@/lib/pipebuf/index";

const SITE_URL = "https://maxdoubin.com";

function severity(item: Case): StageAccent {
  if (tearsHere(item.setup)) return "danger";
  return because(item.setup).includes("luck") ? "amber" : "signal";
}

export function CinematicPipebuf() {
  useSEO({
    title: "Two Writers, One Line: PIPE_BUF and Interleaved Writes | Max Doubin",
    description:
      "A write of PIPE_BUF bytes or fewer is never interleaved, measured at 200 of 200 whole even beside writers tearing themselves apart. Above it there is no guarantee: four writers at 8192 tore nothing because 8192 divides the pipe capacity, and adding one 5000 byte writer made all four tear.",
    canonical: `${SITE_URL}/pipebuf`,
    ogImage: `${SITE_URL}/images/og/pipebuf.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedPipebuf());
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
        recordSolvedPipebuf(active.slug);
        setSolved(loadSolvedPipebuf());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const mine = setup.writers[setup.underTest];

  /* Tile one capacity with records of the size under test and see what lands
     on the boundary. Capped so a 512 byte record on a 64 KiB pipe does not
     try to draw 128 blocks. */
  const whole = Math.floor(setup.capacity / mine);
  const remainder = setup.capacity - whole * mine;
  const drawn = Math.min(whole, 24);
  const truncated = whole > drawn;
  const blocks = Array.from({ length: drawn }, (_, i) => i);

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
              · {CASES.length} pipes, one writer in question each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Two writers, one line.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten pipes, one question each. Work out whether this writer's records can come out with
              somebody else's inside them, and whether what is keeping them whole is a guarantee, a
              measurement, or arithmetic that anybody can undo.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              A write of <code>PIPE_BUF</code> bytes or fewer, which is {PIPE_BUF} on Linux, is never
              interleaved with another. Above that there is no promise at all, and what actually
              happens depends on what else is writing to the same pipe. That is why the mangled log
              line shows up the week somebody adds a second logger, in a service nobody deployed.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="pipebuf-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`pipebuf-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.target} · {item.setup.writers[item.setup.underTest]} B of{" "}
                      {item.setup.writers.length}
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
              data-testid="pipebuf-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="pipebuf-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asSetup(setup)
  .map((line) => `${line.name.padEnd(21)} ${line.value.padStart(20)}  # ${line.unit}`)
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
                    data-testid={`pipebuf-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="pipebuf-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {tearsHere(setup)
                    ? `This writer's records can be torn: ${because(setup)}. All ${recordsAtRisk(setup)} of them are exposed.`
                    : `This writer's records come out whole, and the reason is ${because(setup)}.`}{" "}
                  {setup.target === "pipe"
                    ? `${atRisk(setup)} of the ${setup.writers.length} writers on this pipe can be torn.`
                    : ""}
                </p>

                {/* ── one capacity of pipe, tiled with records ── */}
                {setup.target === "pipe" ? (
                  <div data-testid="pipebuf-tiles">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                      <span className="text-[hsl(var(--brand-bone-dim))]">
                        one capacity of pipe, tiled with {mine} byte records
                      </span>
                      <span className="text-[hsl(var(--brand-bone))]">
                        {setup.capacity} / {mine} = {(setup.capacity / mine).toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-2 flex h-6 w-full overflow-hidden rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                      {blocks.map((i) => (
                        <span
                          key={i}
                          style={{ width: `${(mine / setup.capacity) * 100}%` }}
                          className="block border-r border-[hsl(var(--brand-obsidian))] bg-[hsl(var(--brand-signal)/0.55)]"
                        />
                      ))}
                      {remainder > 0 ? (
                        <span
                          style={{ width: `${(remainder / setup.capacity) * 100}%` }}
                          className="block bg-[hsl(var(--brand-danger)/0.65)]"
                        />
                      ) : null}
                    </div>
                    <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                      {truncated ? `Only the first ${drawn} of ${whole} records are drawn. ` : ""}
                      {remainder === 0
                        ? `${whole} of these records fit the capacity exactly.`
                        : `${whole} fit and ${remainder} bytes are left over, so the next record straddles the end of the pipe. That red sliver is the record that gets split, and whoever writes next lands inside it.`}
                      {guaranteed(mine)
                        ? " None of which matters here: at or under PIPE_BUF the kernel refuses to split a write at all, and waits for the boundary instead of tiling into it."
                        : remainder === 0 && !uniform(setup)
                          ? ` But the other writers are not all this size, so the pipe does not refill on these boundaries, and the tiling above is only what this writer would do alone. That is why it tears anyway.`
                          : remainder === 0
                            ? " Every writer is this size, so the pipe always fills on a record boundary and nobody is interrupted part way through one."
                            : ""}
                    </p>
                  </div>
                ) : null}

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="pipebuf-ledger"
                  >
{`the three questions, in order

  at or under PIPE_BUF?       ${guaranteed(mine) ? "yes" : "no "}   ${mine} against ${PIPE_BUF}${guaranteed(mine) ? "   <- guaranteed, and nothing below matters" : ""}
  writing to a file?          ${setup.target === "file" ? "yes" : "no "}   ${setup.target === "file" ? "the inode lock covered the whole write here" : "a pipe has no such lock"}
  every writer the same size? ${uniform(setup) ? "yes" : "no "}   ${setup.writers.join(", ")}
  and does it divide the pipe? ${setup.target === "pipe" ? (alignsWithCapacity(setup) ? "yes" : "no ") : "n/a"}  ${
  setup.target !== "pipe"
    ? "alignment is a property of a pipe"
    : alignsWithCapacity(setup)
      ? `${setup.capacity} / ${mine} = ${(setup.capacity / mine).toFixed(2)}`
      : uniform(setup)
        ? `${setup.capacity} / ${mine} = ${(setup.capacity / mine).toFixed(2)}, which is not a whole number`
        : `it would at ${(setup.capacity / mine).toFixed(2)}, but the writers are not all one size, so nothing aligns`
}

  this writer                 ${tearsHere(setup) ? "CAN BE TORN" : "comes out whole"}
  because                     ${because(setup)}
  records exposed             ${recordsAtRisk(setup)} of ${setup.records}
${setup.target === "pipe" ? `  writers at risk on this pipe ${atRisk(setup)} of ${setup.writers.length}` : ""}

the pipe itself

  asked for                   ${setup.requested}
  granted                     ${refused(setup.requested) ? `refused, EPERM: over fs.pipe-max-size, which is ${PIPE_MAX_SIZE}` : `${granted(setup.requested)}${granted(setup.requested) === setup.requested ? "" : "   <- rounded up to a power of two"}`}
  the pipe is                 ${setup.capacity}${refused(setup.requested) ? "   unchanged, because the call failed" : ""}

each writer

${setup.writers
  .map(
    (size, i) =>
      `  ${`writer ${i}${i === setup.underTest ? " (this one)" : ""}`.padEnd(22)}${String(size).padStart(7)} B   ${
        tears(setup, i) ? "can be torn" : "whole"
      }`,
  )
  .join("\n")}`}
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
                  data-testid="pipebuf-fix"
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
                  data-testid="pipebuf-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: where the writers are writing, what each of
                them sends, and how the pipe's capacity divides by the record in question. Ask
                whether this writer is under PIPE_BUF first, because that settles it on its own, and
                only then whether anything else is holding it together. The pipe is drawn once you
                have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="pipebuf-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} pipes`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, kernel 6.18.44, measured by forking four
            writers onto one pipe, giving each its own repeated character, and counting maximal runs
            of that character in the raw bytes. The detector took three attempts and the first two
            both appeared to show the POSIX guarantee being violated: counting fixed size windows
            breaks as soon as the record sizes differ, and splitting on newlines is worse, because a
            large writer's torn record swallows the newline around a small writer's intact one and
            makes it read as broken. Counting runs of one character is immune to both. With four
            writers of 200 records each on a 65536 byte pipe, every record size that divides the
            capacity tore nothing in three runs out of three, 4096, 8192, 16384 and 32768; and every
            size that does not tore between 70 and 354 of 800, 4097, 5000, 8193, 12288 and 20000.
            The guarantee held everywhere it was tested: three writers at 4096 beside one at 5000,
            two at 4096 beside two at 20000, and one at 512 beside three at 20000 all produced 200
            of 200 whole records for the small writers, every run. Four writers at 8192 tore nothing
            and the same three of them with one 5000 byte writer added lost 6, 6 and 14 records,
            with no change to their own code. On a regular file opened O_APPEND nothing tore at any
            size tried, including 200000 byte records beside 512 byte ones, because Linux holds the
            inode lock for the length of a buffered write; that is a measurement of this kernel and
            this filesystem rather than a promise, and it is not true over NFS. F_SETPIPE_SZ rounds
            up to a power of two, so 1 gives 4096, 4097 gives 8192, 40000 gives 65536 and 65537
            gives 131072, and 2097152 is refused with EPERM against a pipe-max-size of 1048576. CI
            fills a pipe record by record rather than asking whether a number is under 4096, and
            drives the writers from a seeded generator rather than a rotation, because a strict
            rotation makes three of four writers look safe. A reader slower than the writers, writev,
            O_NONBLOCK partial writes and NFS are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what happens to the writes that do fit,{" "}
            <Link
              href="/writeback"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              not written down
            </Link>{" "}
            is how long they sit in memory before the disk sees them, and{" "}
            <Link
              href="/nagle"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              eight bytes, forty four milliseconds
            </Link>{" "}
            is the other place where how many times you call write decides everything.
          </p>

          <ReadAboutThis href="/pipebuf" />

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
