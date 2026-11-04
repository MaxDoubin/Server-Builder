/**
 * Twisted-pair Ethernet cabling reference.
 *
 * Categories and their speed and distance limits, interactive T568A and
 * T568B pinouts with signal and PoE overlays, an end-to-end wiring map that
 * shows why A on one end and B on the other is a crossover, a crimp-order
 * checker, and ISO/IEC 11801 shielding codes. All data and logic live in
 * lib/toolkit/ethernet-cable-reference so they can be unit tested.
 *
 * Wire colors are object colors (the insulation is orange in either theme),
 * so they are literal values on swatches and SVG strokes. Every surface and
 * text color still comes from a --brand token.
 */

import { useMemo, useState, type CSSProperties } from "react";
import {
  CATEGORIES,
  COMMON_SHIELDS,
  ETH_SPEEDS,
  PAIR_NUMBER,
  PINOUTS,
  POE_TYPES,
  SUPPORT,
  WIRE_IDS,
  analyzeOrder,
  checkRun,
  classifyCable,
  formatRun,
  getSpeed,
  lengthAdvice,
  mapEnds,
  pairPartner,
  parseMeters,
  parseShield,
  pinRole,
  wireBase,
  wireLabel,
  wireStriped,
  type Base,
  type Overlay,
  type Side,
  type SpeedId,
  type Standard,
  type Verdict,
  type WireId,
} from "@/lib/toolkit/ethernet-cable-reference";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ----------------------------------------------------------------- styles */

const LABEL_CLASS = "block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]";
const SMALL_LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TH_CLASS =
  "py-2 pr-4 align-bottom font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const BODY = "font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]";

const chipClass = (active: boolean) =>
  `inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors ${FOCUS} ${
    active
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))] text-[hsl(var(--brand-obsidian))]"
      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))] hover:border-[hsl(var(--brand-signal)/0.6)]"
  }`;

/* Insulation colors. Object colors, the same in both themes. */
const WIRE_HEX: Record<Base, string> = {
  orange: "#e8772e",
  green: "#2f9e57",
  blue: "#2f6bd8",
  brown: "#8b5a2b",
};
const WHITE_HEX = "#f2f1ed";

function swatchStyle(w: WireId): CSSProperties {
  const color = WIRE_HEX[wireBase(w)];
  return wireStriped(w)
    ? { background: `repeating-linear-gradient(-45deg, ${WHITE_HEX} 0 7px, ${color} 7px 11px)` }
    : { background: color };
}

function Swatch({ wire, className = "" }: { wire: WireId; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={swatchStyle(wire)}
      className={`inline-block shrink-0 rounded-[3px] border border-[hsl(var(--brand-iron))] ${className}`}
    />
  );
}

const VERDICT: Record<Verdict, { label: string; tone: string }> = {
  ok: { label: "Works", tone: "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-signal))]" },
  conditional: { label: "Test first", tone: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]" },
  "too-long": { label: "Too long", tone: "border-[hsl(var(--brand-danger)/0.6)] text-[hsl(var(--brand-danger))]" },
  unsupported: { label: "Not specified", tone: "border-[hsl(var(--brand-danger)/0.6)] text-[hsl(var(--brand-danger))]" },
};

const OVERLAYS: { id: Overlay; label: string }[] = [
  { id: "pairs", label: "Pairs" },
  { id: "fast", label: "10/100" },
  { id: "gigabit", label: "1G to 10G" },
  { id: "poe-a", label: "PoE Mode A" },
  { id: "poe-b", label: "PoE Mode B" },
  { id: "poe-4", label: "4-pair PoE" },
];

