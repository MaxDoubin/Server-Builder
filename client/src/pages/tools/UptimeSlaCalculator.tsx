/**
 * Uptime and SLA calculator.
 *
 * Three views of the same arithmetic: a percentage to the downtime it
 * allows in each reporting window, a measured downtime back to the
 * percentage it leaves, and the availability of a chain of dependencies,
 * some of them redundant. Every input is held as the string the reader
 * typed and parsed on each render, so a half-typed value shows a precise
 * message instead of snapping to a number. The arithmetic lives in
 * lib/toolkit/uptime-sla-calculator so it can be tested on its own.
 */

import { Fragment, useMemo, useRef, useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  ALL_WINDOWS,
  CALENDAR_MONTHS,
  MAX_COPIES,
  MAX_TIERS,
  PRESETS,
  WINDOWS,
  availabilityFromDowntime,
  composite,
  downtimeSeconds,
  formatAvailability,
  formatDuration,
  formatExact,
  formatFraction,
  formatNines,
  parseAvailability,
  parseDuration,
  subtractExact,
  toNumber,
  windowByKey,
  type TierInput,
  type Window,
} from "@/lib/toolkit/uptime-sla-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------------ styles */

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-2 min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT_CLASS =
  "mt-2 min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON_CLASS =
  "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF_CLASS =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const BUTTON_CLASS =
  "inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-50";
const ERROR_CLASS =
  "mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const HINT_CLASS = "mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]";
const TH_CLASS =
  "py-2 pr-4 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const TD_CLASS = "py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]";
const TD_DIM_CLASS = "py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]";

/* ---------------------------------------------------------------- examples */

interface Tier extends TierInput {
  id: number;
}

const CHAIN_EXAMPLES: { label: string; tiers: TierInput[] }[] = [
  {
    label: "Single path",
    tiers: [
      { name: "DNS", availability: "99.99", copies: 1, need: 1 },
      { name: "Load balancer", availability: "99.99", copies: 1, need: 1 },
      { name: "App server", availability: "99.9", copies: 1, need: 1 },
      { name: "Database", availability: "99.9", copies: 1, need: 1 },
    ],
  },
  {
    label: "Redundant tiers",
    tiers: [
      { name: "DNS", availability: "99.99", copies: 2, need: 1 },
      { name: "Load balancer", availability: "99.99", copies: 2, need: 1 },
      { name: "App server", availability: "99.9", copies: 3, need: 2 },
      { name: "Database", availability: "99.9", copies: 2, need: 1 },
    ],
  },
  {
    label: "Third-party chain",
    tiers: [
      { name: "CDN", availability: "99.95", copies: 1, need: 1 },
      { name: "API", availability: "99.9", copies: 2, need: 1 },
      { name: "Identity provider", availability: "99.9", copies: 1, need: 1 },
      { name: "Payment API", availability: "99.95", copies: 1, need: 1 },
      { name: "Email API", availability: "99.5", copies: 1, need: 1 },
    ],
  },
];

const PRESET_PERCENTS = PRESETS.map((p) => {
  const parsed = parseAvailability(p);
  return { label: p, u: parsed.kind === "ok" ? parsed.unavailability : { num: 0n, den: 1n } };
});

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/* ------------------------------------------------------------- sub-views */

function DowntimeRows({ windows, u }: { windows: Window[]; u: { num: bigint; den: bigint } }) {
  return (
    <>
      {windows.map((w) => {
        const exact = downtimeSeconds(u, w.seconds);
        return (
          <tr key={w.key} className="border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0">
            <th scope="row" className={`${TD_CLASS} font-normal`}>
              {w.label}
            </th>
            <td className={TD_DIM_CLASS}>{w.length}</td>
            <td className={`${TD_CLASS} text-[hsl(var(--brand-signal))]`}>{formatDuration(toNumber(exact))}</td>
            <td className={TD_DIM_CLASS}>{formatExact(exact, 3)} s</td>
          </tr>
        );
      })}
    </>
  );
}

