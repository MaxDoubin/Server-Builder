/**
 * Email header analyzer.
 *
 * Takes a pasted header section, unfolds it, and lays out what it records:
 * the Received path in the order the servers saw the message, the
 * authentication verdicts the receiving server wrote, how the From,
 * Return-Path and Reply-To domains line up, and any encoded-words decoded.
 * Everything is read from the text. Nothing is looked up and nothing leaves
 * the tab, which matters because headers carry addresses and internal names.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel, ToolResult } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";
import {
  CLOCK_SKEW_SECONDS,
  EXAMPLE_HEADERS,
  LONG_DELAY_SECONDS,
  MAX_HEADER_INPUT,
  analyzeHeaders,
  formatDuration,
  type AuthRow,
  type EmailAnalysis,
  type Finding,
  type IpInfo,
  type IpKind,
  type Mailbox,
  type ReceivedHop,
  type Tone,
} from "@/lib/toolkit/email-header-analyzer";

const INPUT =
  "w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const PILL =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const TD = "py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]";
const SUMMARY =
  "flex min-h-[44px] cursor-pointer items-center font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};
const TONE_WORD: Record<Tone, string> = { ok: "Good", info: "Note", warn: "Caution", danger: "Problem" };

const TEXT_TONE = {
  signal: "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-signal))]",
  amber: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.6)] text-[hsl(var(--brand-danger))]",
  bone: "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))]",
  dim: "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))]",
  ash: "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]",
};

function ipTone(kind: IpKind): string {
  if (kind === "public") return TEXT_TONE.bone;
  if (kind === "documentation") return TEXT_TONE.dim;
  if (kind === "private" || kind === "shared" || kind === "unique-local") return TEXT_TONE.amber;
  return TEXT_TONE.ash;
}

function resultTone(result: string): string {
  if (result === "pass") return TEXT_TONE.signal;
  if (result === "fail" || result === "permerror" || result === "hardfail") return TEXT_TONE.danger;
  if (["softfail", "neutral", "none", "temperror", "policy"].includes(result)) return TEXT_TONE.amber;
  return TEXT_TONE.ash;
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function utc(ms: number): string {
  return new Date(ms).toISOString().replace(".000Z", "Z").replace("T", " ");
}

function mailbox(m: Mailbox | null): string {
  if (!m) return "absent";
  if (m.nullPath) return "<> (null reverse path)";
  return m.display ? `${m.display} <${m.address}>` : (m.address ?? "");
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)} ... (${text.length} chars)` : text;
}

function Chip({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono-tight text-xs ${tone}`}>{children}</span>
  );
}

function IpChips({ ips }: { ips: IpInfo[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {ips.map((ip) => (
        <Chip key={ip.address} tone={ipTone(ip.kind)}>
          <span className="break-all">{ip.address}</span>
          <span className="ml-1.5 text-[hsl(var(--brand-ash))]">{ip.kind}</span>
        </Chip>
      ))}
    </span>
  );
}

function FindingList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <p data-testid="list-findings" className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        Nothing to report.
      </p>
    );
  }
  return (
    <ul className="space-y-2" data-testid="list-findings">
      {findings.map((finding) => (
        <li
          key={finding.text}
          className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[finding.tone]}`}
        >
          <span className="sr-only">{TONE_WORD[finding.tone]}: </span>
          {finding.text}
        </li>
      ))}
    </ul>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className={`${LABEL} pt-0.5`}>{label}</dt>
      <dd className="min-w-0 break-words font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{children}</dd>
    </>
  );
}

function delayLabel(hop: ReceivedHop): { text: string; tone: string } {
  if (hop.index === 1) return { text: "origin", tone: TEXT_TONE.ash };
  if (hop.delay === null) return { text: "delay unknown", tone: TEXT_TONE.ash };
  if (hop.delay > LONG_DELAY_SECONDS) return { text: `+${formatDuration(hop.delay)}`, tone: TEXT_TONE.amber };
  if (hop.delay < -CLOCK_SKEW_SECONDS) return { text: `${formatDuration(hop.delay)}, clock skew`, tone: TEXT_TONE.amber };
  return { text: hop.delay < 0 ? formatDuration(hop.delay) : `+${formatDuration(hop.delay)}`, tone: TEXT_TONE.dim };
}

function HopCard({ hop }: { hop: ReceivedHop }) {
  const delay = delayLabel(hop);
  const otherHosts = hop.fromHosts.filter((h) => h !== (hop.fromName ?? "").toLowerCase().replace(/\.$/, ""));
  return (
    <li className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
          Hop {hop.index}
        </span>
        <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
          {hop.time !== null ? `${utc(hop.time)} UTC` : "no readable timestamp"}
        </span>
        <Chip tone={delay.tone}>{delay.text}</Chip>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <Detail label="From">{hop.fromName ?? <span className="text-[hsl(var(--brand-ash))]">not stated</span>}</Detail>
        {hop.fromIps.length ? (
          <Detail label="From address">
            <IpChips ips={hop.fromIps} />
          </Detail>
        ) : null}
        {otherHosts.length ? <Detail label="Other names">{otherHosts.join(", ")}</Detail> : null}
        <Detail label="By">{hop.byName ?? <span className="text-[hsl(var(--brand-ash))]">not stated</span>}</Detail>
        {hop.byIps.length ? (
          <Detail label="By address">
            <IpChips ips={hop.byIps} />
          </Detail>
        ) : null}
        <Detail label="Protocol">
          {hop.protocol ?? "not stated"}
          <span className="ml-2 text-xs text-[hsl(var(--brand-ash))]">
            {hop.tls === true ? "TLS" : hop.tls === false ? "no TLS recorded" : "TLS unknown"}
          </span>
        </Detail>
        {hop.id ? <Detail label="Queue ID">{hop.id}</Detail> : null}
        {hop.recipient ? <Detail label="For">{hop.recipient}</Detail> : null}
        {hop.dateError ? <Detail label="Timestamp">{hop.dateError}</Detail> : null}
      </dl>
      <details className="mt-2">
        <summary className={SUMMARY}>Raw line</summary>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          Received: {hop.raw}
        </pre>
      </details>
    </li>
  );
}

function AuthTable({ rows }: { rows: AuthRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-left" data-testid="table-auth">
        <thead>
          <tr className="border-b border-[hsl(var(--brand-iron))]">
            <th scope="col" className={TH}>
              Check
            </th>
            <th scope="col" className={TH}>
              Result
            </th>
            <th scope="col" className={TH}>
              For
            </th>
            <th scope="col" className={`${TH} pr-0`}>
              Recorded by
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.method}-${i}`}
              className={`border-b border-[hsl(var(--brand-iron)/0.5)] align-top ${r.primary ? "" : "opacity-70"}`}
            >
              <th scope="row" className={`${TD} font-normal uppercase`}>
                {r.method}
              </th>
              <td className={TD}>
                <Chip tone={resultTone(r.result)}>{r.result}</Chip>
                {r.reason ? <span className="mt-1 block text-xs text-[hsl(var(--brand-ash))]">reason {r.reason}</span> : null}
              </td>
              <td className={`${TD} break-all`}>
                {r.identity ?? <span className="text-[hsl(var(--brand-ash))]">not stated</span>}
                {r.comment ? (
                  <span className="mt-1 block break-words text-xs leading-relaxed text-[hsl(var(--brand-ash))]">{r.comment}</span>
                ) : null}
              </td>
              <td className={`${TD} break-all pr-0 text-xs text-[hsl(var(--brand-bone-dim))]`}>
                {r.authservId ?? "no authserv-id"}
                {r.primary ? "" : " (upstream)"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Results({ a }: { a: EmailAnalysis }) {
  const unfolded = a.fields.map((f) => `${f.name}: ${f.value}`).join("\n");
  const toText = a.to.length ? a.to.slice(0, 3).map(mailbox).join(", ") + (a.to.length > 3 ? ` and ${a.to.length - 3} more` : "") : "absent";

  return (
    <>
      <ToolPanel title={`Findings (${a.findings.length})`}>
        <FindingList findings={a.findings} />
      </ToolPanel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Message">
          <ToolResult label="From" value={mailbox(a.from)} testId="text-from" />
          {a.replyTo.length ? <ToolResult label="Reply-To" value={a.replyTo.map(mailbox).join(", ")} /> : null}
          <ToolResult label="Return-Path" value={mailbox(a.returnPath)} />
          {a.sender ? <ToolResult label="Sender" value={mailbox(a.sender)} /> : null}
          <ToolResult label="To" value={toText} />
          <ToolResult label="Subject" value={a.subject ?? "absent"} mono={false} testId="text-subject" />
          <ToolResult
            label="Date"
            value={a.date ? (a.date.ms !== null ? `${a.date.text} (${utc(a.date.ms)} UTC)` : `${a.date.text} (unreadable)`) : "absent"}
          />
          <ToolResult
            label="Message-ID"
            value={a.messageId ? `${a.messageId.value}${a.messageId.domain ? `, domain ${a.messageId.domain}` : ""}` : "absent"}
          />
          {a.originatingIp ? (
            <ToolResult label="X-Originating-IP" value={`${a.originatingIp.address} (${a.originatingIp.kind})`} />
          ) : null}
          <ToolResult
            label="Transit"
            value={
              a.transitSeconds !== null
                ? `${formatDuration(a.transitSeconds)} across ${a.hops.length} hops`
                : `${a.hops.length} ${a.hops.length === 1 ? "hop" : "hops"}`
            }
            testId="text-transit"
          />
        </ToolPanel>

        <ToolPanel title="Authentication">
          {a.auth.length ? (
            <AuthTable rows={a.auth} />
          ) : (
            <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">No Authentication-Results field.</p>
          )}
          {a.receivedSpf.length ? (
            <div className="mt-4">
              <h3 className={LABEL}>Received-SPF</h3>
              <ul className="mt-2 space-y-1">
                {a.receivedSpf.map((s, i) => (
                  <li key={i} className="break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    <Chip tone={resultTone(s.result)}>{s.result || "unstated"}</Chip>{" "}
                    {s.pairs["client-ip"] ? `client ${s.pairs["client-ip"]}` : ""}
                    {s.pairs["envelope-from"] ? `, envelope ${s.pairs["envelope-from"]}` : ""}
                    {s.pairs.helo ? `, helo ${s.pairs.helo}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {a.dkimSignatures.length ? (
            <div className="mt-4">
              <h3 className={LABEL}>DKIM-Signature fields</h3>
              <ul className="mt-2 space-y-1">
                {a.dkimSignatures.map((s, i) => (
                  <li key={i} className="break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    d={s.domain ?? "?"} s={s.selector ?? "?"} a={s.algorithm ?? "?"}
                    {s.dnsName ? <span className="block text-[hsl(var(--brand-cyan))]">key at {s.dnsName}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Only results written by your own receiving server mean anything. Dimmed rows came from another authserv-id.
          </p>
        </ToolPanel>
      </div>

      {a.domains.length ? (
        <ToolPanel title="Domains against From">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-domains">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH}>
                    Where
                  </th>
                  <th scope="col" className={TH}>
                    Value
                  </th>
                  <th scope="col" className={TH}>
                    Domain
                  </th>
                  <th scope="col" className={`${TH} pr-0`}>
                    Aligned
                  </th>
                </tr>
              </thead>
              <tbody>
                {a.domains.map((d, i) => (
                  <tr key={`${d.role}-${i}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                    <th scope="row" className={`${TD} whitespace-nowrap font-normal text-[hsl(var(--brand-bone-dim))]`}>
                      {d.role}
                    </th>
                    <td className={`${TD} max-w-[280px] break-all text-xs`}>{d.value}</td>
                    <td className={`${TD} break-all`}>{d.domain ?? "none"}</td>
                    <td className={`${TD} pr-0`}>
                      {d.aligned === null ? (
                        <span className="text-[hsl(var(--brand-ash))]">n/a</span>
                      ) : (
                        <Chip tone={d.aligned ? TEXT_TONE.signal : TEXT_TONE.amber}>
                          {d.aligned ? (d.strict ? "exact" : "relaxed") : "no"}
                        </Chip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Relaxed means the same organizational domain, the DMARC default. That is worked out from a short list of public suffixes
            rather than the full Public Suffix List, so treat an unusual suffix with care.
          </p>
        </ToolPanel>
      ) : null}

      <ToolPanel title={`Route, first server first (${a.hops.length})`}>
        {a.hops.length ? (
          <ol className="space-y-3" data-testid="list-hops">
            {a.hops.map((hop) => (
              <HopCard key={hop.index} hop={hop} />
            ))}
          </ol>
        ) : (
          <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">No Received fields.</p>
        )}
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          Each server adds its Received line on top, so the bottom line is the first hop. Only lines added by servers you trust are
          reliable; anything below them could have been written by the sender.
        </p>
      </ToolPanel>

      {a.encoded.length ? (
        <ToolPanel title="Encoded words">
          <ul className="space-y-3" data-testid="list-encoded">
            {a.encoded.map((e, i) => (
              <li key={i} className="border-b border-[hsl(var(--brand-iron)/0.5)] pb-3 last:border-b-0">
                <div className={LABEL}>{e.name}</div>
                <div className="mt-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{clip(e.raw, 400)}</div>
                <div className="mt-1 break-words font-display text-sm text-[hsl(var(--brand-bone))]">{e.decoded}</div>
                {e.errors.length ? (
                  <div className="mt-1 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">{e.errors.join("; ")}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </ToolPanel>
      ) : null}

      {a.xHeaders.length ? (
        <ToolPanel title={`X- and client fields (${a.xHeaders.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-x-headers">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH}>
                    Field
                  </th>
                  <th scope="col" className={TH}>
                    Value
                  </th>
                  <th scope="col" className={`${TH} pr-0`}>
                    What it is
                  </th>
                </tr>
              </thead>
              <tbody>
                {a.xHeaders.map((x, i) => (
                  <tr key={`${x.name}-${i}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                    <th scope="row" className={`${TD} break-all font-normal text-[hsl(var(--brand-signal))]`}>
                      {x.name}
                    </th>
                    <td className={`${TD} max-w-[280px] break-all text-xs`}>
                      {clip(x.value, 300)}
                      {x.detail ? <span className="mt-1 block text-[hsl(var(--brand-cyan))]">{x.detail}</span> : null}
                    </td>
                    <td className={`${TD} pr-0 text-xs leading-relaxed text-[hsl(var(--brand-ash))]`}>{x.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolPanel>
      ) : null}

      <ToolPanel title={`All fields, unfolded (${a.fields.length})`}>
        <details>
          <summary className={SUMMARY}>Show every field</summary>
          <div className="mt-2 flex items-start gap-2">
            <pre
              className="max-h-96 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="text-unfolded"
            >
              {unfolded}
            </pre>
            <CopyButton value={unfolded} label="Copy the unfolded fields" testId="button-copy-unfolded" />
          </div>
        </details>
      </ToolPanel>
    </>
  );
}

export function EmailHeaderAnalyzer() {
  const [raw, setRaw] = useState("");
  const outcome = useMemo(() => analyzeHeaders(raw), [raw]);
  const a = outcome.kind === "ok" ? outcome.value : null;

  const summary = a
    ? `${a.fields.length} ${a.fields.length === 1 ? "field" : "fields"}, ${a.hops.length} ${a.hops.length === 1 ? "hop" : "hops"}${
        a.transitSeconds !== null ? ` over ${formatDuration(a.transitSeconds)}` : ""
      }, ${a.auth.length} authentication ${a.auth.length === 1 ? "result" : "results"}, ${
        a.findings.filter((f) => f.tone === "danger" || f.tone === "warn").length
      } flagged.`
    : outcome.kind === "error"
      ? "Nothing read."
      : "Paste a header section to analyze it.";

  return (
    <ToolShell slug="email-header-analyzer">
      <div className="space-y-6">
        <ToolPanel title="Headers">
          <label htmlFor="email-headers" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste the raw headers, from Show original, View source or Message details. A whole message works too; reading stops at
            the blank line before the body.
          </label>
          <textarea
            id="email-headers"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={12}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={outcome.kind === "error"}
            aria-describedby={outcome.kind === "error" ? "email-headers-error" : "email-headers-hint"}
            placeholder={"Received: from mail.example.com (mail.example.com [192.0.2.25])\n        by mx.example.net with ESMTPS id ...;\n        Tue, 13 Oct 2026 09:14:06 -0700\nFrom: Alice <alice@example.com>"}
            data-testid="input-headers"
            className={`mt-3 ${INPUT}`}
          />
          {outcome.kind === "error" ? (
            <p id="email-headers-error" role="alert" data-testid="text-headers-error" className={`mt-3 ${ERROR_BOX}`}>
              {outcome.message}
            </p>
          ) : (
            <p id="email-headers-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Read in this tab and never sent anywhere. The first {Math.round(MAX_HEADER_INPUT / 1024)} KB are read, which is far more
              than any real header section.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">Try</span>
            {EXAMPLE_HEADERS.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setRaw(example.text)}
                data-testid={`button-example-${slug(example.label)}`}
                className={PILL}
              >
                {example.label}
              </button>
            ))}
            {raw ? (
              <button type="button" onClick={() => setRaw("")} data-testid="button-clear" className={PILL}>
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

        {a ? <Results a={a} /> : null}
      </div>
    </ToolShell>
  );
}
