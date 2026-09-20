/**
 * Two bars, and the gap between them is what nothing reported.
 *
 * Everything on this surface is the difference between what went into write()
 * and what is in the file, so the drawing is those two lengths on one scale
 * with the shortfall hatched in behind. Underneath, where the offsets live,
 * because that is the thing that actually differs between the arrangements.
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
  alwaysAtTheEnd,
  asAppend,
  asBytes,
  asHow,
  correctOption,
  honorsOffset,
  loadSolvedAppend,
  lost,
  perWriter,
  recordSolvedAppend,
  safe,
  sharesOffset,
  size,
  survived,
  written,
  type Case,
} from "@/lib/append/index";

const SITE_URL = "https://maxdoubin.com";

function severity(item: Case): StageAccent {
  if (safe(item.setup)) return "signal";
  return lost(item.setup) >= written(item.setup) / 2 ? "danger" : "amber";
}

/** One labeled bar, against the largest number on the chart. */
function Bar({ label, value, of, tone }: { label: string; value: number; of: number; tone: "in" | "file" | "lost" }) {
  const width = of > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / of) * 100) : 0;
  const color =
    tone === "in"
      ? "bg-[hsl(var(--brand-cyan)/0.55)]"
      : tone === "file"
        ? "bg-[hsl(var(--brand-signal)/0.7)]"
        : "bg-[hsl(var(--brand-danger)/0.5)]";
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span className="w-[112px] shrink-0 text-right font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
        {label}
      </span>
      <span className="h-3.5 min-w-0 flex-1 rounded-[2px] bg-[hsl(var(--brand-iron)/0.4)]">
        <span className={`block h-3.5 rounded-[2px] ${color}`} style={{ width: `${width}%` }} />
      </span>
      <span className="w-[92px] shrink-0 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-bone-dim))]">
        {value} bytes
      </span>
    </div>
  );
}

