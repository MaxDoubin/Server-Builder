/**
 * One bar for the column, split into what comes back and what does not.
 *
 * Every question here is about a single figure that two different kinds of
 * memory add up to, so the drawing is that figure as one bar with the split
 * drawn in: the part an attempt would return, and the part it would not. The
 * two are the same color in `free` and that is the whole problem, so here
 * they are not.
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
  after,
  asAttempt,
  asPagecache,
  asSize,
  asStore,
  availableCostKb,
  buffCache,
  cached,
  correctOption,
  costKb,
  freed,
  honestColumn,
  loadSolvedPagecache,
  pinned,
  reclaimableCache,
  recordSolvedPagecache,
  shared,
  survives,
  type Case,
} from "@/lib/pagecache/index";

const SITE_URL = "https://maxdoubin.com";

function severity(item: Case): StageAccent {
  if (!pinned(item.setup)) return "signal";
  /* A gibibyte of the column that is never coming back is the bad case. */
  return costKb(item.setup) >= 256 * 1024 ? "danger" : "amber";
}

export function CinematicPagecache() {
  useSEO({
    title: "The Cache You Cannot Drop: tmpfs, Shmem And buff/cache | Max Doubin",
    description:
      "A gibibyte written to a file and a gibibyte written to tmpfs put the same figure in free's buff/cache column. drop_caches returns the first and none of the second. Shmem is the column that tells them apart, and MemAvailable is the one that was right all along.",
    canonical: `${SITE_URL}/pagecache`,
    ogImage: `${SITE_URL}/images/og/pagecache.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedPagecache());
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
        recordSolvedPagecache(active.slug);
        setSolved(loadSolvedPagecache());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const column = buffCache(setup);
  const back = freed(setup);
  const stuck = shared(setup);
  const pct = (kb: number) => (column > 0 ? Math.max(kb > 0 ? 0.8 : 0, (kb / column) * 100) : 0);

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
              · {CASES.length} machines, one column each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The cache you cannot drop.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten hosts, one question each. Work out how much of what{" "}
              <code>free</code> calls buff/cache you would actually get back.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              A gibibyte written to a file and a gibibyte written to <code>tmpfs</code> put the
              same figure in that column. Dropping caches returns the first and none of the
              second, because a tmpfs page has no disk behind it to be written back to.{" "}
              <code>Shmem</code>, which <code>free</code> prints under &ldquo;shared&rdquo; and
              nobody reads, is the only column in the output that tells them apart.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="pagecache-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`pagecache-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {asSize(costKb(item.setup))} to {item.setup.store}
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
              data-testid="pagecache-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="pagecache-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asPagecache(setup)
  .map((line) => `${line.name.padEnd(16)} ${line.value.padStart(22)}  # ${line.unit}`)
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
                    data-testid={`pagecache-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="pagecache-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The column reads {asSize(column)}, of which{" "}
                  {asSize(stuck)} is Shmem.{" "}
                  {setup.attempt === "nothing"
                    ? `Nothing has been tried yet, and this job cost MemAvailable ${asSize(availableCostKb(setup))}.`
                    : `${asAttempt(setup.attempt)} returns ${asSize(back)} of it, leaving ${asSize(after(setup))}.`}
                </p>

                {/* ── the column, and the two halves of it ── */}
                <div data-testid="pagecache-bar">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      buff/cache {asSize(column)}, as one figure
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {asSize(back)} comes back
                    </span>
                  </div>
                  <div className="mt-2.5 flex h-6 w-full overflow-hidden rounded-[3px] bg-[hsl(var(--brand-iron)/0.4)]">
                    <span
                      className="h-6 bg-[hsl(var(--brand-signal)/0.65)]"
                      style={{ width: `${pct(back)}%` }}
                      title="comes back"
                    />
                    <span
                      className="h-6 bg-[hsl(var(--brand-danger)/0.5)]"
                      style={{ width: `${pct(stuck)}%` }}
                      title="Shmem, which does not"
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                    <span>
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-[hsl(var(--brand-signal)/0.65)]" />
                      {setup.attempt === "nothing"
                        ? "nothing has been tried, so nothing has come back"
                        : `${asSize(back)} returned by ${asAttempt(setup.attempt)}`}
                    </span>
                    <span>
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-[hsl(var(--brand-danger)/0.5)]" />
                      {asSize(stuck)} Shmem, which nothing here returns
                    </span>
                    <span>
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-[hsl(var(--brand-iron))]" />
                      {asSize(column - back - stuck)} mapped or already reclaimable
                    </span>
                  </div>
                  <p className="mt-2.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {pinned(setup)
                      ? `The bytes went to ${asStore(setup.store)}, so they are in Cached and in Shmem both, and they cost MemAvailable the whole ${asSize(costKb(setup))}. The same figure in the same column for an ordinary file would have cost it nothing.`
                      : `The bytes went to ${asStore(setup.store)}, so they are in Cached and not in Shmem, and they cost MemAvailable nothing at all. The same figure in the same column for a tmpfs file would have cost it ${asSize(costKb(setup))}.`}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="pagecache-ledger"
                  >
{`what /proc/meminfo reads

  Buffers                     ${String(setup.buffersKb).padEnd(12)} kB
  Cached                      ${String(cached(setup)).padEnd(12)} kB, of which Shmem is ${shared(setup)}
  Shmem                       ${String(shared(setup)).padEnd(12)} kB, printed by free as "shared"
  SReclaimable                ${String(setup.reclaimableKb).padEnd(12)} kB

what free prints

  buff/cache                  ${String(column).padEnd(12)} kB, the three of those added up
  of it, ordinary cache       ${String(reclaimableCache(setup)).padEnd(12)} kB
  of it, tmpfs                ${String(shared(setup)).padEnd(12)} kB

what this job did

  wrote                       ${String(costKb(setup)).padEnd(12)} kB to ${asStore(setup.store)}
  cost to MemAvailable        ${String(availableCostKb(setup)).padEnd(12)} kB
  reported honestly by        ${honestColumn(setup)}

  tried                       ${asAttempt(setup.attempt)}
  handed back                 ${String(back).padEnd(12)} kB
  column afterwards           ${String(after(setup)).padEnd(12)} kB
  this job's bytes            ${survives(setup) ? "still there" : "gone"}`}
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
                  data-testid="pagecache-fix"
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
                  data-testid="pagecache-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above. Add Buffers, Cached and SReclaimable to get
                the column, then ask which of those three the attempt can actually take. Do not
                start from the size of the column: start from where the bytes went, because that
                is the only thing that decides it, and the column reads the same either way.
                The split is drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="pagecache-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} machines`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, Linux 6.18.44 with 16481980 kB of RAM
            and no swap, measured by writing a known amount into an ordinary file and into a tmpfs
            and reading /proc/meminfo either side. One atomic copy of that file taken next to one
            free -k settles what the columns are: Buffers 8704 plus Cached 230000 plus SReclaimable
            24828 is 263532, and free printed 263532, while Shmem 12996 is what it printed under
            shared. Writing a gibibyte to an ordinary file took Cached from 212780 to 1261688 and
            left Shmem and MemAvailable alone, and drop_caches took Cached back to 212360. Writing
            the same gibibyte to tmpfs took Cached from 212652 to 1261392, took Shmem to 1061396,
            took MemAvailable down by the whole gibibyte, and drop_caches left it at 1261232. The
            baseline survives a drop in both runs, because most of a baseline like that is the
            mapped pages of whatever is running: an earlier version of this model had drop_caches
            taking it, and the measurement disagreed. Unlinking a 512 MiB tmpfs file with a
            descriptor still open freed nothing, with df reporting 512M until the descriptor
            closed. A tmpfs mounted size=16M stopped at exactly 16777216 bytes and returned ENOSPC
            with 14782776 kB of the machine free, and one mounted with no size= at all reported
            7.9G, which is half of RAM. A one byte file on tmpfs costs 4096 bytes by df and du. CI
            recomputes every answer by itemizing the column one contributor at a time and filtering
            it by what each attempt can take, across 2016 combinations. Swap is not modeled, because
            this machine has none, so every figure here is the pinned case; neither are cgroup v2
            memory.stat, huge pages in tmpfs, or System V shared memory.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other way memory accounting misleads,{" "}
            <Link
              href="/pss"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              four processes, one copy
            </Link>{" "}
            is what adding up a column of RSS gives you, and{" "}
            <Link
              href="/free"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              two hundred megabytes free
            </Link>{" "}
            is why an idle machine reports almost none of it as free.
          </p>

          <ReadAboutThis href="/pagecache" />

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
