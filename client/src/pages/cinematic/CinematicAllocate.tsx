/**
 * One address plan: a block, a list of things that need space, and a map.
 *
 * The map is the part a spreadsheet cannot do. An address plan written as a
 * column of CIDRs hides both of the mistakes that matter: an overlap looks
 * like two different numbers, and a gap you cannot use looks like nothing at
 * all. Drawn to scale against the block, both are immediate.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PractiseStage } from "@/components/practise/PractiseStage";
import { useSEO } from "@/lib/useSEO";
import { getProblem, review } from "@/lib/allocate/index";
import {
  broadcastOf,
  isCidr,
  networkOf,
  parseCidr,
  prefixForHosts,
  sizeOf,
  toDotted,
  usableIn,
} from "@/lib/allocate/cidr";
import type { Plan, Problem } from "@/lib/allocate/types";
import { clearPlan, loadPlan, recordSolvedPlan, savePlan } from "@/lib/allocate/progress";
import { CinematicNotFound } from "@/pages/cinematic/CinematicNotFound";

const SITE_URL = "https://maxdoubin.com";

/* Four accents, cycled, so adjacent bands on the map are never the same. */
const BAND = [
  "hsl(var(--brand-signal) / 0.55)",
  "hsl(var(--brand-cyan) / 0.55)",
  "hsl(var(--brand-amber) / 0.55)",
  "hsl(var(--brand-bone) / 0.35)",
];

export function CinematicAllocate() {
  const [, params] = useRoute("/allocate/:slug");
  const problem = params?.slug ? getProblem(params.slug) : undefined;

  useSEO({
    title: problem ? `${problem.title} | Address plans | Max Doubin` : "Plan not found",
    description: problem ? problem.tagline : "",
    canonical: problem ? `${SITE_URL}/allocate/${problem.slug}` : `${SITE_URL}/allocate`,
    noindex: !problem,
  });

  if (!problem) return <CinematicNotFound />;
  return <PlanView key={problem.slug} problem={problem} />;
}

