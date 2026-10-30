/**
 * MTU and MSS calculator.
 *
 * The reader stacks encapsulations on a link MTU and gets the inner MTU, the
 * TCP MSS to clamp to for IPv4 and IPv6, and the commands that do it. All
 * arithmetic lives in lib/toolkit/mtu-mss-calculator so it can be tested
 * against RFC values; this file only holds state and draws it.
 */

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  CISCO_ADJUST_MSS_MAX,
  CISCO_ADJUST_MSS_MIN,
  IPV4_MIN_MTU,
  IPV6_MIN_MTU,
  LAYER_KINDS,
  MAX_LAYERS,
  clampCommands,
  computeStack,
  layerTitle,
  outerIsV6,
  parseMtu,
  validCiscoIface,
  validLinuxIface,
  type Layer,
  type LayerKind,
  type OuterFamily,
} from "@/lib/toolkit/mtu-mss-calculator";

/* ----------------------------------------------------------------- styles */

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-40";
const ICON_BTN =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-40";
const SELECT =
  "min-h-[44px] rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const PRE =
  "min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]";

function toggleClass(on: boolean, align: "center" | "start" = "center"): string {
  return `flex min-h-[44px] cursor-pointer items-center ${align === "start" ? "justify-start py-2 text-left" : "justify-center"} gap-2 rounded-lg border px-3 font-mono-tight text-[0.6875rem] uppercase tracking-[0.16em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
    on
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
  }`;
}

const WARN_BOX =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const DANGER_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";

/* ---------------------------------------------------------------- presets */

const HAS_OUTER: LayerKind[] = ["gre", "vxlan", "wireguard", "esp"];

const PRESETS: { id: string; label: string; mtu: number; layers: Layer[] }[] = [
  { id: "pppoe", label: "DSL with PPPoE", mtu: 1500, layers: [{ kind: "pppoe" }] },
  { id: "pppoe-vlan", label: "PPPoE on a VLAN", mtu: 1500, layers: [{ kind: "dot1q" }, { kind: "pppoe" }] },
  { id: "wg-default", label: "WireGuard (wg-quick default)", mtu: 1500, layers: [{ kind: "wireguard", outer: "ipv6" }] },
  { id: "wg-pppoe", label: "WireGuard over PPPoE", mtu: 1500, layers: [{ kind: "pppoe" }, { kind: "wireguard", outer: "ipv4" }] },
  { id: "ipsec-natt", label: "IPsec site to site, NAT-T", mtu: 1500, layers: [{ kind: "esp", outer: "ipv4", natt: true }] },
  { id: "gre-ipsec", label: "GRE inside IPsec", mtu: 1500, layers: [{ kind: "esp", outer: "ipv4" }, { kind: "gre", outer: "ipv4" }] },
  { id: "vxlan", label: "VXLAN on 1500", mtu: 1500, layers: [{ kind: "vxlan", outer: "ipv4" }] },
  { id: "vxlan-jumbo", label: "VXLAN on 9000", mtu: 9000, layers: [{ kind: "vxlan", outer: "ipv4" }] },
  { id: "mpls", label: "MPLS VPN, two labels", mtu: 1500, layers: [{ kind: "mpls" }, { kind: "mpls" }] },
  { id: "qinq", label: "QinQ handoff", mtu: 1500, layers: [{ kind: "dot1ad" }, { kind: "dot1q" }] },
];

const DEFAULT_PRESET = PRESETS[3];

interface Item {
  id: number;
  layer: Layer;
}

/* ------------------------------------------------------------------- view */

function Stat({ label, value, sub, testId }: { label: string; value: string; sub: string; testId?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4">
      <div className={LABEL}>{label}</div>
      <div
        data-testid={testId}
        className="mt-2 font-display text-3xl font-medium tracking-[-0.02em] text-[hsl(var(--brand-bone))]"
      >
        {value}
      </div>
      <div className="mt-1 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{sub}</div>
    </div>
  );
}

