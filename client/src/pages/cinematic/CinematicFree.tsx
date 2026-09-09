/**
 * The estimate taken apart, next to the two columns people read instead.
 *
 * The argument is that MemAvailable is three additions and two subtractions
 * and nobody looks at any of them, so the page shows all five: free less the
 * reserves, the cache less what is held back, the slab less the same, and
 * the total. The held-back line says which arm of the min() won, because
 * that is the sentence that changes with the size of the machine and is the
 * half of the rule everybody has forgotten.
 *
 * Above it, `free -h` exactly as it prints, because the whole incident
 * starts with somebody reading one column of that output.
 *
 * Where the estimate overstates, the bar shows the overstatement in a
 * different colour rather than a smaller number, because the point is that
 * the kernel is reporting the larger figure honestly and it is still wrong
 * for the question being asked.
 *
 * Nothing is drawn before an answer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PractiseStage, type StageAccent } from "@/components/practise/PractiseStage";
import { ReadAboutThis } from "@/components/practise/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  asFree,
  asMeminfo,
  available,
  correctOption,
  estimate,
  fits,
  human,
  loadSolvedFree,
  overstatedBy,
  pageCache,
  recordSolvedFree,
  trulyAvailable,
  used,
  withoutWaiting,
  type Case,
} from "@/lib/free/index";

const SITE_URL = "https://maxdoubin.com";

/** A machine whose estimate is wrong is the alarming one, not a busy one. */
function severity(item: Case): StageAccent {
  if (overstatedBy(item.setup) > 0) return "danger";
  if (item.setup.wants > 0 && !fits(item.setup)) return "amber";
  return "signal";
}

