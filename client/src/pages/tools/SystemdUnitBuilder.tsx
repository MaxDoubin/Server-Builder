/**
 * systemd service unit builder.
 *
 * The form holds one UnitOptions object and everything on the right is
 * derived from it by buildUnit in lib/toolkit/systemd-unit-builder: the unit
 * text, the install commands, and the list of checks. The page validates as
 * you type and never writes a line it knows is wrong. Nothing is stored or
 * sent anywhere; the form lives in component state in this tab only.
 */

import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  EXAMPLES,
  HARDENING_INFO,
  MAX_LINES,
  MAX_LINE_LENGTH,
  RESTART_POLICIES,
  SERVICE_TYPES,
  buildUnit,
  defaultOptions,
  noHardening,
  standardHardening,
  type Finding,
  type HardeningOptions,
  type Level,
  type UnitOptions,
} from "@/lib/toolkit/systemd-unit-builder";
import { ToolPanel, ToolShell } from "./ToolShell";

const LABEL =
  "block font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "mt-1.5 w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none aria-[invalid=true]:border-[hsl(var(--brand-danger))]";
const SELECT = `${INPUT} min-h-[44px]`;
const HINT = "mt-1.5 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]";
const ERR = "mt-1.5 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const CHIP =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ACTION =
  "inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PRE =
  "min-w-0 overflow-x-auto whitespace-pre rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]";

const LEVEL_BOX: Record<Level, string> = {
  error: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)]",
};
const LEVEL_TEXT: Record<Level, string> = {
  error: "text-[hsl(var(--brand-danger))]",
  warn: "text-[hsl(var(--brand-amber))]",
  info: "text-[hsl(var(--brand-cyan))]",
};
const LEVEL_NAME: Record<Level, string> = { error: "Error", warn: "Check", info: "Note" };

const FIELD_NAMES: Record<string, string> = {
  name: "Name",
  description: "Description",
  after: "After",
  wants: "Wants",
  type: "Type",
  execStart: "ExecStart",
  execStartPre: "ExecStartPre",
  execReload: "ExecReload",
  pidFile: "PIDFile",
  user: "User",
  group: "Group",
  workingDirectory: "WorkingDirectory",
  environment: "Environment",
  environmentFile: "EnvironmentFile",
  restart: "Restart",
  restartSec: "RestartSec",
  startLimitIntervalSec: "StartLimitIntervalSec",
  startLimitBurst: "StartLimitBurst",
  wantedBy: "WantedBy",
  hardening: "Sandboxing",
  protectHome: "ProtectHome",
  restrictAddressFamilies: "RestrictAddressFamilies",
  capabilityBoundingSet: "CapabilityBoundingSet",
  ambientCapabilities: "AmbientCapabilities",
  readWritePaths: "ReadWritePaths",
  systemCallFilter: "SystemCallFilter",
  memoryDenyWriteExecute: "MemoryDenyWriteExecute",
};

function infoFor(key: keyof HardeningOptions) {
  return HARDENING_INFO.find((row) => row.key === key);
}

/* ------------------------------------------------------------- controls */

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors: string[];
  hint?: ReactNode;
  placeholder?: string;
  rows?: number;
  testId?: string;
}

