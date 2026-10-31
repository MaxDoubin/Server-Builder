/**
 * OpenSSH public key inspector.
 *
 * Paste authorized_keys, .pub files, known_hosts lines or an RFC 4716 block.
 * Each key is decoded from its wire format, fingerprinted exactly as
 * ssh-keygen -l prints it, checked for weak algorithms and sizes, and every
 * authorized_keys option is explained along with what the options add up to.
 * The parsing and hashing live in lib/toolkit/ssh-key-inspector.ts. Nothing
 * is uploaded and nothing is stored.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  inspectKeys,
  MAX_INPUT_CHARS,
  MAX_LINES,
  type Effective,
  type Finding,
  type KeyLine,
  type Tone,
} from "@/lib/toolkit/ssh-key-inspector";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* --------------------------------------------------------------- examples */

const EXAMPLE_AUTHORIZED_KEYS = [
  "# Laptop",
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKzWvvlVpO+UtBPKOEICiaE996iZruwytHCPnxSZmpvt alice@laptop",
  "# Nightly backup: one command, from the backup subnet, nothing else",
  'from="10.20.0.0/16",command="/usr/local/bin/rrsync -ro /srv/backup",restrict ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBACqruIfUpJGckErp7hErX8ipeHh5yelc5w4caH8H4aIo+OkwAy2IhhvWJdoWXZA3nTESeDgF+9iLVeBLQUWpoY= backup@nas',
  "# Git over SSH",
  'command="git-shell -c \\"$SSH_ORIGINAL_COMMAND\\"",no-pty ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD2q4Q9BaLW8eo3/nC1gW8smyhqZZsVBD00XSlmTr4RdPFdNh2sOaaMfgCqjIx+sAaEXBDSrtJKu2Ew52xg7acCTg0IFe+erX+OJB/F2kS/tkUJtfahU+MWkj7mckyUAPD/6OD92g1ikI9tIhpWNZOT1VXXsQOn+e5ImXtFyh1is3adrFiJch14ap02V4JliTexUnZqlqZQTG5CsvZdKnXswKDQfMcyEsx3eTnXGz12qUdi4CDRhIYpfrgbWk8x9Q0z+qJeOY4WdazVsb8LD7Uf0qmvjcMQgUSMWE2vs5i/rEFNdKCfnMCoLMnjDWOWGK0t1g2sOjpG/kCgnKWeJHen git@forge',
  "# Old CI deploy key",
  'expiry-time="20240101" ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQDwh3AbhATG3GJnVGknQrimKoC4E3kZFhPDpcHWSIPCTnLj23UrgvU85CYTKR+jvAbiSeErfLbOVZA94iS3hmDYlWoDEWQyrAZAXBSw03NuM0VsZIh7eYhpadPxZo1EafXaWthpDgsEpn3rEt7lox2DLQS/KpIC25+5GxNukkwB5w== deploy@ci',
  "ssh-dss AAAAB3NzaC1kc3MAAACBAI+bVpsOrXpIZ8fhu28+lNEn2vzmrlLwVZfvD38LqyUxLWlxMaYJOEDMUcU1R4arMlCmBNK7cVdmKswwsfrN7AmmVAk/QT+1nr4ISOYcZZDbmkNmlCi0Rk/vo+Ns9eeyBqG1QhhVZapkiDFCW/ImKhAQOQ7LRyL6cFRidYMSNkbHAAAAFQCt9p6g2IdJO1m6D4/phqh7NkAF7QAAAIEAgrq+WEfebBzUB4R2j3jc2ueeXvW7cMzNVtJCWxbX/xYJRWJfDnhUb8VJ13dYCUpTdcvoNftrLSTOTM7tj39lCQIoWhax/E0pD09Mw+dNKVpvFHfkIYUFQ79ka1A8yflzvfODQOfdpRwIwBLb9PlUJfgxxLhAuC7/q6aTKxBnUdEAAACATaSWuzX2BLay+qUQYDyM8Tn7vqMWCH8M5QJBdRLupzPpwxIOAiQQ/yL5XRyk3itWYbU0yqL2MXD96yuaUK/xNP0ymCDMMa2l8UvJgngnpg4OcTGNxK2Y9sBdHepnaqUQJfVuukP2IDp1VZkQHJug9qECjMG7pZz858jzdUBNFD8= legacy@oldbox",
  "# Hardware security key",
  "sk-ssh-ed25519@openssh.com AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29tAAAAIKzWvvlVpO+UtBPKOEICiaE996iZruwytHCPnxSZmpvtAAAABHNzaDo= alice@yubikey",
].join("\n");