const OVERLAY_TEXT: Record<Overlay, string> = {
  pairs:
    "TIA numbers the pairs 1 blue, 2 orange, 3 green, 4 brown. T568A puts pair 3 on pins 1 and 2 and pair 2 on pins 3 and 6; T568B swaps those two. Blue and brown sit on the same pins in both.",
  fast: "10BASE-T and 100BASE-TX use two pairs: one transmits, one receives. A host port (MDI) transmits on 1 and 2; a switch port (MDI-X) transmits on 3 and 6, so a straight cable joins transmit to receive. Pins 4, 5, 7 and 8 are idle.",
  gigabit:
    "1000BASE-T, 2.5G, 5G and 10GBASE-T send and receive on all four pairs at once, with echo cancellation separating the two directions. MDI-X swaps pair A with B and C with D.",
  "poe-a":
    "Mode A (Alternative A at the switch) puts power on the pairs at pins 1-2 and 3-6 as a common-mode voltage between the two pairs, through the center taps of the data transformers. Data and power share the wires.",
  "poe-b":
    "Mode B (Alternative B) powers the pairs at pins 4-5 and 7-8. On 10/100 those pairs carry no data; on gigabit and faster they carry both.",
  "poe-4":
    "802.3bt Type 3 and Type 4 can power both pair sets at once. Spreading the current over four pairs keeps the current in each conductor, and so the heating, well below what two pairs would need for 60 W or 90 W.",
};

/* ------------------------------------------------------------ subsections */

function CheckRun() {
  const [speed, setSpeed] = useState<SpeedId>("10gbase-t");
  const [raw, setRaw] = useState("60");
  const parsed = useMemo(() => parseMeters(raw), [raw]);
  const meters = parsed && parsed.ok ? parsed.meters : null;
  const advice = meters !== null ? lengthAdvice(meters) : null;

  return (
    <ToolPanel title="Will this run work">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="eth-speed" className={LABEL_CLASS}>
            Ethernet speed
          </label>
          <select
            id="eth-speed"
            value={speed}
            onChange={(event) => setSpeed(event.target.value as SpeedId)}
            data-testid="select-eth-speed"
            className={INPUT_CLASS}
          >
            {ETH_SPEEDS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="eth-length" className={LABEL_CLASS}>
            Channel length, end to end
          </label>
          <input
            id="eth-length"
            type="text"
            inputMode="decimal"
            value={raw}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setRaw(event.target.value)}
            placeholder="60 m or 200 ft"
            aria-invalid={parsed !== null && !parsed.ok}
            aria-describedby="eth-length-message"
            data-testid="input-cable-length"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {parsed !== null && !parsed.ok ? (
        <p
          id="eth-length-message"
          role="alert"
          data-testid="text-length-error"
          className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
        >
          <span aria-hidden="true">✕</span>
          <span className="min-w-0 break-words">{parsed.message}</span>
        </p>
      ) : (
        <p
          id="eth-length-message"
          aria-live="polite"
          className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]"
        >
          {meters === null
            ? "Enter the whole channel, patch cords included. A bare number is meters."
            : `${getSpeed(speed).name} over ${formatRun(meters)}. ${getSpeed(speed).pairs}; ${getSpeed(speed).coding}.`}
        </p>
      )}

      {advice ? (
        <p className="mt-3 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
          {advice}
        </p>
      ) : null}

      <ul className="mt-5 space-y-0" data-testid="output-cable-check">
        {CATEGORIES.map((c) => {
          const v = meters !== null ? checkRun(speed, c.id, meters) : null;
          const support = SUPPORT[speed][c.id];
          const verdict = v ?? {
            verdict: (support.level === "no" ? "unsupported" : support.level === "yes" ? "ok" : "conditional") as Verdict,
            limitM: support.meters,
            message: support.note ?? `Up to ${support.meters} m.`,
          };
          const tone = VERDICT[verdict.verdict];
          return (
            <li
              key={c.id}
              data-testid={`check-${c.id}`}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-1 border-b border-[hsl(var(--brand-iron)/0.5)] py-3 last:border-b-0 sm:grid-cols-[5rem_8rem_minmax(0,1fr)]"
            >
              <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{c.name}</span>
              <span>
                <span className={`inline-flex min-h-[24px] items-center rounded-full border px-2.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] ${tone.tone}`}>
                  {tone.label}
                </span>
                {verdict.limitM > 0 ? (
                  <span className="ml-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">max {verdict.limitM} m</span>
                ) : null}
              </span>
              <span className="col-span-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] sm:col-span-1">
                {verdict.message}
              </span>
            </li>
          );
        })}
      </ul>
    </ToolPanel>
  );
}

