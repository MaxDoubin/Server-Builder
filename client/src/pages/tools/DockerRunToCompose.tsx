/**
 * docker run to Compose converter.
 *
 * The pasted command is split into words with POSIX shell quoting rules,
 * parsed with the option grammar the Docker CLI uses, and written out as a
 * Compose file. The tokenizer, the flag mapping and the YAML writer live in
 * lib/toolkit/docker-run-to-compose so they can be unit tested without React.
 *
 * Nothing is executed or expanded. The command stays in component state in
 * this tab, is never persisted, and is never sent anywhere. That matters
 * because docker run lines routinely carry passwords in -e flags.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { MAX_INPUT, MAX_WORDS, convertDockerRun } from "@/lib/toolkit/docker-run-to-compose";
import { ToolPanel, ToolShell } from "./ToolShell";

const EXAMPLES: { label: string; value: string }[] = [
  {
    label: "Web server",
    value: "docker run -d --name web --restart unless-stopped -p 8080:80 -v $(pwd)/html:/usr/share/nginx/html:ro nginx:1.27",
  },
  {
    label: "Database",
    value: `docker run -d \\
  --name postgres \\
  --restart unless-stopped \\
  -p 127.0.0.1:5432:5432 \\
  -e POSTGRES_PASSWORD=change-me \\
  -v pgdata:/var/lib/postgresql/data \\
  --health-cmd 'pg_isready -U postgres' \\
  --health-interval 10s --health-retries 5 \\
  --shm-size 256m \\
  postgres:16`,
  },
  {
    label: "Hardened",
    value: `docker run -d --name api \\
  --read-only --tmpfs /tmp:rw,size=64m \\
  --cap-drop ALL --cap-add NET_BIND_SERVICE \\
  --security-opt no-new-privileges \\
  --user 10001:10001 \\
  --memory 256m --cpus 0.5 --pids-limit 100 \\
  --ulimit nofile=4096:8192 \\
  -p 8443:8443 \\
  ghcr.io/example/api:2.4.1`,
  },
  {
    label: "Two services",
    value: `docker network create appnet
docker run -d --name db --network appnet -e POSTGRES_PASSWORD_FILE=/run/secrets/pw -v dbdata:/var/lib/postgresql/data postgres:16
docker run -d --name api --network appnet --network-alias backend -p 3000:3000 -e DATABASE_HOST=db example/api:1.2.0`,
  },
];

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD_CLASS =
  "mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TOGGLE_CLASS =
  "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))]";
const ERROR_CLASS =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH_CLASS =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function DockerRunToCompose() {
  const [raw, setRaw] = useState(EXAMPLES[1].value);
  const [serviceName, setServiceName] = useState("");
  const [externalVolumes, setExternalVolumes] = useState(false);

  const blank = raw.trim() === "";
  const result = useMemo(
    () => (blank ? null : convertDockerRun(raw, { serviceName: serviceName.trim(), externalVolumes })),
    [raw, blank, serviceName, externalVolumes],
  );
  const ok = result && result.ok ? result : null;
  const error = result && !result.ok ? result.error : null;

  const warnings = ok ? ok.notes.filter((n) => n.level === "warn") : [];
  const infos = ok ? ok.notes.filter((n) => n.level === "info") : [];
  const lineCount = ok ? ok.yaml.split("\n").length - 1 : 0;

  const summary = ok
    ? `Converted ${ok.services.length} ${plural(ok.services.length, "service", "services")}: ${ok.services.join(", ")}. ${warnings.length} ${plural(warnings.length, "warning", "warnings")}, ${ok.unconverted.length} ${plural(ok.unconverted.length, "flag", "flags")} not converted.`
    : error
      ? "Nothing converted."
      : "Paste a docker run command to convert it.";

  // The name only applies when the input holds a single docker run command.
  const ignoredFor = ok !== null && ok.services.length > 1 && serviceName.trim() !== "" ? ok.services.length : 0;

  return (
    <ToolShell slug="docker-run-to-compose">
      <div className="space-y-6">
        <ToolPanel title="Command">
          <label
            htmlFor="docker-run-input"
            className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
          >
            Paste a docker run command. Line continuations, quotes and a leading $ or sudo are handled.
          </label>
          <textarea
            id="docker-run-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={10}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={error !== null}
            aria-describedby={error ? "docker-run-error" : "docker-run-hint"}
            placeholder="docker run -d --name web -p 8080:80 nginx:1.27"
            data-testid="input-docker-run"
            className={`${FIELD_CLASS} resize-y`}
          />

          {error ? (
            <p id="docker-run-error" role="alert" data-testid="text-docker-run-error" className={`mt-3 ${ERROR_CLASS}`}>
              {error}
            </p>
          ) : (
            <p id="docker-run-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Nothing is run or expanded. Up to {MAX_INPUT.toLocaleString("en-US")} characters and{" "}
              {MAX_WORDS.toLocaleString("en-US")} words, and several docker run lines make several services. The
              command is not stored and no request is made.
            </p>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="docker-run-service" className={LABEL_CLASS}>
                Service name (optional)
              </label>
              <input
                id="docker-run-service"
                type="text"
                value={serviceName}
                onChange={(event) => setServiceName(event.target.value)}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                maxLength={64}
                aria-describedby="docker-run-service-hint"
                placeholder="from --name, else the image"
                data-testid="input-service-name"
                className={FIELD_CLASS}
              />
              <p id="docker-run-service-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {ignoredFor > 0
                  ? `Ignored, because the input holds ${ignoredFor} commands. Each service is named after its own --name or image.`
                  : "Used when the input holds one docker run command."}
              </p>
            </div>
            <div className="min-w-0 md:pt-[1.625rem]">
              <label className={TOGGLE_CLASS}>
                <input
                  type="checkbox"
                  checked={externalVolumes}
                  onChange={(event) => setExternalVolumes(event.target.checked)}
                  data-testid="checkbox-external-volumes"
                  className="h-4 w-4 shrink-0 accent-[hsl(var(--brand-signal))]"
                />
                Attach to existing named volumes
              </label>
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Writes <code className="text-[hsl(var(--brand-cyan))]">external: true</code> for each named volume, so
                Compose uses the volume docker run already created instead of making a new, prefixed one.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setRaw(example.value)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
            {raw ? (
              <button type="button" onClick={() => setRaw("")} data-testid="button-clear" className={CHIP_CLASS}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="break-words font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {ok ? (
          <div className="space-y-6">
            <ToolPanel title="Compose file">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  {lineCount} {plural(lineCount, "line", "lines")}
                </span>
                <CopyButton value={ok.yaml} label="Copy the Compose file" testId="button-copy-compose">
                  <span>Copy YAML</span>
                </CopyButton>
              </div>
              <div className="mt-3 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                <pre
                  data-testid="output-compose"
                  tabIndex={0}
                  aria-label="Compose file"
                  className="min-w-max p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  {ok.yaml}
                </pre>
              </div>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Save it as <code className="text-[hsl(var(--brand-cyan))]">compose.yaml</code> or{" "}
                <code className="text-[hsl(var(--brand-cyan))]">docker-compose.yml</code> and start it with{" "}
                <code className="text-[hsl(var(--brand-cyan))]">docker compose up -d</code>. There is no top-level{" "}
                <code className="text-[hsl(var(--brand-cyan))]">version</code> key, because current Compose ignores it and
                warns when it is present.
              </p>
            </ToolPanel>

            {warnings.length > 0 ? (
              <ToolPanel title="Check before you use it">
                <ul className="space-y-3" data-testid="list-warnings">
                  {warnings.map((note) => (
                    <li
                      key={note.text}
                      className="break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                    >
                      <span className="mr-2 uppercase tracking-[0.18em]">Warning</span>
                      {note.text}
                    </li>
                  ))}
                </ul>
              </ToolPanel>
            ) : null}

            {ok.unconverted.length > 0 ? (
              <ToolPanel title={`Not converted (${ok.unconverted.length})`}>
                <p className="mb-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  These flags have no equivalent in the file above. Each row says why.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse text-left" data-testid="table-unconverted">
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        <th scope="col" className={TH_CLASS}>
                          Flag
                        </th>
                        <th scope="col" className={TH_CLASS}>
                          Why
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ok.unconverted.map((item, i) => (
                        <tr key={`${item.flag}-${i}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                          <td className="break-all py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                            {item.flag}
                          </td>
                          <td className="py-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                            {item.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ToolPanel>
            ) : null}

            {infos.length > 0 ? (
              <ToolPanel title="Notes">
                <ul className="space-y-2" data-testid="list-notes">
                  {infos.map((note) => (
                    <li
                      key={note.text}
                      className="break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    >
                      {note.text}
                    </li>
                  ))}
                </ul>
              </ToolPanel>
            ) : null}

            {ok.mappings.length > 0 ? (
              <ToolPanel title="How each flag was mapped">
                <details>
                  <summary className="flex min-h-[28px] cursor-pointer items-center font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]">
                    Show the {ok.mappings.length} {plural(ok.mappings.length, "mapping", "mappings")}
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[360px] border-collapse text-left" data-testid="table-mappings">
                      <thead>
                        <tr className="border-b border-[hsl(var(--brand-iron))]">
                          <th scope="col" className={TH_CLASS}>
                            Flag as written
                          </th>
                          <th scope="col" className={TH_CLASS}>
                            Compose key
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {ok.mappings.map((m, i) => (
                          <tr key={`${m.flag}-${i}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                            <td className="break-all py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                              {m.flag}
                            </td>
                            <td className="break-all py-2 font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">
                              {m.key}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </ToolPanel>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToolShell>
  );
}