/** github.com's published host keys, which a reader can check against GitHub's own fingerprint list. */
const EXAMPLE_GITHUB = [
  "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl",
  "github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=",
  "github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=",
].join("\n");

const EXAMPLES: { label: string; text: string }[] = [
  { label: "authorized_keys", text: EXAMPLE_AUTHORIZED_KEYS },
  { label: "GitHub host keys", text: EXAMPLE_GITHUB },
];

/** Detail panels rendered before the reader asks for the rest. */
const DETAIL_STEP = 40;

/* ------------------------------------------------------------------ style */

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const TH = "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const CHIP_IDLE =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

const TONE_WORD: Record<Tone, string> = { ok: "Fine", info: "Note", warn: "Caution", danger: "Problem" };

const PERMISSIONS: { key: keyof Effective; label: string }[] = [
  { key: "pty", label: "Terminal (pty)" },
  { key: "portForwarding", label: "Port forwarding" },
  { key: "agentForwarding", label: "Agent forwarding" },
  { key: "x11Forwarding", label: "X11 forwarding" },
  { key: "userRc", label: "~/.ssh/rc" },
];

/* ---------------------------------------------------------------- helpers */

function worstTone(line: KeyLine): Tone {
  if (line.error || line.findings.some((f) => f.tone === "danger")) return "danger";
  if (line.findings.some((f) => f.tone === "warn")) return "warn";
  return "ok";
}

function statusText(line: KeyLine): string {
  if (line.error) return "Unusable";
  const tone = worstTone(line);
  return tone === "danger" ? "Problem" : tone === "warn" ? "Caution" : "Fine";
}

function typeSummary(line: KeyLine): string {
  if (!line.key) return line.typeField ?? "unknown";
  const bits = line.key.bits !== null ? `, ${line.key.bits} bits` : "";
  return `${line.key.label}${bits}`;
}

function sourceLabel(line: KeyLine): string {
  if (line.source === "known_hosts") return "known_hosts entry";
  if (line.source === "rfc4716") return "RFC 4716 block";
  return "authorized_keys line";
}