/** The chain drawn left to right, redundant copies stacked. Decorative; the table says the same. */
function ChainDiagram({ tiers, results }: { tiers: Tier[]; results: ReturnType<typeof composite> }) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex w-max items-center gap-2" aria-hidden="true">
        <div className="rounded-lg border border-[hsl(var(--brand-iron))] px-3 py-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
          Request
        </div>
        {tiers.map((tier, i) => {
          const r = results.tiers[i];
          const bad = !r || r.error !== null;
          return (
            <Fragment key={tier.id}>
              <ArrowRight className="h-4 w-4 shrink-0 text-[hsl(var(--brand-ash))]" />
              <div
                className={`flex min-w-[8.5rem] flex-col gap-1.5 rounded-xl border p-2.5 ${
                  bad
                    ? "border-[hsl(var(--brand-danger)/0.6)]"
                    : i === results.weakest
                      ? "border-[hsl(var(--brand-amber)/0.7)]"
                      : "border-[hsl(var(--brand-iron))]"
                } ${r && r.copies > 1 ? "border-dashed" : ""}`}
              >
                <div className="max-w-[10rem] truncate font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                  {r?.name ?? tier.name}
                </div>
                {Array.from({ length: r?.copies ?? 1 }, (_, c) => (
                  <div
                    key={c}
                    className="rounded-md border border-[hsl(var(--brand-iron)/0.8)] bg-[hsl(var(--brand-obsidian)/0.6)] px-2 py-1 font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-bone-dim))]"
                  >
                    {bad ? "?" : `${tier.availability.trim().replace(/\s*%$/, "")}%`}
                  </div>
                ))}
                {r && r.copies > 1 ? (
                  <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.14em] text-[hsl(var(--brand-ash))]">
                    need {r.need} of {r.copies}
                  </div>
                ) : null}
                <div
                  className={`font-mono-tight text-[0.6875rem] ${
                    bad ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-signal))]"
                  }`}
                >
                  {bad ? "invalid" : `${formatAvailability(r.tierU)}%`}
                </div>
              </div>
            </Fragment>
          );
        })}
        <ArrowRight className="h-4 w-4 shrink-0 text-[hsl(var(--brand-ash))]" />
        <div className="rounded-lg border border-[hsl(var(--brand-signal)/0.6)] px-3 py-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-signal))]">
          {results.ok ? `${formatAvailability(results.u)}%` : "Served"}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- page */

