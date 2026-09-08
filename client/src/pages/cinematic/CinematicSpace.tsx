/**
 * ENOSPC, read off the disagreement between two tools rather than off one.
 *
 * The visual argument is three bars stacked in one column, all measuring the
 * same filesystem: what `df` counts, what `du` can walk to, and what `df -i`
 * says about inodes. On four of the six cases two of those bars are visibly
 * different lengths, and the difference is the whole diagnosis. On the other
 * two they agree, which is itself the finding.
 *
 * The reserve is drawn as a hatched sliver at the right hand end of the df
 * bar, because it is the one part of the picture that is not a measurement
 * error: it is space that exists and that this user may not have. A reader
 * who sees a full bar with a sliver still in it has the answer.
 *
 * The commands are quoted as a terminal would print them, because recognising
 * this in the wild means recognising that output. Every figure in it is
 * computed by the model.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PractiseStage, type StageAccent } from "@/components/practise/PractiseStage";
import { ReadAboutThis } from "@/components/practise/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  CAUSE_LABEL,
  availableTo,
  candidates,
  correctOption,
  dfAvailable,
  dfPercent,
  dfUsed,
  duTotal,
  errnoFor,
  failure,
  human,
  inodePercent,
  invisible,
  loadSolvedSpaces,
  recordSolvedSpace,
  reserved,
  tell,
  type Case,
} from "@/lib/space/index";

const SITE_URL = "https://maxdoubin.com";

/** How much of a surprise the answer is, which is what the room reacts to. */
function severity(item: Case): StageAccent {
  const cause = failure(item.filesystem, item.write);
  if (cause === "blocks") return "cyan";
  if (cause === "unlinked" || cause === "shadowed") return "danger";
  return "amber";
}

/** A percentage as a width, never quite zero so an empty bar is still a bar. */
const span = (percent: number) => `${Math.max(0.6, Math.min(100, percent))}%`;