function PlanView({ problem }: { problem: Problem }) {
  const [plan, setPlan] = useState<Plan>({});
  const [hintsOpen, setHintsOpen] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = loadPlan(problem.slug);
    if (saved) setPlan(saved);
    setMounted(true);
  }, [problem.slug]);

  const update = useCallback(
    (id: string, value: string) => {
      setPlan((current) => {
        const next = { ...current, [id]: value };
        savePlan(problem.slug, next);
        return next;
      });
    },
    [problem.slug],
  );

  const result = useMemo(() => review(problem, plan), [problem, plan]);

  useEffect(() => {
    if (result.solved && mounted) recordSolvedPlan(problem.slug);
  }, [result.solved, mounted, problem.slug]);

  const parsedBlock = parseCidr(problem.block);
  const block = isCidr(parsedBlock) ? parsedBlock : null;
  const blockStart = block ? networkOf(block) : 0;
  const blockSize = block ? sizeOf(block.prefix) : 1;

  const mood =
    result.satisfied === 0 ? "critical" : result.satisfied >= result.total - 1 ? "recovering" : "tense";

  return (
    <CinematicLayout>
      <PractiseStage
        accent="cyan"
        mood={mood}
        ending={result.solved ? "best" : undefined}
        flashKey={result.satisfied}
      />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[980px]">
          <Link
            href="/allocate"
            className="inline-flex min-h-[36px] items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
          >
            ← All address plans
          </Link>

          <header className="mt-6">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · Address plan · {problem.difficulty}
            </div>
            <h1 className="mt-4 font-display text-[clamp(1.8rem,4.5vw,3rem)] font-medium leading-[1.02] tracking-[-0.035em] text-[hsl(var(--brand-bone))]">
              {problem.title}
            </h1>
            {problem.brief.map((paragraph, index) => (
              <p
                key={index}
                className="mt-4 max-w-2xl font-mono-tight text-[14.5px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
              >
                {paragraph}
              </p>
            ))}
            <p className="mt-4 font-mono-tight text-[12.5px] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
              {problem.block} · {blockSize.toLocaleString()} addresses ·{" "}
              {toDotted(blockStart)} to {block ? toDotted(broadcastOf(block)) : ""}
            </p>
          </header>

          <section className="mt-8">
            <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · The block, to scale
            </h2>
            <div
              className="mt-3 flex h-14 w-full overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)]"
              data-testid="allocate-map"
              role="img"
              aria-label={`${result.placed.length} of ${result.total} subnets placed, using ${result.used} of ${result.capacity} addresses`}
            >
              {block ? <Map placed={result.placed} start={blockStart} size={blockSize} /> : null}
            </div>
            <p className="mt-2 font-mono-tight text-[11.5px] text-[hsl(var(--brand-ash))]">
              {result.used.toLocaleString()} of {result.capacity.toLocaleString()} addresses
              allocated. Gaps are unspent, which is not the same as wasted: a plan with no gap
              cannot absorb anything.
            </p>
          </section>

          <section className="mt-9">
            <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · What needs space
            </h2>
            <ul className="mt-4 space-y-3">
              {problem.requirements.map((requirement, index) => {
                const finding = result.findings.find((f) => f.requirementId === requirement.id);
                const smallest = prefixForHosts(requirement.hosts);
                return (
                  <li
                    key={requirement.id}
                    className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.45)] p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="inline-block h-3 w-3 shrink-0 rounded-sm"
                          style={{ background: BAND[index % BAND.length] }}
                        />
                        <span className="font-mono-tight text-[14px] text-[hsl(var(--brand-bone))]">
                          {requirement.label}
                        </span>
                      </span>
                      <span className="font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">
                        {requirement.hosts} hosts · at least a /{smallest} ({usableIn(smallest)}{" "}
                        usable)
                        {requirement.within ? ` · inside ${requirement.within}` : ""}
                      </span>
                    </div>
                    {requirement.note ? (
                      <p className="mt-1 font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
                        {requirement.note}
                      </p>
                    ) : null}
                    <input
                      value={plan[requirement.id] ?? ""}
                      onChange={(event) => update(requirement.id, event.target.value)}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      placeholder="10.0.0.0/24"
                      aria-label={`Subnet for ${requirement.label}`}
                      data-testid={`allocate-input-${requirement.id}`}
                      className="mt-3 w-full max-w-[280px] rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)] px-3 py-2 font-mono-tight text-[13px] text-[hsl(var(--brand-bone))] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))]"
                    />
                    {finding ? (
                      <p
                        className={`mt-2 font-mono-tight text-[12.5px] leading-relaxed ${
                          finding.ok
                            ? "text-[hsl(var(--brand-signal))]"
                            : "text-[hsl(var(--brand-amber))]"
                        }`}
                        data-testid={`allocate-finding-${finding.ok ? "ok" : "bad"}`}
                      >
                        {finding.message}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
              <p
                className="font-mono-tight text-[12px] uppercase tracking-[0.2em]"
                aria-live="polite"
                data-testid="allocate-status"
              >
                {result.solved ? (
                  <span className="text-[hsl(var(--brand-signal))]">
                    Every requirement met, nothing overlapping. Done.
                  </span>
                ) : (
                  <span className="text-[hsl(var(--brand-ash))]">
                    {result.satisfied} of {result.total}
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  clearPlan(problem.slug);
                  setPlan({});
                }}
                data-testid="allocate-clear"
                className="min-h-[36px] font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
              >
                Clear it
              </button>
            </div>
          </section>

          <section className="mt-9">
            <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · Hints, {hintsOpen} of {problem.hints.length}
            </h2>
            <ol className="mt-3 space-y-2">
              {problem.hints.slice(0, hintsOpen).map((hint, index) => (
                <li
                  key={index}
                  className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] px-4 py-2.5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                >
                  {hint}
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-4">
              {hintsOpen < problem.hints.length ? (
                <button
                  type="button"
                  onClick={() => setHintsOpen((n) => n + 1)}
                  data-testid="allocate-hint"
                  className="min-h-[36px] font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                >
                  Open hint {hintsOpen + 1}
                </button>
              ) : null}
              {!revealed && !result.solved ? (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  data-testid="allocate-reveal"
                  className="min-h-[36px] font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                >
                  Show me a plan that works
                </button>
              ) : null}
            </div>
          </section>

          {revealed && !result.solved ? (
            <section className="mt-9 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5">
              <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
                · One plan that works
              </h2>
              <p className="mt-2 font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
                Not the only one. This is marked on behaviour, so any plan that meets every
                requirement without overlapping is right, including a tidier one than mine.
              </p>
              <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)]">
                {problem.requirements.map((requirement) => (
                  <div key={requirement.id} className="contents">
                    <dt className="font-mono-tight text-[12.5px] text-[hsl(var(--brand-ash))]">
                      {requirement.label}
                    </dt>
                    <dd className="font-mono-tight text-[12.5px] text-[hsl(var(--brand-bone-dim))]">
                      {problem.solution[requirement.id]}
                    </dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                onClick={() => {
                  setPlan(problem.solution);
                  savePlan(problem.slug, problem.solution);
                }}
                data-testid="allocate-apply"
                className="mt-3 min-h-[36px] font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                Fill it in
              </button>
            </section>
          ) : null}

          {result.solved || revealed ? (
            <section className="mt-9 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.05)] p-5">
              <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · What this one is about
              </h2>
              {problem.debrief.map((paragraph, index) => (
                <p
                  key={index}
                  className="mt-3 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ) : null}
        </div>
      </div>
    </CinematicLayout>
  );
}

/**
 * The block drawn to scale.
 *
 * Sorted by address rather than by requirement order, because a map that
 * follows the list rather than the numbers would draw the bands out of
 * sequence and be worse than no map.
 */
function Map({
  placed,
  start,
  size,
}: {
  placed: { id: string; label: string; cidr: { base: number; prefix: number } }[];
  start: number;
  size: number;
}) {
  const sorted = [...placed].sort((a, b) => networkOf(a.cidr) - networkOf(b.cidr));
  const pieces: { key: string; label: string | null; width: number; index: number }[] = [];
  let cursor = start;
  sorted.forEach((item, index) => {
    const at = networkOf(item.cidr);
    if (at > cursor) {
      pieces.push({ key: `gap-${cursor}`, label: null, width: (at - cursor) / size, index: -1 });
    }
    const span = sizeOf(item.cidr.prefix);
    pieces.push({ key: item.id, label: item.label, width: span / size, index });
    cursor = at + span;
  });
  if (cursor < start + size) {
    pieces.push({ key: "tail", label: null, width: (start + size - cursor) / size, index: -1 });
  }

  return (
    <>
      {pieces.map((piece) => (
        <div
          key={piece.key}
          title={piece.label ?? "unallocated"}
          className="h-full border-r border-[hsl(var(--brand-obsidian))] last:border-r-0"
          style={{
            width: `${piece.width * 100}%`,
            background: piece.label
              ? BAND[piece.index % BAND.length]
              : "repeating-linear-gradient(45deg, hsl(var(--brand-iron) / 0.35) 0 6px, transparent 6px 12px)",
            transition: "width 260ms ease",
          }}
        />
      ))}
    </>
  );
}
