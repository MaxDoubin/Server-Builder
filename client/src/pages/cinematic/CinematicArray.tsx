/**
 * The array calculator.
 *
 * Two URE probabilities side by side, because printing only the frightening
 * one is how "RAID 5 is dead" became a thing people repeat without ever
 * having done the arithmetic, and printing only the reassuring one is how
 * somebody ends up with a sixteen day rebuild window they never thought about.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage } from "@/components/practice/PracticeStage";
import { useSEO } from "@/lib/useSEO";
import {
  CONFIGS,
  LEVEL_LABEL,
  MIN_DISKS,
  analyse,
  formatDuration,
  formatProbability,
  tbToTib,
  type Level,
} from "@/lib/array/index";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";

const SITE_URL = "https://maxdoubin.com";

const LEVELS: Level[] = ["raid0", "raid1", "raid5", "raid6", "raid10", "raidz1", "raidz2", "raidz3"];

export function CinematicArray() {
  useSEO({
    title: "Array calculator | Max Doubin",
    description:
      "Usable capacity, guaranteed fault tolerance, rebuild time and the unrecoverable read error arithmetic behind RAID 5 is dead, with the spec figure and an observed one side by side.",
    canonical: `${SITE_URL}/array`,
  });

  const [level, setLevel] = useState<Level>("raid5");
  const [disks, setDisks] = useState(8);
  const [diskTb, setDiskTb] = useState(16);
  const [rebuildMbs, setRebuildMbs] = useState(80);
  const [ureExponent, setUreExponent] = useState(14);

  const array = { level, disks, diskTb, rebuildMbs, ureExponent };
  const result = useMemo(() => analyse(array), [level, disks, diskTb, rebuildMbs, ureExponent]);

  const tooFew = disks < MIN_DISKS[level];
  const days = result.rebuildSeconds / 86400;
  const mood = tooFew || result.tolerance === 0 ? "critical" : days > 7 ? "tense" : "calm";

  return (
    <CinematicLayout>
      <PracticeStage
        accent={result.tolerance === 0 ? "danger" : days > 7 ? "amber" : "signal"}
        mood={mood}
        flashKey={disks + diskTb}
      />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[940px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Homelab · Do the arithmetic
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Array.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Usable capacity, the fault tolerance you can actually rely on, how long a rebuild
              takes, and the unrecoverable read error calculation that the phrase RAID 5 is dead
              comes from.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              That calculation is shown twice, on purpose. Once with the manufacturer's figure,
              which is a warranty bound rather than a measurement, and once with a rate two orders
              of magnitude better, which is a conservative reading of what field studies actually
              find. The conclusion moves a very long way between them, and a page that prints only
              one of the two is repeating a rumour with a decimal point in it.
            </p>
          </header>

          <section className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Level">
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value as Level)}
                data-testid="array-level"
                className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)] px-3 py-2.5 font-mono-tight text-[13px] text-[hsl(var(--brand-bone))] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                {LEVELS.map((option) => (
                  <option key={option} value={option}>
                    {LEVEL_LABEL[option]}
                  </option>
                ))}
              </select>
            </Field>
            <NumberField label="Disks" value={disks} min={2} max={48} onChange={setDisks} testId="array-disks" />
            <NumberField label="TB each" value={diskTb} min={1} max={30} onChange={setDiskTb} testId="array-size" />
            <NumberField
              label="Rebuild MB/s"
              value={rebuildMbs}
              min={10}
              max={2000}
              step={10}
              onChange={setRebuildMbs}
              testId="array-rate"
              note="Not the disk's sequential rate. A rebuild competes with production reads."
            />
            <Field label="URE rate">
              <select
                value={ureExponent}
                onChange={(event) => setUreExponent(Number(event.target.value))}
                data-testid="array-ure"
                className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)] px-3 py-2.5 font-mono-tight text-[13px] text-[hsl(var(--brand-bone))] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                <option value={14}>1 in 10^14, consumer SATA</option>
                <option value={15}>1 in 10^15, enterprise SATA and most NAS disks</option>
                <option value={16}>1 in 10^16, enterprise SAS</option>
              </select>
            </Field>
          </section>

          {tooFew ? (
            <p
              className="mt-5 font-mono-tight text-[13px] text-[hsl(var(--brand-danger))]"
              data-testid="array-invalid"
            >
              {LEVEL_LABEL[level]} needs at least {MIN_DISKS[level]} disks.
            </p>
          ) : null}

          <section className="mt-8 grid gap-4 sm:grid-cols-2">
            <Stat
              label="Usable"
              value={`${result.usableTb.toLocaleString()} TB`}
              note={`${tbToTib(result.usableTb).toFixed(1)} TiB as the operating system will report it, from ${result.rawTb.toLocaleString()} TB raw. The nine per cent is the decimal to binary conversion, not lost space.`}
              testId="array-usable"
            />
            <Stat
              label="Survives"
              value={
                result.tolerance === 0
                  ? "no failures"
                  : `${result.tolerance} ${result.tolerance === 1 ? "failure" : "failures"}`
              }
              note={`${(result.efficiency * 100).toFixed(0)} per cent of the raw capacity is usable. This is the guarantee, not the best case.`}
              tone={result.tolerance === 0 ? "danger" : undefined}
              testId="array-tolerance"
            />
            <Stat
              label="Rebuild"
              value={result.tolerance === 0 ? "there is none" : formatDuration(result.rebuildSeconds)}
              note={
                result.tolerance === 0
                  ? "Nothing to rebuild from. A disk failing here loses the array, and the only recovery is a restore."
                  : `${(result.rebuildReadBytes / 1e12).toFixed(1)} TB read at ${rebuildMbs} MB/s. This is the window with reduced or no redundancy.`
              }
              tone={result.tolerance === 0 ? "danger" : days > 7 ? "amber" : undefined}
              testId="array-rebuild"
            />
            <Stat
              label="A URE during that rebuild"
              value={result.tolerance === 0 ? "not applicable" : formatProbability(result.ureProbability)}
              note={
                result.tolerance === 0
                  ? "There is no rebuild to have one during. The relevant number here is the chance of any one disk failing, which grows with every disk you add."
                  : `Using the specification figure. With a rate two orders of magnitude better, which is what field studies find: ${formatProbability(result.ureProbabilityObserved)}.`
              }
              tone={result.ureProbability > 0.5 ? "amber" : undefined}
              testId="array-ure-result"
            />
          </section>

          <section className="mt-6 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5">
            <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · What that actually costs you
            </h2>
            <p className="mt-3 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]">
              {result.ureConsequence}
            </p>
            {result.notes.map((note, index) => (
              <p
                key={index}
                className="mt-3 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-ash))]"
              >
                {note}
              </p>
            ))}
          </section>

          <section className="mt-11">
            <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · Configurations worth comparing
            </h2>
            <ul className="mt-5 space-y-4">
              {CONFIGS.map((config) => (
                <li
                  key={config.id}
                  className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.45)] p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="font-mono-tight text-[14px] text-[hsl(var(--brand-bone))]">
                      {config.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setLevel(config.array.level);
                        setDisks(config.array.disks);
                        setDiskTb(config.array.diskTb);
                        setRebuildMbs(config.array.rebuildMbs);
                        setUreExponent(config.array.ureExponent);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      data-testid={`array-load-${config.id}`}
                      className="min-h-[36px] font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
                    >
                      Load it
                    </button>
                  </div>
                  {config.notes.map((note, index) => (
                    <p
                      key={index}
                      className="mt-2.5 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
                    >
                      {note}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-11 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.4)] p-5">
            <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · The thing this page cannot compute
            </h2>
            <p className="mt-3 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]">
              None of this is a backup. Every level here protects against a disk failing and
              against nothing else: not a deletion, not a ransomware run, not a controller writing
              corruption to every member at once, not the building. An array survives hardware and
              a backup survives you.
            </p>
            <p className="mt-3 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-ash))]">
              The failure that is not modelled here is correlated failure, and it is the one that
              actually takes arrays down. Disks bought together, from the same batch, run at the
              same temperature for the same years, do not fail independently, and a rebuild puts
              every survivor under sustained full read load at exactly the moment you need them to
              behave. That is the real argument for a rebuild window measured in days rather than
              weeks.
            </p>
          </section>

          <p className="mt-11 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI checks this arithmetic against a table of capacities, tolerances, rebuild times and
            probabilities worked out by hand. That table earned its keep immediately: the textbook
            form of the URE expression silently returns zero for small rates, because subtracting
            1e-17 from 1 in a float64 gives exactly 1, and the wrong answer reads as a very
            reassuring number rather than as an error.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what the disks go in, the{" "}
            <Link
              href="/tools/rack-budget"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              rack power and cooling budget
            </Link>{" "}
            and the{" "}
            <Link
              href="/racks"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              rack library
            </Link>{" "}
            are next door.
          </p>
        </div>
        <ReadAboutThis href="/array" />

      </div>
    </CinematicLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
        · {label}
      </span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  testId,
  note,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  testId: string;
  note?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        data-testid={testId}
        className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)] px-3 py-2.5 font-mono-tight text-[13px] text-[hsl(var(--brand-bone))] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))]"
      />
      {note ? (
        <span className="mt-1 block font-mono-tight text-[11px] leading-snug text-[hsl(var(--brand-ash))]">
          {note}
        </span>
      ) : null}
    </Field>
  );
}

const TONE: Record<string, string> = {
  danger: "text-[hsl(var(--brand-danger))]",
  amber: "text-[hsl(var(--brand-amber))]",
};

function Stat({
  label,
  value,
  note,
  tone,
  testId,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "danger" | "amber";
  testId: string;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5">
      <h2 className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
        · {label}
      </h2>
      <p
        className={`mt-2 font-display text-2xl font-medium tracking-[-0.02em] ${tone ? TONE[tone] : "text-[hsl(var(--brand-bone))]"}`}
        data-testid={testId}
      >
        {value}
      </p>
      <p className="mt-2 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
        {note}
      </p>
    </div>
  );
}
