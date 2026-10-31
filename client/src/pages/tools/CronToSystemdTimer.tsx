/**
 * Cron to systemd timer converter.
 *
 * The crontab line is parsed into explicit value sets, and the OnCalendar
 * lines, the .timer and the .service all come from those sets via
 * lib/toolkit/cron-to-systemd-timer. The next run times are computed from
 * the cron rule itself, not from the generated text, so the two can be
 * compared by eye and by `systemd-analyze calendar`. Nothing is stored or
 * sent anywhere; everything lives in component state in this tab only.
 */

import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_INPUT_LENGTH,
  MAX_SEARCH_DAYS,
  MACROS,
  buildTimer,
  defaultTimerOptions,
  formatRun,
  nextCronRuns,
  parseCrontabLine,
  type CronField,
  type Finding,
  type TimerOptions,
} from "@/lib/toolkit/cron-to-systemd-timer";
import { ToolPanel, ToolShell } from "./ToolShell";

type Level = Finding["level"];

const LABEL =
  "block font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "mt-1.5 w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none aria-[invalid=true]:border-[hsl(var(--brand-danger))]";
const HINT = "mt-1.5 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]";
const ERR = "mt-1.5 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const CHIP =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ACTION =
  "inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PRE =
  "min-w-0 overflow-x-auto whitespace-pre rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]";
const TH =
  "py-2 pr-4 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";

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
  cron: "Schedule",
  name: "Name",
  command: "Command",
  user: "User",
  workingDirectory: "WorkingDirectory",
  randomizedDelaySec: "RandomizedDelaySec",
  timezone: "Time zone",
  persistent: "Persistent",
};

const EXAMPLES: { id: string; label: string; cron: string }[] = [
  { id: "weekday-nights", label: "Weekday 02:30", cron: "30 2 * * 1-5 /usr/local/bin/nightly-backup" },
  { id: "every-15", label: "Every 15 min", cron: "*/15 * * * * /usr/local/bin/poll-queue" },
  { id: "or-rule", label: "1st, 15th or Monday", cron: "0 0 1,15 * 1 /usr/local/bin/report" },
  { id: "business", label: "Business hours", cron: "*/30 9-17 * * mon-fri /usr/local/bin/sync-files" },
  { id: "weekly", label: "@weekly", cron: "@weekly /usr/local/bin/rotate-logs" },
  { id: "daily", label: "@daily", cron: "@daily /usr/local/bin/cleanup" },
  { id: "months", label: "Quarterly", cron: "0 6 1 */3 * /usr/local/bin/quarterly-report" },
  { id: "shell", label: "Shell syntax", cron: "0 4 * * * cd /srv/app && ./prune.sh > /var/log/prune.log 2>&1" },
  { id: "reboot", label: "@reboot", cron: "@reboot /usr/local/bin/warm-cache" },
];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The values a field expanded to, short enough for a table cell. */
function describeValues(field: CronField, kind: "minute" | "hour" | "dom" | "month" | "dow"): string {
  const total = { minute: 60, hour: 24, dom: 31, month: 12, dow: 7 }[kind];
  if (field.values.length === total) {
    return { minute: "every minute", hour: "every hour", dom: "every day", month: "every month", dow: "every day" }[kind];
  }
  const label = (v: number): string =>
    kind === "month" ? MONTH_LABELS[v - 1] : kind === "dow" ? DAY_LABELS[v] : String(v);
  const shown = field.values.slice(0, 12).map(label).join(", ");
  return field.values.length > 12 ? `${shown} and ${field.values.length - 12} more` : shown;
}

/* ------------------------------------------------------------- controls */