function FindingList({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <ul className="mt-4 space-y-2">
      {findings.map((f, i) => (
        <li key={i} className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[f.tone]}`}>
          <span className="uppercase tracking-[0.2em]">{TONE_WORD[f.tone]}: </span>
          {f.text}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------- one key line */

function LinePanel({ line }: { line: KeyLine }) {
  const key = line.key;
  const cert = key?.certificate ?? null;
  return (
    <ToolPanel title={`Line ${line.lineNumber}: ${sourceLabel(line)}`}>
      <div data-testid={`panel-ssh-line-${line.lineNumber}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-mono-tight text-sm text-[hsl(var(--brand-signal))]">{typeSummary(line)}</p>
          <p className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            {line.source === "known_hosts" ? `Hosts: ${line.hosts ?? ""}` : line.comment ? `Comment: ${line.comment}` : "No comment"}
          </p>
        </div>

        {line.error ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
          >
            {line.error}
          </p>
        ) : null}

        {line.sha256 && line.md5 ? (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--brand-iron)/0.5)] py-2.5">
              <span className={`${LABEL} min-w-[5rem]`}>SHA256</span>
              <span data-testid={`text-sha256-${line.lineNumber}`} className="min-w-0 flex-1 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                {line.sha256}
              </span>
              <CopyButton value={line.sha256} label={`Copy the SHA256 fingerprint of line ${line.lineNumber}`} />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--brand-iron)/0.5)] py-2.5">
              <span className={`${LABEL} min-w-[5rem]`}>MD5</span>
              <span className="min-w-0 flex-1 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{line.md5}</span>
              <CopyButton value={line.md5} label={`Copy the MD5 fingerprint of line ${line.lineNumber}`} />
            </div>
            {cert ? (
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                These fingerprint the public key inside the certificate, which is what ssh-keygen -l prints for a certificate.
              </p>
            ) : null}
          </div>
        ) : null}

        {line.keygen ? (
          <div className="mt-4">
            <p className={LABEL}>What ssh-keygen prints for this line</p>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]">
              <span className="text-[hsl(var(--brand-ash))]">$ ssh-keygen -lf file</span>
              {"\n"}
              {line.keygen}
              {"\n"}
              <span className="text-[hsl(var(--brand-ash))]">$ ssh-keygen -E md5 -lf file</span>
              {"\n"}
              {line.keygenMd5}
            </pre>
          </div>
        ) : null}

        {key ? (
          <div className="mt-4">
            <ToolResult label="Key type" value={key.type} />
            {key.details.map((d) => (
              <ToolResult key={d.label} label={d.label} value={d.value} />
            ))}
          </div>
        ) : null}

        {cert ? (
          <div className="mt-4">
            <p className={LABEL}>Certificate</p>
            <div className="mt-2">
              <ToolResult label="Type" value={`${cert.certType} certificate`} />
              <ToolResult label="Key id" value={cert.keyId || "(empty)"} />
              <ToolResult label="Serial" value={cert.serial} />
              <ToolResult label="Principals" value={cert.principals.length ? cert.principals.join(", ") : "(none: any principal)"} />
              <ToolResult label="Valid" value={cert.validity} />
              <ToolResult
                label="Critical options"
                value={cert.criticalOptions.length ? cert.criticalOptions.map((o) => (o.value ? `${o.label}=${o.value}` : o.label)).join(", ") : "none"}
              />
              <ToolResult
                label="Extensions"
                value={cert.extensions.length ? cert.extensions.map((o) => (o.value ? `${o.label}=${o.value}` : o.label)).join(", ") : "none"}
              />
              <ToolResult label="Signed by" value={`${cert.caType}, ${cert.caFingerprint}`} />
              <ToolResult label="Signature" value={cert.signatureAlgorithm} />
            </div>
          </div>
        ) : null}

        {line.options.length ? (
          <div className="mt-4">
            <p className={LABEL}>Options</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Option
                    </th>
                    <th scope="col" className={TH}>
                      Value
                    </th>
                    <th scope="col" className={`${TH} pr-0`}>
                      What it does
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {line.options.map((o, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                      <th
                        scope="row"
                        className={`py-3 pr-4 font-mono-tight text-sm font-normal ${o.error ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-signal))]"}`}
                      >
                        {o.canonical ?? o.name}
                      </th>
                      <td className="max-w-[240px] break-all py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                        {o.value === null ? (
                          <span className="text-[hsl(var(--brand-ash))]">flag</span>
                        ) : o.value.length > 2000 ? (
                          `${o.value.slice(0, 2000)}... (${o.value.length.toLocaleString("en-US")} characters)`
                        ) : (
                          o.value
                        )}
                      </td>
                      <td className="py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {o.explanation}
                        {o.detail ? <span className="mt-1 block break-words text-[hsl(var(--brand-cyan))]">{o.detail}</span> : null}
                        {o.error ? <span className="mt-1 block text-[hsl(var(--brand-danger))]">{o.error}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {line.effective ? (
          <div className="mt-4">
            <p className={LABEL}>After the options, sshd_config permitting</p>
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PERMISSIONS.map((p) => {
                const allowed = line.effective?.[p.key] ?? true;
                return (
                  <li
                    key={p.key}
                    className={`flex min-h-[36px] items-center justify-between gap-2 rounded-lg border px-3 font-mono-tight text-xs ${
                      allowed
                        ? "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))]"
                        : "border-[hsl(var(--brand-signal)/0.45)] text-[hsl(var(--brand-signal))]"
                    }`}
                  >
                    <span>{p.label}</span>
                    <span className="uppercase tracking-[0.18em]">{allowed ? "allowed" : "blocked"}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <FindingList findings={line.findings} />
      </div>
    </ToolPanel>
  );
}

/* ------------------------------------------------------------------- page */

export function SshKeyInspector() {
  const [raw, setRaw] = useState("");
  const [detailLimit, setDetailLimit] = useState(DETAIL_STEP);
  // Expiry checks need a clock; reading it once keeps results stable while typing.
  const [now] = useState(() => Date.now());

  const result = useMemo(() => (raw.trim() ? inspectKeys(raw, now) : null), [raw, now]);
  const lines = result?.lines ?? [];
  const problems = lines.filter((l) => worstTone(l) === "danger").length;
  const cautions = lines.filter((l) => worstTone(l) === "warn").length;

  const summary = result
    ? lines.length === 0
      ? "No key lines found. Comments and blank lines are skipped."
      : `${lines.length} ${lines.length === 1 ? "key line" : "key lines"}: ${problems} with problems, ${cautions} with cautions.`
    : "Paste keys to inspect them.";

  function setInput(value: string) {
    setRaw(value);
    setDetailLimit(DETAIL_STEP);
  }

  return (
    <ToolShell slug="ssh-key-inspector">
      <div className="space-y-6">
        <ToolPanel title="Keys">
          <label htmlFor="ssh-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste public keys, one per line: an authorized_keys file, .pub files, known_hosts lines or an SSH2 PUBLIC KEY block.
          </label>
          <textarea
            id="ssh-input"
            value={raw}
            onChange={(e) => setInput(e.target.value)}
            rows={8}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-describedby="ssh-hint"
            placeholder={'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... user@host\nrestrict,command="/usr/bin/backup" ssh-ed25519 AAAA... backup'}
            data-testid="input-ssh-keys"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <p id="ssh-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Public keys only. Up to {MAX_LINES.toLocaleString("en-US")} key lines or {MAX_INPUT_CHARS.toLocaleString("en-US")} characters, read in this tab.
          </p>
          {result?.capNote ? (
            <p role="alert" className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
              {result.capNote}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={LABEL}>Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setInput(ex.text)}
                data-testid={`button-example-${ex.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_IDLE}
              >
                {ex.label}
              </button>
            ))}
            {raw ? (
              <button type="button" onClick={() => setInput("")} data-testid="button-clear" className={CHIP_IDLE}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {lines.length ? (
          <ToolPanel title="Overview">
            <div className="overflow-x-auto">
              <table data-testid="table-ssh-overview" className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Line
                    </th>
                    <th scope="col" className={TH}>
                      Key
                    </th>
                    <th scope="col" className={TH}>
                      SHA256 fingerprint
                    </th>
                    <th scope="col" className={TH}>
                      Comment or hosts
                    </th>
                    <th scope="col" className={`${TH} pr-0`}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const tone = worstTone(l);
                    return (
                      <tr key={l.lineNumber} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                        <th scope="row" className="py-2.5 pr-4 font-mono-tight text-xs font-normal text-[hsl(var(--brand-ash))]">
                          {l.lineNumber}
                        </th>
                        <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{typeSummary(l)}</td>
                        <td className="max-w-[300px] break-all py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                          {l.sha256 ?? "none"}
                        </td>
                        <td className="max-w-[200px] break-all py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                          {l.source === "known_hosts" ? l.hosts : l.comment || "none"}
                        </td>
                        <td
                          className={`py-2.5 font-mono-tight text-xs uppercase tracking-[0.18em] ${
                            tone === "danger"
                              ? "text-[hsl(var(--brand-danger))]"
                              : tone === "warn"
                                ? "text-[hsl(var(--brand-amber))]"
                                : "text-[hsl(var(--brand-signal))]"
                          }`}
                        >
                          {statusText(l)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ToolPanel>
        ) : null}

        {lines.length ? (
          <div data-testid="list-ssh-results" className="space-y-6">
            {lines.slice(0, detailLimit).map((l) => (
              <LinePanel key={l.lineNumber} line={l} />
            ))}
            {lines.length > detailLimit ? (
              <button
                type="button"
                onClick={() => setDetailLimit((n) => n + DETAIL_STEP)}
                data-testid="button-more-lines"
                className={CHIP_IDLE}
              >
                Show details for {Math.min(DETAIL_STEP, lines.length - detailLimit)} more lines
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToolShell>
  );
}