export function CinematicAppend() {
  useSEO({
    title: "Two Writers, One Offset: O_APPEND And Lost Writes | Max Doubin",
    description:
      "Four processes hand a log 51200 bytes and the file comes out 12800 long, with no error anywhere. A file offset belongs to an open file description, so two open calls on one path make two of them, and O_APPEND is the only thing that makes the seek and the write one operation.",
    canonical: `${SITE_URL}/append`,
    ogImage: `${SITE_URL}/images/og/append.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedAppend());
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
        recordSolvedAppend(active.slug);
        setSolved(loadSolvedAppend());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const wrote = written(setup);
  const onDisk = size(setup);
  const gone = lost(setup);

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
              · {CASES.length} sets of writers, one file each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Two writers, one offset.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten logs, one question each. Work out how much of what the writers handed to{" "}
              <code>write()</code> is actually in the file afterwards.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              A file offset does not belong to a file, and it does not belong to a process. It
              belongs to an open file description, which is what one <code>open()</code> call
              creates. Two calls on the same path make two offsets that know nothing about each
              other, and every write returns the full count either way.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="append-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`append-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.writers} writers, {asBytes(written(item.setup))} in
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
              data-testid="append-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="append-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asAppend(setup)
  .map((line) => `${line.name.padEnd(18)} ${line.value.padStart(44)}  # ${line.unit}`)
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
                    data-testid={`append-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="append-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} {setup.writers} writers handed over {wrote} bytes and
                  the file is {onDisk}.{" "}
                  {safe(setup)
                    ? "Nothing was lost."
                    : `${gone} bytes went into write() and are not in the file, and nothing anywhere returned an error.`}
                </p>

                {/* ── what went in against what is there ── */}
                <div data-testid="append-bars">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      {setup.writers} writers, {setup.records} records of {setup.bytes} bytes each
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {survived(setup)} of {setup.writers * setup.records} records survive
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <Bar label="handed to write" value={wrote} of={wrote} tone="in" />
                    <Bar label="in the file" value={onDisk} of={wrote} tone="file" />
                    {gone > 0 ? <Bar label="lost" value={gone} of={wrote} tone="lost" /> : null}
                  </div>
                  <p className="mt-2.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {alwaysAtTheEnd(setup.how)
                      ? "O_APPEND makes the seek and the write one operation the kernel does under the inode lock, so there is no moment between them for another writer to use."
                      : sharesOffset(setup.how)
                        ? "One open call made one open file description, and the offset lives there, so every write advances it for all of them."
                        : setup.how === "pwrite" && setup.tiled
                          ? "No offset is shared and none is needed: the writers agreed in advance which bytes belong to whom."
                          : `Each of the ${setup.writers} writers walked its own offset from zero, so all of them aimed at the same ${setup.records} places and the file is as long as the furthest any one of them reached, which is one writer's worth.`}
                    {honorsOffset(setup)
                      ? " pwrite here does put the bytes where it is told, which is the whole of why the layout has to be right."
                      : ""}
                    {setup.how === "append-pwrite"
                      ? " The offset each pwrite names is discarded: on Linux, pwrite on a descriptor opened O_APPEND appends regardless."
                      : ""}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="append-ledger"
                  >
{`what the writers did

  writers                     ${String(setup.writers).padEnd(12)} each one a separate process
  records each                ${String(setup.records).padEnd(12)} of ${setup.bytes} bytes
  one writer's worth          ${String(perWriter(setup)).padEnd(12)} bytes
  handed to write()           ${String(wrote).padEnd(12)} bytes, every call returning the full count

where the offsets were

  opened                      ${asHow(setup.how)}
  offsets in play             ${sharesOffset(setup.how) ? "1, shared" : setup.how === "pwrite" || setup.how === "append-pwrite" ? "0, the offset is named per write" : `${setup.writers}, one per open() call`}
  writes go to the end        ${alwaysAtTheEnd(setup.how) ? "yes, decided under the inode lock" : "no, wherever the offset points"}
  the named offset is used    ${honorsOffset(setup) ? "yes" : setup.how === "append-pwrite" ? "no, O_APPEND discards it" : "no offset is named"}

what came out

  file                        ${String(onDisk).padEnd(12)} bytes
  lost                        ${String(gone).padEnd(12)} bytes${gone > 0 ? ", which nothing reported" : ""}
  records in the file         ${String(survived(setup)).padEnd(12)} of ${setup.writers * setup.records}`}
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
                  data-testid="append-fix"
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
                  data-testid="append-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: how many writers there are, how much each of
                them writes, and how the file was opened. Ask how many file offsets are in play
                before anything else, because that is what decides this, and remember that one
                open() call makes one and fork makes none. The bars are drawn once you have
                committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="append-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} logs`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, kernel 6.18.44, measured by forking
            writers onto one file, giving each its own repeated character, and reading the size back
            with stat. Four writers at two hundred records of sixty four bytes hand over 51200 bytes
            every time. With each of them opening the file with O_APPEND the file came out 51200;
            with each of them opening it without the flag it came out 12800, which is 200 times 64,
            exactly one writer's worth; with the parent opening it once and forking it came out
            51200 again; and with each of them pwriting at its own stride it came out 51200. The
            figure for the unsafe arrangement does not depend on the writer count: eight writers at
            fifty records of 4096 handed over 1638400 and left 204800, which is again one writer's
            worth. pwrite loses its offset on an O_APPEND descriptor, measured on a ten byte file: a
            plain descriptor writing two bytes at offset 0 left the size at ten with the bytes at the
            front, and an O_APPEND descriptor took the size to twelve with the bytes on the end,
            which is the deviation pwrite(2) documents. lseek before a write is ignored the same way.
            CI replays the writes one at a time over a simulated file, with an offset per open file
            description, under four interleavings that all have to agree, across 2570 sets of
            writers. NFS, where O_APPEND is not atomic because the client does the seek itself,
            O_DIRECT, and tearing by a crash rather than by another writer are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the same question about a pipe rather than a file,{" "}
            <Link
              href="/pipebuf"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              two writers, one line
            </Link>{" "}
            is where PIPE_BUF stops protecting you, and{" "}
            <Link
              href="/locks"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              three locks, one file
            </Link>{" "}
            is the other thing an open file description owns.
          </p>

          <ReadAboutThis href="/append" />

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