function Matrix() {
  // Number each distinct caveat once, in reading order.
  const footnotes: string[] = [];
  const marker = (note: string | undefined): number | null => {
    if (!note) return null;
    let i = footnotes.indexOf(note);
    if (i === -1) {
      footnotes.push(note);
      i = footnotes.length - 1;
    }
    return i + 1;
  };
  const rows = ETH_SPEEDS.map((s) => ({
    speed: s,
    cells: CATEGORIES.map((c) => {
      const sup = SUPPORT[s.id][c.id];
      return { cat: c, sup, mark: sup.level === "no" ? null : marker(sup.note) };
    }),
  }));

  return (
    <ToolPanel title="Speed and distance">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left" data-testid="table-speed-matrix">
          <caption className="sr-only">Maximum channel length for each Ethernet speed on each cable category</caption>
          <thead>
            <tr className="border-b border-[hsl(var(--brand-iron))]">
              <th scope="col" className={TH_CLASS}>
                Speed
              </th>
              {CATEGORIES.map((c) => (
                <th key={c.id} scope="col" className={TH_CLASS}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ speed, cells }) => (
              <tr key={speed.id} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                <th scope="row" className="whitespace-nowrap py-2.5 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]">
                  {speed.name}
                  <span className="block font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-ash))]">{speed.ieee}</span>
                </th>
                {cells.map(({ cat, sup, mark }) => (
                  <td
                    key={cat.id}
                    className={`whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs ${
                      sup.level === "no"
                        ? "text-[hsl(var(--brand-ash))]"
                        : sup.level === "conditional"
                          ? "text-[hsl(var(--brand-amber))]"
                          : "text-[hsl(var(--brand-bone))]"
                    }`}
                  >
                    {sup.level === "no" ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="sr-only">not specified</span>
                      </>
                    ) : (
                      <>
                        {sup.meters} m{sup.level === "conditional" ? <span className="sr-only">, conditional</span> : null}
                        {mark ? <sup className="ml-0.5 text-[0.625rem] text-[hsl(var(--brand-ash))]">{mark}</sup> : null}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        Lengths are the full channel. <span className="text-[hsl(var(--brand-amber))]">Amber</span> means the figure
        carries a condition, given in the numbered note, that testing has to confirm; a dot means the speed is not
        specified on that category.
      </p>
      <ol className="mt-3 space-y-2" data-testid="list-matrix-notes">
        {footnotes.map((note, i) => (
          <li key={note} className="flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            <span className="shrink-0 text-[hsl(var(--brand-ash))]">{i + 1}.</span>
            <span className="min-w-0">{note}</span>
          </li>
        ))}
      </ol>
    </ToolPanel>
  );
}

function Pinout() {
  const [std, setStd] = useState<Standard>("T568B");
  const [overlay, setOverlay] = useState<Overlay>("fast");
  const [side, setSide] = useState<Side>("mdi");
  const [pin, setPin] = useState(1);

  const wires = PINOUTS[std];
  const wire = wires[pin - 1];
  const partner = pairPartner(pin);
  const sideMatters = overlay === "fast" || overlay === "gigabit";
  const other: Standard = std === "T568A" ? "T568B" : "T568A";
  const otherWire = PINOUTS[other][pin - 1];

  return (
    <ToolPanel title="Pinout">
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <fieldset>
          <legend className={LABEL_CLASS}>Standard</legend>
          <div className="mt-3 flex gap-2">
            {(["T568A", "T568B"] as Standard[]).map((s) => (
              <button key={s} type="button" aria-pressed={std === s} onClick={() => setStd(s)} data-testid={`button-std-${s}`} className={chipClass(std === s)}>
                {s}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className={LABEL_CLASS}>Port</legend>
          <div className="mt-3 flex gap-2">
            {(
              [
                ["mdi", "Host (MDI)"],
                ["mdix", "Switch (MDI-X)"],
              ] as [Side, string][]
            ).map(([s, label]) => (
              <button
                key={s}
                type="button"
                aria-pressed={side === s}
                onClick={() => setSide(s)}
                data-testid={`button-side-${s}`}
                className={chipClass(side === s)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset className="mt-5">
        <legend className={LABEL_CLASS}>Show</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {OVERLAYS.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={overlay === o.id}
              onClick={() => setOverlay(o.id)}
              data-testid={`button-overlay-${o.id}`}
              className={chipClass(overlay === o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div>
          <div className="mx-auto max-w-[26rem] rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3">
            <div className="grid grid-cols-8 gap-1" role="group" aria-label={`${std} plug, pins 1 to 8`} data-testid="output-pinout">
              {wires.map((w, i) => {
                const p = i + 1;
                const role = pinRole(overlay, p, side, std);
                const selected = p === pin;
                const isPartner = p === partner && !selected;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Pin ${p}, ${wireLabel(w)}, pair ${PAIR_NUMBER[wireBase(w)]}. ${role.long}`}
                    onClick={() => setPin(p)}
                    data-testid={`button-pin-${p}`}
                    className={`flex min-h-[44px] flex-col items-center gap-1 rounded-md border px-0.5 py-1.5 transition-colors ${FOCUS} ${
                      selected
                        ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)]"
                        : isPartner
                          ? "border-[hsl(var(--brand-signal)/0.5)] border-dashed"
                          : "border-transparent hover:border-[hsl(var(--brand-iron))]"
                    }`}
                  >
                    <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{p}</span>
                    <Swatch wire={w} className={`h-16 w-full max-w-[1.75rem] ${role.active ? "" : "opacity-40"}`} />
                    <span
                      className={`font-mono-tight text-[0.625rem] leading-none ${
                        role.active ? "text-[hsl(var(--brand-bone))]" : "text-[hsl(var(--brand-ash))]"
                      }`}
                    >
                      {role.short}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 h-2 rounded-b-md border-x border-b border-[hsl(var(--brand-iron))]" aria-hidden="true" />
          </div>
          <p className="mx-auto mt-3 max-w-[26rem] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Plug seen from the contact side, latch away from you, cable hanging down: pin 1 is on the left. Pairs sit on
            pins 1-2, 3-6, 4-5 and 7-8.
          </p>
          <p className={`mt-4 ${BODY}`} data-testid="text-overlay">
            {OVERLAY_TEXT[overlay]}
            {sideMatters ? ` Showing a ${side === "mdi" ? "host (MDI)" : "switch (MDI-X)"} port.` : ""}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Swatch wire={wire} className="h-10 w-10" />
            <div>
              <div className="font-display text-xl font-medium text-[hsl(var(--brand-bone))]" data-testid="text-pin-title">
                Pin {pin}: {wireLabel(wire)}
              </div>
              <div className={SMALL_LABEL}>{std}</div>
            </div>
          </div>
          <div className="mt-3">
            <ToolResult label="Pair" value={`${PAIR_NUMBER[wireBase(wire)]} (${wireBase(wire)}), with pin ${partner}`} />
            <ToolResult label={`In ${other}`} value={otherWire === wire ? `${wireLabel(otherWire)}, the same` : wireLabel(otherWire)} />
            <ToolResult
              label="10/100"
              value={
                pinRole("fast", pin, "mdi", std).active
                  ? `${pinRole("fast", pin, "mdi", std).short} host, ${pinRole("fast", pin, "mdix", std).short} switch`
                  : "Unused"
              }
            />
            <ToolResult
              label="1000BASE-T"
              value={`BI_${pinRole("gigabit", pin, "mdi", std).short} host, BI_${pinRole("gigabit", pin, "mdix", std).short} switch`}
            />
            <ToolResult label="PoE" value={[1, 2, 3, 6].includes(pin) ? "Mode A pair set" : "Mode B pair set"} />
          </div>
        </div>
      </div>

      <div className="relative mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left" data-testid="table-pinout">
          <caption className="sr-only">T568A and T568B wire colors with pair numbers and signals for each pin</caption>
          <thead>
            <tr className="border-b border-[hsl(var(--brand-iron))]">
              {["Pin", "T568A", "T568B", "10/100 host", "1000BASE-T host", "PoE"].map((h) => (
                <th key={h} scope="col" className={TH_CLASS}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
              <tr key={p} className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${p === pin ? "bg-[hsl(var(--brand-signal)/0.06)]" : ""}`}>
                <th scope="row" className="py-2 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]">
                  {p}
                </th>
                {(["T568A", "T568B"] as Standard[]).map((s) => {
                  const w = PINOUTS[s][p - 1];
                  return (
                    <td key={s} className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      <span className="inline-flex items-center gap-2">
                        <Swatch wire={w} className="h-3.5 w-6" />
                        {wireLabel(w)}
                        <span className="text-[hsl(var(--brand-ash))]">P{PAIR_NUMBER[wireBase(w)]}</span>
                      </span>
                    </td>
                  );
                })}
                <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  {pinRole("fast", p, "mdi", "T568B").active ? pinRole("fast", p, "mdi", "T568B").short : "unused"}
                </td>
                <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">BI_{pinRole("gigabit", p, "mdi", "T568B").short}</td>
                <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  {[1, 2, 3, 6].includes(p) ? "Mode A" : "Mode B"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ToolPanel>
  );
}

/** Two connectors and the eight wires between them. */
function EndsDiagram({ a, b }: { a: WireId[]; b: WireId[] }) {
  const map = mapEnds(a, b);
  const y = (p: number) => 24 + (p - 1) * 28;
  const label = map
    .map((q, i) => (q === i + 1 ? null : `pin ${i + 1} to pin ${q}`))
    .filter(Boolean)
    .join(", ");
  return (
    <svg
      viewBox="0 0 320 236"
      className="h-auto w-full max-w-[22rem]"
      role="img"
      aria-label={label ? `Wires that change pins: ${label}. All others go straight through.` : "Every pin connects to the same pin at the other end."}
      data-testid="svg-ends"
    >
      <text x={44} y={12} fontSize="11" textAnchor="middle" fill="hsl(var(--brand-ash))">
        End 1
      </text>
      <text x={276} y={12} fontSize="11" textAnchor="middle" fill="hsl(var(--brand-ash))">
        End 2
      </text>
      <rect x={34} y={14} width={20} height={220} rx={4} fill="hsl(var(--brand-obsidian))" stroke="hsl(var(--brand-iron))" />
      <rect x={266} y={14} width={20} height={220} rx={4} fill="hsl(var(--brand-obsidian))" stroke="hsl(var(--brand-iron))" />
      {a.map((w, i) => {
        const q = map[i];
        if (q === null) return null;
        const y1 = y(i + 1);
        const y2 = y(q);
        const d = `M 54 ${y1} C 140 ${y1}, 180 ${y2}, 266 ${y2}`;
        const color = WIRE_HEX[wireBase(w)];
        return (
          <g key={w}>
            <path d={d} fill="none" stroke="hsl(var(--brand-iron))" strokeWidth={7} strokeLinecap="round" />
            <path d={d} fill="none" stroke={wireStriped(w) ? WHITE_HEX : color} strokeWidth={5} strokeLinecap="round" />
            {wireStriped(w) ? <path d={d} fill="none" stroke={color} strokeWidth={5} strokeDasharray="4 6" /> : null}
          </g>
        );
      })}
      {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
        <g key={p}>
          <text x={22} y={y(p) + 4} fontSize="12" textAnchor="middle" fill="hsl(var(--brand-bone-dim))">
            {p}
          </text>
          <text x={298} y={y(p) + 4} fontSize="12" textAnchor="middle" fill="hsl(var(--brand-bone-dim))">
            {p}
          </text>
        </g>
      ))}
    </svg>
  );
}

const CABLE_TEXT = {
  straight:
    "Straight-through: every pin reaches the same pin at the other end. This is the normal patch cord. T568A at both ends and T568B at both ends are electrically the same cable; the standards differ only in which of two pairs lands on pins 1-2 and 3-6.",
  crossover:
    "Crossover: the orange and green pairs trade places, so pins 1 and 2 reach 3 and 6. Before Auto-MDIX, joining two hosts or two switches over 10/100 needed this so that transmit met receive. It does not swap the blue and brown pairs, so it is not a full gigabit crossover.",
  "gigabit-crossover": "Gigabit crossover: all four pairs swapped, A with B and C with D.",
  other: "Not a standard cable.",
} as const;

function CableEnds() {
  const [end1, setEnd1] = useState<Standard>("T568B");
  const [end2, setEnd2] = useState<Standard>("T568A");
  const kind = classifyCable(mapEnds(PINOUTS[end1], PINOUTS[end2]));

  return (
    <ToolPanel title="Cable ends">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="eth-end1" className={LABEL_CLASS}>
                End 1
              </label>
              <select id="eth-end1" value={end1} onChange={(event) => setEnd1(event.target.value === "T568A" ? "T568A" : "T568B")} data-testid="select-end1" className={INPUT_CLASS}>
                <option value="T568A">T568A</option>
                <option value="T568B">T568B</option>
              </select>
            </div>
            <div>
              <label htmlFor="eth-end2" className={LABEL_CLASS}>
                End 2
              </label>
              <select id="eth-end2" value={end2} onChange={(event) => setEnd2(event.target.value === "T568A" ? "T568A" : "T568B")} data-testid="select-end2" className={INPUT_CLASS}>
                <option value="T568A">T568A</option>
                <option value="T568B">T568B</option>
              </select>
            </div>
          </div>
          <p className="mt-5 font-display text-xl font-medium text-[hsl(var(--brand-bone))]" data-testid="text-cable-kind">
            {kind === "straight" ? "Straight-through" : kind === "crossover" ? "Crossover (10/100)" : kind === "gigabit-crossover" ? "Gigabit crossover" : "Nonstandard"}
          </p>
          <p className={`mt-2 ${BODY}`}>{CABLE_TEXT[kind]}</p>
          <p className={`mt-3 ${BODY}`}>
            Auto-MDIX makes the question mostly moot: the port detects which pairs its partner transmits on and swaps its
            own, so a straight cable works between any two ports. It is optional in 1000BASE-T but present in nearly every
            gigabit PHY. Mixing A and B by accident in a permanent link still creates a crossover that a cable certifier
            flags.
          </p>
        </div>
        <div className="flex justify-center md:justify-end">
          <EndsDiagram a={PINOUTS[end1]} b={PINOUTS[end2]} />
        </div>
      </div>
    </ToolPanel>
  );
}

const CRIMP_EXAMPLES: { label: string; order: WireId[] }[] = [
  { label: "T568B", order: PINOUTS.T568B },
  { label: "T568A", order: PINOUTS.T568A },
  { label: "Split pair", order: ["white-orange", "orange", "white-green", "green", "white-blue", "blue", "white-brown", "brown"] },
  { label: "Reversed", order: [...PINOUTS.T568B].reverse() },
];

function CrimpCheck() {
  const [order, setOrder] = useState<(WireId | null)[]>(() => Array<WireId | null>(8).fill(null));
  const result = useMemo(() => analyzeOrder(order), [order]);
  const tone =
    result.level === "ok"
      ? "text-[hsl(var(--brand-signal))]"
      : result.level === "warn"
        ? "text-[hsl(var(--brand-amber))]"
        : result.level === "error"
          ? "text-[hsl(var(--brand-danger))]"
          : "text-[hsl(var(--brand-ash))]";

  function setAt(i: number, value: string) {
    setOrder((prev) => {
      const next = [...prev];
      next[i] = (WIRE_IDS as string[]).includes(value) ? (value as WireId) : null;
      return next;
    });
  }

  return (
    <ToolPanel title="Check a crimp">
      <p className={BODY}>
        Enter the colors in the order they sit in your plug, pin 1 first, with the plug held as in the pinout above.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {order.map((w, i) => (
          <div key={i}>
            <label htmlFor={`eth-crimp-${i + 1}`} className={SMALL_LABEL}>
              Pin {i + 1}
            </label>
            <div className="mt-2 flex items-center gap-2">
              {w ? <Swatch wire={w} className="h-8 w-3" /> : <span aria-hidden="true" className="inline-block h-8 w-3 shrink-0 rounded-[3px] border border-dashed border-[hsl(var(--brand-iron))]" />}
              <select
                id={`eth-crimp-${i + 1}`}
                value={w ?? ""}
                onChange={(event) => setAt(i, event.target.value)}
                data-testid={`select-crimp-${i + 1}`}
                className="min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-2 py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              >
                <option value="">Choose</option>
                {WIRE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {wireLabel(id)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={SMALL_LABEL}>Load</span>
        {CRIMP_EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => setOrder([...ex.order])}
            data-testid={`button-crimp-${ex.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            className={chipClass(false)}
          >
            {ex.label}
          </button>
        ))}
        <button type="button" onClick={() => setOrder(Array<WireId | null>(8).fill(null))} data-testid="button-crimp-clear" className={chipClass(false)}>
          Clear
        </button>
      </div>
      <div className="mt-5" role="status" aria-live="polite" data-testid="output-crimp">
        <p className={`font-mono-tight text-sm ${tone}`}>{result.summary}</p>
        {result.problems.length ? (
          <ul className="mt-2 space-y-2">
            {result.problems.map((p) => (
              <li key={p} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {p}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </ToolPanel>
  );
}

function PoeTable() {
  return (
    <ToolPanel title="Power over Ethernet">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left" data-testid="table-poe">
          <caption className="sr-only">IEEE PoE types with pairs used, power at the switch and at the device, and current</caption>
          <thead>
            <tr className="border-b border-[hsl(var(--brand-iron))]">
              {["Standard", "Name", "Type", "Pairs", "At the switch", "At the device", "Current"].map((h) => (
                <th key={h} scope="col" className={TH_CLASS}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POE_TYPES.map((p) => (
              <tr key={p.type} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                <th scope="row" className="whitespace-nowrap py-2.5 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]">
                  {p.ieee}
                </th>
                <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{p.name}</td>
                <td className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{p.type}</td>
                <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{p.pairs}</td>
                <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{p.pseW} W</td>
                <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{p.pdW} W</td>
                <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{p.current}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`mt-4 ${BODY}`}>
        The gap between the two power columns is what 100 m of cable is allowed to burn as heat. Mode A uses the pairs on
        pins 1-2 and 3-6, Mode B the pairs on 4-5 and 7-8; a two-pair switch port uses one or the other, and the device has
        to accept power on either pair set in either polarity. Use the PoE buttons on the pinout to see which pins each mode
        powers.
      </p>
    </ToolPanel>
  );
}

function ShieldDiagram({ overall, pairFoil }: { overall: ("braid" | "foil")[]; pairFoil: boolean }) {
  const braid = overall.includes("braid");
  const foil = overall.includes("foil");
  const pairs: { base: Base; cx: number; cy: number }[] = [
    { base: "blue", cx: 70, cy: 70 },
    { base: "orange", cx: 130, cy: 70 },
    { base: "green", cx: 70, cy: 130 },
    { base: "brown", cx: 130, cy: 130 },
  ];
  return (
    <svg viewBox="0 0 200 200" className="h-auto w-full max-w-[13rem]" aria-hidden="true" data-testid="svg-shield">
      <circle cx={100} cy={100} r={94} fill="hsl(var(--brand-obsidian))" stroke="hsl(var(--brand-ash))" strokeWidth={3} />
      {braid ? <circle cx={100} cy={100} r={86} fill="none" stroke="hsl(var(--brand-amber))" strokeWidth={5} strokeDasharray="3 3" /> : null}
      {foil ? <circle cx={100} cy={100} r={braid ? 79 : 86} fill="none" stroke="hsl(var(--brand-cyan))" strokeWidth={2.5} /> : null}
      {pairs.map((p) => (
        <g key={p.base}>
          {pairFoil ? <circle cx={p.cx} cy={p.cy} r={26} fill="none" stroke="hsl(var(--brand-cyan))" strokeWidth={2} /> : null}
          <circle cx={p.cx - 10} cy={p.cy} r={10} fill={WIRE_HEX[p.base]} stroke="hsl(var(--brand-iron))" />
          <circle cx={p.cx + 10} cy={p.cy} r={10} fill={WHITE_HEX} stroke={WIRE_HEX[p.base]} strokeWidth={3} />
        </g>
      ))}
    </svg>
  );
}

function Shielding() {
  const [raw, setRaw] = useState("S/FTP");
  const parsed = useMemo(() => parseShield(raw), [raw]);
  const info = parsed && parsed.ok ? parsed.info : null;

  return (
    <ToolPanel title="Shielding codes">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_13rem]">
        <div>
          <label htmlFor="eth-shield" className={LABEL_CLASS}>
            ISO/IEC 11801 code or an old name
          </label>
          <input
            id="eth-shield"
            type="text"
            value={raw}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
            onChange={(event) => setRaw(event.target.value)}
            placeholder="U/UTP, F/UTP, S/FTP"
            aria-invalid={parsed !== null && !parsed.ok}
            aria-describedby="eth-shield-message"
            data-testid="input-shield-code"
            className={INPUT_CLASS}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {COMMON_SHIELDS.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={info?.code === code}
                onClick={() => setRaw(code)}
                data-testid={`button-shield-${code.toLowerCase().replace("/", "-")}`}
                className={chipClass(info?.code === code)}
              >
                {code}
              </button>
            ))}
          </div>
          <div id="eth-shield-message" className="mt-4" data-testid="output-shield">
            {parsed === null ? (
              <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">Enter a code such as F/UTP.</p>
            ) : !parsed.ok ? (
              <p role="alert" className="flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                <span aria-hidden="true">✕</span>
                <span className="min-w-0 break-words">{parsed.message}</span>
              </p>
            ) : (
              <>
                <p className="font-display text-xl font-medium text-[hsl(var(--brand-bone))]">{parsed.info.code}</p>
                <p className={`mt-1 ${BODY}`}>{parsed.info.description}</p>
                {parsed.info.legacy ? (
                  <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">{parsed.info.legacy}</p>
                ) : null}
              </>
            )}
          </div>
          <dl className="mt-5 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {[
              ["Before the slash", "The overall screen around all pairs"],
              ["After the slash", "The screen on each pair, then TP"],
              ["U", "Unscreened"],
              ["F", "Foil"],
              ["S", "Braid"],
              ["SF", "Braid and foil"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3 border-b border-[hsl(var(--brand-iron)/0.5)] py-2">
                <dt className="w-24 shrink-0 font-mono-tight text-xs text-[hsl(var(--brand-signal))]">{k}</dt>
                <dd className="min-w-0 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-col items-center gap-3">
          {info ? <ShieldDiagram overall={info.overall} pairFoil={info.pairFoil} /> : <ShieldDiagram overall={[]} pairFoil={false} />}
          <ul className="space-y-1 font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-bone-dim))]">
            <li>
              <span className="text-[hsl(var(--brand-amber))]">Dashed ring</span>: braid
            </li>
            <li>
              <span className="text-[hsl(var(--brand-cyan))]">Thin ring</span>: foil
            </li>
          </ul>
        </div>
      </div>
    </ToolPanel>
  );
}

function Categories() {
  return (
    <ToolPanel title="Categories">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left" data-testid="table-categories">
          <caption className="sr-only">Twisted-pair cable categories with bandwidth, standard, construction and fastest supported Ethernet</caption>
          <thead>
            <tr className="border-b border-[hsl(var(--brand-iron))]">
              {["Category", "Bandwidth", "TIA", "ISO/IEC 11801", "Construction", "Fastest", "Notes"].map((h) => (
                <th key={h} scope="col" className={TH_CLASS}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => (
              <tr key={c.id} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                <th scope="row" className="whitespace-nowrap py-3 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]">
                  {c.name}
                </th>
                <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{c.mhz} MHz</td>
                <td className="max-w-[10rem] py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{c.tia}</td>
                <td className="max-w-[9rem] py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{c.iso}</td>
                <td className="max-w-[10rem] py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]">
                  {c.construction}
                  <span className="mt-1 block text-[hsl(var(--brand-ash))]">{c.connector}</span>
                </td>
                <td className="max-w-[10rem] py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]">{c.fastest}</td>
                <td className="max-w-[18rem] py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{c.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        Bandwidth is the frequency up to which a category's loss and crosstalk limits are specified, not a data rate.
      </p>
    </ToolPanel>
  );
}

export function EthernetCableReference() {
  return (
    <ToolShell slug="ethernet-cable-reference">
      <div className="space-y-6">
        <CheckRun />
        <Categories />
        <Matrix />
        <Pinout />
        <CableEnds />
        <CrimpCheck />
        <PoeTable />
        <Shielding />
      </div>
    </ToolShell>
  );
}