/** A labeled text input, or a textarea when `rows` is given. */
function Field({ id, label, value, onChange, errors, hint, placeholder, rows, testId }: FieldProps) {
  const describedBy = [errors.length ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    value,
    placeholder,
    spellCheck: false,
    autoComplete: "off",
    autoCapitalize: "off",
    autoCorrect: "off",
    "aria-invalid": errors.length > 0,
    "aria-describedby": describedBy,
    "data-testid": testId,
  };
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {rows ? (
        <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} className={`${INPUT} resize-y`} />
      ) : (
        <input {...common} type="text" onChange={(e) => onChange(e.target.value)} className={INPUT} />
      )}
      {hint ? (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      ) : null}
      {errors.length > 0 ? (
        <div id={`${id}-error`}>
          {errors.map((message) => (
            <p key={message} className={ERR}>
              {message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  hint,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  hint?: ReactNode;
  testId?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        data-testid={testId}
        className={SELECT}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <label
      className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 font-mono-tight text-xs transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
        checked
          ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]"
          : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]"
      }`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
      <span aria-hidden>{checked ? "[x]" : "[ ]"}</span>
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );
}

/** One sandboxing directive: the control on top, then what it does and what it can break. */
function HardeningRow({
  rowKey,
  children,
  messages,
}: {
  rowKey: keyof HardeningOptions;
  children: ReactNode;
  messages?: Finding[];
}) {
  const info = infoFor(rowKey);
  if (!info) return null;
  return (
    <div className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.3)] p-4">
      <code className="block break-all font-mono-tight text-sm text-[hsl(var(--brand-cyan))]">{info.directive}</code>
      <div className="mt-3">{children}</div>
      <p className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
        {info.summary}
      </p>
      <p className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        <span className="uppercase tracking-[0.18em] text-[hsl(var(--brand-amber))]">Can break </span>
        {info.breaks}
      </p>
      {messages?.map((m) => (
        <p key={m.message} className={m.level === "error" ? ERR : HINT}>
          {m.message}
        </p>
      ))}
    </div>
  );
}

/** The unit file with section headers and comments dimmed, so the structure reads at a glance. */
function UnitText({ text }: { text: string }) {
  const lines = text.replace(/\n$/, "").split("\n");
  return (
    <>
      {lines.map((line, i) => {
        let cls = "";
        if (line.startsWith("[")) cls = "text-[hsl(var(--brand-signal))]";
        else if (line.startsWith("#")) cls = "text-[hsl(var(--brand-ash))]";
        else if (line.includes("=")) {
          const eq = line.indexOf("=");
          return (
            <span key={i}>
              <span className="text-[hsl(var(--brand-cyan))]">{line.slice(0, eq + 1)}</span>
              <span className="text-[hsl(var(--brand-bone))]">{line.slice(eq + 1)}</span>
              {"\n"}
            </span>
          );
        }
        return (
          <span key={i} className={cls}>
            {line}
            {"\n"}
          </span>
        );
      })}
    </>
  );
}

/* ----------------------------------------------------------------- page */

export function SystemdUnitBuilder() {
  const [o, setO] = useState<UnitOptions>(() => defaultOptions());

  const build = useMemo(() => buildUnit(o), [o]);
  const h = o.hardening;

  function set<K extends keyof UnitOptions>(key: K, value: UnitOptions[K]) {
    setO((prev) => ({ ...prev, [key]: value }));
  }
  function setH<K extends keyof HardeningOptions>(key: K, value: HardeningOptions[K]) {
    setO((prev) => ({ ...prev, hardening: { ...prev.hardening, [key]: value } }));
  }

  const errorsFor = (field: string): string[] =>
    build.findings.filter((f) => f.level === "error" && f.field === field).map((f) => f.message);
  const messagesFor = (field: string): Finding[] => build.findings.filter((f) => f.field === field);

  const ordered = useMemo(() => {
    const rank: Record<Level, number> = { error: 0, warn: 1, info: 2 };
    return [...build.findings].sort((a, b) => rank[a.level] - rank[b.level]);
  }, [build.findings]);

  const typeInfo = SERVICE_TYPES.find((t) => t.value === o.type);
  const restartInfo = RESTART_POLICIES.find((r) => r.value === o.restart);

  return (
    <ToolShell slug="systemd-unit-builder">
      <div className="space-y-6">
        <ToolPanel title="Start from">
          <div className="flex flex-wrap items-center gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                onClick={() => setO(example.options())}
                data-testid={`button-example-${example.id}`}
                className={CHIP}
              >
                {example.label}
              </button>
            ))}
            <button type="button" onClick={() => setO(defaultOptions())} data-testid="button-reset" className={CHIP}>
              Reset
            </button>
          </div>
          <p className={HINT}>
            Every field is checked as you type. Lines that fail a check are left out of the unit and listed under
            Checks. Lists are read up to {MAX_LINES} lines of {MAX_LINE_LENGTH.toLocaleString("en-US")} characters.
          </p>
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-6">
            <ToolPanel title="Unit">
              <div className="space-y-4">
                <Field
                  id="sdu-name"
                  label="Service name"
                  value={o.name}
                  onChange={(v) => set("name", v)}
                  errors={errorsFor("name")}
                  hint={
                    <>
                      The file is <code>{build.fileName || "NAME.service"}</code>. Letters, digits and : _ . - only.
                    </>
                  }
                  placeholder="myapp"
                  testId="input-name"
                />
                <Field
                  id="sdu-description"
                  label="Description"
                  value={o.description}
                  onChange={(v) => set("description", v)}
                  errors={errorsFor("description")}
                  placeholder="What this service does"
                />
                <Field
                  id="sdu-after"
                  label="After (start later than)"
                  value={o.after}
                  onChange={(v) => set("after", v)}
                  errors={errorsFor("after")}
                  hint="Units this one waits for. Separate with spaces. After= only orders, it does not start anything."
                  placeholder="network-online.target postgresql.service"
                />
                <Field
                  id="sdu-wants"
                  label="Wants (pull in)"
                  value={o.wants}
                  onChange={(v) => set("wants", v)}
                  errors={errorsFor("wants")}
                  hint="Units to start alongside this one. A failure of theirs does not stop this service."
                  placeholder="network-online.target"
                />
              </div>
            </ToolPanel>

            <ToolPanel title="Service">
              <div className="space-y-4">
                <SelectField
                  id="sdu-type"
                  label="Type"
                  value={o.type}
                  onChange={(v) => set("type", v as UnitOptions["type"])}
                  options={SERVICE_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                  hint={typeInfo?.detail}
                  testId="select-type"
                />
                <Field
                  id="sdu-exec-start"
                  label={o.type === "oneshot" ? "ExecStart (one command per line, run in order)" : "ExecStart (one command)"}
                  value={o.execStart}
                  onChange={(v) => set("execStart", v)}
                  errors={errorsFor("execStart")}
                  hint="An absolute path, then its arguments. No shell runs, so pipes and redirects mean nothing here. A trailing backslash continues a line."
                  placeholder="/usr/local/bin/myapp --config /etc/myapp/config.toml"
                  rows={o.type === "oneshot" ? 3 : 2}
                  testId="input-exec-start"
                />
                <Field
                  id="sdu-exec-start-pre"
                  label="ExecStartPre (one per line, optional)"
                  value={o.execStartPre}
                  onChange={(v) => set("execStartPre", v)}
                  errors={errorsFor("execStartPre")}
                  hint="Runs before ExecStart and must succeed first. A leading - ignores its failure."
                  placeholder="/usr/local/bin/myapp --check-config"
                  rows={2}
                />
                <Field
                  id="sdu-exec-reload"
                  label="ExecReload (one per line, optional)"
                  value={o.execReload}
                  onChange={(v) => set("execReload", v)}
                  errors={errorsFor("execReload")}
                  hint={
                    <>
                      Run by <code>systemctl reload</code>. <code>$MAINPID</code> is the main process ID.
                    </>
                  }
                  placeholder="/bin/kill -HUP $MAINPID"
                  rows={2}
                />
                {o.type === "forking" ? (
                  <Field
                    id="sdu-pid-file"
                    label="PIDFile"
                    value={o.pidFile}
                    onChange={(v) => set("pidFile", v)}
                    errors={errorsFor("pidFile")}
                    hint="The file the daemon writes its main process ID to, normally under /run."
                    placeholder="/run/myapp.pid"
                  />
                ) : null}
                {o.type === "oneshot" ? (
                  <Toggle
                    checked={o.remainAfterExit}
                    onChange={(v) => set("remainAfterExit", v)}
                    label="RemainAfterExit=yes (stay active after the command exits)"
                    testId="checkbox-remain-after-exit"
                  />
                ) : null}
              </div>
            </ToolPanel>

            <ToolPanel title="Identity and environment">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    id="sdu-user"
                    label="User"
                    value={o.user}
                    onChange={(v) => set("user", v)}
                    errors={errorsFor("user")}
                    placeholder="myapp"
                  />
                  <Field
                    id="sdu-group"
                    label="Group"
                    value={o.group}
                    onChange={(v) => set("group", v)}
                    errors={errorsFor("group")}
                    placeholder="myapp"
                  />
                </div>
                {messagesFor("user")
                  .filter((m) => m.level !== "error")
                  .map((m) => (
                    <p key={m.message} className={HINT}>
                      {m.message}
                    </p>
                  ))}
                <Field
                  id="sdu-workdir"
                  label="WorkingDirectory"
                  value={o.workingDirectory}
                  onChange={(v) => set("workingDirectory", v)}
                  errors={errorsFor("workingDirectory")}
                  hint="Absolute path, or ~ for the service user's home. The default is /."
                  placeholder="/var/lib/myapp"
                />
                <Field
                  id="sdu-environment"
                  label="Environment (KEY=value, one per line)"
                  value={o.environment}
                  onChange={(v) => set("environment", v)}
                  errors={errorsFor("environment")}
                  hint="Written as quoted Environment= lines, so a value may contain spaces."
                  placeholder="NODE_ENV=production"
                  rows={3}
                />
                <Field
                  id="sdu-environment-file"
                  label="EnvironmentFile (one path per line)"
                  value={o.environmentFile}
                  onChange={(v) => set("environmentFile", v)}
                  errors={errorsFor("environmentFile")}
                  hint="KEY=value lines, no shell syntax. A leading - ignores a missing file. Put secrets here, mode 0600."
                  placeholder="-/etc/default/myapp"
                  rows={2}
                />
              </div>
            </ToolPanel>

            <ToolPanel title="Restart and start limits">
              <div className="space-y-4">
                <SelectField
                  id="sdu-restart"
                  label="Restart"
                  value={o.restart}
                  onChange={(v) => set("restart", v as UnitOptions["restart"])}
                  options={RESTART_POLICIES.map((r) => ({ value: r.value, label: r.value }))}
                  hint={restartInfo?.detail}
                  testId="select-restart"
                />
                {errorsFor("restart").map((m) => (
                  <p key={m} className={ERR}>
                    {m}
                  </p>
                ))}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field
                    id="sdu-restart-sec"
                    label="RestartSec"
                    value={o.restartSec}
                    onChange={(v) => set("restartSec", v)}
                    errors={errorsFor("restartSec")}
                    placeholder="5s"
                  />
                  <Field
                    id="sdu-start-limit-interval"
                    label="StartLimitIntervalSec"
                    value={o.startLimitIntervalSec}
                    onChange={(v) => set("startLimitIntervalSec", v)}
                    errors={errorsFor("startLimitIntervalSec")}
                    placeholder="60s"
                  />
                  <Field
                    id="sdu-start-limit-burst"
                    label="StartLimitBurst"
                    value={o.startLimitBurst}
                    onChange={(v) => set("startLimitBurst", v)}
                    errors={errorsFor("startLimitBurst")}
                    placeholder="5"
                  />
                </div>
                <p className={HINT}>
                  Times take a number of seconds or units such as <code>500ms</code>, <code>5s</code> or{" "}
                  <code>2min</code>. The two start limit settings are written in the [Unit] section, where systemd
                  reads them. Left blank, systemd allows 5 starts in 10 seconds.
                </p>
                <Field
                  id="sdu-wanted-by"
                  label="WantedBy (the [Install] target)"
                  value={o.wantedBy}
                  onChange={(v) => set("wantedBy", v)}
                  errors={errorsFor("wantedBy")}
                  hint="multi-user.target starts it at boot on a server. Leave it empty to write no [Install] section."
                  placeholder="multi-user.target"
                />
              </div>
            </ToolPanel>
          </div>

          <div className="min-w-0 space-y-6">
            <ToolPanel title="Unit file">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  {build.fileName ? `/etc/systemd/system/${build.fileName}` : "Fix the name to get a file path"}
                </span>
                <CopyButton value={build.unit} label="Copy unit file" testId="button-copy-unit">
                  <span>Copy unit</span>
                </CopyButton>
              </div>
              <pre className={`${PRE} mt-3`} data-testid="output-unit" tabIndex={0} role="region" aria-label="Generated unit file">
                <UnitText text={build.unit} />
              </pre>
              <p className={HINT} data-testid="text-summary">
                {build.errors === 0 ? "No errors. " : `${build.errors} ${build.errors === 1 ? "error" : "errors"}. `}
                {build.warnings} {build.warnings === 1 ? "check" : "checks"}, {build.notes}{" "}
                {build.notes === 1 ? "note" : "notes"}. {build.hardeningCount} sandboxing{" "}
                {build.hardeningCount === 1 ? "line" : "lines"} written.
              </p>
            </ToolPanel>

            <ToolPanel title="Install and verify">
              {build.fileName ? (
                <>
                  <pre className={PRE} data-testid="output-commands" tabIndex={0} role="region" aria-label="Install commands">
                    {build.commands}
                  </pre>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <CopyButton value={build.commands} label="Copy install commands" testId="button-copy-commands">
                      <span>Copy commands</span>
                    </CopyButton>
                    <CopyButton
                      value={build.script}
                      label="Copy the unit and the commands as one script"
                      testId="button-copy-script"
                    >
                      <span>Copy as one script</span>
                    </CopyButton>
                  </div>
                  <p className={HINT}>
                    The one-script copy writes the unit with a quoted heredoc, so nothing in it is expanded by the
                    shell. <code>systemd-analyze security</code> prints an exposure score and one line per setting.
                    Read it as a list of what is still open, not as a grade.
                  </p>
                </>
              ) : (
                <p className={HINT}>The commands appear once the service name is valid.</p>
              )}
            </ToolPanel>

            <ToolPanel title="Checks">
              {ordered.length === 0 ? (
                <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]" data-testid="text-no-findings">
                  Nothing to flag.
                </p>
              ) : (
                <ul className="space-y-2" data-testid="list-findings">
                  {ordered.map((f, i) => (
                    <li
                      key={`${f.level}-${f.field}-${i}`}
                      className={`rounded-lg border p-3 ${LEVEL_BOX[f.level]}`}
                    >
                      <span
                        className={`font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] ${LEVEL_TEXT[f.level]}`}
                      >
                        {LEVEL_NAME[f.level]}
                        {f.field ? ` · ${FIELD_NAMES[f.field] ?? f.field}` : ""}
                      </span>
                      <p className="mt-1 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {f.message}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </ToolPanel>
          </div>
        </div>

        <ToolPanel title="Sandboxing">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setO((prev) => ({ ...prev, hardening: { ...noHardening(), readWritePaths: prev.hardening.readWritePaths } }))}
              data-testid="button-hardening-none"
              className={ACTION}
            >
              Turn all off
            </button>
            <button
              type="button"
              onClick={() =>
                setO((prev) => ({
                  ...prev,
                  hardening: { ...standardHardening(), readWritePaths: prev.hardening.readWritePaths },
                }))
              }
              data-testid="button-hardening-standard"
              className={ACTION}
            >
              Standard set
            </button>
            <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]" data-testid="text-hardening-count">
              {build.hardeningCount} {build.hardeningCount === 1 ? "line" : "lines"} in the unit
            </span>
          </div>
          <p className={HINT}>
            Each switch removes something the service probably does not need, so a bug in it reaches less. They limit
            damage after a compromise. They do not stop one. The standard set suits a network daemon running as its
            own user. Turn on one group, start the service, and read its log before adding the next.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <HardeningRow rowKey="noNewPrivileges">
              <Toggle
                checked={h.noNewPrivileges}
                onChange={(v) => setH("noNewPrivileges", v)}
                label="NoNewPrivileges=yes"
                testId="checkbox-no-new-privileges"
              />
            </HardeningRow>

            <HardeningRow rowKey="protectSystem" messages={messagesFor("protectSystem")}>
              <SelectField
                id="sdu-protect-system"
                label="Mode"
                value={h.protectSystem}
                onChange={(v) => setH("protectSystem", v as HardeningOptions["protectSystem"])}
                options={[
                  { value: "", label: "not set" },
                  { value: "yes", label: "yes" },
                  { value: "full", label: "full" },
                  { value: "strict", label: "strict" },
                ]}
                testId="select-protect-system"
              />
            </HardeningRow>

            <HardeningRow rowKey="protectHome" messages={messagesFor("protectHome")}>
              <SelectField
                id="sdu-protect-home"
                label="Mode"
                value={h.protectHome}
                onChange={(v) => setH("protectHome", v as HardeningOptions["protectHome"])}
                options={[
                  { value: "", label: "not set" },
                  { value: "yes", label: "yes" },
                  { value: "read-only", label: "read-only" },
                  { value: "tmpfs", label: "tmpfs" },
                ]}
                testId="select-protect-home"
              />
            </HardeningRow>

            <HardeningRow rowKey="privateTmp">
              <Toggle checked={h.privateTmp} onChange={(v) => setH("privateTmp", v)} label="PrivateTmp=yes" testId="checkbox-private-tmp" />
            </HardeningRow>

            <HardeningRow rowKey="privateDevices">
              <Toggle
                checked={h.privateDevices}
                onChange={(v) => setH("privateDevices", v)}
                label="PrivateDevices=yes"
                testId="checkbox-private-devices"
              />
            </HardeningRow>

            <HardeningRow rowKey="protectKernelTunables">
              <Toggle
                checked={h.protectKernelTunables}
                onChange={(v) => setH("protectKernelTunables", v)}
                label="ProtectKernelTunables=yes"
                testId="checkbox-protect-kernel-tunables"
              />
            </HardeningRow>

            <HardeningRow rowKey="protectKernelModules">
              <Toggle
                checked={h.protectKernelModules}
                onChange={(v) => setH("protectKernelModules", v)}
                label="ProtectKernelModules=yes"
                testId="checkbox-protect-kernel-modules"
              />
            </HardeningRow>

            <HardeningRow rowKey="protectControlGroups">
              <Toggle
                checked={h.protectControlGroups}
                onChange={(v) => setH("protectControlGroups", v)}
                label="ProtectControlGroups=yes"
                testId="checkbox-protect-control-groups"
              />
            </HardeningRow>

            <HardeningRow rowKey="restrictAddressFamilies" messages={messagesFor("restrictAddressFamilies")}>
              <Field
                id="sdu-address-families"
                label="Families (empty for no restriction)"
                value={h.restrictAddressFamilies}
                onChange={(v) => setH("restrictAddressFamilies", v)}
                errors={[]}
                placeholder="AF_UNIX AF_INET AF_INET6"
              />
            </HardeningRow>

            <HardeningRow rowKey="capabilityBoundingSet" messages={messagesFor("capabilityBoundingSet")}>
              <SelectField
                id="sdu-cap-mode"
                label="Bounding set"
                value={h.capabilityMode}
                onChange={(v) => setH("capabilityMode", v as HardeningOptions["capabilityMode"])}
                options={[
                  { value: "unset", label: "not set (no limit)" },
                  { value: "none", label: "empty (drop every capability)" },
                  { value: "allow", label: "allow only the listed" },
                  { value: "deny", label: "drop the listed (~)" },
                ]}
                testId="select-capability-mode"
              />
              {h.capabilityMode === "allow" || h.capabilityMode === "deny" ? (
                <div className="mt-3">
                  <Field
                    id="sdu-cap-list"
                    label="Capabilities"
                    value={h.capabilityBoundingSet}
                    onChange={(v) => setH("capabilityBoundingSet", v)}
                    errors={[]}
                    placeholder="CAP_NET_BIND_SERVICE"
                  />
                </div>
              ) : null}
            </HardeningRow>

            <HardeningRow rowKey="ambientCapabilities" messages={messagesFor("ambientCapabilities")}>
              <Field
                id="sdu-ambient"
                label="Capabilities"
                value={h.ambientCapabilities}
                onChange={(v) => setH("ambientCapabilities", v)}
                errors={[]}
                placeholder="CAP_NET_BIND_SERVICE"
              />
            </HardeningRow>

            <HardeningRow rowKey="readWritePaths" messages={messagesFor("readWritePaths")}>
              <Field
                id="sdu-rw-paths"
                label="Paths, separated by spaces"
                value={h.readWritePaths}
                onChange={(v) => setH("readWritePaths", v)}
                errors={[]}
                placeholder="/var/lib/myapp -/var/cache/myapp"
              />
            </HardeningRow>

            <HardeningRow rowKey="systemCallFilter" messages={messagesFor("systemCallFilter")}>
              <SelectField
                id="sdu-syscall"
                label="Filter"
                value={h.systemCallFilter}
                onChange={(v) => setH("systemCallFilter", v as HardeningOptions["systemCallFilter"])}
                options={[
                  { value: "off", label: "not set" },
                  { value: "system-service", label: "@system-service" },
                  { value: "system-service-strict", label: "@system-service, minus @privileged @resources" },
                ]}
                testId="select-syscall-filter"
              />
            </HardeningRow>

            <HardeningRow rowKey="systemCallArchitectures">
              <Toggle
                checked={h.systemCallArchitectures}
                onChange={(v) => setH("systemCallArchitectures", v)}
                label="SystemCallArchitectures=native"
                testId="checkbox-syscall-architectures"
              />
            </HardeningRow>

            <HardeningRow rowKey="lockPersonality">
              <Toggle
                checked={h.lockPersonality}
                onChange={(v) => setH("lockPersonality", v)}
                label="LockPersonality=yes"
                testId="checkbox-lock-personality"
              />
            </HardeningRow>

            <HardeningRow rowKey="restrictRealtime">
              <Toggle
                checked={h.restrictRealtime}
                onChange={(v) => setH("restrictRealtime", v)}
                label="RestrictRealtime=yes"
                testId="checkbox-restrict-realtime"
              />
            </HardeningRow>

            <HardeningRow rowKey="restrictSuidSgid">
              <Toggle
                checked={h.restrictSuidSgid}
                onChange={(v) => setH("restrictSuidSgid", v)}
                label="RestrictSUIDSGID=yes"
                testId="checkbox-restrict-suid-sgid"
              />
            </HardeningRow>

            <HardeningRow rowKey="restrictNamespaces">
              <Toggle
                checked={h.restrictNamespaces}
                onChange={(v) => setH("restrictNamespaces", v)}
                label="RestrictNamespaces=yes"
                testId="checkbox-restrict-namespaces"
              />
            </HardeningRow>

            <HardeningRow rowKey="protectHostname">
              <Toggle
                checked={h.protectHostname}
                onChange={(v) => setH("protectHostname", v)}
                label="ProtectHostname=yes"
                testId="checkbox-protect-hostname"
              />
            </HardeningRow>

            <HardeningRow rowKey="memoryDenyWriteExecute" messages={messagesFor("memoryDenyWriteExecute")}>
              <Toggle
                checked={h.memoryDenyWriteExecute}
                onChange={(v) => setH("memoryDenyWriteExecute", v)}
                label="MemoryDenyWriteExecute=yes"
                testId="checkbox-memory-deny-write-execute"
              />
            </HardeningRow>
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
