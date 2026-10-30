/**
 * OSPF cost calculator.
 *
 * Every number on the page comes from one function, ospfCost, applied to the
 * reference bandwidth and each link's speed in whole kilobits per second.
 * The two paths, the collapse table and the generated configuration all read
 * the same derived values, so they cannot disagree with each other.
 */

import { useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  DEFAULT_REFERENCE_MBPS,
  LINK_PRESETS,
  MAX_HOPS,
  MAX_INTERFACE_COST,
  MAX_REFERENCE_MBPS,
  type BandwidthUnit,
  type ConfigHop,
  type CostResult,
  type Parsed,
  cleanInterfaceName,
  compareTotals,
  findCollapses,
  formatBandwidth,
  frrConfig,
  iosConfig,
  ospfCost,
  parseBandwidthKbps,
  parseProcessId,
  parseReferenceMbps,
  presetById,
  suggestReferenceMbps,
} from "@/lib/toolkit/ospf-cost-calculator";

type PathKey = "A" | "B";
type Dialect = "ios" | "frr";

interface HopDraft {
  id: number;
  name: string;
  /** A LINK_PRESETS id, or "custom". */
  preset: string;
  custom: string;
  unit: BandwidthUnit;
}

const UNITS: BandwidthUnit[] = ["kbps", "Mbps", "Gbps"];

const REFERENCE_CHIPS = [100, 1000, 10000, 40000, 100000, 400000, 1000000];

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT =
  "min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_BASE =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON = "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const ERROR_TEXT = "mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const HINT_TEXT = "mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]";

/* The opening example: three 1 Gbps hops against four 100 Gbps hops. At the
   default reference every one of those links costs 1, so OSPF counts hops
   and takes the slow path. */
function initialPaths(): Record<PathKey, HopDraft[]> {
  return {
    A: ["Gi0/0", "Gi0/1", "Gi0/2"].map((name, i) => ({ id: i + 1, name, preset: "1g", custom: "1", unit: "Gbps" })),
    B: ["Hu0/0/0", "Hu0/0/1", "Hu0/0/2", "Hu0/0/3"].map((name, i) => ({
      id: i + 4,
      name,
      preset: "100g",
      custom: "100",
      unit: "Gbps",
    })),
  };
}

function resolveHop(hop: HopDraft): Parsed<bigint> {
  if (hop.preset !== "custom") {
    const preset = presetById(hop.preset);
    if (preset) return { ok: true, value: preset.kbps };
  }
  return parseBandwidthKbps(hop.custom, hop.unit);
}

function mbpsLabel(mbps: number): string {
  return formatBandwidth(BigInt(mbps) * 1000n);
}

