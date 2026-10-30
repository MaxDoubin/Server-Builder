/**
 * DHCP classless static route encoder and decoder (RFC 3442 option 121,
 * Microsoft option 249).
 *
 * The route list is the one source of truth. The hex string, the wire
 * layout table and the three server configurations are all derived from it,
 * and nothing is encoded while any row is invalid, so a config copied from
 * this page can never be missing a route that was silently skipped.
 */

import { useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  MAX_DECODE_BYTES,
  MAX_ROUTES,
  SINGLE_OPTION_MAX,
  cidrString,
  decodeOption,
  dnsmasqConfig,
  encodeRoute,
  encodeRoutes,
  formatIPv4,
  iscConfig,
  keaConfig,
  parseCidr,
  parseDecimalBytes,
  parseHexBytes,
  parseIPv4,
  routeWarnings,
  significantOctets,
  toHex,
  type Route,
} from "@/lib/toolkit/dhcp-option-121-encoder";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ---------------------------------------------------------------- styles */

const FIELD =
  "min-h-[44px] w-full min-w-0 rounded-lg border bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const LABEL =
  "mb-1.5 block font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]";
const CHIP =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-40";
const PRE =
  "min-w-0 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]";
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const WARN_BOX =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

/* ----------------------------------------------------------------- state */

interface Row {
  id: number;
  dest: string;
  router: string;
}

type RowSeed = Omit<Row, "id">;

const PRESETS: { label: string; rows: RowSeed[] }[] = [
  {
    label: "Split route plus default",
    rows: [
      { dest: "10.0.0.0/8", router: "192.168.1.254" },
      { dest: "172.16.0.0/12", router: "192.168.1.254" },
      { dest: "0.0.0.0/0", router: "192.168.1.1" },
    ],
  },
  {
    label: "RFC 3442 examples",
    rows: [
      { dest: "10.0.0.0/8", router: "192.0.2.1" },
      { dest: "10.17.0.0/16", router: "192.0.2.1" },
      { dest: "10.27.129.0/24", router: "192.0.2.1" },
      { dest: "10.229.0.128/25", router: "192.0.2.1" },
      { dest: "10.198.122.47/32", router: "192.0.2.1" },
      { dest: "0.0.0.0/0", router: "192.0.2.1" },
    ],
  },
  { label: "Default route only", rows: [{ dest: "0.0.0.0/0", router: "192.168.1.1" }] },
  {
    label: "On-link subnet",
    rows: [
      { dest: "192.168.2.0/24", router: "0.0.0.0" },
      { dest: "0.0.0.0/0", router: "192.168.1.1" },
    ],
  },
  { label: "Missing default", rows: [{ dest: "10.0.0.0/8", router: "192.168.1.254" }] },
];

const DECODE_EXAMPLES: { label: string; format: "hex" | "decimal"; text: string }[] = [
  { label: "Hex with header", format: "hex", text: "79 0b 08 0a c0 a8 01 fe 00 c0 a8 01 01" },
  { label: "dhcpd line", format: "decimal", text: "option rfc3442-classless-static-routes 24, 192, 168, 123, 10, 10, 10, 1;" },
  { label: "Truncated", format: "hex", text: "18 0a 00 00 c0 a8" },
];

interface RowCheck {
  blank: boolean;
  destError: string | null;
  routerError: string | null;
  note: string | null;
  route: Route | null;
}

function checkRow(row: Row): RowCheck {
  if (row.dest.trim() === "" && row.router.trim() === "") {
    return { blank: true, destError: null, routerError: null, note: null, route: null };
  }
  const dest = parseCidr(row.dest);
  const router = parseIPv4(row.router);
  const destError = dest.ok ? null : dest.error;
  const routerError = router.ok ? null : router.error;
  let note: string | null = null;
  if (dest.ok && dest.value.hostBitsSet) {
    note = `${formatIPv4(dest.value.typed)} has bits set past /${dest.value.prefix}. Encoded as ${cidrString(dest.value.network, dest.value.prefix)}.`;
  }
  const route = dest.ok && router.ok ? { network: dest.value.network, prefix: dest.value.prefix, router: router.value } : null;
  return { blank: false, destError, routerError, note, route };
}