export function UptimeSlaCalculator() {
  const [raw, setRaw] = useState("99.9");
  const [downRaw, setDownRaw] = useState("43m 50s");
  const [windowKey, setWindowKey] = useState("month");
  const [target, setTarget] = useState("99.9");
  const nextId = useRef(100);
  const [tiers, setTiers] = useState<Tier[]>(() =>
    CHAIN_EXAMPLES[0].tiers.map((t, i) => ({ ...t, id: i + 1 })),
  );

  /* forward */
  const parsed = useMemo(() => parseAvailability(raw), [raw]);
  const ok = parsed.kind === "ok" ? parsed : null;
  const uNum = ok ? toNumber(ok.unavailability) : NaN;

  const summary = ok
    ? [
        `Availability ${formatExact(ok.percent, 12)}% (${formatNines(uNum)} nines)`,
        ...[...WINDOWS, ...CALENDAR_MONTHS].map(
          (w) =>
            `${`${w.label} (${w.length})`.padEnd(26)}${formatDuration(toNumber(downtimeSeconds(ok.unavailability, w.seconds)))}`,
        ),
      ].join("\n")
    : "";

  /* reverse */
  const win = windowByKey(windowKey);
  const down = useMemo(() => parseDuration(downRaw), [downRaw]);
  const downOk = down.kind === "ok" ? down.seconds : null;
  const achieved = downOk ? availabilityFromDowntime(downOk, win.seconds) : null;
  const targetParsed = parseAvailability(target);
  const budget = targetParsed.kind === "ok" ? downtimeSeconds(targetParsed.unavailability, win.seconds) : null;
  const remaining = downOk && budget ? subtractExact(budget, downOk) : null;
  const usedFraction = downOk && budget && budget.num !== 0n ? toNumber(downOk) / toNumber(budget) : null;
  const downError =
    down.kind === "error"
      ? down.message
      : downOk && !achieved
        ? `${formatDuration(toNumber(downOk))} is longer than the window itself (${win.length}).`
        : null;

  /* composite */
  const results = useMemo(() => composite(tiers), [tiers]);
  const anyRedundant = results.tiers.some((t) => t.copies > 1);

  function updateTier(id: number, patch: Partial<TierInput>) {
    setTiers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...patch };
        if (next.need > next.copies) next.need = next.copies;
        return next;
      }),
    );
  }
  function addTier() {
    setTiers((prev) =>
      prev.length >= MAX_TIERS
        ? prev
        : [...prev, { id: nextId.current++, name: "", availability: "99.9", copies: 1, need: 1 }],
    );
  }
  function removeTier(id: number) {
    setTiers((prev) => prev.filter((t) => t.id !== id));
  }
  function loadChain(example: TierInput[]) {
    setTiers(example.map((t) => ({ ...t, id: nextId.current++ })));
  }

  const chainText = results.ok
    ? results.tiers
        .map((t) => (t.copies > 1 ? `${t.name} (${t.need} of ${t.copies})` : t.name))
        .join(" then ")
    : "";

  return (
    <ToolShell slug="uptime-sla-calculator">
      <div className="space-y-6">
        {/* ------------------------------------------------ forward */}
        <ToolPanel title="Availability to allowed downtime">
          <label htmlFor="sla-availability" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Availability target, in percent
          </label>
          <input
            id="sla-availability"
            type="text"
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={parsed.kind === "error"}
            aria-describedby="sla-availability-message"
            placeholder="99.95"
            data-testid="input-availability"
            className={`${INPUT_CLASS} sm:max-w-[280px]`}
          />
          {parsed.kind === "error" ? (
            <p id="sla-availability-message" role="alert" data-testid="text-availability-error" className={ERROR_CLASS}>
              <span aria-hidden="true">✕</span>
              <span className="min-w-0 break-words">{parsed.message}</span>
            </p>
          ) : (
            <p id="sla-availability-message" className={HINT_CLASS}>
              {ok && ok.unavailability.num === 0n
                ? "100 percent allows no downtime at all, not even a restart. No real service promises it."
                : "A plain number such as 99.95, with or without the percent sign."}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Presets
            </span>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setRaw(p)}
                aria-pressed={raw.trim() === p}
                data-testid={`button-preset-${p.replace(".", "-")}`}
                className={`${CHIP_CLASS} ${raw.trim() === p ? CHIP_ON_CLASS : CHIP_OFF_CLASS}`}
              >
                {p}%
              </button>
            ))}
          </div>

          {ok ? (
            <div className="mt-6" data-testid="output-downtime">
              <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-3">
                <ToolResult label="Nines" value={formatNines(uNum)} testId="text-nines" />
                <ToolResult label="Unavailable" value={`${formatExact({ num: ok.unavailability.num * 100n, den: ok.unavailability.den }, 12)}%`} />
                <ToolResult label="Fraction" value={formatFraction(uNum)} />
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse" data-testid="table-downtime">
                  <caption className="sr-only">Allowed downtime at {formatExact(ok.percent, 12)} percent availability</caption>
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>Window</th>
                      <th scope="col" className={TH_CLASS}>Length</th>
                      <th scope="col" className={TH_CLASS}>Allowed downtime</th>
                      <th scope="col" className={TH_CLASS}>Exact</th>
                    </tr>
                  </thead>
                  <tbody>
                    <DowntimeRows windows={WINDOWS} u={ok.unavailability} />
                  </tbody>
                  <tbody>
                    <tr>
                      <th scope="rowgroup" colSpan={4} className={`${TH_CLASS} pt-5`}>
                        Calendar months
                      </th>
                    </tr>
                    <DowntimeRows windows={CALENDAR_MONTHS} u={ok.unavailability} />
                  </tbody>
                </table>
              </div>
              <p className={HINT_CLASS}>
                Month is 30.44 days, the average month rounded to two decimals. Year is 365.25 days so leap
                years average in, and a quarter is a quarter of that year. A contract measured per calendar
                month gives February about 10 percent less room than a 31-day month.
              </p>
              <div className="mt-4">
                <CopyButton value={summary} label="Copy the downtime table as text" testId="button-copy-downtime">
                  <span>Copy table</span>
                </CopyButton>
              </div>
            </div>
          ) : null}
        </ToolPanel>

        {/* ------------------------------------------------ reverse */}
        <ToolPanel title="Downtime to availability">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="min-w-0">
              <label htmlFor="sla-downtime" className={LABEL_CLASS}>
                Measured downtime
              </label>
              <input
                id="sla-downtime"
                type="text"
                value={downRaw}
                onChange={(e) => setDownRaw(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={downError !== null}
                aria-describedby="sla-downtime-message"
                placeholder="43m 50s"
                data-testid="input-downtime"
                className={INPUT_CLASS}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="sla-window" className={LABEL_CLASS}>
                Over a window of
              </label>
              <select
                id="sla-window"
                value={windowKey}
                onChange={(e) => setWindowKey(e.target.value)}
                data-testid="select-window"
                className={SELECT_CLASS}
              >
                {ALL_WINDOWS.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.label} ({w.length})
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="sla-target" className={LABEL_CLASS}>
                Compare with target
              </label>
              <select
                id="sla-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                data-testid="select-target"
                className={SELECT_CLASS}
              >
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </select>
            </div>
          </div>
          {downError ? (
            <p id="sla-downtime-message" role="alert" data-testid="text-downtime-error" className={ERROR_CLASS}>
              <span aria-hidden="true">✕</span>
              <span className="min-w-0 break-words">{downError}</span>
            </p>
          ) : (
            <p id="sla-downtime-message" className={HINT_CLASS}>
              Units ms, s, m, h, d or w, combined as in 1h 30m, or a clock time such as 0:43:50.
            </p>
          )}

          {downOk && achieved ? (
            <div className="mt-4" data-testid="output-availability">
              <ToolResult
                label="Availability achieved"
                value={`${formatExact(achieved, 6, "floor")}%`}
                testId="text-achieved"
              />
              <ToolResult
                label="Nines"
                value={formatNines(toNumber(downOk) / win.seconds)}
              />
              <ToolResult
                label="Same rate over a year"
                value={formatDuration((toNumber(downOk) / win.seconds) * WINDOWS[4].seconds)}
              />
              {budget ? (
                <>
                  <ToolResult label={`Budget at ${target}%`} value={formatDuration(toNumber(budget))} />
                  <ToolResult
                    label="Budget used"
                    value={
                      usedFraction === null
                        ? toNumber(downOk) === 0
                          ? "none"
                          : "all of it, the target allows no downtime"
                        : pct(usedFraction)
                    }
                    testId="text-budget-used"
                  />
                  {remaining ? (
                    <ToolResult
                      label={remaining.num < 0n ? "Target missed by" : "Remaining"}
                      value={formatDuration(Math.abs(toNumber(remaining)))}
                    />
                  ) : null}
                </>
              ) : null}
              <p className={HINT_CLASS}>
                The percentage is rounded down, so a figure that prints as the target really met it.
              </p>
            </div>
          ) : null}
        </ToolPanel>

        {/* ------------------------------------------------ composite */}
        <ToolPanel title="Composite availability">
          <p className="max-w-3xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            List the tiers a request passes through, in order. Every tier must be up for a request to be
            served, so the tiers multiply. Copies inside a tier are redundant: the tier is up while at least
            the number you need are up.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Examples
            </span>
            {CHAIN_EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => loadChain(ex.tiers)}
                data-testid={`button-chain-${ex.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={`${CHIP_CLASS} ${CHIP_OFF_CLASS}`}
              >
                {ex.label}
              </button>
            ))}
          </div>

          <ol className="mt-5 space-y-3" data-testid="list-tiers">
            {tiers.map((tier, i) => {
              const r = results.tiers[i];
              const errId = `sla-tier-${tier.id}-error`;
              return (
                <li
                  key={tier.id}
                  className="rounded-xl border border-[hsl(var(--brand-iron)/0.8)] bg-[hsl(var(--brand-obsidian)/0.35)] p-3"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-8 shrink-0 pb-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      {i + 1}.
                    </div>
                    <div className="min-w-[10rem] flex-[2_1_10rem]">
                      <label htmlFor={`sla-tier-${tier.id}-name`} className={LABEL_CLASS}>
                        Name
                      </label>
                      <input
                        id={`sla-tier-${tier.id}-name`}
                        type="text"
                        value={tier.name}
                        maxLength={40}
                        onChange={(e) => updateTier(tier.id, { name: e.target.value })}
                        placeholder={`Tier ${i + 1}`}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="min-w-[7rem] flex-[1_1_7rem]">
                      <label htmlFor={`sla-tier-${tier.id}-avail`} className={LABEL_CLASS}>
                        Each, %
                      </label>
                      <input
                        id={`sla-tier-${tier.id}-avail`}
                        type="text"
                        inputMode="decimal"
                        value={tier.availability}
                        onChange={(e) => updateTier(tier.id, { availability: e.target.value })}
                        aria-invalid={r?.error ? true : undefined}
                        aria-describedby={r?.error ? errId : undefined}
                        className={INPUT_CLASS}
                        data-testid={`input-tier-${i}`}
                      />
                    </div>
                    <div className="w-[5.5rem] shrink-0">
                      <label htmlFor={`sla-tier-${tier.id}-copies`} className={LABEL_CLASS}>
                        Copies
                      </label>
                      <select
                        id={`sla-tier-${tier.id}-copies`}
                        value={tier.copies}
                        onChange={(e) => updateTier(tier.id, { copies: Number(e.target.value) })}
                        className={SELECT_CLASS}
                      >
                        {Array.from({ length: MAX_COPIES }, (_, n) => n + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-[5.5rem] shrink-0">
                      <label htmlFor={`sla-tier-${tier.id}-need`} className={LABEL_CLASS}>
                        Need
                      </label>
                      <select
                        id={`sla-tier-${tier.id}-need`}
                        value={Math.min(tier.need, tier.copies)}
                        onChange={(e) => updateTier(tier.id, { need: Number(e.target.value) })}
                        disabled={tier.copies === 1}
                        className={`${SELECT_CLASS} disabled:opacity-60`}
                      >
                        {Array.from({ length: tier.copies }, (_, n) => n + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTier(tier.id)}
                      aria-label={`Remove tier ${i + 1}${tier.name.trim() ? `, ${tier.name.trim()}` : ""}`}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-danger)/0.6)] hover:text-[hsl(var(--brand-danger))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  {r?.error ? (
                    <p id={errId} role="alert" className={ERROR_CLASS}>
                      <span aria-hidden="true">✕</span>
                      <span className="min-w-0 break-words">{r.error}</span>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={addTier}
              disabled={tiers.length >= MAX_TIERS}
              data-testid="button-add-tier"
              className={BUTTON_CLASS}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add tier
            </button>
            <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              {tiers.length} of {MAX_TIERS} tiers, up to {MAX_COPIES} copies each.
            </span>
          </div>

          {tiers.length > 0 ? (
            <div className="mt-6">
              <div className={LABEL_CLASS}>Dependency diagram</div>
              <div className="mt-3">
                <ChainDiagram tiers={tiers} results={results} />
              </div>
              {results.ok ? (
                <p className="sr-only">
                  A request passes through {chainText}, for a chain availability of {formatAvailability(results.u)}{" "}
                  percent.
                </p>
              ) : null}
            </div>
          ) : (
            <p className={HINT_CLASS}>Add a tier to build a chain.</p>
          )}

          {results.ok ? (
            <div className="mt-6 space-y-6" data-testid="output-composite">
              <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
                <div>
                  <ToolResult
                    label="Chain availability"
                    value={`${formatAvailability(results.u)}%`}
                    testId="text-composite"
                  />
                  <ToolResult label="Nines" value={formatNines(results.u)} />
                  <ToolResult label="Unavailable fraction" value={formatFraction(results.u)} />
                </div>
                <div>
                  <ToolResult label="Downtime per month" value={formatDuration(results.u * WINDOWS[2].seconds)} />
                  <ToolResult label="Downtime per year" value={formatDuration(results.u * WINDOWS[4].seconds)} />
                  {anyRedundant ? (
                    <ToolResult
                      label="Without redundancy"
                      value={`${formatAvailability(results.uSingle)}%, ${formatDuration(results.uSingle * WINDOWS[4].seconds)} a year`}
                    />
                  ) : null}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse" data-testid="table-tiers">
                  <caption className="sr-only">Availability of each tier and its share of the chain's downtime</caption>
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>Tier</th>
                      <th scope="col" className={TH_CLASS}>One copy</th>
                      <th scope="col" className={TH_CLASS}>Redundancy</th>
                      <th scope="col" className={TH_CLASS}>Whole tier</th>
                      <th scope="col" className={TH_CLASS}>Share of downtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.tiers.map((t, i) => (
                      <tr key={tiers[i]?.id ?? i} className="border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0">
                        <th scope="row" className={`${TD_CLASS} max-w-[12rem] break-words font-normal`}>
                          {t.name}
                          {i === results.weakest ? (
                            <span className="ml-2 font-mono-tight text-[0.625rem] uppercase tracking-[0.14em] text-[hsl(var(--brand-amber))]">
                              weakest
                            </span>
                          ) : null}
                        </th>
                        <td className={TD_CLASS}>{formatAvailability(t.u)}%</td>
                        <td className={TD_DIM_CLASS}>
                          {t.copies === 1 ? "single" : `${t.need} of ${t.copies}`}
                        </td>
                        <td className={`${TD_CLASS} text-[hsl(var(--brand-signal))]`}>{formatAvailability(t.tierU)}%</td>
                        <td className={TD_CLASS}>{pct(t.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="max-w-3xl font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                For small numbers the chain's unavailability is close to the sum of each tier's, which is why
                every dependency you add in series costs you its whole downtime budget, and why the chain can
                never be more available than its weakest tier. These figures assume tiers fail independently.
                A shared power feed, network, region, deploy or configuration change can take several copies
                down together, and then the redundancy here is optimistic.
              </p>
            </div>
          ) : null}
        </ToolPanel>

        {/* ------------------------------------------------ reference */}
        <ToolPanel title="Every preset at a glance">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse" data-testid="table-presets">
              <caption className="sr-only">Allowed downtime for each common availability target</caption>
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH_CLASS}>Target</th>
                  {WINDOWS.map((w) => (
                    <th key={w.key} scope="col" className={TH_CLASS}>
                      {w.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PRESET_PERCENTS.map((p) => (
                  <tr key={p.label} className="border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0">
                    <th scope="row" className={`${TD_CLASS} font-normal text-[hsl(var(--brand-signal))]`}>
                      {p.label}%
                    </th>
                    {WINDOWS.map((w) => (
                      <td key={w.key} className={TD_CLASS}>
                        {formatDuration(toNumber(downtimeSeconds(p.u, w.seconds)))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