function quotientText(q: number): string {
  return q.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** One line of arithmetic, so the reader sees exactly what was dropped. */
function costWorking(referenceMbps: number, kbps: bigint, r: CostResult): string {
  const lhs = `${(referenceMbps * 1000).toLocaleString("en-US")} / ${Number(kbps).toLocaleString("en-US")} kbps = ${quotientText(r.quotient)}`;
  if (r.floored) return `${lhs}, raised to the minimum of 1`;
  if (r.capped) return `${lhs}, capped at ${MAX_INTERFACE_COST}`;
  if (!r.exact) return `${lhs}, fraction dropped`;
  return lhs;
}

interface ResolvedPath {
  hops: { draft: HopDraft; parsed: Parsed<bigint> }[];
  speeds: bigint[] | null;
}

function resolvePath(drafts: HopDraft[]): ResolvedPath {
  const hops = drafts.map((draft) => ({ draft, parsed: resolveHop(draft) }));
  const speeds: bigint[] = [];
  for (const h of hops) {
    if (!h.parsed.ok) return { hops, speeds: null };
    speeds.push(h.parsed.value);
  }
  return { hops, speeds: speeds.length ? speeds : null };
}

function total(referenceMbps: number | null, speeds: bigint[] | null): number | null {
  if (referenceMbps === null || speeds === null) return null;
  return speeds.reduce((sum, kbps) => sum + ospfCost(referenceMbps, kbps).cost, 0);
}

function slowest(speeds: bigint[] | null): bigint | null {
  if (!speeds || speeds.length === 0) return null;
  return speeds.reduce((min, s) => (s < min ? s : min));
}

/* ------------------------------------------------------------ path editor */

function PathEditor({
  pathKey,
  hops,
  resolved,
  referenceMbps,
  onEdit,
  onAdd,
  onRemove,
}: {
  pathKey: PathKey;
  hops: HopDraft[];
  resolved: ResolvedPath;
  referenceMbps: number | null;
  onEdit: (id: number, patch: Partial<HopDraft>) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
}) {
  const sum = total(referenceMbps, resolved.speeds);
  return (
    <ToolPanel title={`Path ${pathKey}`}>
      <ol className="space-y-3">
        {resolved.hops.map(({ draft, parsed }, index) => {
          const base = `ospf-${pathKey}-${draft.id}`;
          const cost = parsed.ok && referenceMbps !== null ? ospfCost(referenceMbps, parsed.value) : null;
          return (
            <li
              key={draft.id}
              className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-3"
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 basis-[7rem]">
                  <label htmlFor={`${base}-name`} className={LABEL}>
                    Hop {index + 1} interface
                  </label>
                  <input
                    id={`${base}-name`}
                    value={draft.name}
                    onChange={(e) => onEdit(draft.id, { name: e.target.value })}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    maxLength={60}
                    data-testid={`input-hop-name-${pathKey}-${index + 1}`}
                    className={`mt-2 ${INPUT}`}
                  />
                </div>
                <div className="min-w-0 flex-[2] basis-[10rem]">
                  <label htmlFor={`${base}-speed`} className={LABEL}>
                    Speed
                  </label>
                  <select
                    id={`${base}-speed`}
                    value={draft.preset}
                    onChange={(e) => onEdit(draft.id, { preset: e.target.value })}
                    data-testid={`select-hop-speed-${pathKey}-${index + 1}`}
                    className={`mt-2 ${SELECT}`}
                  >
                    {LINK_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                    <option value="custom">Custom speed</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(draft.id)}
                  disabled={hops.length <= 1}
                  aria-label={`Remove hop ${index + 1} from path ${pathKey}`}
                  data-testid={`button-remove-hop-${pathKey}-${index + 1}`}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-danger)/0.6)] hover:text-[hsl(var(--brand-danger))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>

              {draft.preset === "custom" ? (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-[2] basis-[8rem]">
                    <label htmlFor={`${base}-custom`} className={LABEL}>
                      Custom speed
                    </label>
                    <input
                      id={`${base}-custom`}
                      value={draft.custom}
                      onChange={(e) => onEdit(draft.id, { custom: e.target.value })}
                      inputMode="decimal"
                      spellCheck={false}
                      aria-invalid={!parsed.ok}
                      aria-describedby={!parsed.ok ? `${base}-error` : undefined}
                      data-testid={`input-hop-custom-${pathKey}-${index + 1}`}
                      className={`mt-2 ${INPUT}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1 basis-[6rem]">
                    <label htmlFor={`${base}-unit`} className={LABEL}>
                      Unit
                    </label>
                    <select
                      id={`${base}-unit`}
                      value={draft.unit}
                      onChange={(e) => onEdit(draft.id, { unit: e.target.value as BandwidthUnit })}
                      className={`mt-2 ${SELECT}`}
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}

              {!parsed.ok ? (
                <p id={`${base}-error`} role="alert" className={ERROR_TEXT}>
                  {parsed.error}
                </p>
              ) : cost && referenceMbps !== null ? (
                <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 font-mono-tight text-xs leading-relaxed">
                  <span className="text-[hsl(var(--brand-ash))]">{costWorking(referenceMbps, parsed.value, cost)}</span>
                  <span
                    className={cost.floored ? "text-[hsl(var(--brand-amber))]" : "text-[hsl(var(--brand-signal))]"}
                  >
                    cost {cost.cost}
                  </span>
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onAdd}
          disabled={hops.length >= MAX_HOPS}
          data-testid={`button-add-hop-${pathKey}`}
          className={`${CHIP_BASE} ${CHIP_OFF} gap-2 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add hop
        </button>
        <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]" data-testid={`text-total-${pathKey}`}>
          Total {sum === null ? "n/a" : sum.toLocaleString("en-US")}
        </span>
      </div>
      <p className={HINT_TEXT}>
        Each hop is the outgoing interface on the router that forwards. Up to {MAX_HOPS} hops per path.
      </p>
    </ToolPanel>
  );
}

/* ------------------------------------------------------------------- page */

export function OspfCostCalculator() {
  const [refDraft, setRefDraft] = useState(String(DEFAULT_REFERENCE_MBPS));
  const [paths, setPaths] = useState<Record<PathKey, HopDraft[]>>(initialPaths);
  const [dialect, setDialect] = useState<Dialect>("ios");
  const [processDraft, setProcessDraft] = useState("1");
  const [pin, setPin] = useState(false);
  const nextId = useRef(100);

  const ref = useMemo(() => parseReferenceMbps(refDraft), [refDraft]);
  const referenceMbps = ref.ok ? ref.value : null;
  const processId = useMemo(() => parseProcessId(processDraft), [processDraft]);

  const resolvedA = useMemo(() => resolvePath(paths.A), [paths.A]);
  const resolvedB = useMemo(() => resolvePath(paths.B), [paths.B]);

  const totalA = total(referenceMbps, resolvedA.speeds);
  const totalB = total(referenceMbps, resolvedB.speeds);
  const defaultA = total(DEFAULT_REFERENCE_MBPS, resolvedA.speeds);
  const defaultB = total(DEFAULT_REFERENCE_MBPS, resolvedB.speeds);
  const winner = compareTotals(totalA, totalB);
  const defaultWinner = compareTotals(defaultA, defaultB);
  const slowA = slowest(resolvedA.speeds);
  const slowB = slowest(resolvedB.speeds);

  const allSpeeds = useMemo(() => [...(resolvedA.speeds ?? []), ...(resolvedB.speeds ?? [])], [resolvedA, resolvedB]);
  const fastest = allSpeeds.length ? allSpeeds.reduce((max, s) => (s > max ? s : max)) : null;
  const suggested = fastest !== null ? suggestReferenceMbps(fastest) : null;
  // At or above the reference means cost 1: exactly 1 at the reference, floored to 1 above it.
  const atOrAboveCount =
    referenceMbps === null ? 0 : allSpeeds.filter((s) => s >= BigInt(referenceMbps) * 1000n).length;
  const cappedCount =
    referenceMbps === null ? 0 : allSpeeds.filter((s) => ospfCost(referenceMbps, s).capped).length;
  const pathCollapses = referenceMbps === null ? [] : findCollapses(referenceMbps, allSpeeds);

  const tableCollapsesDefault = useMemo(
    () => findCollapses(DEFAULT_REFERENCE_MBPS, LINK_PRESETS.map((p) => p.kbps)),
    [],
  );
  const tableCollapsesCurrent = useMemo(
    () => (referenceMbps === null ? [] : findCollapses(referenceMbps, LINK_PRESETS.map((p) => p.kbps))),
    [referenceMbps],
  );

  function editHop(path: PathKey, id: number, patch: Partial<HopDraft>) {
    setPaths((prev) => ({ ...prev, [path]: prev[path].map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
  }

  function addHop(path: PathKey) {
    setPaths((prev) => {
      if (prev[path].length >= MAX_HOPS) return prev;
      const last = prev[path][prev[path].length - 1];
      nextId.current += 1;
      const hop: HopDraft = {
        id: nextId.current,
        name: `eth${prev[path].length}`,
        preset: last?.preset ?? "1g",
        custom: last?.custom ?? "1",
        unit: last?.unit ?? "Gbps",
      };
      return { ...prev, [path]: [...prev[path], hop] };
    });
  }

  function removeHop(path: PathKey, id: number) {
    setPaths((prev) => (prev[path].length <= 1 ? prev : { ...prev, [path]: prev[path].filter((h) => h.id !== id) }));
  }

  const configHops: ConfigHop[] = useMemo(() => {
    if (referenceMbps === null) return [];
    const out: ConfigHop[] = [];
    (["A", "B"] as PathKey[]).forEach((key) => {
      const resolved = key === "A" ? resolvedA : resolvedB;
      resolved.hops.forEach(({ draft, parsed }, i) => {
        if (!parsed.ok) return;
        out.push({
          path: key,
          index: i + 1,
          name: cleanInterfaceName(draft.name, `${key}-hop${i + 1}`),
          kbps: parsed.value,
          cost: ospfCost(referenceMbps, parsed.value).cost,
        });
      });
    });
    return out;
  }, [referenceMbps, resolvedA, resolvedB]);

  const config =
    referenceMbps === null
      ? ""
      : dialect === "ios"
        ? iosConfig({ referenceMbps, processId: processId.ok ? processId.value : 1, pin, hops: configHops })
        : frrConfig({ referenceMbps, processId: 1, pin, hops: configHops });

  const winnerText =
    winner === "none"
      ? "n/a"
      : winner === "tie"
        ? "Equal, both installed"
        : `Path ${winner}`;

  let verdict: { tone: "ok" | "warn"; text: string } | null = null;
  if (winner !== "none" && referenceMbps !== null && slowA !== null && slowB !== null) {
    const parts: string[] = [];
    if (winner === "tie") {
      parts.push(
        "The totals are equal, so OSPF installs both paths and load-shares across them, up to the router's maximum-paths limit.",
      );
    } else {
      const win = winner === "A" ? slowA : slowB;
      const lose = winner === "A" ? slowB : slowA;
      const other = winner === "A" ? "B" : "A";
      parts.push(
        `OSPF prefers path ${winner} (slowest link ${formatBandwidth(win)}) over path ${other} (slowest link ${formatBandwidth(lose)}).`,
      );
    }
    if (atOrAboveCount > 0 && atOrAboveCount === allSpeeds.length) {
      parts.push(
        `All ${allSpeeds.length} links here run at or above the ${mbpsLabel(referenceMbps)} reference, so each costs 1 and OSPF is simply counting hops.`,
      );
    } else if (atOrAboveCount === 1) {
      parts.push(
        `1 of the ${allSpeeds.length} links here runs at or above the ${mbpsLabel(referenceMbps)} reference, so it costs 1 whatever its speed.`,
      );
    } else if (atOrAboveCount > 1) {
      parts.push(
        `${atOrAboveCount} of the ${allSpeeds.length} links here run at or above the ${mbpsLabel(referenceMbps)} reference, so each of those costs 1 whatever its speed.`,
      );
    }
    if (cappedCount > 0) {
      parts.push(
        `${cappedCount === 1 ? "1 link hits" : `${cappedCount} links hit`} the ${MAX_INTERFACE_COST.toLocaleString("en-US")} ceiling, so slower links than that can no longer be told apart either.`,
      );
    }
    if (defaultWinner !== winner && referenceMbps !== DEFAULT_REFERENCE_MBPS && defaultWinner !== "none") {
      parts.push(
        defaultWinner === "tie"
          ? "At the 100 Mbps default the two paths would tie."
          : `At the 100 Mbps default OSPF would pick path ${defaultWinner} instead.`,
      );
    }
    const slowerWins =
      (winner === "A" && slowA < slowB) || (winner === "B" && slowB < slowA) || (winner === "tie" && slowA !== slowB);
    verdict = { tone: slowerWins && atOrAboveCount > 0 ? "warn" : "ok", text: parts.join(" ") };
  }

  return (
    <ToolShell slug="ospf-cost-calculator">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Reference bandwidth">
            <label htmlFor="ospf-reference" className={LABEL}>
              auto-cost reference-bandwidth, in Mbps
            </label>
            <input
              id="ospf-reference"
              value={refDraft}
              onChange={(e) => setRefDraft(e.target.value)}
              inputMode="numeric"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!ref.ok}
              aria-describedby={ref.ok ? "ospf-reference-hint" : "ospf-reference-error"}
              data-testid="input-reference"
              className={`mt-2 ${INPUT}`}
            />
            {ref.ok ? (
              <p id="ospf-reference-hint" className={HINT_TEXT}>
                {mbpsLabel(ref.value)}. Any link at or above it costs 1. Range 1 to{" "}
                {MAX_REFERENCE_MBPS.toLocaleString("en-US")} Mbps; the default is 100.
              </p>
            ) : (
              <p id="ospf-reference-error" role="alert" data-testid="text-reference-error" className={ERROR_TEXT}>
                {ref.error}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {REFERENCE_CHIPS.map((mbps) => (
                <button
                  key={mbps}
                  type="button"
                  onClick={() => setRefDraft(String(mbps))}
                  aria-pressed={referenceMbps === mbps}
                  data-testid={`button-reference-${mbps}`}
                  className={`${CHIP_BASE} ${referenceMbps === mbps ? CHIP_ON : CHIP_OFF}`}
                >
                  {mbpsLabel(mbps)}
                  {mbps === DEFAULT_REFERENCE_MBPS ? " (default)" : ""}
                </button>
              ))}
            </div>

            {fastest !== null && suggested !== null ? (
              <div className="mt-5 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-3">
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Fastest link on these paths: {formatBandwidth(fastest)}. The smallest power of ten at or above it is{" "}
                  {suggested.toLocaleString("en-US")} Mbps, which keeps every link here above the floor of 1.
                </p>
                <button
                  type="button"
                  onClick={() => setRefDraft(String(suggested))}
                  disabled={referenceMbps === suggested}
                  data-testid="button-use-suggested"
                  className={`mt-3 ${CHIP_BASE} ${CHIP_OFF} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  Use {suggested.toLocaleString("en-US")}
                </button>
              </div>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Comparison">
            <ToolResult label="Path A total" value={totalA === null ? "n/a" : totalA.toLocaleString("en-US")} />
            <ToolResult label="Path B total" value={totalB === null ? "n/a" : totalB.toLocaleString("en-US")} />
            <ToolResult label="OSPF picks" value={winnerText} testId="text-winner" />
            <ToolResult
              label="At the 100 Mbps default"
              value={
                defaultA === null || defaultB === null
                  ? "n/a"
                  : `A ${defaultA} · B ${defaultB} · ${
                      defaultWinner === "tie" ? "equal" : `path ${defaultWinner}`
                    }`
              }
            />
            <ToolResult
              label="Slowest link"
              value={`A ${slowA === null ? "n/a" : formatBandwidth(slowA)} · B ${slowB === null ? "n/a" : formatBandwidth(slowB)}`}
            />
            <p
              role="status"
              aria-live="polite"
              data-testid="text-verdict"
              className={`mt-4 rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${
                verdict === null
                  ? "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                  : verdict.tone === "warn"
                    ? "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]"
                    : "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]"
              }`}
            >
              {verdict === null
                ? "Fix the inputs marked in red to compare the paths."
                : verdict.text}
            </p>
            {pathCollapses.length > 0 && referenceMbps !== null ? (
              <p className={HINT_TEXT}>
                Speeds sharing a cost here:{" "}
                {pathCollapses
                  .map((c) => `${c.speeds.map(formatBandwidth).join(", ")} all cost ${c.cost}`)
                  .join("; ")}
                .
              </p>
            ) : null}
          </ToolPanel>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {(["A", "B"] as PathKey[]).map((key) => (
            <PathEditor
              key={key}
              pathKey={key}
              hops={paths[key]}
              resolved={key === "A" ? resolvedA : resolvedB}
              referenceMbps={referenceMbps}
              onEdit={(id, patch) => editHop(key, id, patch)}
              onAdd={() => addHop(key)}
              onRemove={(id) => removeHop(key, id)}
            />
          ))}
        </div>

        <ToolPanel title="Where the default runs out">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left" data-testid="table-costs">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th
                    scope="col"
                    className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                  >
                    Link
                  </th>
                  <th
                    scope="col"
                    className="py-2 pr-4 text-right font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                  >
                    Cost at 100 Mbps
                  </th>
                  <th
                    scope="col"
                    className="py-2 text-right font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                  >
                    Cost at {referenceMbps === null ? "n/a" : `${referenceMbps.toLocaleString("en-US")} Mbps`}
                  </th>
                </tr>
              </thead>
              <tbody>
                {LINK_PRESETS.map((p) => {
                  const atDefault = ospfCost(DEFAULT_REFERENCE_MBPS, p.kbps);
                  const atCurrent = referenceMbps === null ? null : ospfCost(referenceMbps, p.kbps);
                  return (
                    <tr key={p.id} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                      <th
                        scope="row"
                        className="py-2.5 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]"
                      >
                        {p.label}
                      </th>
                      <td
                        className={`py-2.5 pr-4 text-right font-mono-tight text-sm ${
                          atDefault.floored ? "text-[hsl(var(--brand-amber))]" : "text-[hsl(var(--brand-bone-dim))]"
                        }`}
                      >
                        {atDefault.cost}
                      </td>
                      <td
                        className={`py-2.5 text-right font-mono-tight text-sm ${
                          atCurrent?.floored
                            ? "text-[hsl(var(--brand-amber))]"
                            : atCurrent?.capped
                              ? "text-[hsl(var(--brand-danger))]"
                              : "text-[hsl(var(--brand-signal))]"
                        }`}
                      >
                        {atCurrent === null ? "n/a" : atCurrent.cost}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="mt-4 space-y-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            {tableCollapsesDefault.map((c) => (
              <li key={`d-${c.cost}`}>
                At 100 Mbps, {c.speeds.length} different speeds cost {c.cost}:{" "}
                {c.speeds.map(formatBandwidth).join(", ")}.
              </li>
            ))}
            {referenceMbps !== null && referenceMbps !== DEFAULT_REFERENCE_MBPS
              ? tableCollapsesCurrent.length === 0
                ? (
                    <li>
                      At {referenceMbps.toLocaleString("en-US")} Mbps, every speed in this table has a cost of its
                      own.
                    </li>
                  )
                : tableCollapsesCurrent.map((c) => (
                    <li key={`c-${c.cost}`}>
                      At {referenceMbps.toLocaleString("en-US")} Mbps, {c.speeds.length} speeds cost {c.cost}:{" "}
                      {c.speeds.map(formatBandwidth).join(", ")}.
                    </li>
                  ))
              : null}
          </ul>
          <p className={HINT_TEXT}>
            Amber marks a link faster than the reference: its cost is raised to the floor of 1, so it looks no faster
            than a link at the reference. Red marks a cost capped at{" "}
            {MAX_INTERFACE_COST.toLocaleString("en-US")}, the largest a 16-bit router-LSA metric can carry.
          </p>
        </ToolPanel>

        <ToolPanel title="Configuration">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Configuration dialect">
              {(
                [
                  { key: "ios", label: "Cisco IOS" },
                  { key: "frr", label: "FRRouting" },
                ] as { key: Dialect; label: string }[]
              ).map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDialect(d.key)}
                  aria-pressed={dialect === d.key}
                  data-testid={`button-dialect-${d.key}`}
                  className={`${CHIP_BASE} ${dialect === d.key ? CHIP_ON : CHIP_OFF}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {dialect === "ios" ? (
              <div className="w-36">
                <label htmlFor="ospf-process" className={LABEL}>
                  Process id
                </label>
                <input
                  id="ospf-process"
                  value={processDraft}
                  onChange={(e) => setProcessDraft(e.target.value)}
                  inputMode="numeric"
                  aria-invalid={!processId.ok}
                  aria-describedby={!processId.ok ? "ospf-process-error" : undefined}
                  data-testid="input-process-id"
                  className={`mt-2 ${INPUT}`}
                />
              </div>
            ) : null}
            <label
              className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
                pin
                  ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                  : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={pin}
                onChange={() => setPin((v) => !v)}
                data-testid="checkbox-pin"
              />
              <span aria-hidden>{pin ? "[x]" : "[ ]"}</span>
              Pin each cost with ip ospf cost
            </label>
          </div>
          {dialect === "ios" && !processId.ok ? (
            <p id="ospf-process-error" role="alert" className={ERROR_TEXT}>
              {processId.error} Using 1 until it is fixed.
            </p>
          ) : null}

          {config ? (
            <div className="mt-4 flex flex-wrap items-start gap-2">
              <pre
                data-testid="text-config"
                className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]"
              >
                {config}
              </pre>
              <CopyButton value={config} label="Copy configuration" testId="button-copy-config" />
            </div>
          ) : (
            <p className={ERROR_TEXT}>Fix the reference bandwidth to generate configuration.</p>
          )}
          <p className={HINT_TEXT}>
            Interface names are copied as typed. FRR uses the Linux name, such as eth0 or ens3. Pinning makes the cost
            independent of the reference and of how a given implementation rounds; leaving it off lets the reference do
            the work.
          </p>
        </ToolPanel>

        <div className="rounded-2xl border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.07)] p-5">
          <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
            The reference has to match on every router
          </div>
          <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Each router computes the cost of its own interfaces and advertises it. A router still on 100 Mbps advertises
            its 10 Gbps links at cost 1 while its neighbors on 100000 advertise theirs at 10, so traffic bends toward the
            router that was missed. No OSPF packet carries the reference, so no router can notice the mismatch; the
            paths are simply wrong. Change it everywhere in the same window.
          </p>
        </div>
      </div>
    </ToolShell>
  );
}