function Field({
  id,
  label,
  value,
  onChange,
  errors,
  hint,
  placeholder,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors: string[];
  hint?: ReactNode;
  placeholder?: string;
  testId?: string;
}) {
  const describedBy = [errors.length ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={errors.length > 0}
        aria-describedby={describedBy}
        data-testid={testId}
        className={INPUT}
      />
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

function Toggle({
  checked,
  onChange,
  label,
  hint,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: ReactNode;
  testId?: string;
}) {
  return (
    <div>
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
      {hint ? <p className={HINT}>{hint}</p> : null}
    </div>
  );
}

/** A unit file with section headers and keys picked out. */
function UnitText({ text }: { text: string }) {
  return (
    <>
      {text
        .replace(/\n$/, "")
        .split("\n")
        .map((line, i) => {
          const eq = line.indexOf("=");
          if (line.startsWith("[")) {
            return (
              <span key={i} className="text-[hsl(var(--brand-signal))]">
                {line}
                {"\n"}
              </span>
            );
          }
          if (eq > 0) {
            return (
              <span key={i}>
                <span className="text-[hsl(var(--brand-cyan))]">{line.slice(0, eq + 1)}</span>
                <span className="text-[hsl(var(--brand-bone))]">{line.slice(eq + 1)}</span>
                {"\n"}
              </span>
            );
          }
          return (
            <span key={i}>
              {line}
              {"\n"}
            </span>
          );
        })}
    </>
  );
}

/* ----------------------------------------------------------------- page */

export function CronToSystemdTimer() {
  const [o, setO] = useState<TimerOptions>(() => defaultTimerOptions());
  const [nowTick, setNowTick] = useState(() => Date.now());

  const parsed = useMemo(() => parseCrontabLine(o.cron), [o.cron]);
  const build = useMemo(() => buildTimer(o), [o]);

  const schedule = parsed.ok && parsed.kind === "schedule" ? parsed.schedule : null;
  const runs = useMemo(() => (schedule ? nextCronRuns(schedule, new Date(nowTick), 5) : []), [schedule, nowTick]);

  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "your local time zone";
    } catch {
      return "your local time zone";
    }
  }, []);

  function set<K extends keyof TimerOptions>(key: K, value: TimerOptions[K]) {
    setO((prev) => ({ ...prev, [key]: value }));
  }

  const errorsFor = (field: string): string[] =>
    build.findings.filter((f) => f.level === "error" && f.field === field).map((f) => f.message);

  const ordered = useMemo(() => {
    const rank: Record<Level, number> = { error: 0, warn: 1, info: 2 };
    return [...build.findings].sort((a, b) => rank[a.level] - rank[b.level]);
  }, [build.findings]);

  const rows: { label: string; field: CronField; kind: "minute" | "hour" | "dom" | "month" | "dow" }[] = schedule
    ? [
        { label: "Minute", field: schedule.minute, kind: "minute" },
        { label: "Hour", field: schedule.hour, kind: "hour" },
        { label: "Day of month", field: schedule.dom, kind: "dom" },
        { label: "Month", field: schedule.month, kind: "month" },
        { label: "Day of week", field: schedule.dow, kind: "dow" },
      ]
    : [];
  const bothRestricted = schedule !== null && !schedule.dom.star && !schedule.dow.star;
  const macro = parsed.ok && parsed.kind === "schedule" ? parsed.macro : null;

  return (
    <ToolShell slug="cron-to-systemd-timer">
      <div className="space-y-6">
        <ToolPanel title="Cron expression">
          <Field
            id="c2t-cron"
            label="Crontab line, or just the five fields"
            value={o.cron}
            onChange={(v) => set("cron", v)}
            errors={errorsFor("cron")}
            hint={
              <>
                Five fields (minute hour day-of-month month day-of-week), or a macro such as <code>@daily</code>. A
                command after the fifth field is carried into the service. A system crontab has a user column before
                the command, so remove it and use User= below. Up to {MAX_INPUT_LENGTH.toLocaleString("en-US")} characters.
              </>
            }
            placeholder="30 2 * * 1-5 /usr/local/bin/backup"
            testId="input-cron"
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                onClick={() => set("cron", example.cron)}
                data-testid={`button-example-${example.id}`}
                className={CHIP}
              >
                {example.label}
              </button>
            ))}
          </div>

          {schedule ? (
            <div className="mt-5">
              {macro ? (
                <p className={`${HINT} mb-2 mt-0`}>
                  <code>{macro}</code> stands for <code>{MACROS[macro]}</code>.
                </p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] border-collapse" data-testid="table-fields">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH}>
                        Field
                      </th>
                      <th scope="col" className={TH}>
                        Written
                      </th>
                      <th scope="col" className={TH}>
                        Means
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.label} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                        <th scope="row" className="py-2 pr-4 text-left font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone-dim))]">
                          {row.label}
                        </th>
                        <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{row.field.raw}</td>
                        <td className="py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                          {describeValues(row.field, row.kind)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={HINT} data-testid="text-day-rule">
                {bothRestricted
                  ? "Both day fields are restricted, so cron runs the job when either one matches."
                  : "At least one day field starts with an asterisk, so cron requires both day fields to match."}
              </p>
            </div>
          ) : null}
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="systemd calendar">
            {build.parsed && !build.isReboot ? (
              <>
                <div className="space-y-2" data-testid="output-calendar">
                  {build.calendar.map((line) => (
                    <div key={line} className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 flex-1 break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                        OnCalendar={line}
                      </code>
                      <CopyButton value={`OnCalendar=${line}`} label={`Copy OnCalendar=${line}`} testId="button-copy-calendar">
                        <span>Copy</span>
                      </CopyButton>
                    </div>
                  ))}
                </div>
                {build.orRule ? (
                  <p
                    className="mt-4 break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                    data-testid="text-or-rule"
                  >
                    Two lines because cron ORs the day fields. The first line fires on the listed dates and the
                    second on the listed weekdays. Together they fire when either matches, which is what cron did.
                    One line would fire only when the date and the weekday match together.
                  </p>
                ) : null}
                <h3 className="mt-5 font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  Verify with systemd
                </h3>
                <pre className={`${PRE} mt-2`} data-testid="output-verify" tabIndex={0} role="region" aria-label="Verification command">
                  {build.verifyCommands}
                </pre>
                <div className="mt-3">
                  <CopyButton value={build.verifyCommands} label="Copy the systemd-analyze command" testId="button-copy-verify">
                    <span>Copy command</span>
                  </CopyButton>
                </div>
                <p className={HINT}>
                  For each line it prints <code>Normalized form:</code>, which should read the same as the line above,
                  and then the next five times it fires. If the two lists of times differ from the ones here, trust
                  systemd and check the zone.
                </p>
              </>
            ) : build.parsed && build.isReboot ? (
              <>
                <code className="block rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                  OnBootSec=1min
                </code>
                <p className={HINT}>
                  <code>@reboot</code> has no calendar time. <code>OnBootSec=</code> fires that long after the kernel
                  started. Check the span with <code>systemd-analyze timespan 1min</code>.
                </p>
              </>
            ) : (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]" data-testid="text-calendar-empty">
                The calendar lines appear once the expression is valid.
              </p>
            )}
          </ToolPanel>

          <ToolPanel title="Next runs">
            {schedule && build.parsed ? (
              <>
                {runs.length > 0 ? (
                  <ol className="space-y-1.5" data-testid="list-next-runs">
                    {runs.map((run, i) => (
                      <li key={run.getTime()} className="flex gap-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        <span className="w-4 shrink-0 text-right text-[hsl(var(--brand-ash))]">{i + 1}</span>
                        <span className="min-w-0 break-words">{formatRun(run)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]" data-testid="text-no-runs">
                    No run in the next {Math.round(MAX_SEARCH_DAYS / 365.25)} years.
                  </p>
                )}
                <p className={HINT}>
                  Worked out from the cron rule, not from the OnCalendar text, in this browser's time zone (
                  {timeZone}). The search looks {MAX_SEARCH_DAYS.toLocaleString("en-US")} days ahead at most. The
                  machine that runs the timer uses its own zone unless you set one.
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setNowTick(Date.now())}
                    data-testid="button-refresh-runs"
                    className={ACTION}
                  >
                    Recalculate from now
                  </button>
                </div>
              </>
            ) : (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                {build.isReboot ? "A boot timer has no calendar times to list." : "Run times appear once the expression is valid."}
              </p>
            )}
          </ToolPanel>
        </div>

        <ToolPanel title="Timer and service settings">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              id="c2t-name"
              label="Unit name"
              value={o.name}
              onChange={(v) => set("name", v)}
              errors={errorsFor("name")}
              hint={
                <>
                  Becomes <code>{build.timerFile || "NAME.timer"}</code> and <code>{build.serviceFile || "NAME.service"}</code>.
                </>
              }
              placeholder="nightly-backup"
              testId="input-name"
            />
            <Field
              id="c2t-command"
              label="Command (overrides the one in the crontab line)"
              value={o.command}
              onChange={(v) => set("command", v)}
              errors={errorsFor("command")}
              hint="Shell syntax is wrapped in /bin/sh -c. An unescaped % is refused, because cron treats it as a newline."
              placeholder="/usr/local/bin/backup --full"
              testId="input-command"
            />
            <Field
              id="c2t-user"
              label="User (optional)"
              value={o.user}
              onChange={(v) => set("user", v)}
              errors={errorsFor("user")}
              hint="A user crontab ran as its owner. Without User= the service runs as root."
              placeholder="backup"
            />
            <Field
              id="c2t-workdir"
              label="WorkingDirectory (optional)"
              value={o.workingDirectory}
              onChange={(v) => set("workingDirectory", v)}
              errors={errorsFor("workingDirectory")}
              hint="Cron started jobs in the user's home directory, which is ~. A service starts in / unless this is set."
              placeholder="~"
            />
            <Field
              id="c2t-delay"
              label="RandomizedDelaySec (optional)"
              value={o.randomizedDelaySec}
              onChange={(v) => set("randomizedDelaySec", v)}
              errors={errorsFor("randomizedDelaySec")}
              hint="Each run is delayed by a random time between 0 and this, which spreads load when many machines share a schedule. Keep it well under the interval."
              placeholder="15min"
              testId="input-delay"
            />
            <Field
              id="c2t-timezone"
              label="Time zone (optional)"
              value={o.timezone}
              onChange={(v) => set("timezone", v)}
              errors={errorsFor("timezone")}
              hint="Appended to each OnCalendar line. Empty uses the machine's zone, as cron does."
              placeholder="UTC or Europe/Berlin"
            />
            <Toggle
              checked={o.persistent}
              onChange={(v) => set("persistent", v)}
              label="Persistent=true"
              hint="If the machine was off or asleep at a scheduled time, the missed run happens once, as soon as the timer starts again. Cron skips it. The last run time is kept on disk."
              testId="checkbox-persistent"
            />
            <Toggle
              checked={o.preciseTiming}
              onChange={(v) => set("preciseTiming", v)}
              label="AccuracySec=1s"
              hint="By default systemd may fire a timer up to a minute late so wakeups can be batched. One second is close to cron's behavior."
              testId="checkbox-precise"
            />
          </div>
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Timer unit">
            {build.timer ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">/etc/systemd/system/{build.timerFile}</span>
                  <CopyButton value={build.timer} label="Copy timer unit" testId="button-copy-timer">
                    <span>Copy timer</span>
                  </CopyButton>
                </div>
                <pre className={`${PRE} mt-3`} data-testid="output-timer" tabIndex={0} role="region" aria-label="Generated timer unit">
                  <UnitText text={build.timer} />
                </pre>
              </>
            ) : (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">The timer unit appears once the expression, name and command are valid.</p>
            )}
          </ToolPanel>

          <ToolPanel title="Service unit">
            {build.service ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">/etc/systemd/system/{build.serviceFile}</span>
                  <CopyButton value={build.service} label="Copy service unit" testId="button-copy-service">
                    <span>Copy service</span>
                  </CopyButton>
                </div>
                <pre className={`${PRE} mt-3`} data-testid="output-service" tabIndex={0} role="region" aria-label="Generated service unit">
                  <UnitText text={build.service} />
                </pre>
                <p className={HINT}>
                  <code>Type=oneshot</code> because the job runs and exits. It has no [Install] section: the timer
                  starts it, so enable the timer and leave the service alone.
                </p>
              </>
            ) : (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">The service unit appears once the expression, name and command are valid.</p>
            )}
          </ToolPanel>
        </div>

        <ToolPanel title="Install and verify">
          {build.installCommands ? (
            <>
              <pre className={PRE} data-testid="output-commands" tabIndex={0} role="region" aria-label="Install commands">
                {build.installCommands}
              </pre>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <CopyButton value={build.installCommands} label="Copy install commands" testId="button-copy-commands">
                  <span>Copy commands</span>
                </CopyButton>
                <CopyButton value={build.script} label="Copy both units and the commands as one script" testId="button-copy-script">
                  <span>Copy as one script</span>
                </CopyButton>
              </div>
            </>
          ) : (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">The commands appear once there are units to install.</p>
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
                <li key={`${f.level}-${f.field}-${i}`} className={`rounded-lg border p-3 ${LEVEL_BOX[f.level]}`}>
                  <span className={`font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] ${LEVEL_TEXT[f.level]}`}>
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

        <ToolPanel title="What else changes when cron becomes a timer">
          <ul className="space-y-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            <li>
              <span className="text-[hsl(var(--brand-bone))]">Shell and environment.</span> Cron ran the command with{" "}
              <code>sh -c</code> and a minimal <code>PATH</code> of <code>/usr/bin:/bin</code> on most systems. A service has no shell
              unless you ask for one, a different default <code>PATH</code>, and none of the variables set at the top of the crontab.
            </li>
            <li>
              <span className="text-[hsl(var(--brand-bone))]">Output.</span> Cron mailed anything a job printed to the
              crontab's <code>MAILTO</code>. A service sends it to the journal. Read it with{" "}
              <code>journalctl -u {build.serviceFile || "NAME.service"}</code>.
            </li>
            <li>
              <span className="text-[hsl(var(--brand-bone))]">Overlap.</span> Cron starts a second copy if the first
              is still running. A timer asks systemd to start the service, and systemd does not start a copy that is
              already starting or running, so the late tick is skipped.
            </li>
            <li>
              <span className="text-[hsl(var(--brand-bone))]">Time zone.</span> Both use the machine's zone by default.
              Cron has no per-line zone except through <code>CRON_TZ</code> in some implementations. An OnCalendar line
              can end with a zone name.
            </li>
            <li>
              <span className="text-[hsl(var(--brand-bone))]">Seconds and years.</span> A calendar event has a seconds
              field and a year, which cron lacks. The conversion fixes seconds at 00 and the year at any.
            </li>
          </ul>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