export function MtuMssCalculator() {
  const nextId = useRef(DEFAULT_PRESET.layers.length);
  const [mtuDraft, setMtuDraft] = useState(String(DEFAULT_PRESET.mtu));
  const [items, setItems] = useState<Item[]>(() =>
    DEFAULT_PRESET.layers.map((layer, i) => ({ id: i, layer: { ...layer } })),
  );
  const [tagsCount, setTagsCount] = useState(false);
  const [iface, setIface] = useState("wg0");
  const [ciscoIface, setCiscoIface] = useState("Tunnel0");

  const parsedMtu = useMemo(() => parseMtu(mtuDraft), [mtuDraft]);
  const result = useMemo(
    () =>
      parsedMtu.ok
        ? computeStack({ linkMtu: parsedMtu.value, layers: items.map((it) => it.layer), tagsCountAgainstMtu: tagsCount })
        : null,
    [parsedMtu, items, tagsCount],
  );

  const ifaceOk = validLinuxIface(iface.trim());
  const ciscoOk = validCiscoIface(ciscoIface.trim());
  const commands = useMemo(() => {
    if (!result || result.mss4 === null) return null;
    return clampCommands(
      result.innerMtu,
      result.mss4,
      result.mss6,
      ifaceOk ? iface.trim() : "wg0",
      ciscoOk ? ciscoIface.trim() : "Tunnel0",
    );
  }, [result, iface, ciscoIface, ifaceOk, ciscoOk]);

  function addLayer(kind: LayerKind) {
    if (items.length >= MAX_LAYERS) return;
    const layer: Layer = HAS_OUTER.includes(kind) ? { kind, outer: "ipv4" } : { kind };
    setItems((prev) => [...prev, { id: nextId.current++, layer }]);
  }

  function updateLayer(id: number, patch: Partial<Layer>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, layer: { ...it.layer, ...patch } } : it)));
  }

  function move(index: number, delta: -1 | 1) {
    setItems((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(id: number) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setMtuDraft(String(preset.mtu));
    setItems(preset.layers.map((layer) => ({ id: nextId.current++, layer: { ...layer } })));
  }

  const ciscoOutOfRange =
    result?.mss4 != null && (result.mss4 < CISCO_ADJUST_MSS_MIN || result.mss4 > CISCO_ADJUST_MSS_MAX);

  const summary = !parsedMtu.ok
    ? "Enter a valid link MTU to see results."
    : result && result.mss4 !== null
      ? `Inner MTU ${result.innerMtu} bytes. Clamp MSS to ${result.mss4} for IPv4${result.mss6 !== null ? ` and ${result.mss6} for IPv6` : ""}.`
      : "No room is left for IP traffic inside this stack.";

  return (
    <ToolShell slug="mtu-mss-calculator">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <ToolPanel title="Link">
            <label htmlFor="mtu-link" className={LABEL}>
              Link MTU in bytes
            </label>
            <input
              id="mtu-link"
              value={mtuDraft}
              onChange={(e) => setMtuDraft(e.target.value)}
              inputMode="numeric"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!parsedMtu.ok}
              aria-describedby={parsedMtu.ok ? "mtu-link-hint" : "mtu-link-error"}
              data-testid="input-link-mtu"
              placeholder="1500"
              className={FIELD}
            />
            {parsedMtu.ok ? (
              <p id="mtu-link-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                The largest IP packet the physical interface carries: 1500 on standard Ethernet, 9000 or so with
                jumbo frames.
              </p>
            ) : (
              <p
                id="mtu-link-error"
                role="alert"
                data-testid="text-mtu-error"
                className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                {parsedMtu.error}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Common
              </span>
              {[1500, 1492, 9000, 9216].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMtuDraft(String(value))}
                  data-testid={`button-mtu-${value}`}
                  className={CHIP}
                >
                  {value}
                </button>
              ))}
            </div>

            <label className={`mt-5 ${toggleClass(tagsCount, "start")}`}>
              <input
                type="checkbox"
                className="sr-only"
                checked={tagsCount}
                onChange={(e) => setTagsCount(e.target.checked)}
                data-testid="checkbox-tags-count"
              />
              <span aria-hidden>{tagsCount ? "[x]" : "[ ]"}</span>
              <span className="normal-case tracking-normal">
                Gear on this path caps frames at 1518 bytes, so link VLAN tags eat into the MTU
              </span>
            </label>
          </ToolPanel>

          <ToolPanel title="Encapsulation stack">
            <div className={LABEL}>Start from</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  data-testid={`button-preset-${preset.id}`}
                  className={CHIP}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className={`mt-6 ${LABEL}`}>Add a layer, inside the last one</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {LAYER_KINDS.map((entry) => (
                <button
                  key={entry.kind}
                  type="button"
                  disabled={items.length >= MAX_LAYERS}
                  onClick={() => addLayer(entry.kind)}
                  data-testid={`button-add-${entry.kind}`}
                  className="flex min-h-[44px] flex-col items-start gap-0.5 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-3 py-2 text-left transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">+ {entry.label}</span>
                  <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{entry.hint}</span>
                </button>
              ))}
            </div>
            {items.length >= MAX_LAYERS ? (
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                The stack is capped at {MAX_LAYERS} layers.
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <div className={LABEL}>Outermost first</div>
              {items.length ? (
                <button type="button" onClick={() => setItems([])} data-testid="button-clear-stack" className={CHIP}>
                  Clear
                </button>
              ) : null}
            </div>

            {items.length === 0 ? (
              <p className="mt-3 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                No encapsulation. The inner MTU is the link MTU.
              </p>
            ) : (
              <ol className="mt-3 space-y-2" data-testid="list-stack">
                {items.map((item, index) => {
                  const { layer } = item;
                  const row = result?.rows[index];
                  const title = layerTitle(layer);
                  return (
                    <li
                      key={item.id}
                      className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{index + 1}.</span>
                        <span className="min-w-0 flex-1 break-words font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {title}
                        </span>
                        <span className="font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                          {row
                            ? row.frameBytes
                              ? `+${row.frameBytes} frame`
                              : `-${row.overhead} B`
                            : "not reached"}
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => move(index, -1)}
                            disabled={index === 0}
                            aria-label={`Move layer ${index + 1}, ${title}, outward`}
                            data-testid={`button-up-${index}`}
                            className={ICON_BTN}
                          >
                            <ArrowUp aria-hidden className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(index, 1)}
                            disabled={index === items.length - 1}
                            aria-label={`Move layer ${index + 1}, ${title}, inward`}
                            data-testid={`button-down-${index}`}
                            className={ICON_BTN}
                          >
                            <ArrowDown aria-hidden className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(item.id)}
                            aria-label={`Remove layer ${index + 1}, ${title}`}
                            data-testid={`button-remove-${index}`}
                            className={ICON_BTN}
                          >
                            <X aria-hidden className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {HAS_OUTER.includes(layer.kind) || layer.kind === "ipv6" ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {HAS_OUTER.includes(layer.kind) ? (
                            <select
                              value={layer.outer ?? "ipv4"}
                              onChange={(e) => updateLayer(item.id, { outer: e.target.value as OuterFamily })}
                              aria-label={`Outer IP version for layer ${index + 1}`}
                              data-testid={`select-outer-${index}`}
                              className={SELECT}
                            >
                              <option value="ipv4">over IPv4</option>
                              <option value="ipv6">over IPv6</option>
                            </select>
                          ) : null}
                          {layer.kind === "gre"
                            ? (
                                [
                                  ["greKey", "key +4"],
                                  ["greSeq", "seq +4"],
                                  ["greChecksum", "csum +4"],
                                ] as const
                              ).map(([field, text]) => (
                                <label key={field} className={toggleClass(Boolean(layer[field]))}>
                                  <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={Boolean(layer[field])}
                                    onChange={(e) => updateLayer(item.id, { [field]: e.target.checked } as Partial<Layer>)}
                                    data-testid={`checkbox-${field}-${index}`}
                                  />
                                  <span aria-hidden>{layer[field] ? "[x]" : "[ ]"}</span>
                                  {text}
                                </label>
                              ))
                            : null}
                          {(layer.kind === "gre" || layer.kind === "ipv6") && outerIsV6(layer) ? (
                            <label className={toggleClass(Boolean(layer.encapLimit))}>
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={Boolean(layer.encapLimit)}
                                onChange={(e) => updateLayer(item.id, { encapLimit: e.target.checked })}
                                data-testid={`checkbox-encaplimit-${index}`}
                              />
                              <span aria-hidden>{layer.encapLimit ? "[x]" : "[ ]"}</span>
                              encap limit +8
                            </label>
                          ) : null}
                          {layer.kind === "esp" ? (
                            <label className={toggleClass(Boolean(layer.natt))}>
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={Boolean(layer.natt)}
                                onChange={(e) => updateLayer(item.id, { natt: e.target.checked })}
                                data-testid={`checkbox-natt-${index}`}
                              />
                              <span aria-hidden>{layer.natt ? "[x]" : "[ ]"}</span>
                              NAT-T +8
                            </label>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </ToolPanel>
        </div>

        <div className="min-w-0 space-y-6">
          <ToolPanel title="Result">
            <p
              role="status"
              aria-live="polite"
              data-testid="text-summary"
              className="mb-4 font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            >
              {summary}
            </p>
            {result ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Stat
                    label="Inner MTU"
                    value={result.innerMtu > 0 ? String(result.innerMtu) : "none"}
                    sub={`${result.totalOverhead} bytes of overhead`}
                    testId="text-inner-mtu"
                  />
                  <Stat
                    label="MSS, IPv4"
                    value={result.mss4 !== null ? String(result.mss4) : "n/a"}
                    sub="MTU - 20 IP - 20 TCP"
                    testId="text-mss4"
                  />
                  <Stat
                    label="MSS, IPv6"
                    value={result.mss6 !== null ? String(result.mss6) : "n/a"}
                    sub={result.mss6 !== null ? "MTU - 40 IP - 20 TCP" : `needs MTU of ${IPV6_MIN_MTU}+`}
                    testId="text-mss6"
                  />
                </div>
                <div className="mt-4">
                  <ToolResult label="Link MTU" value={`${parsedMtu.ok ? parsedMtu.value : ""} bytes`} />
                  <ToolResult
                    label="VLAN tags on the link"
                    value={result.linkTags === 0 ? "none" : String(result.linkTags)}
                  />
                  <ToolResult
                    label="Ethernet frame"
                    value={`${result.frameSize} bytes`}
                    testId="text-frame-size"
                  />
                </div>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  Frame size counts the 14 byte header, link tags, payload and 4 byte FCS. Preamble and the
                  interframe gap are not included.
                </p>
                {result.warnings.length ? (
                  <ul className="mt-4 space-y-2" data-testid="list-warnings">
                    {result.warnings.map((warning, i) => (
                      <li
                        key={`${i}-${warning}`}
                        className={result.exhaustedAt || result.innerMtu < IPV4_MIN_MTU ? DANGER_BOX : WARN_BOX}
                      >
                        {warning}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </ToolPanel>

          {result && result.rows.length ? (
            <ToolPanel title="Layer by layer">
              <ol className="space-y-4" data-testid="list-breakdown">
                {result.rows.map((row) => (
                  <li key={`${row.index}-${row.kind}`} className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {row.index + 1}. {row.title}
                      </span>
                      <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        {row.budget} to {row.inner > 0 ? row.inner : "nothing"}
                      </span>
                    </div>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[280px] border-collapse text-left">
                        <tbody>
                          {row.parts.map((part) => (
                            <tr key={part.label} className="border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0">
                              <th
                                scope="row"
                                className="py-1.5 pr-4 font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone-dim))]"
                              >
                                {part.label}
                              </th>
                              <td className="whitespace-nowrap py-1.5 text-right font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                                {part.range ? `${part.range}, ${part.bytes} here` : part.bytes}
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <th
                              scope="row"
                              className="py-1.5 pr-4 font-mono-tight text-xs font-normal uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]"
                            >
                              {row.frameBytes ? "Added to the frame" : "Taken from the MTU"}
                            </th>
                            <td className="py-1.5 text-right font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                              {row.frameBytes ? row.frameBytes : row.overhead}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {row.note ? (
                      <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                        {row.note}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </ToolPanel>
          ) : null}
        </div>
      </div>

      {result && result.esp.some((detail) => detail.rows.length) ? (
        <ToolPanel title="ESP padding" className="mt-6">
          {result.esp
            .filter((detail) => detail.rows.length)
            .map((detail) => (
              <div key={detail.layerIndex} className="mb-6 last:mb-0">
                <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Layer {detail.layerIndex + 1} has {detail.budget} bytes. Inner packets of different lengths can
                  produce the same ESP packet, because padding fills the trailer out to a 4 byte boundary.
                  {detail.lost > 0
                    ? ` At this budget ${detail.lost} ${detail.lost === 1 ? "byte goes" : "bytes go"} unused: one more inner byte would need 3 bytes of padding and would not fit.`
                    : " At this budget the largest inner packet needs no padding at all."}
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-left" data-testid={`table-esp-${detail.layerIndex}`}>
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        {["Inner packet", "Padding", "ESP packet", "Fits"].map((head) => (
                          <th
                            key={head}
                            scope="col"
                            className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                          >
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.rows.map((row) => (
                        <tr key={row.inner} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                          <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{row.inner}</td>
                          <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{row.padding}</td>
                          <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                            {row.espPacket}
                          </td>
                          <td
                            className={`py-2 font-mono-tight text-sm ${
                              row.fits ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-danger))]"
                            }`}
                          >
                            {row.fits ? "yes" : `no, ${row.espPacket - detail.budget} over`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </ToolPanel>
      ) : null}

      <ToolPanel title="Clamp commands" className="mt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor="mtu-iface" className={LABEL}>
              Linux interface
            </label>
            <input
              id="mtu-iface"
              value={iface}
              onChange={(e) => setIface(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={!ifaceOk}
              aria-describedby={ifaceOk ? undefined : "mtu-iface-error"}
              data-testid="input-iface"
              className={FIELD}
            />
            {ifaceOk ? null : (
              <p id="mtu-iface-error" role="alert" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
                Up to 15 letters, digits, dots, dashes or underscores. Showing wg0 until it is valid.
              </p>
            )}
          </div>
          <div className="min-w-0">
            <label htmlFor="mtu-cisco-iface" className={LABEL}>
              Cisco interface
            </label>
            <input
              id="mtu-cisco-iface"
              value={ciscoIface}
              onChange={(e) => setCiscoIface(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={!ciscoOk}
              aria-describedby={ciscoOk ? undefined : "mtu-cisco-error"}
              data-testid="input-cisco-iface"
              className={FIELD}
            />
            {ciscoOk ? null : (
              <p id="mtu-cisco-error" role="alert" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
                A name such as Tunnel0 or GigabitEthernet0/0/1.100. Showing Tunnel0 until it is valid.
              </p>
            )}
          </div>
        </div>

        {commands ? (
          <div className="mt-6 space-y-5">
            {(
              [
                ["Linux interface MTU", commands.linuxMtu, "linux-mtu"],
                ["iptables", commands.iptables, "iptables"],
                ["nftables", commands.nftables, "nftables"],
                ["Cisco IOS", commands.cisco, "cisco"],
              ] as const
            ).map(([title, text, id]) => (
              <div key={id}>
                <h3 className={LABEL}>{title}</h3>
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <pre className={PRE} data-testid={`text-cmd-${id}`}>
                    {text}
                  </pre>
                  <CopyButton value={text} label={`Copy the ${title} commands`} testId={`button-copy-${id}`} />
                </div>
              </div>
            ))}
            {ciscoOutOfRange ? (
              <p className={WARN_BOX}>
                IOS accepts {CISCO_ADJUST_MSS_MIN} to {CISCO_ADJUST_MSS_MAX} for ip tcp adjust-mss, and{" "}
                {result?.mss4} is outside that range. Check what your platform accepts.
              </p>
            ) : null}
            <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The rules match SYN and SYN-ACK in both directions through the interface, and only ever lower an MSS:
              iptables' --set-mss has not raised one since Linux 2.6.25, and the nftables rules test the size first.
              Use them on the router that forwards into the tunnel, not on the endpoints.
            </p>
          </div>
        ) : (
          <p className="mt-6 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Commands appear once the stack leaves room for IPv4, at least {IPV4_MIN_MTU} bytes.
          </p>
        )}
      </ToolPanel>
    </ToolShell>
  );
}
