/**
 * tcpdump capture filter builder.
 *
 * The clause list is the only state that matters. The BPF filter, the
 * tcpdump command line and the Wireshark display filter are all derived
 * from it by the pure functions in lib/toolkit, and nothing is emitted while
 * any clause is invalid, so a filter copied from this page always compiles
 * to what the explanation under it says.
 */

import { useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  CLAUSE_KINDS,
  MAX_CLAUSES,
  MAX_SNAPLEN,
  PROTOCOLS,
  RECIPES,
  TCP_FLAGS,
  buildCommand,
  buildFilter,
  compileClause,
  isBlankClause,
  newClause,
  type Clause,
  type ClauseKind,
  type CommandOptions,
  type FlagKey,
  type FlagState,
} from "@/lib/toolkit/tcpdump-filter-builder";
import { ToolPanel, ToolShell } from "./ToolShell";

/* ---------------------------------------------------------------- styles */

const FIELD =
  "min-h-[44px] w-full min-w-0 rounded-lg border bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const OK_BORDER = "border-[hsl(var(--brand-iron))]";
const BAD_BORDER = "border-[hsl(var(--brand-danger))]";
const LABEL =
  "mb-1.5 block font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]";
const CHIP =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-40";
const PRE =
  "min-w-0 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-sm leading-relaxed";
const WARN_BOX =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const TOGGLE =
  "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))]";
const CHECKBOX = "h-4 w-4 shrink-0 accent-[hsl(var(--brand-signal))]";

/* ----------------------------------------------------------------- state */

type Row = Clause & { id: number };

/** A starting value per kind, so switching kind never lands on an empty error. */
const SAMPLE: Record<ClauseKind, string> = {
  host: "192.0.2.10",
  net: "10.0.0.0/8",
  port: "443",
  portrange: "6000-6010",
  proto: "",
  flags: "",
  length: "1000",
};

const PLACEHOLDER: Record<ClauseKind, string> = {
  host: "10.0.0.5, 2001:db8::1 or name",
  net: "10.0.0.0/8",
  port: "443",
  portrange: "6000-6010",
  proto: "",
  flags: "",
  length: "1000",
};

const VALUE_LABEL: Record<ClauseKind, string> = {
  host: "Address or hostname",
  net: "Network (CIDR)",
  port: "Port",
  portrange: "Range",
  proto: "VLAN id (optional)",
  flags: "",
  length: "Bytes",
};

const GENERAL_DIFFERENCES = [
  "A capture filter decides what is recorded, so anything it rejects is gone. A display filter only hides packets that are already in the file and can be changed at any time.",
  "Display filters match a field anywhere in the dissection, including the copy of the original IP and transport headers quoted inside an ICMP error. Capture filters read fixed offsets in the packet's own headers.",
  "The syntax is different: tcpdump writes host 10.0.0.5 and port 53, Wireshark writes ip.addr == 10.0.0.5 && udp.port == 53. Wireshark's capture filter box takes the tcpdump syntax, not the display syntax.",
];

/* ------------------------------------------------------------------ view */

