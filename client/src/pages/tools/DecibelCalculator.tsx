/**
 * Decibel calculator.
 *
 * Three views over the same arithmetic. Sound adds and subtracts incoherent
 * sources as powers, moves a level with distance, and A-weights octave band
 * data. RF converts between dBm and watts, works out free-space path loss,
 * and walks a link budget one gain or loss at a time. Ratios shows what a
 * decibel figure means as a power or amplitude ratio. All of the math lives
 * in lib/toolkit/decibel-calculator so it can be tested without React.
 */

import { useMemo, useState } from "react";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  DISTANCE_FACTOR,
  FREQUENCY_FACTOR,
  MAX_DISTANCE_M,
  MAX_ENTRIES,
  MAX_FREQUENCY_HZ,
  MIN_FREQUENCY_HZ,
  OCTAVE_BANDS,
  POWER_UNITS,
  aWeighting,
  analyzeSum,
  convertPower,
  convertRatio,
  formatDb,
  formatMeters,
  formatNumber,
  formatSi,
  formatSignedDb,
  freeSpacePathLoss,
  levelAtDistance,
  linkBudget,
  parseDb,
  parseLevelList,
  parseLoss,
  parseNumber,
  subtractLevel,
  weightOctaveBands,
  type DistanceUnit,
  type FrequencyUnit,
  type Parsed,
  type PowerUnit,
  type RatioKind,
  type SpreadingModel,
} from "@/lib/toolkit/decibel-calculator";

type Mode = "sound" | "rf" | "ratio";

const MODES: { key: Mode; label: string }[] = [
  { key: "sound", label: "Sound levels" },
  { key: "rf", label: "RF link" },
  { key: "ratio", label: "Ratios" },
];

const LEVEL_EXAMPLES: { label: string; value: string }[] = [
  { label: "Two equal fans", value: "45\n45" },
  { label: "Ten servers", value: "10 x 55" },
  { label: "Loud plus quiet", value: "60\n50" },
  { label: "Mixed room", value: "62\n58\n55\n55\n49" },
];

/** Illustrative octave band levels for a rack of fans, 63 Hz to 8 kHz. */
const DEFAULT_BANDS = ["68", "66", "64", "62", "59", "56", "52", "46"];

const RATIO_TABLE = [-10, -6, -3, -1, 0, 1, 3, 6, 10, 20, 30];

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT =
  "min-h-[44px] rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_BASE =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON = "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const ERROR_TEXT = "mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const HINT_TEXT = "mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]";
const WARN_BOX =
  "mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const DANGER_BOX =
  "mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const TD = "py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]";
const TD_DIM = "py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]";
const BIG =
  "font-display text-[clamp(2rem,6vw,3rem)] font-medium leading-none tracking-[-0.03em] text-[hsl(var(--brand-bone))]";

function errorOf<T>(parsed: Parsed<T>): string | null {
  return parsed.ok ? null : parsed.error;
}

function percent(share: number): string {
  if (share >= 0.9995 && share < 1) return ">99.9%";
  if (share > 0 && share < 0.0005) return "<0.1%";
  return `${(share * 100).toFixed(1)}%`;
}