export function CinematicSpace() {
  useSEO({
    title: "No Space Left on Device | Max Doubin",
    description:
      "One error message, six filesystems, six different things to do about it. Six cases where the fix is decided by which two numbers disagree, not by how full the disk is.",
    canonical: `${SITE_URL}/space`,
    ogImage: `${SITE_URL}/images/og/space.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedSpaces());
    setMounted(true);
  }, []);

  const answered = chosen !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && chosen === right?.id;
  const cause = useMemo(() => failure(active.filesystem, active.write), [active]);
  const narrows = useMemo(() => candidates(active.filesystem, active.write), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setChosen(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (chosen !== null) return;
      setChosen(id);
      if (id === correctOption(active)?.id) {
        recordSolvedSpace(active.slug);
        setSolved(loadSolvedSpaces());
      }
    },
    [active, chosen],
  );

  const fs = active.filesystem;
  /* Percentages against the raw total, so the three bars are comparable. */
  const pctOf = (blocks: number) => (blocks / fs.totalBlocks) * 100;

  return (
    <CinematicLayout>
      <PractiseStage
        accent={answered ? severity(active) : "signal"}
        mood={!answered ? "calm" : correct ? "recovering" : "tense"}
        flashKey={0}
      />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1040px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {CASES.length} filesystems
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              No space left on device.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Six filesystems, that one message, and six different things to do about it. Two of
              the six are not out of space at all and one of them is the filesystem working
              exactly as designed.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The instinct is to look at <code>df</code>, and <code>df</code> is the tool most
              likely to mislead you here, because it answers a different question from the one you
              asked. It reports blocks accounted to the filesystem. It does not report what this
              user may consume, or what a directory tree contains, or what is still allocated to a
              file with no name. So the diagnosis is never a number. It is a disagreement between
              two numbers, and each of the six produces a different pair.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="space-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`space-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      {item.filesystem.mount}
                    </span>
                    {mounted && solved.includes(item.slug) ? (
                      <span className="font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
                        done
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 font-mono-tight text-[12.5px] leading-snug text-[hsl(var(--brand-bone))]">
                    {item.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <section className="mt-8 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
                {active.name}
              </h2>
              <p className="font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
                {fs.mount}, {human(fs.totalBlocks)}
              </p>
            </div>
            <p
              className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="space-brief"
            >
              {active.brief}
            </p>

            {/* ── the three measurements, on one scale ── */}
            <div className="mt-6 overflow-x-auto">
              <div className="min-w-[460px] space-y-3" data-testid="space-gauges">
                {[
                  {
                    key: "df",
                    label: `df ${fs.mount}`,
                    reading: `${human(dfUsed(fs))} used, ${human(dfAvailable(fs))} avail, ${dfPercent(fs)}%`,
                    percent: pctOf(dfUsed(fs)),
                    tone: "bg-[hsl(var(--brand-signal)/0.55)]",
                  },
                  {
                    key: "du",
                    label: `du -sx ${fs.mount}`,
                    reading: `${human(duTotal(fs))} in files with a name`,
                    percent: pctOf(duTotal(fs)),
                    tone: "bg-[hsl(var(--brand-cyan)/0.55)]",
                  },
                  {
                    key: "inodes",
                    label: `df -i ${fs.mount}`,
                    reading: `${fs.usedInodes.toLocaleString()} of ${fs.totalInodes.toLocaleString()} inodes, ${inodePercent(fs)}%`,
                    percent: inodePercent(fs),
                    tone: "bg-[hsl(var(--brand-amber)/0.55)]",
                  },
                ].map((row) => (
                  <div key={row.key} data-testid={`space-gauge-${row.key}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="font-mono-tight text-[11.5px] text-[hsl(var(--brand-bone-dim))]">
                        {row.label}
                      </span>
                      <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                        {row.reading}
                      </span>
                    </div>
                    <span className="relative mt-1 block h-4 w-full overflow-hidden rounded-sm bg-[hsl(var(--brand-iron)/0.4)]">
                      <span
                        className={`absolute inset-y-0 left-0 ${row.tone}`}
                        style={{ width: span(row.percent) }}
                      />
                      {/*
                        The reserve, hatched, at the far end of the df row
                        only. It is the one part of a full bar that is space
                        rather than a mistake.
                      */}
                      {row.key === "df" && reserved(fs) > 0 ? (
                        <span
                          className="absolute inset-y-0 right-0 bg-[repeating-linear-gradient(45deg,hsl(var(--brand-bone)/0.35)_0_3px,transparent_3px_6px)]"
                          style={{ width: span(pctOf(reserved(fs))) }}
                          data-testid="space-reserve"
                        />
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-4 font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
              All three bars measure {fs.mount}. The hatching at the right of the first is the{" "}
              {Math.round(fs.reservedFraction * 100)}% held back for root, which exists and which
              this write may not have.
            </p>

            {/* ── the write that failed ── */}
            <div
              className="mt-6 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="space-write"
            >
              <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ sudo -u ${active.write.user} ${active.write.what}
  writing ${human(active.write.blocks)}${active.write.files > 0 ? ` across ${active.write.files.toLocaleString()} new ${active.write.files === 1 ? "file" : "files"}` : ` by appending to a file that exists`}
  ${cause ? `${errnoFor(cause)}: ${errnoFor(cause) === "EDQUOT" ? "Disk quota exceeded" : "No space left on device"}` : "ok"}
  ${active.write.user} has ${human(availableTo(fs, active.write.user))} available here`}
              </pre>
            </div>

            {/* ── the question ── */}
            <h3 className="mt-7 font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
              · {active.question}
            </h3>
            <div className="mt-3 space-y-2">
              {active.options.map((option) => {
                const picked = chosen === option.id;
                const isRight = option.id === right?.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => pick(option.id)}
                    disabled={answered}
                    data-testid={`space-option-${option.id}`}
                    className={`block w-full rounded-xl border px-4 py-3 text-left font-mono-tight text-[13px] leading-relaxed transition-colors disabled:cursor-default ${
                      !answered
                        ? "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                        : isRight
                          ? "border-[hsl(var(--brand-signal)/0.8)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                          : picked
                            ? "border-[hsl(var(--brand-danger)/0.8)] bg-[hsl(var(--brand-danger)/0.1)] text-[hsl(var(--brand-bone))]"
                            : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                    }`}
                  >
                    {option.claim}
                  </button>
                );
              })}
            </div>

            {answered && cause ? (
              <div className="mt-6 space-y-5" data-testid="space-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} It is {CAUSE_LABEL[cause]}, reported as{" "}
                  {errnoFor(cause)}.
                </p>

                <p
                  className="rounded-xl border border-[hsl(var(--brand-cyan)/0.4)] bg-[hsl(var(--brand-cyan)/0.05)] px-4 py-3 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="space-tell"
                >
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-cyan))]">
                    The tell ·{" "}
                  </span>
                  {tell(fs, active.write, cause)}.
                </p>

                {/*
                  Two numbers do not always settle it. Unlinked blocks and
                  blocks behind a mount are identical from outside, and
                  pretending otherwise would be the most useful lie on the
                  page.
                */}
                {narrows.causes.length > 1 ? (
                  <p
                    className="rounded-xl border border-[hsl(var(--brand-amber)/0.4)] bg-[hsl(var(--brand-amber)/0.05)] px-4 py-3 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="space-narrows"
                  >
                    <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                      Not settled ·{" "}
                    </span>
                    df and du narrow this to {narrows.causes.map((c) => CAUSE_LABEL[c]).join(" or ")},
                    and no further: {human(invisible(fs))} is accounted for and unreachable either
                    way. {narrows.separator}.
                  </p>
                ) : null}

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="space-fix"
                >
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-cyan))]">
                    The fix ·{" "}
                  </span>
                  {active.fix}
                </p>
                <p className="border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                    The belief this breaks ·{" "}
                  </span>
                  {active.breaks}.
                </p>
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="space-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Four commands settle four of these six. Which two numbers disagree is drawn once
                you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="space-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} read right` : `${CASES.length} filesystems`}
          </p>

          <ReadAboutThis href="/space" />

          <p className="mt-10 font-mono-tight text-[12.5px] text-[hsl(var(--brand-ash))]">
            <Link href="/practise" className="underline decoration-dotted hover:text-[hsl(var(--brand-bone))]">
              All practise material
            </Link>
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