function Select({
  id,
  label,
  value,
  onChange,
  options,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  testId?: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} className={`${FIELD} ${OK_BORDER}`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const DIRECTIONS = [
  { value: "any", label: "src or dst" },
  { value: "src", label: "src" },
  { value: "dst", label: "dst" },
];
const TRANSPORTS = [
  { value: "any", label: "tcp, udp or sctp" },
  { value: "tcp", label: "tcp" },
  { value: "udp", label: "udp" },
];
const FLAG_STATES = [
  { value: "", label: "any" },
  { value: "set", label: "set" },
  { value: "clear", label: "clear" },
];

export function TcpdumpFilterBuilder() {
  const nextId = useRef(2);
  const [rows, setRows] = useState<Row[]>([
    { id: 1, ...newClause("host", { value: "192.0.2.10" }) },
    { id: 2, ...newClause("port", { value: "443", transport: "tcp", join: "and" }) },
  ]);
  const [opts, setOpts] = useState<CommandOptions>({
    sudo: true,
    iface: "eth0",
    numeric: true,
    snaplen: "",
    count: "",
    file: "",
  });

  const built = useMemo(() => buildFilter(rows), [rows]);
  const rowChecks = useMemo(() => rows.map((r) => (isBlankClause(r) ? null : compileClause(r))), [rows]);
  const command = useMemo(() => (built.ok ? buildCommand(opts, built.bpf) : null), [built, opts]);
  const caveats = useMemo(() => [...new Set(built.items.flatMap((i) => i.caveats))], [built]);
  const fieldError = (field: keyof CommandOptions) => command?.errors.find((e) => e.field === field)?.message ?? null;

  function update(id: number, patch: Partial<Clause>) {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function setKind(id: number, kind: ClauseKind) {
    setRows((current) =>
      current.map((r) =>
        r.id === id
          ? {
              ...r,
              kind,
              value: SAMPLE[kind],
              flags: kind === "flags" && Object.keys(r.flags).length === 0 ? { syn: "set" } : r.flags,
            }
          : r,
      ),
    );
  }

  function setFlag(id: number, key: FlagKey, state: string) {
    setRows((current) =>
      current.map((r) => {
        if (r.id !== id) return r;
        const flags = { ...r.flags };
        if (state === "") delete flags[key];
        else flags[key] = state as FlagState;
        return { ...r, flags };
      }),
    );
  }

  function addRow() {
    if (rows.length >= MAX_CLAUSES) return;
    nextId.current += 1;
    const id = nextId.current;
    setRows((current) => [...current, { id, ...newClause("port", { value: "", join: "and" }) }]);
  }

  function removeRow(id: number) {
    setRows((current) => current.filter((r) => r.id !== id));
  }

  function move(index: number, delta: number) {
    setRows((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function loadRecipe(clauses: Clause[]) {
    setRows(
      clauses.map((c) => {
        nextId.current += 1;
        return { id: nextId.current, ...c, flags: { ...c.flags } };
      }),
    );
  }

  const errorCount = built.errors.length;
  const used = built.items.length;
  const skippedNote = built.skipped.length
    ? ` ${built.skipped.length} empty ${built.skipped.length === 1 ? "clause" : "clauses"} skipped.`
    : "";
  const status = !built.ok
    ? `${errorCount} ${errorCount === 1 ? "clause needs" : "clauses need"} fixing. Nothing is emitted until every clause is valid.`
    : built.bpf === ""
      ? `No clauses in use: tcpdump would capture every packet.${skippedNote}`
      : `${used} ${used === 1 ? "clause" : "clauses"}, ${built.bpf.length} characters of filter.${skippedNote}`;

  return (
    <ToolShell slug="tcpdump-filter-builder">
      <div className="space-y-6">
        <ToolPanel title="Recipes">
          <div className="flex flex-wrap gap-2">
            {RECIPES.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => loadRecipe(recipe.clauses)}
                data-testid={`button-recipe-${recipe.id}`}
                className={CHIP}
              >
                {recipe.label}
              </button>
            ))}
          </div>
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            A recipe replaces the clauses below. Edit any of them afterwards.
          </p>
        </ToolPanel>

        <ToolPanel title="Clauses">
          <ol className="space-y-4" data-testid="input-clauses">
            {rows.map((row, index) => {
              const check = rowChecks[index];
              const p = `clause-${row.id}`;
              const valueError = check && !check.ok ? check.error : null;
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-[hsl(var(--brand-iron)/0.7)] bg-[hsl(var(--brand-obsidian)/0.3)] p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      Clause {index + 1}
                    </span>
                    {check && check.ok ? (
                      <code className="break-all font-mono-tight text-xs text-[hsl(var(--brand-signal))]">{check.value.bpf}</code>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {index > 0 ? (
                      <Select
                        id={`${p}-join`}
                        label="Joined by"
                        value={row.join}
                        onChange={(v) => update(row.id, { join: v as Clause["join"] })}
                        options={[
                          { value: "and", label: "and" },
                          { value: "or", label: "or" },
                        ]}
                        testId={`select-join-${index}`}
                      />
                    ) : null}
                    <Select
                      id={`${p}-kind`}
                      label="Match on"
                      value={row.kind}
                      onChange={(v) => setKind(row.id, v as ClauseKind)}
                      options={CLAUSE_KINDS.map((k) => ({ value: k.id, label: k.label }))}
                      testId={`select-kind-${index}`}
                    />

                    {row.kind === "port" || row.kind === "portrange" ? (
                      <Select
                        id={`${p}-transport`}
                        label="Transport"
                        value={row.transport}
                        onChange={(v) => update(row.id, { transport: v as Clause["transport"] })}
                        options={TRANSPORTS}
                        testId={`select-transport-${index}`}
                      />
                    ) : null}

                    {row.kind === "host" || row.kind === "net" || row.kind === "port" || row.kind === "portrange" ? (
                      <Select
                        id={`${p}-dir`}
                        label="Direction"
                        value={row.dir}
                        onChange={(v) => update(row.id, { dir: v as Clause["dir"] })}
                        options={DIRECTIONS}
                        testId={`select-dir-${index}`}
                      />
                    ) : null}

                    {row.kind === "proto" ? (
                      <Select
                        id={`${p}-proto`}
                        label="Protocol"
                        value={row.proto}
                        onChange={(v) => update(row.id, { proto: v as Clause["proto"], value: "" })}
                        options={PROTOCOLS.map((x) => ({ value: x.id, label: x.label }))}
                        testId={`select-proto-${index}`}
                      />
                    ) : null}

                    {row.kind === "length" ? (
                      <Select
                        id={`${p}-lenop`}
                        label="Length is"
                        value={row.lenOp}
                        onChange={(v) => update(row.id, { lenOp: v as Clause["lenOp"] })}
                        options={[
                          { value: "ge", label: "at least (greater)" },
                          { value: "le", label: "at most (less)" },
                        ]}
                        testId={`select-lenop-${index}`}
                      />
                    ) : null}

                    {row.kind !== "flags" && (row.kind !== "proto" || row.proto === "vlan") ? (
                      <div className="min-w-0">
                        <label htmlFor={`${p}-value`} className={LABEL}>
                          {VALUE_LABEL[row.kind]}
                        </label>
                        <input
                          id={`${p}-value`}
                          value={row.value}
                          onChange={(e) => update(row.id, { value: e.target.value })}
                          placeholder={row.kind === "proto" ? "20" : PLACEHOLDER[row.kind]}
                          spellCheck={false}
                          autoComplete="off"
                          autoCapitalize="off"
                          autoCorrect="off"
                          inputMode={row.kind === "port" || row.kind === "length" || row.kind === "proto" ? "numeric" : undefined}
                          aria-invalid={valueError !== null}
                          aria-describedby={valueError ? `${p}-error` : undefined}
                          data-testid={`input-value-${index}`}
                          className={`${FIELD} ${valueError ? BAD_BORDER : OK_BORDER}`}
                        />
                      </div>
                    ) : null}
                  </div>

                  {row.kind === "flags" ? (
                    <fieldset className="mt-3">
                      <legend className={LABEL}>Each flag must be</legend>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        {TCP_FLAGS.map((f) => (
                          <Select
                            key={f.key}
                            id={`${p}-flag-${f.key}`}
                            label={f.label}
                            value={row.flags[f.key] ?? ""}
                            onChange={(v) => setFlag(row.id, f.key, v)}
                            options={FLAG_STATES}
                            testId={`select-flag-${f.key}-${index}`}
                          />
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  {check === null ? (
                    <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                      Empty, so this clause is skipped until it has a value.
                    </p>
                  ) : null}
                  {valueError ? (
                    <p
                      id={`${p}-error`}
                      role="alert"
                      data-testid={`text-clause-error-${index}`}
                      className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
                    >
                      {valueError}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className={TOGGLE}>
                      <input
                        type="checkbox"
                        checked={row.negate}
                        onChange={(e) => update(row.id, { negate: e.target.checked })}
                        data-testid={`checkbox-negate-${index}`}
                        className={CHECKBOX}
                      />
                      Negate (not)
                    </label>
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move clause ${index + 1} up`}
                      className={CHIP}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === rows.length - 1}
                      aria-label={`Move clause ${index + 1} down`}
                      className={CHIP}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      aria-label={`Remove clause ${index + 1}`}
                      data-testid={`button-remove-${index}`}
                      className={CHIP}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          {rows.length === 0 ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">No clauses. Add one or load a recipe.</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={addRow} disabled={rows.length >= MAX_CLAUSES} data-testid="button-add-clause" className={CHIP}>
              Add clause
            </button>
            {rows.length ? (
              <button type="button" onClick={() => setRows([])} data-testid="button-clear-clauses" className={CHIP}>
                Clear all
              </button>
            ) : null}
            <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              Up to {MAX_CLAUSES} clauses. An empty clause is skipped.
            </span>
          </div>
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-status"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {status}
        </p>

        {built.ok ? (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Capture filter (BPF)">
                <div className="flex flex-wrap items-start gap-2">
                  <pre data-testid="text-bpf" className={`${PRE} flex-1 text-[hsl(var(--brand-signal))]`}>
                    {built.bpf || "(empty: every packet)"}
                  </pre>
                  {built.bpf ? <CopyButton value={built.bpf} label="Copy the capture filter" testId="button-copy-bpf" /> : null}
                </div>
                {built.items.length ? (
                  <ul className="mt-4 space-y-3" data-testid="list-explain">
                    {built.items.map((item) => (
                      <li key={item.index} className="border-b border-[hsl(var(--brand-iron)/0.5)] pb-3 last:border-b-0">
                        <code className="block break-all font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">{item.bpf}</code>
                        <span className="mt-1 block font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                          {item.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {built.grouped ? (
                  <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    tcpdump gives <code>and</code> and <code>or</code> equal precedence and reads them left to right. The
                    parentheses make that grouping explicit, and the Wireshark filter uses the same grouping.
                  </p>
                ) : null}
                {built.warnings.length ? (
                  <ul className="mt-4 space-y-2" data-testid="list-warnings">
                    {built.warnings.map((w) => (
                      <li key={w} className={WARN_BOX}>
                        {w}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </ToolPanel>

              <ToolPanel title="Closest Wireshark display filter">
                <div className="flex flex-wrap items-start gap-2">
                  <pre data-testid="text-wireshark" className={`${PRE} flex-1 text-[hsl(var(--brand-amber))]`}>
                    {built.wireshark || "(empty: every packet is shown)"}
                  </pre>
                  {built.wireshark ? (
                    <CopyButton value={built.wireshark} label="Copy the display filter" testId="button-copy-wireshark" />
                  ) : null}
                </div>
                <div className="mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.07)] p-4">
                  <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                    Two different languages
                  </div>
                  <ul className="mt-2 space-y-2">
                    {GENERAL_DIFFERENCES.map((d) => (
                      <li key={d} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
                {caveats.length ? (
                  <>
                    <h3 className="mt-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                      Where this pair disagrees
                    </h3>
                    <ul className="mt-2 space-y-2" data-testid="list-caveats">
                      {caveats.map((c) => (
                        <li key={c} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                          {c}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </ToolPanel>
            </div>

            <ToolPanel title="tcpdump command">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    { field: "iface", label: "Interface (-i)", placeholder: "eth0 or any", numeric: false },
                    { field: "snaplen", label: "Snap length (-s)", placeholder: "0 = whole packet", numeric: true },
                    { field: "count", label: "Stop after (-c)", placeholder: "packets", numeric: true },
                    { field: "file", label: "Write to (-w)", placeholder: "capture.pcap", numeric: false },
                  ] as const
                ).map((f) => {
                  const err = fieldError(f.field);
                  return (
                    <div key={f.field} className="min-w-0">
                      <label htmlFor={`tcpdump-${f.field}`} className={LABEL}>
                        {f.label}
                      </label>
                      <input
                        id={`tcpdump-${f.field}`}
                        value={opts[f.field]}
                        onChange={(e) => setOpts((o) => ({ ...o, [f.field]: e.target.value }))}
                        placeholder={f.placeholder}
                        spellCheck={false}
                        autoComplete="off"
                        autoCapitalize="off"
                        autoCorrect="off"
                        inputMode={f.numeric ? "numeric" : undefined}
                        aria-invalid={err !== null}
                        aria-describedby={err ? `tcpdump-${f.field}-error` : undefined}
                        data-testid={`input-${f.field}`}
                        className={`${FIELD} ${err ? BAD_BORDER : OK_BORDER}`}
                      />
                      {err ? (
                        <p
                          id={`tcpdump-${f.field}-error`}
                          role="alert"
                          className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
                        >
                          {err}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <label className={TOGGLE}>
                  <input
                    type="checkbox"
                    checked={opts.numeric}
                    onChange={(e) => setOpts((o) => ({ ...o, numeric: e.target.checked }))}
                    data-testid="checkbox-nn"
                    className={CHECKBOX}
                  />
                  No name resolution (-nn)
                </label>
                <label className={TOGGLE}>
                  <input
                    type="checkbox"
                    checked={opts.sudo}
                    onChange={(e) => setOpts((o) => ({ ...o, sudo: e.target.checked }))}
                    data-testid="checkbox-sudo"
                    className={CHECKBOX}
                  />
                  Prefix sudo
                </label>
              </div>

              {command && command.command ? (
                <div className="mt-4 flex flex-wrap items-start gap-2">
                  <pre data-testid="text-command" className={`${PRE} flex-1 text-[hsl(var(--brand-signal))]`}>
                    {command.command}
                  </pre>
                  <CopyButton value={command.command} label="Copy the tcpdump command" testId="button-copy-command" />
                </div>
              ) : null}

              {command && command.command ? (
                <dl className="mt-4 space-y-3">
                  {command.parts.map((part) => (
                    <div key={part.token} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-4">
                      <dt className="break-all font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">{part.token}</dt>
                      <dd className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{part.text}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {command?.warnings.length ? (
                <ul className="mt-4 space-y-2">
                  {command.warnings.map((w) => (
                    <li key={w} className={WARN_BOX}>
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Snap length accepts 0 to {MAX_SNAPLEN.toLocaleString("en-US")}. Leave a field empty to omit that option.
              </p>
            </ToolPanel>
          </>
        ) : null}
      </div>
    </ToolShell>
  );
}