/** A labeled text input with an optional fixed unit after it. */
function Field({
  id,
  label,
  value,
  onChange,
  error,
  suffix,
  testId,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  suffix?: string;
  testId?: string;
  placeholder?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder={placeholder}
          data-testid={testId}
          className={INPUT}
        />
        {suffix ? (
          <span className="w-[2.75rem] shrink-0 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{suffix}</span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className={ERROR_TEXT}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A labeled text input beside a unit select. */
function UnitField<U extends string>({
  id,
  label,
  value,
  onChange,
  unit,
  onUnit,
  units,
  error,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit: U;
  onUnit: (unit: U) => void;
  units: { value: U; label: string }[];
  error?: string | null;
  testId?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          data-testid={testId}
          className={INPUT}
        />
        <select
          value={unit}
          onChange={(event) => onUnit(event.target.value as U)}
          aria-label={`${label}, unit`}
          data-testid={testId ? `${testId}-unit` : undefined}
          className={`${SELECT} w-[5.5rem] shrink-0`}
        >
          {units.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p id={errorId} role="alert" className={ERROR_TEXT}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ChipGroup<K extends string>({
  label,
  options,
  value,
  onChange,
  testPrefix,
}: {
  label: string;
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  testPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          data-testid={`${testPrefix}-${o.key}`}
          className={`${CHIP_BASE} ${value === o.key ? CHIP_ON : CHIP_OFF}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ sound */

function SoundView() {
  const [levelsText, setLevelsText] = useState("45\n45");
  const [subTotal, setSubTotal] = useState("58");
  const [subPart, setSubPart] = useState("52");
  const [distLevel, setDistLevel] = useState("78");
  const [r1, setR1] = useState("1");
  const [r2, setR2] = useState("4");
  const [distUnit, setDistUnit] = useState<"m" | "ft">("m");
  const [model, setModel] = useState<SpreadingModel>("point");
  const [bands, setBands] = useState<string[]>(DEFAULT_BANDS);

  const levels = useMemo(() => parseLevelList(levelsText), [levelsText]);
  const sum = useMemo(() => (levels.ok ? analyzeSum(levels.value) : null), [levels]);

  const totalParsed = useMemo(() => parseDb(subTotal, "the measured total"), [subTotal]);
  const partParsed = useMemo(() => parseDb(subPart, "the part to remove"), [subPart]);
  const difference = useMemo(
    () => (totalParsed.ok && partParsed.ok ? subtractLevel(totalParsed.value, partParsed.value) : null),
    [totalParsed, partParsed],
  );

  const distLevelParsed = useMemo(() => parseDb(distLevel, "the known level"), [distLevel]);
  const r1Parsed = useMemo(
    () => parseNumber(r1, "the measured distance", { min: 0, minExclusive: true, max: 1e9 }),
    [r1],
  );
  const r2Parsed = useMemo(
    () => parseNumber(r2, "the new distance", { min: 0, minExclusive: true, max: 1e9 }),
    [r2],
  );
  const atDistance =
    distLevelParsed.ok && r1Parsed.ok && r2Parsed.ok
      ? levelAtDistance(distLevelParsed.value, r1Parsed.value, r2Parsed.value, model)
      : null;

  const bandParsed = useMemo(
    () =>
      bands.map((text, i) =>
        text.trim() === "" ? null : parseDb(text, `the ${OCTAVE_BANDS[i].label} Hz band`),
      ),
    [bands],
  );
  const bandsOk = bandParsed.every((p) => p === null || p.ok);
  const weighted = useMemo(
    () =>
      bandsOk
        ? weightOctaveBands(bandParsed.map((p) => (p !== null && p.ok ? p.value : null)))
        : null,
    [bandParsed, bandsOk],
  );

  const loudest = sum
    ? sum.contributions.reduce((best, c) => (c.entry.level > best.entry.level ? c : best), sum.contributions[0])
    : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Add sources">
          <label htmlFor="db-levels" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Levels in dB, one per line
          </label>
          <textarea
            id="db-levels"
            value={levelsText}
            onChange={(event) => setLevelsText(event.target.value)}
            rows={6}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={!levels.ok}
            aria-describedby="db-levels-message"
            data-testid="input-levels"
            className="mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          {!levels.ok ? (
            <p id="db-levels-message" role="alert" className={ERROR_TEXT}>
              {levels.error}
            </p>
          ) : (
            <p id="db-levels-message" className={HINT_TEXT}>
              Commas and spaces also separate levels, and 12 x 55 means twelve identical sources at 55 dB. Up to{" "}
              {MAX_ENTRIES} entries. Add levels that share one weighting: all dBA, or all unweighted.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {LEVEL_EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setLevelsText(example.value)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={`${CHIP_BASE} ${CHIP_OFF}`}
              >
                {example.label}
              </button>
            ))}
          </div>
        </ToolPanel>

        <ToolPanel title="Combined level">
          {sum && loudest ? (
            <div>
              <p className={BIG} data-testid="output-total" aria-live="polite">
                {formatDb(sum.total)} <span className="text-[0.5em] text-[hsl(var(--brand-ash))]">dB</span>
              </p>
              <div className="mt-4">
                <ToolResult label="Sources" value={sum.sources.toLocaleString("en-US")} />
                <ToolResult label="Loudest single source" value={`${formatDb(loudest.entry.level)} dB`} />
                <ToolResult
                  label="Above the loudest"
                  value={`${formatSignedDb(sum.total - loudest.entry.level)} dB`}
                  testId="text-above-loudest"
                />
                {sum.contributions.length === 1 && sum.sources === 1 ? null : (
                  <ToolResult
                    label="Arithmetic sum, for contrast"
                    value={
                      sum.sources <= 1000
                        ? `${formatDb(sum.contributions.reduce((n, c) => n + c.entry.level * c.entry.count, 0))} dB, which is wrong`
                        : "meaningless"
                    }
                  />
                )}
              </div>
              <p className={HINT_TEXT}>
                Doubling the number of identical sources adds 3.01 dB and ten times as many adds 10 dB. A source 10 dB
                below another adds only 0.41 dB to it.
              </p>
            </div>
          ) : (
            <p className={HINT_TEXT}>Enter at least one valid level to see the combined result.</p>
          )}
        </ToolPanel>
      </div>

      {sum && sum.contributions.length > 1 ? (
        <ToolPanel title="What each source contributes">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left" data-testid="table-contributions">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH}>
                    Source
                  </th>
                  <th scope="col" className={TH}>
                    Level
                  </th>
                  <th scope="col" className={TH}>
                    Share of power
                  </th>
                  <th scope="col" className={TH}>
                    Total without it
                  </th>
                </tr>
              </thead>
              <tbody>
                {sum.contributions.map((c, i) => (
                  <tr key={i} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                    <td className={TD_DIM}>{c.entry.count > 1 ? `${i + 1} (${c.entry.count} sources)` : i + 1}</td>
                    <td className={TD}>{formatDb(c.entry.level)} dB</td>
                    <td className={TD}>{percent(c.share)}</td>
                    <td className={TD}>
                      {c.without === null || c.drop === null
                        ? "nothing left"
                        : `${formatDb(c.without)} dB (${formatSignedDb(-c.drop)})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={HINT_TEXT}>
            Quieting the loudest source is almost always the only change that moves the total. Removing a source that
            carries a small share of the power changes the result by a fraction of a decibel.
          </p>
        </ToolPanel>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Subtract a source">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="db-sub-total"
              label="Measured total"
              value={subTotal}
              onChange={setSubTotal}
              error={errorOf(totalParsed)}
              suffix="dB"
              testId="input-sub-total"
            />
            <Field
              id="db-sub-part"
              label="Background or known part"
              value={subPart}
              onChange={setSubPart}
              error={errorOf(partParsed)}
              suffix="dB"
              testId="input-sub-part"
            />
          </div>
          {difference && !difference.ok ? (
            <p role="alert" className={DANGER_BOX}>
              {difference.error}
            </p>
          ) : null}
          {difference && difference.ok && totalParsed.ok ? (
            <div className="mt-4">
              <ToolResult
                label="What remains"
                value={`${formatDb(difference.value.remaining)} dB`}
                testId="output-remaining"
              />
              <ToolResult
                label="Correction"
                value={`${formatSignedDb(difference.value.remaining - totalParsed.value)} dB`}
              />
              <ToolResult label="Total minus part" value={`${formatDb(difference.value.margin)} dB`} />
              <ToolResult
                label="Error multiplier"
                value={`${formatNumber(difference.value.sensitivity, 3)} dB per dB`}
              />
              <p className={HINT_TEXT}>
                Each 1 dB of error in the measured total moves the answer by about{" "}
                {formatNumber(difference.value.sensitivity, 3)} dB.
              </p>
              {difference.value.margin < 3 ? (
                <p className={WARN_BOX}>
                  The total is less than 3 dB above the part, so what remains is quieter than the part itself and the
                  answer is very sensitive to measurement error. Measure closer to the source, or measure the
                  background again at a quieter time.
                </p>
              ) : null}
            </div>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Distance">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="db-dist-level"
              label="Known level"
              value={distLevel}
              onChange={setDistLevel}
              error={errorOf(distLevelParsed)}
              suffix="dB"
              testId="input-dist-level"
            />
            <div className="min-w-0">
              <label htmlFor="db-dist-unit" className={LABEL}>
                Distance unit
              </label>
              <div className="mt-2">
                <select
                  id="db-dist-unit"
                  value={distUnit}
                  onChange={(event) => setDistUnit(event.target.value as "m" | "ft")}
                  data-testid="select-dist-unit"
                  className={`${SELECT} w-full`}
                >
                  <option value="m">meters</option>
                  <option value="ft">feet</option>
                </select>
              </div>
            </div>
            <Field
              id="db-r1"
              label="Measured at"
              value={r1}
              onChange={setR1}
              error={errorOf(r1Parsed)}
              suffix={distUnit}
              testId="input-r1"
            />
            <Field
              id="db-r2"
              label="Level wanted at"
              value={r2}
              onChange={setR2}
              error={errorOf(r2Parsed)}
              suffix={distUnit}
              testId="input-r2"
            />
          </div>
          <div className="mt-4">
            <ChipGroup
              label="Source shape"
              options={[
                { key: "point" as SpreadingModel, label: "Point source" },
                { key: "line" as SpreadingModel, label: "Line source" },
              ]}
              value={model}
              onChange={setModel}
              testPrefix="button-model"
            />
          </div>
          {atDistance && r2Parsed.ok ? (
            <div className="mt-4">
              <ToolResult
                label={`Level at ${formatNumber(r2Parsed.value)} ${distUnit}`}
                value={`${formatDb(atDistance.level)} dB`}
                testId="output-distance-level"
              />
              <ToolResult label="Change" value={`${formatSignedDb(atDistance.change)} dB`} />
              <ToolResult
                label="Distance doublings"
                value={`${formatNumber(atDistance.doublings, 3)} at ${formatDb(atDistance.perDoubling)} dB each`}
              />
            </div>
          ) : null}
          <p className={HINT_TEXT}>
            {model === "point"
              ? "A point source spreads over a sphere, so the level falls 6.02 dB per doubling of distance."
              : "A long line source, such as a row of racks seen from close by, spreads over a cylinder and falls 3.01 dB per doubling."}{" "}
            This is a free field. Indoors, reflections build a reverberant field, and past a certain distance the level
            stops falling.
          </p>
        </ToolPanel>
      </div>

      <ToolPanel title="Octave bands to dBA">
        <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          Unweighted sound pressure levels per octave band, as an equipment data sheet lists them. Leave a band blank to
          skip it. The starting values are illustrative.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {OCTAVE_BANDS.map((band, i) => {
            const parsed = bandParsed[i];
            return (
              <Field
                key={band.label}
                id={`db-band-${band.label}`}
                label={`${band.label} Hz`}
                value={bands[i]}
                onChange={(value) => setBands((prev) => prev.map((v, j) => (j === i ? value : v)))}
                error={parsed && !parsed.ok ? parsed.error : null}
                testId={`input-band-${band.label}`}
              />
            );
          })}
        </div>
        {weighted ? (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] border-collapse text-left" data-testid="table-bands">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Band
                    </th>
                    <th scope="col" className={TH}>
                      Level
                    </th>
                    <th scope="col" className={TH}>
                      A weight
                    </th>
                    <th scope="col" className={TH}>
                      Weighted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {weighted.bands.map((b) => (
                    <tr key={b.band.label} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                      <td className={TD_DIM}>{b.band.label} Hz</td>
                      <td className={TD}>{formatDb(b.level, 1)}</td>
                      <td className={TD}>{formatSignedDb(aWeighting(b.band.hz), 1)}</td>
                      <td className={TD}>{formatDb(b.a, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <ToolResult label="A-weighted, dBA" value={`${formatDb(weighted.a, 1)} dBA`} testId="output-dba" />
              <ToolResult label="C-weighted, dBC" value={`${formatDb(weighted.c, 1)} dBC`} />
              <ToolResult label="Unweighted, dB(Z)" value={`${formatDb(weighted.z, 1)} dB`} />
              <ToolResult label="dBC minus dBA" value={`${formatDb(weighted.c - weighted.a, 1)} dB`} />
              <p className={HINT_TEXT}>
                Weightings from IEC 61672-1. A gap between dBC and dBA means much of the energy sits at low
                frequencies, which the A curve discounts and which walls and ear protection stop least well.
              </p>
            </div>
          </div>
        ) : bandsOk ? (
          <p className={HINT_TEXT}>Enter a level in at least one band.</p>
        ) : null}
      </ToolPanel>
    </div>
  );
}

/* ------------------------------------------------------------ RF */

const FREQUENCY_UNITS: { value: FrequencyUnit; label: string }[] = [
  { value: "kHz", label: "kHz" },
  { value: "MHz", label: "MHz" },
  { value: "GHz", label: "GHz" },
];

const DISTANCE_UNITS: { value: DistanceUnit; label: string }[] = [
  { value: "m", label: "m" },
  { value: "km", label: "km" },
  { value: "ft", label: "ft" },
  { value: "mi", label: "mi" },
];

const FREQUENCY_EXAMPLES: { label: string; value: string; unit: FrequencyUnit }[] = [
  { label: "915 MHz", value: "915", unit: "MHz" },
  { label: "2.4 GHz", value: "2.437", unit: "GHz" },
  { label: "5 GHz", value: "5.5", unit: "GHz" },
  { label: "6 GHz", value: "6.5", unit: "GHz" },
];

type PathMode = "fspl" | "manual";

function RfView() {
  const [powerText, setPowerText] = useState("20");
  const [powerUnit, setPowerUnit] = useState<PowerUnit>("dBm");

  const [freqText, setFreqText] = useState("2.437");
  const [freqUnit, setFreqUnit] = useState<FrequencyUnit>("GHz");
  const [distText, setDistText] = useState("1");
  const [distUnit, setDistUnit] = useState<DistanceUnit>("km");

  const [txText, setTxText] = useState("20");
  const [txLossText, setTxLossText] = useState("1");
  const [txGainText, setTxGainText] = useState("6");
  const [pathMode, setPathMode] = useState<PathMode>("fspl");
  const [pathText, setPathText] = useState("100");
  const [otherText, setOtherText] = useState("0");
  const [rxGainText, setRxGainText] = useState("6");
  const [rxLossText, setRxLossText] = useState("1");
  const [sensText, setSensText] = useState("-82");

  const powerParsed = useMemo(() => {
    const isLog = powerUnit === "dBm" || powerUnit === "dBW";
    const n = parseNumber(powerText, "the power", isLog ? {} : { min: 0, minExclusive: true });
    return n.ok ? convertPower(n.value, powerUnit) : n;
  }, [powerText, powerUnit]);

  const freqParsed = useMemo(() => {
    const n = parseNumber(freqText, "the frequency", { min: 0, minExclusive: true });
    if (!n.ok) return n;
    const hz = n.value * FREQUENCY_FACTOR[freqUnit];
    if (hz < MIN_FREQUENCY_HZ || hz > MAX_FREQUENCY_HZ) {
      return { ok: false as const, error: "Enter a frequency between 1 kHz and 3 THz." };
    }
    return { ok: true as const, value: hz };
  }, [freqText, freqUnit]);

  const distParsed = useMemo(() => {
    const n = parseNumber(distText, "the distance", { min: 0, minExclusive: true });
    if (!n.ok) return n;
    const m = n.value * DISTANCE_FACTOR[distUnit];
    if (m > MAX_DISTANCE_M) return { ok: false as const, error: "That distance is past 10^15 m, far beyond any link." };
    return { ok: true as const, value: m };
  }, [distText, distUnit]);

  const path = freqParsed.ok && distParsed.ok ? freeSpacePathLoss(distParsed.value, freqParsed.value) : null;

  const tx = useMemo(() => parseDb(txText, "the transmit power"), [txText]);
  const txLoss = useMemo(() => parseLoss(txLossText, "the transmit cable loss"), [txLossText]);
  const txGain = useMemo(() => parseDb(txGainText, "the transmit antenna gain"), [txGainText]);
  const manualPath = useMemo(() => parseLoss(pathText, "the path loss"), [pathText]);
  const other = useMemo(() => parseLoss(otherText, "the other losses"), [otherText]);
  const rxGain = useMemo(() => parseDb(rxGainText, "the receive antenna gain"), [rxGainText]);
  const rxLoss = useMemo(() => parseLoss(rxLossText, "the receive cable loss"), [rxLossText]);
  const sens = useMemo(
    () => (sensText.trim() === "" ? null : parseDb(sensText, "the receiver sensitivity")),
    [sensText],
  );

  const pathLoss: number | null =
    pathMode === "fspl" ? (path ? path.fspl : null) : manualPath.ok ? manualPath.value : null;

  const link =
    tx.ok && txLoss.ok && txGain.ok && other.ok && rxGain.ok && rxLoss.ok && pathLoss !== null && (sens === null || sens.ok)
      ? linkBudget({
          txDbm: tx.value,
          txLossDb: txLoss.value,
          txGainDbi: txGain.value,
          pathLossDb: pathLoss,
          otherLossDb: other.value,
          rxGainDbi: rxGain.value,
          rxLossDb: rxLoss.value,
          sensitivityDbm: sens && sens.ok ? sens.value : null,
        })
      : null;

  const steps =
    link && tx.ok && txLoss.ok && txGain.ok && other.ok && rxGain.ok && rxLoss.ok && pathLoss !== null
      ? (() => {
          const rows: { label: string; change: number | null; level: number }[] = [];
          let level = tx.value;
          rows.push({ label: "Transmitter output", change: null, level });
          level -= txLoss.value;
          rows.push({ label: "Transmit cable and connectors", change: -txLoss.value, level });
          level += txGain.value;
          rows.push({ label: "Transmit antenna (EIRP)", change: txGain.value, level });
          level -= pathLoss;
          rows.push({ label: pathMode === "fspl" ? "Free-space path loss" : "Path loss", change: -pathLoss, level });
          if (other.value !== 0) {
            level -= other.value;
            rows.push({ label: "Other losses", change: -other.value, level });
          }
          level += rxGain.value;
          rows.push({ label: "Receive antenna", change: rxGain.value, level });
          level -= rxLoss.value;
          rows.push({ label: "Receive cable and connectors", change: -rxLoss.value, level });
          return rows;
        })()
      : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Power">
          <UnitField
            id="db-power"
            label="Power"
            value={powerText}
            onChange={setPowerText}
            unit={powerUnit}
            onUnit={setPowerUnit}
            units={POWER_UNITS}
            error={errorOf(powerParsed)}
            testId="input-power"
          />
          {powerParsed.ok ? (
            <div className="mt-4" data-testid="output-power">
              <ToolResult label="dBm" value={`${formatDb(powerParsed.value.dbm)} dBm`} testId="text-dbm" />
              <ToolResult label="dBW" value={`${formatDb(powerParsed.value.dbw)} dBW`} />
              <ToolResult label="Watts" value={formatSi(powerParsed.value.watts, "W")} testId="text-watts" />
              <ToolResult label="Milliwatts" value={`${formatNumber(powerParsed.value.watts * 1e3, 5)} mW`} />
            </div>
          ) : null}
          <p className={HINT_TEXT}>
            dBm is decibels above 1 mW, so 0 dBm is 1 mW, 30 dBm is 1 W and every 10 dB is a factor of ten. dBW is the
            same scale referenced to 1 W, always 30 lower.
          </p>
        </ToolPanel>

        <ToolPanel title="Free-space path loss">
          <div className="space-y-4">
            <UnitField
              id="db-freq"
              label="Frequency"
              value={freqText}
              onChange={setFreqText}
              unit={freqUnit}
              onUnit={setFreqUnit}
              units={FREQUENCY_UNITS}
              error={errorOf(freqParsed)}
              testId="input-frequency"
            />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Common frequencies">
              {FREQUENCY_EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    setFreqText(ex.value);
                    setFreqUnit(ex.unit);
                  }}
                  data-testid={`button-freq-${ex.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className={`${CHIP_BASE} ${CHIP_OFF}`}
                >
                  {ex.label}
                </button>
              ))}
            </div>
            <UnitField
              id="db-distance"
              label="Distance"
              value={distText}
              onChange={setDistText}
              unit={distUnit}
              onUnit={setDistUnit}
              units={DISTANCE_UNITS}
              error={errorOf(distParsed)}
              testId="input-distance"
            />
          </div>
          {path ? (
            <div className="mt-4">
              <ToolResult label="Free-space path loss" value={`${formatDb(path.fspl)} dB`} testId="output-fspl" />
              <ToolResult label="Wavelength" value={formatMeters(path.wavelength)} />
              <ToolResult label="Distance in wavelengths" value={formatNumber(path.wavelengths, 4)} />
              <ToolResult label="First Fresnel zone radius at midpoint" value={formatMeters(path.fresnelMid)} />
              <p className={HINT_TEXT}>
                Loss between isotropic antennas with nothing in the way (ITU-R P.525). Keep at least 60 percent of the
                Fresnel radius clear of terrain, trees and roofs, or the real loss will be higher.
              </p>
              {path.wavelengths < 2 ? (
                <p className={WARN_BOX}>
                  The antennas are less than two wavelengths apart. The free-space formula assumes each is in the
                  far field of the other, which is not true this close, and below about 0.08 wavelengths it even
                  returns a negative loss.
                </p>
              ) : null}
            </div>
          ) : null}
        </ToolPanel>
      </div>

      <ToolPanel title="Link budget">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            id="db-tx"
            label="Transmit power"
            value={txText}
            onChange={setTxText}
            error={errorOf(tx)}
            suffix="dBm"
            testId="input-tx-power"
          />
          <Field
            id="db-tx-loss"
            label="Transmit cable loss"
            value={txLossText}
            onChange={setTxLossText}
            error={errorOf(txLoss)}
            suffix="dB"
            testId="input-tx-loss"
          />
          <Field
            id="db-tx-gain"
            label="Transmit antenna gain"
            value={txGainText}
            onChange={setTxGainText}
            error={errorOf(txGain)}
            suffix="dBi"
            testId="input-tx-gain"
          />
          <Field
            id="db-other"
            label="Other losses"
            value={otherText}
            onChange={setOtherText}
            error={errorOf(other)}
            suffix="dB"
            testId="input-other-loss"
          />
          <Field
            id="db-rx-gain"
            label="Receive antenna gain"
            value={rxGainText}
            onChange={setRxGainText}
            error={errorOf(rxGain)}
            suffix="dBi"
            testId="input-rx-gain"
          />
          <Field
            id="db-rx-loss"
            label="Receive cable loss"
            value={rxLossText}
            onChange={setRxLossText}
            error={errorOf(rxLoss)}
            suffix="dB"
            testId="input-rx-loss"
          />
          <Field
            id="db-sens"
            label="Receiver sensitivity"
            value={sensText}
            onChange={setSensText}
            error={sens ? errorOf(sens) : null}
            suffix="dBm"
            testId="input-sensitivity"
            placeholder="optional"
          />
        </div>

        <div className="mt-5">
          <div className={LABEL}>Path loss</div>
          <div className="mt-2">
            <ChipGroup
              label="Path loss source"
              options={[
                { key: "fspl" as PathMode, label: "Free-space loss above" },
                { key: "manual" as PathMode, label: "Enter a value" },
              ]}
              value={pathMode}
              onChange={setPathMode}
              testPrefix="button-path"
            />
          </div>
          {pathMode === "manual" ? (
            <div className="mt-4 sm:max-w-[16rem]">
              <Field
                id="db-path"
                label="Path loss"
                value={pathText}
                onChange={setPathText}
                error={errorOf(manualPath)}
                suffix="dB"
                testId="input-path-loss"
              />
            </div>
          ) : (
            <p className={HINT_TEXT}>
              {path
                ? `Using ${formatDb(path.fspl)} dB from the free-space panel. Walls, foliage and rain go in other losses.`
                : "Fix the frequency or distance in the free-space panel to use its loss here."}
            </p>
          )}
        </div>

        {link && steps ? (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[340px] border-collapse text-left" data-testid="table-link">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Stage
                    </th>
                    <th scope="col" className={TH}>
                      Change
                    </th>
                    <th scope="col" className={TH}>
                      Level
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((row) => (
                    <tr key={row.label} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                      <td className={TD_DIM}>{row.label}</td>
                      <td className={TD}>{row.change === null ? "" : `${formatSignedDb(row.change)} dB`}</td>
                      <td className={TD}>{formatDb(row.level)} dBm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <ToolResult
                label="EIRP"
                value={`${formatDb(link.eirpDbm)} dBm (${formatSi(Math.pow(10, link.eirpDbm / 10) / 1e3, "W")})`}
                testId="text-eirp"
              />
              <ToolResult
                label="Received power"
                value={`${formatDb(link.rxDbm)} dBm (${formatSi(Math.pow(10, link.rxDbm / 10) / 1e3, "W")})`}
                testId="output-rx-power"
              />
              {link.marginDb !== null ? (
                <ToolResult label="Margin over sensitivity" value={`${formatSignedDb(link.marginDb)} dB`} testId="text-margin" />
              ) : null}
              {link.marginDb !== null && link.marginDb < 0 ? (
                <p className={DANGER_BOX}>
                  The received power is below the receiver sensitivity, so this link will not work at the data rate
                  that sensitivity belongs to. Raise antenna gain, shorten the cable, or accept a slower rate with a
                  better sensitivity.
                </p>
              ) : link.marginDb !== null && link.marginDb < 10 ? (
                <p className={WARN_BOX}>
                  Less than 10 dB of margin. Outdoor links are commonly planned with 10 dB or more to absorb fading,
                  weather and antennas drifting out of alignment.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </ToolPanel>
    </div>
  );
}

/* ------------------------------------------------------------ ratios */

const RATIO_KINDS: { value: RatioKind; label: string }[] = [
  { value: "db", label: "dB" },
  { value: "power", label: "power x" },
  { value: "amplitude", label: "ampl. x" },
];

function RatioView() {
  const [text, setText] = useState("3");
  const [kind, setKind] = useState<RatioKind>("db");
  const parsed = useMemo(() => {
    const n = parseNumber(text, kind === "db" ? "a decibel value" : "a ratio");
    return n.ok ? convertRatio(n.value, kind) : n;
  }, [text, kind]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ToolPanel title="Convert">
        <UnitField
          id="db-ratio"
          label="Value"
          value={text}
          onChange={setText}
          unit={kind}
          onUnit={setKind}
          units={RATIO_KINDS}
          error={errorOf(parsed)}
          testId="input-ratio"
        />
        {parsed.ok ? (
          <div className="mt-4" data-testid="output-ratio">
            <ToolResult label="Decibels" value={`${formatDb(parsed.value.db, 3)} dB`} />
            <ToolResult label="Power ratio" value={`${formatNumber(parsed.value.power, 5)} x`} />
            <ToolResult label="Amplitude ratio" value={`${formatNumber(parsed.value.amplitude, 5)} x`} />
          </div>
        ) : null}
        <p className={HINT_TEXT}>
          Power ratios use 10 log10. Amplitude ratios (voltage, current, sound pressure) use 20 log10, because power
          goes as amplitude squared. The decibel figure is the same either way; only the ratio it stands for differs.
        </p>
      </ToolPanel>

      <ToolPanel title="Reference">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[300px] border-collapse text-left" data-testid="table-ratios">
            <thead>
              <tr className="border-b border-[hsl(var(--brand-iron))]">
                <th scope="col" className={TH}>
                  dB
                </th>
                <th scope="col" className={TH}>
                  Power
                </th>
                <th scope="col" className={TH}>
                  Amplitude
                </th>
              </tr>
            </thead>
            <tbody>
              {RATIO_TABLE.map((db) => {
                const r = convertRatio(db, "db");
                return r.ok ? (
                  <tr key={db} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                    <td className={TD_DIM}>{formatSignedDb(db, 0)}</td>
                    <td className={TD}>{formatNumber(r.value.power, 4)} x</td>
                    <td className={TD}>{formatNumber(r.value.amplitude, 4)} x</td>
                  </tr>
                ) : null;
              })}
            </tbody>
          </table>
        </div>
      </ToolPanel>
    </div>
  );
}

export function DecibelCalculator() {
  const [mode, setMode] = useState<Mode>("sound");

  return (
    <ToolShell slug="decibel-calculator">
      <div className="space-y-6">
        <ChipGroup label="Calculator" options={MODES} value={mode} onChange={setMode} testPrefix="button-mode" />
        {mode === "sound" ? <SoundView /> : mode === "rf" ? <RfView /> : <RatioView />}
      </div>
    </ToolShell>
  );
}
