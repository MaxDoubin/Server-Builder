/**
 * Scenario browser, live objective tracker and debrief.
 *
 * Purely a renderer. The run itself lives in useScenarioRun so a scenario
 * keeps being evaluated while this panel is closed, and so completion is
 * detected from the same derived state the meters use.
 */

import { Button } from "@/components/ui/button";
import type {
  ObjectiveResult,
  Scenario,
  ScenarioEvaluation,
} from "@/lib/scenarios";
import type { ScenarioRun } from "@/lib/useScenarioRun";

const DISCIPLINE_LABEL: Record<Scenario["discipline"], string> = {
  cooling: "Cooling",
  power: "Power",
  network: "Network",
  thermal: "Thermal",
  capacity: "Capacity",
};

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}s`;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function ObjectiveRow({ result }: { result: ObjectiveResult }) {
  const { objective, met, progress } = result;
  const width = Math.min(100, Math.max(0, progress.fraction * 100));
  const isBrokenGuard = objective.kind === "guard" && !met;

  return (
    <li className="rounded-md border border-white/10 bg-white/5 p-2">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] leading-none ${
            met
              ? "border-emerald-400/70 bg-emerald-400/20 text-emerald-200"
              : isBrokenGuard
                ? "border-rose-400/70 bg-rose-500/15 text-rose-200"
                : "border-white/25 text-white/50"
          }`}
        >
          {met ? "✓" : isBrokenGuard ? "!" : ""}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium leading-snug text-white/85">
              {objective.label}
            </span>
            <span
              className={`shrink-0 rounded-sm px-1 text-[9px] uppercase tracking-widest ${
                objective.kind === "guard"
                  ? "bg-amber-400/15 text-amber-200"
                  : "bg-cyan-400/15 text-cyan-200"
              }`}
            >
              {objective.kind}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-white/45">{objective.detail}</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                met ? "bg-emerald-400" : isBrokenGuard ? "bg-rose-500" : "bg-cyan-400"
              }`}
              style={{ width: `${width}%` }}
            />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2 text-[10px]">
            <span className="font-mono text-white/60">{progress.text}</span>
            <span
              className={
                met ? "text-emerald-300" : isBrokenGuard ? "text-rose-300" : "text-white/50"
              }
            >
              {met ? "met" : isBrokenGuard ? "broken" : "not yet"}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

interface ScenarioPanelProps {
  scenarios: Scenario[];
  run: ScenarioRun | null;
  scenario: Scenario | null;
  evaluation: ScenarioEvaluation | null;
  completedIds: string[];
  elapsedSeconds: number;
  onStart: (scenario: Scenario) => void;
  onAbort: () => void;
  onRestart: () => void;
}

export function ScenarioPanel({
  scenarios,
  run,
  scenario,
  evaluation,
  completedIds,
  elapsedSeconds,
  onStart,
  onAbort,
  onRestart,
}: ScenarioPanelProps) {
  if (!run || !scenario) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] leading-relaxed text-white/50">
          Each scenario changes the floor and then grades you against what the floor actually
          reports: rack count, measured load, cooling against the plant that is online, and the
          equipment installed. Objectives keep evaluating while the panel is closed.
        </p>
        <div className="text-[10px] uppercase tracking-widest text-white/50">
          {completedIds.length} of {scenarios.length} closed out
        </div>
        <ul className="space-y-2">
          {scenarios.map((item) => {
            const done = completedIds.includes(item.id);
            return (
              <li
                key={item.id}
                className="rounded-lg border border-white/10 bg-white/5 p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-sm bg-cyan-400/15 px-1 text-[9px] uppercase tracking-widest text-cyan-200">
                        {DISCIPLINE_LABEL[item.discipline]}
                      </span>
                      {done && (
                        <span className="rounded-sm bg-emerald-400/15 px-1 text-[9px] uppercase tracking-widest text-emerald-200">
                          Complete
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs font-medium text-white/90">{item.title}</div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-white/50">
                      {item.summary}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0 bg-white/10 text-[10px] uppercase tracking-widest text-white hover:bg-white/20"
                    onClick={() => onStart(item)}
                  >
                    {done ? "Replay" : "Start"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const complete = Boolean(run.completedAt);

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="rounded-sm bg-cyan-400/15 px-1 text-[9px] uppercase tracking-widest text-cyan-200 w-max">
            {DISCIPLINE_LABEL[scenario.discipline]}
          </div>
          <h3 className="mt-1 text-sm font-semibold leading-tight text-white">{scenario.title}</h3>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[11px] text-white/70">{formatElapsed(elapsedSeconds)}</div>
          <div className="text-[9px] uppercase tracking-widest text-white/50">
            {evaluation ? `${evaluation.metCount}/${evaluation.total}` : "0/0"}
          </div>
        </div>
      </div>

      {complete ? (
        <div className="space-y-2 rounded-lg border border-emerald-400/40 bg-emerald-400/10 p-2.5">
          <div className="text-[10px] uppercase tracking-widest text-emerald-200">
            Debrief · closed in {formatElapsed(elapsedSeconds)}
          </div>
          <p className="text-[11px] leading-relaxed text-emerald-50/90">{scenario.debrief}</p>
        </div>
      ) : (
        <>
          <p className="text-[11px] leading-relaxed text-white/70">{scenario.briefing}</p>
          <p className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] leading-relaxed text-white/55">
            <span className="uppercase tracking-widest text-white/50">Starting condition · </span>
            {scenario.startingCondition}
          </p>
        </>
      )}

      <ul className="space-y-1.5">
        {evaluation?.results.map((result) => (
          <ObjectiveRow key={result.objective.id} result={result} />
        ))}
      </ul>

      {!complete && evaluation?.brokenGuard && (
        <p
          role="alert"
          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-rose-100"
        >
          A constraint is broken: {evaluation.brokenGuard.label.toLowerCase()}. The scenario cannot
          close while that is true.
        </p>
      )}

      {!complete && (
        <details className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
          <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-white/50">
            Hints
          </summary>
          <ul className="mt-1.5 space-y-1">
            {scenario.hints.map((hint) => (
              <li key={hint} className="text-[10px] leading-relaxed text-white/55">
                · {hint}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-2 pt-0.5">
        <Button
          size="sm"
          variant="secondary"
          className="bg-white/10 text-[10px] uppercase tracking-widest text-white hover:bg-white/20"
          onClick={onAbort}
        >
          {complete ? "Back to scenarios" : "Abandon"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="bg-white/10 text-[10px] uppercase tracking-widest text-white hover:bg-white/20"
          onClick={onRestart}
        >
          Restart
        </Button>
      </div>
    </div>
  );
}