/** The bytes of one route, colored by role: width, destination, router. */
function RouteBytes({ route }: { route: Route }) {
  const bytes = encodeRoute(route);
  const sig = significantOctets(route.prefix);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return (
    <span className="whitespace-nowrap font-mono-tight text-sm">
      <span className="text-[hsl(var(--brand-signal))]">{hex(bytes[0])}</span>
      {sig > 0 ? (
        <span className="text-[hsl(var(--brand-cyan))]"> {bytes.slice(1, 1 + sig).map(hex).join(" ")}</span>
      ) : null}
      <span className="text-[hsl(var(--brand-amber))]"> {bytes.slice(1 + sig).map(hex).join(" ")}</span>
    </span>
  );
}

function RouteTable({ routes, testId, offsets }: { routes: Route[]; testId: string; offsets?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table data-testid={testId} className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[hsl(var(--brand-iron))]">
            {offsets ? (
              <th scope="col" className={TH}>
                Byte
              </th>
            ) : null}
            <th scope="col" className={TH}>
              Destination
            </th>
            <th scope="col" className={TH}>
              Router
            </th>
            <th scope="col" className={TH}>
              Octets
            </th>
            <th scope="col" className={`${TH} pr-0`}>
              Wire bytes
            </th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route, i) => (
            <tr key={i} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
              {offsets ? (
                <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-ash))]">{offsets[i]}</td>
              ) : null}
              <th scope="row" className="py-2.5 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                {route.prefix === 0 ? "0.0.0.0/0 (default)" : cidrString(route.network, route.prefix)}
              </th>
              <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                {route.router === 0 ? "0.0.0.0 (on-link)" : formatIPv4(route.router)}
              </td>
              <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                {1 + significantOctets(route.prefix) + 4}
              </td>
              <td className="py-2.5">
                <RouteBytes route={route} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfigBlock({ title, value, testId }: { title: string; value: string; testId: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">{title}</h3>
        <CopyButton value={value} label={`Copy the ${title} configuration`} testId={`button-copy-${testId}`} />
      </div>
      <pre data-testid={`text-${testId}`} className={PRE}>
        {value}
      </pre>
    </div>
  );
}