export function CinematicFree() {
  useSEO({
    title: "Two Hundred Megabytes Free, and the Machine Is Fine | Max Doubin",
    description:
      "MemAvailable is an estimate with three parts and two subtractions, and the subtraction is min(half the cache, the low watermark), which goes one way on a laptop and the other on a server. Ten machines here, and the question is what the kernel would actually print.",
    canonical: `${SITE_URL}/free`,
    ogImage: `${SITE_URL}/images/og/free.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedFree());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const parts = useMemo(() => estimate(active.setup), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedFree(active.slug);
        setSolved(loadSolvedFree());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const overstated = overstatedBy(setup);
  const rows: { label: string; value: number; note: string }[] = [
    { label: "MemFree less the reserves", value: parts.fromFree, note: `${human(setup.free)} free, ${human(setup.totalReserve)} reserved` },
    { label: "page cache less what stays", value: parts.fromCache, note: `${human(pageCache(setup))} cached, ${human(parts.cacheHeld)} held by ${parts.cacheHeldBy}` },
    { label: "reclaimable slab less the same", value: parts.fromSlab, note: "kernel caches it will give back" },
  ];
  const widest = Math.max(1, ...rows.map((row) => Math.abs(row.value)), parts.available);

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
              · {CASES.length} machines, one estimate
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Two hundred megabytes free.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten machines and one line of /proc/meminfo. Work out what MemAvailable says, and
              whether it is telling you the truth about this particular host.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              An operating system that leaves memory unused is wasting it, so on any server that
              has been up a week the free column is small by design and says nothing. MemAvailable
              is the number that answers the question, and the kernel calls it an estimate: free
              less the reserves, plus the page cache less what has to stay, plus the reclaimable
              slab less the same. That subtraction is{" "}
              <code>min(half of it, the low watermark)</code>, and which arm wins changes with the
              size of the machine. The remembered rule, that half the cache is available, is the
              small machine case.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="free-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`free-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      {human(item.setup.total)} · {human(item.setup.free)} free
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
            <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
              {active.name}
            </h2>
            <p
              className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="free-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="free-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ free -h
${asFree(setup)}

$ grep -E 'Total|Free|Available|file|Dirty|Shmem|Reclaimable|SwapTotal' /proc/meminfo
${asMeminfo(setup)}
# totalreserve_pages ${setup.totalReserve} kB, low watermarks ${setup.watermarkLow} kB${setup.wants > 0 ? `\n# something is about to allocate ${human(setup.wants)}` : ""}`}
              </pre>
            </div>

            <h3 className="mt-7 font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
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
                    data-testid={`free-option-${option.id}`}
                    className={`block w-full rounded-xl border px-4 py-3 text-left font-mono-tight text-[13px] leading-relaxed transition-colors disabled:cursor-default ${
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
              <div className="mt-6 space-y-5" data-testid="free-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} MemAvailable is {available(setup)} kB, which is{" "}
                  {human(available(setup))} of a {human(setup.total)} machine.
                  {overstated > 0
                    ? ` About ${human(overstated)} of that is tmpfs on a host with no swap, so ${human(trulyAvailable(setup))} is real.`
                    : ""}
                  {setup.wants > 0
                    ? ` An allocation of ${human(setup.wants)} ${fits(setup) ? "fits" : "does not fit"}.`
                    : ""}
                </p>

                {/* ── the estimate, part by part ── */}
                <div className="space-y-2" data-testid="free-parts">
                  {rows.map((row) => (
                    <div key={row.label} data-testid={`free-part-${row.label.split(" ")[0]}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[11.5px]">
                        <span className="text-[hsl(var(--brand-bone-dim))]">{row.label}</span>
                        <span className="text-[hsl(var(--brand-signal))]">
                          {row.value < 0 ? "" : "+"}
                          {human(row.value)}
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                        <span
                          style={{ width: `${Math.min(100, (Math.abs(row.value) / widest) * 100)}%` }}
                          className="block h-full bg-[hsl(var(--brand-signal)/0.55)]"
                        />
                      </div>
                      <p className="mt-0.5 font-mono-tight text-[10.5px] text-[hsl(var(--brand-ash)/0.85)]">
                        {row.note}
                      </p>
                    </div>
                  ))}
                  <div className="pt-1" data-testid="free-total">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[12px]">
                      <span className="text-[hsl(var(--brand-bone))]">MemAvailable</span>
                      <span className="text-[hsl(var(--brand-bone))]">{human(parts.available)}</span>
                    </div>
                    <div className="mt-1 flex h-3.5 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                      <span
                        style={{ width: `${Math.min(100, ((parts.available - overstated) / widest) * 100)}%` }}
                        className="block h-full bg-[hsl(var(--brand-signal)/0.75)]"
                      />
                      {overstated > 0 ? (
                        <span
                          style={{ width: `${Math.min(100, (overstated / widest) * 100)}%` }}
                          className="block h-full bg-[hsl(var(--brand-danger)/0.8)]"
                          data-testid="free-overstated"
                        />
                      ) : null}
                    </div>
                    <p className="mt-1 font-mono-tight text-[10.5px] text-[hsl(var(--brand-ash)/0.85)]">
                      {overstated > 0
                        ? `The red is tmpfs counted as reclaimable page cache on a host with no swap. Nothing frees it.`
                        : `Every part of this is genuinely reclaimable.`}
                      {setup.dirty > 0
                        ? ` ${human(setup.dirty)} of the cache is dirty, so ${human(withoutWaiting(setup))} could be had without waiting on the disk.`
                        : ""}
                    </p>
                  </div>
                </div>

                {/* the two columns people read instead */}
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["free", human(setup.free), "the column people alert on"],
                    ["used", human(used(setup)), "total less free less cache; a residue"],
                    ["available", human(available(setup)), "the one that answers the question"],
                  ].map(([label, value, note]) => (
                    <div key={label} className="rounded-xl border border-[hsl(var(--brand-iron))] p-4">
                      <p className="font-techno text-[9.5px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                        · {label}
                      </p>
                      <p className="mt-2 font-display text-2xl text-[hsl(var(--brand-bone))]">{value}</p>
                      <p className="mt-1 font-mono-tight text-[10.5px] leading-snug text-[hsl(var(--brand-ash))]">
                        {note}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="free-fix"
                >
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-cyan))]">
                    What to do ·{" "}
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
                  data-testid="free-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the kernel uses is above, including the two fields it does not print:
                the reserves and the low watermarks. The estimate taken apart is drawn once you have
                committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="free-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} machines`}
          </p>

          <p className="mt-6 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI recomputes every estimate from a straight transcription of si_mem_available, checks
            that both arms of that min() are represented in the set, and requires every quantity to
            be a whole kibibyte, because /proc/meminfo cannot print a fraction of one and a case it
            could not produce is teaching from a machine that does not exist. The first draft here
            had 1.2 GiB of slab written as a float and every answer came out ending in .2.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what happens when the estimate runs out,{" "}
            <Link
              href="/oom"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              something has to die
            </Link>
            , and{" "}
            <Link
              href="/load"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              forty, and idle
            </Link>{" "}
            is the other number on this machine that is not what it looks like.
          </p>

          <ReadAboutThis href="/free" />

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
