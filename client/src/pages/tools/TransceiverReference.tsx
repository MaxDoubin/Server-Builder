/**
 * Optical and copper transceiver reference.
 *
 * A filterable table of common SFP, QSFP, QSFP-DD and OSFP modules. All of
 * the data, the length parser and the filter live in
 * lib/toolkit/transceiver-reference so they can be unit tested without
 * React. Multimode reach is looked up per fiber grade, which is why the
 * grade selector changes both the reach column and the length filter.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  FIBER_TYPES,
  FORM_FACTORS,
  FORM_FACTOR_ORDER,
  GRADES,
  MEDIA_LABEL,
  MEDIA_SHORT,
  MODULES,
  SPEEDS,
  filterModules,
  formatMeters,
  parseLength,
  reachFor,
  speedLabel,
  type FormFactor,
  type Grade,
  type Media,
  type Module,
  type SortKey,
} from "@/lib/toolkit/transceiver-reference";
import { ToolPanel, ToolShell } from "./ToolShell";

const LABEL_CLASS = "block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]";
const INPUT_CLASS =
  "mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TH_CLASS =
  "py-2 pr-4 align-bottom font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

const chipClass = (active: boolean) =>
  `inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors ${FOCUS} ${
    active
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))] text-[hsl(var(--brand-obsidian))]"
      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))] hover:border-[hsl(var(--brand-signal)/0.6)]"
  }`;

const MEDIA_FILTERS: { id: Media | null; label: string }[] = [
  { id: null, label: "Any" },
  { id: "mmf", label: "Multimode" },
  { id: "smf", label: "Single-mode" },
  { id: "tp", label: "Twisted pair" },
  { id: "dac", label: "DAC" },
  { id: "aoc", label: "AOC" },
];

const NAME_KEY: { code: string; meaning: string }[] = [
  { code: "T", meaning: "Twisted-pair copper, RJ45" },
  { code: "C", meaning: "Copper twinax, a direct attach cable" },
  { code: "S", meaning: "Short reach, 850 nm on multimode" },
  { code: "D", meaning: "500 m on single-mode" },
  { code: "F", meaning: "2 km on single-mode" },
  { code: "L", meaning: "Long reach, 10 km on single-mode" },
  { code: "E", meaning: "Extended reach, 30 to 40 km" },
  { code: "Z", meaning: "About 80 km, a vendor term, not IEEE" },
  { code: "B", meaning: "Bidirectional on one fiber" },
  { code: "X", meaning: "8b/10b block coding, as in 1000BASE-X" },
  { code: "R", meaning: "64b/66b block coding family, as in 10GBASE-R and every rate above it" },
  { code: "4, 8", meaning: "Lane count, as in SR4 or SR8" },
  { code: ".2", meaning: "Two wavelengths per fiber, as in SR4.2" },
];

function reachCell(m: Module, grade: Grade) {
  if (m.media !== "mmf") {
    return (
      <>
        <span className="text-[hsl(var(--brand-bone))]">{formatMeters(m.reachM)}</span>
        <span className="mt-1 block text-[hsl(var(--brand-bone-dim))]">{m.reachText}</span>
      </>
    );
  }
  const r = reachFor(m, grade);
  return (
    <>
      <span className={r === null ? "text-[hsl(var(--brand-amber))]" : "text-[hsl(var(--brand-bone))]"}>
        {r === null ? `Not specified on ${grade}` : `${formatMeters(r)} on ${grade}`}
      </span>
      <span className="mt-1 block text-[hsl(var(--brand-bone-dim))]">{m.reachText}</span>
    </>
  );
}

function asText(rows: Module[], grade: Grade): string {
  const head = ["Standard", "Form factor", "Speed", "Media", "Wavelength", "Reach", "Connector", "Lanes", "Defined by"];
  const lines = rows.map((m) => {
    const r = reachFor(m, grade);
    const reach = m.media === "mmf" ? (r === null ? `not specified on ${grade}` : `${formatMeters(r)} on ${grade}`) : formatMeters(m.reachM);
    return [m.name, m.formFactors.join(", "), speedLabel(m.speedGbps), MEDIA_SHORT[m.media], m.wavelength, reach, m.connector, m.lanes, m.definedBy].join("\t");
  });
  return [head.join("\t"), ...lines].join("\n");
}

export function TransceiverReference() {
  const [query, setQuery] = useState("");
  const [speed, setSpeed] = useState<number | null>(null);
  const [media, setMedia] = useState<Media | null>(null);
  const [formFactor, setFormFactor] = useState<FormFactor | null>(null);
  const [lengthRaw, setLengthRaw] = useState("");
  const [grade, setGrade] = useState<Grade>("OM4");
  const [sort, setSort] = useState<SortKey>("speed");

  const length = useMemo(() => parseLength(lengthRaw), [lengthRaw]);
  const lengthM = length && length.ok ? length.meters : null;

  const outcome = useMemo(
    () => filterModules(MODULES, { query, speed, media, formFactor, lengthM, grade, sort }),
    [query, speed, media, formFactor, lengthM, grade, sort],
  );
  const rows = outcome.rows;

  const filtered = query.trim() !== "" || speed !== null || media !== null || formFactor !== null || lengthRaw.trim() !== "";
  const longest = Math.max(...MODULES.map((m) => m.reachM));

  function reset() {
    setQuery("");
    setSpeed(null);
    setMedia(null);
    setFormFactor(null);
    setLengthRaw("");
    setSort("speed");
  }

  let emptyMessage = "No module matches these filters. Clear one of them to widen the list.";
  if (lengthM !== null && lengthM > longest) {
    emptyMessage = `Nothing in this table reaches ${formatMeters(lengthM)}; the longest is ${formatMeters(longest)}. Longer links use coherent optics such as 400ZR, or amplified DWDM systems.`;
  } else if (lengthM !== null && outcome.tooShort > 0) {
    emptyMessage = `${outcome.tooShort} ${outcome.tooShort === 1 ? "module matches" : "modules match"} the other filters but ${outcome.tooShort === 1 ? "falls" : "fall"} short of ${formatMeters(lengthM)}${media === "mmf" || media === null ? ` on ${grade}` : ""}.`;
  }

  return (
    <ToolShell slug="transceiver-reference">
      <div className="space-y-6">
        <ToolPanel title="Filter">
          <label htmlFor="xcvr-search" className={LABEL_CLASS}>
            Search standard, connector, wavelength or note
          </label>
          <input
            id="xcvr-search"
            type="search"
            value={query}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="bidi, mpo, cwdm, 10GBASE-LR"
            data-testid="input-transceiver-search"
            className={INPUT_CLASS}
          />

          <fieldset className="mt-5">
            <legend className={LABEL_CLASS}>Speed</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={speed === null}
                onClick={() => setSpeed(null)}
                data-testid="button-speed-any"
                className={chipClass(speed === null)}
              >
                Any
              </button>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={speed === s}
                  onClick={() => setSpeed(speed === s ? null : s)}
                  data-testid={`button-speed-${s}`}
                  className={chipClass(speed === s)}
                >
                  {speedLabel(s)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className={LABEL_CLASS}>Media</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {MEDIA_FILTERS.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  aria-pressed={media === f.id}
                  onClick={() => setMedia(f.id === media ? null : f.id)}
                  data-testid={`button-media-${f.id ?? "any"}`}
                  className={chipClass(media === f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="xcvr-length" className={LABEL_CLASS}>
                Link length to cover
              </label>
              <input
                id="xcvr-length"
                type="text"
                inputMode="decimal"
                value={lengthRaw}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => setLengthRaw(event.target.value)}
                placeholder="300 m, 2 km, 150 ft"
                aria-invalid={length !== null && !length.ok}
                aria-describedby="xcvr-length-message"
                data-testid="input-transceiver-length"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="xcvr-grade" className={LABEL_CLASS}>
                Multimode grade
              </label>
              <select
                id="xcvr-grade"
                value={grade}
                onChange={(event) => setGrade(event.target.value as Grade)}
                data-testid="select-grade"
                className={INPUT_CLASS}
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="xcvr-ff" className={LABEL_CLASS}>
                Form factor
              </label>
              <select
                id="xcvr-ff"
                value={formFactor ?? ""}
                onChange={(event) => setFormFactor(event.target.value === "" ? null : (event.target.value as FormFactor))}
                data-testid="select-form-factor"
                className={INPUT_CLASS}
              >
                <option value="">Any</option>
                {FORM_FACTOR_ORDER.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="xcvr-sort" className={LABEL_CLASS}>
                Sort by
              </label>
              <select
                id="xcvr-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value === "reach" ? "reach" : "speed")}
                data-testid="select-sort"
                className={INPUT_CLASS}
              >
                <option value="speed">Speed</option>
                <option value="reach">Reach, longest first</option>
              </select>
            </div>
          </div>

          {length !== null && !length.ok ? (
            <p
              id="xcvr-length-message"
              role="alert"
              data-testid="text-length-error"
              className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              <span aria-hidden="true">✕</span>
              <span className="min-w-0 break-words">{length.message}</span>
            </p>
          ) : (
            <p id="xcvr-length-message" className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {lengthM !== null
                ? `Showing modules that reach at least ${formatMeters(lengthM)}. Multimode rows are judged on ${grade}.`
                : "A bare number is meters. The grade sets the reach shown for multimode rows; single-mode and copper ignore it."}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p role="status" aria-live="polite" data-testid="text-transceiver-count" className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              {rows.length} of {MODULES.length} modules
              {lengthM !== null && outcome.tooShort > 0 && rows.length > 0
                ? `, ${outcome.tooShort} more fall short of ${formatMeters(lengthM)}`
                : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {filtered ? (
                <button type="button" onClick={reset} data-testid="button-reset" className={chipClass(false)}>
                  Clear filters
                </button>
              ) : null}
              {rows.length > 0 ? (
                <CopyButton value={asText(rows, grade)} label="Copy the listed modules as tab-separated text" testId="button-copy-table">
                  <span>Copy table</span>
                </CopyButton>
              ) : null}
            </div>
          </div>
        </ToolPanel>

        <ToolPanel title="Modules">
          {rows.length === 0 ? (
            <p data-testid="text-transceiver-empty" className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              {emptyMessage}
            </p>
          ) : null}
          <div className={rows.length === 0 ? "hidden" : "overflow-x-auto"}>
            <table className="w-full min-w-[1120px] border-collapse text-left" data-testid="table-transceivers">
              <caption className="sr-only">
                Transceiver modules with form factor, speed, media, wavelength, reach, connector, lanes and notes
              </caption>
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  {["Standard", "Form factor", "Speed", "Media", "Wavelength", "Reach", "Connector", "Lanes", "Notes"].map((head) => (
                    <th key={head} scope="col" className={TH_CLASS}>
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top" data-testid={`row-${m.id}`}>
                    <th scope="row" className="py-3 pr-4 text-left font-normal">
                      <span className="block whitespace-nowrap font-mono-tight text-sm text-[hsl(var(--brand-signal))]">{m.name}</span>
                      <span className="mt-1 block max-w-[11rem] font-mono-tight text-[0.6875rem] leading-snug text-[hsl(var(--brand-ash))]">
                        {m.definedBy}
                      </span>
                    </th>
                    <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {m.formFactors.join(", ")}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {speedLabel(m.speedGbps)}
                    </td>
                    <td className="py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      <abbr title={MEDIA_LABEL[m.media]} className="no-underline">
                        {MEDIA_SHORT[m.media]}
                      </abbr>
                    </td>
                    <td className="max-w-[10rem] py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {m.wavelength}
                    </td>
                    <td className="max-w-[12rem] py-3 pr-4 font-mono-tight text-xs leading-relaxed">{reachCell(m, grade)}</td>
                    <td className="max-w-[9rem] py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]">
                      {m.connector}
                    </td>
                    <td className="max-w-[9rem] py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {m.lanes}
                    </td>
                    <td className="max-w-[20rem] py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {m.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Form factors">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left" data-testid="table-form-factors">
                <caption className="sr-only">Pluggable form factors, their electrical lanes and what their ports accept</caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    {["Form factor", "Lanes", "Ethernet", "Defined by", "Port also takes"].map((head) => (
                      <th key={head} scope="col" className={TH_CLASS}>
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FORM_FACTORS.map((f) => (
                    <tr key={f.name} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                      <th scope="row" className="whitespace-nowrap py-2.5 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]">
                        {f.name}
                      </th>
                      <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{f.lanes}</td>
                      <td className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{f.speeds}</td>
                      <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{f.spec}</td>
                      <td className="py-2.5 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{f.accepts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              A port that takes an older module runs it at the older speed, and only if the switch software supports
              it. A breakout needs both the right cable and a port that can be split.
            </p>
          </ToolPanel>

          <ToolPanel title="Fiber types">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left" data-testid="table-fiber-types">
                <caption className="sr-only">Multimode and single-mode fiber grades with core size, bandwidth and jacket color</caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    {["Grade", "Core / cladding", "Bandwidth", "Usual jacket"].map((head) => (
                      <th key={head} scope="col" className={TH_CLASS}>
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FIBER_TYPES.map((f) => (
                    <tr key={f.name} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                      <th scope="row" className="whitespace-nowrap py-2.5 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]">
                        {f.name}
                      </th>
                      <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{f.core}</td>
                      <td className="py-2.5 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{f.bandwidth}</td>
                      <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{f.jacket}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Jacket color is a convention (TIA-598), not a guarantee. Check the print on the cable before trusting a
              reach figure.
            </p>
          </ToolPanel>
        </div>

        <ToolPanel title="Reading a name">
          <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            <code className="text-[hsl(var(--brand-cyan))]">100GBASE-LR4</code> is 100 Gb/s, baseband signaling, long
            reach, four lanes. The letters after BASE follow a pattern:
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2" data-testid="list-name-key">
            {NAME_KEY.map((k) => (
              <div key={k.code} className="flex gap-3 border-b border-[hsl(var(--brand-iron)/0.5)] py-2">
                <dt className="w-14 shrink-0 font-mono-tight text-sm text-[hsl(var(--brand-signal))]">{k.code}</dt>
                <dd className="min-w-0 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{k.meaning}</dd>
              </div>
            ))}
          </dl>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