export function DhcpOption121Encoder() {
  const nextId = useRef(3);
  const [rows, setRows] = useState<Row[]>([
    { id: 1, dest: "10.0.0.0/8", router: "192.168.1.254" },
    { id: 2, dest: "0.0.0.0/0", router: "192.168.1.1" },
  ]);
  const [includeMs, setIncludeMs] = useState(true);
  const [decodeFormat, setDecodeFormat] = useState<"hex" | "decimal">("hex");
  const [decodeText, setDecodeText] = useState("");

  const checks = useMemo(() => rows.map(checkRow), [rows]);
  const { routes, invalidCount } = useMemo(() => {
    const filled = checks.filter((c) => !c.blank);
    const invalid = filled.filter((c) => c.route === null).length;
    return {
      invalidCount: invalid,
      routes: invalid === 0 ? filled.map((c) => c.route as Route) : [],
    };
  }, [checks]);
  const ready = invalidCount === 0 && routes.length > 0;

  const bytes = useMemo(() => (ready ? encodeRoutes(routes) : []), [ready, routes]);
  const warnings = useMemo(() => (ready ? routeWarnings(routes) : []), [ready, routes]);
  const plain = toHex(bytes);
  const colon = toHex(bytes, ":");
  const prefixed = bytes.length ? `0x${plain}` : "";
  const opts = { includeMs };
  const isc = ready ? iscConfig(routes, opts) : "";
  const kea = ready ? keaConfig(routes, opts) : "";
  const dnsmasq = ready ? dnsmasqConfig(routes, opts) : "";

  const decoded = useMemo(() => {
    if (decodeText.trim() === "") return null;
    const parsed = decodeFormat === "hex" ? parseHexBytes(decodeText) : parseDecimalBytes(decodeText);
    if (!parsed.ok) return { inputError: parsed.error, result: null };
    return { inputError: null, result: decodeOption(parsed.value) };
  }, [decodeText, decodeFormat]);

  function update(id: number, patch: Partial<RowSeed>) {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function load(seeds: RowSeed[]) {
    setRows(
      seeds.slice(0, MAX_ROUTES).map((seed) => {
        nextId.current += 1;
        return { id: nextId.current, ...seed };
      }),
    );
  }

  function addRow() {
    if (rows.length >= MAX_ROUTES) return;
    nextId.current += 1;
    setRows((current) => [...current, { id: nextId.current, dest: "", router: "" }]);
  }

  function removeRow(id: number) {
    setRows((current) => (current.length <= 1 ? [{ ...current[0], dest: "", router: "" }] : current.filter((r) => r.id !== id)));
  }

  const summary = ready
    ? `${routes.length} ${pluralise(routes.length, "route")}, ${bytes.length} ${pluralise(bytes.length, "octet")} of option data.`
    : invalidCount > 0
      ? `${invalidCount} ${pluralise(invalidCount, "row")} ${invalidCount === 1 ? "needs" : "need"} fixing. Nothing is encoded until every row is valid.`
      : "Add a route to encode.";

  return (
    <ToolShell slug="dhcp-option-121-encoder">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Routes">
            <div className="space-y-4" data-testid="input-routes">
              {rows.map((row, index) => {
                const check = checks[index];
                const destId = `route-dest-${row.id}`;
                const routerId = `route-router-${row.id}`;
                return (
                  <div
                    key={row.id}
                    className="rounded-xl border border-[hsl(var(--brand-iron)/0.7)] bg-[hsl(var(--brand-obsidian)/0.3)] p-3"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                      <div className="min-w-0">
                        <label htmlFor={destId} className={LABEL}>
                          Destination {index + 1}
                        </label>
                        <input
                          id={destId}
                          value={row.dest}
                          onChange={(e) => update(row.id, { dest: e.target.value })}
                          placeholder="10.0.0.0/8"
                          spellCheck={false}
                          autoComplete="off"
                          autoCapitalize="off"
                          autoCorrect="off"
                          aria-invalid={check.destError !== null}
                          aria-describedby={check.destError ? `${destId}-error` : undefined}
                          data-testid={`input-dest-${index}`}
                          className={`${FIELD} ${check.destError ? "border-[hsl(var(--brand-danger))]" : "border-[hsl(var(--brand-iron))]"}`}
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={routerId} className={LABEL}>
                          Router {index + 1}
                        </label>
                        <input
                          id={routerId}
                          value={row.router}
                          onChange={(e) => update(row.id, { router: e.target.value })}
                          placeholder="192.168.1.1"
                          spellCheck={false}
                          autoComplete="off"
                          autoCapitalize="off"
                          autoCorrect="off"
                          inputMode="decimal"
                          aria-invalid={check.routerError !== null}
                          aria-describedby={check.routerError ? `${routerId}-error` : undefined}
                          data-testid={`input-router-${index}`}
                          className={`${FIELD} ${check.routerError ? "border-[hsl(var(--brand-danger))]" : "border-[hsl(var(--brand-iron))]"}`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        aria-label={`Remove route ${index + 1}`}
                        data-testid={`button-remove-${index}`}
                        className={CHIP}
                      >
                        Remove
                      </button>
                    </div>
                    {check.destError ? (
                      <p id={`${destId}-error`} role="alert" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                        Destination: {check.destError}
                      </p>
                    ) : null}
                    {check.routerError ? (
                      <p id={`${routerId}-error`} role="alert" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                        Router: {check.routerError}
                      </p>
                    ) : null}
                    {check.note ? (
                      <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">{check.note}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addRow}
                disabled={rows.length >= MAX_ROUTES}
                data-testid="button-add-route"
                className={CHIP}
              >
                Add route
              </button>
              <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                Up to {MAX_ROUTES} routes. A blank row is ignored.
              </span>
            </div>

            <label className="mt-5 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))]">
              <input
                type="checkbox"
                checked={includeMs}
                onChange={(e) => setIncludeMs(e.target.checked)}
                data-testid="checkbox-ms249"
                className="h-4 w-4 accent-[hsl(var(--brand-signal))]"
              />
              Also send Microsoft option 249 with the same bytes
            </label>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Load
              </span>
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => load(preset.rows)}
                  data-testid={`button-preset-${preset.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className={CHIP}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </ToolPanel>

          <div className="space-y-6">
            <ToolPanel title="Option 121 data">
              <p
                role="status"
                aria-live="polite"
                data-testid="text-summary"
                className="font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
              >
                {summary}
              </p>
              {ready ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <pre data-testid="text-encoded-hex" className={`${PRE} flex-1 break-all whitespace-pre-wrap`}>
                      {plain}
                    </pre>
                    <CopyButton value={plain} label="Copy the hex string" testId="button-copy-hex" />
                  </div>
                  <div className="mt-4">
                    <ToolResult
                      label="Length"
                      value={`${bytes.length} ${pluralise(bytes.length, "octet")} (0x${bytes.length.toString(16).padStart(2, "0")})`}
                      testId="text-length"
                    />
                    <ToolResult label="Colon form" value={colon} />
                    <ToolResult label="0x form" value={prefixed} />
                    <ToolResult label="Decimal" value={bytes.join(", ")} />
                    <ToolResult
                      label="Whole option"
                      value={bytes.length <= SINGLE_OPTION_MAX ? `79 ${bytes.length.toString(16).padStart(2, "0")} ${toHex(bytes, " ")}` : "too long for one instance"}
                    />
                  </div>
                </>
              ) : null}
            </ToolPanel>

            {ready ? (
              <ToolPanel title="Checks">
                {warnings.length ? (
                  <ul className="space-y-2" data-testid="list-warnings">
                    {warnings.map((w) => (
                      <li key={w} className={WARN_BOX}>
                        {w}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p
                    data-testid="list-warnings"
                    className="rounded-lg border border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]"
                  >
                    A default route is included, every router is a usable next hop, and the option fits in one instance.
                  </p>
                )}
              </ToolPanel>
            ) : null}
          </div>
        </div>

        {ready ? (
          <>
            <ToolPanel title="Wire layout">
              <RouteTable routes={routes} testId="table-encoded-routes" />
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Each route is the <span className="text-[hsl(var(--brand-signal))]">prefix length</span>, then only the{" "}
                <span className="text-[hsl(var(--brand-cyan))]">significant octets</span> of the destination (prefix
                length divided by 8, rounded up), then the four octets of the{" "}
                <span className="text-[hsl(var(--brand-amber))]">router</span>. The default route is a single zero
                octet plus its router.
              </p>
            </ToolPanel>

            <ToolPanel title="Server configuration">
              <div className="space-y-6">
                <ConfigBlock title="ISC dhcpd" value={isc} testId="config-isc" />
                <ConfigBlock title="Kea DHCPv4" value={kea} testId="config-kea" />
                <ConfigBlock title="dnsmasq" value={dnsmasq} testId="config-dnsmasq" />
              </div>
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                The Router option repeats the default gateway for clients that do not support option 121. Clients that
                do support it ignore the Router option and use the 0.0.0.0/0 entry in the list instead.
              </p>
            </ToolPanel>
          </>
        ) : null}

        <ToolPanel title="Decode an option">
          <fieldset>
            <legend className="font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
              Input is
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  { id: "hex", label: "Hex bytes" },
                  { id: "decimal", label: "Decimal octets" },
                ] as const
              ).map((option) => (
                <label
                  key={option.id}
                  className={`flex min-h-[44px] min-w-[140px] flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
                    decodeFormat === option.id
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
                  }`}
                >
                  <input
                    type="radio"
                    name="dhcp121-decode-format"
                    value={option.id}
                    checked={decodeFormat === option.id}
                    onChange={() => setDecodeFormat(option.id)}
                    className="sr-only"
                    data-testid={`radio-format-${option.id}`}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor="dhcp121-decode" className="mt-4 block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste option 121 or 249 data. Separators, 0x prefixes and a leading code and length are accepted.
          </label>
          <textarea
            id="dhcp121-decode"
            value={decodeText}
            onChange={(e) => setDecodeText(e.target.value)}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={Boolean(decoded?.inputError || decoded?.result?.error)}
            aria-describedby="dhcp121-decode-hint"
            placeholder={decodeFormat === "hex" ? "08 0a c0 a8 01 fe 00 c0 a8 01 01" : "8, 10, 192, 168, 1, 254, 0, 192, 168, 1, 1"}
            data-testid="input-decode"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <p id="dhcp121-decode-hint" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
            Reads up to {MAX_DECODE_BYTES} octets.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">Try</span>
            {ready ? (
              <button
                type="button"
                onClick={() => {
                  setDecodeFormat("hex");
                  setDecodeText(toHex(bytes, " "));
                }}
                data-testid="button-decode-current"
                className={CHIP}
              >
                The encoding above
              </button>
            ) : null}
            {DECODE_EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => {
                  setDecodeFormat(example.format);
                  setDecodeText(example.text);
                }}
                data-testid={`button-decode-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP}
              >
                {example.label}
              </button>
            ))}
            {decodeText ? (
              <button type="button" onClick={() => setDecodeText("")} data-testid="button-decode-clear" className={CHIP}>
                Clear
              </button>
            ) : null}
          </div>

          {decoded?.inputError ? (
            <p role="alert" data-testid="text-decode-error" className={`mt-4 ${ERROR_BOX}`}>
              {decoded.inputError}
            </p>
          ) : null}

          {decoded?.result ? (
            <div className="mt-5 space-y-4" data-testid="output-decoded">
              <p className="font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                {decoded.result.headerCode !== null
                  ? `Option ${decoded.result.headerCode} header removed. `
                  : ""}
                {decoded.result.dataLength} {pluralise(decoded.result.dataLength, "octet")},{" "}
                {decoded.result.routes.length} {pluralise(decoded.result.routes.length, "route")} decoded
              </p>
              {decoded.result.routes.length ? (
                <RouteTable
                  routes={decoded.result.routes}
                  offsets={decoded.result.routes.map((r) => r.offset)}
                  testId="table-decoded-routes"
                />
              ) : null}
              {decoded.result.error ? (
                <p role="alert" data-testid="text-decode-error" className={ERROR_BOX}>
                  {decoded.result.error}
                </p>
              ) : null}
              {decoded.result.warnings.length ? (
                <ul className="space-y-2">
                  {decoded.result.warnings.map((w) => (
                    <li key={w} className={WARN_BOX}>
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}
              {decoded.result.routes.length && !decoded.result.error ? (
                <button
                  type="button"
                  onClick={() =>
                    load(
                      (decoded.result?.routes ?? []).map((r) => ({
                        dest: cidrString(r.network, r.prefix),
                        router: formatIPv4(r.router),
                      })),
                    )
                  }
                  data-testid="button-edit-decoded"
                  className={CHIP}
                >
                  Edit these routes above
                </button>
              ) : null}
            </div>
          ) : null}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
