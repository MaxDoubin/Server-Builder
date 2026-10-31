/**
 * DKIM record analyzer.
 *
 * Reads a DKIM key record as published in DNS and, separately, a
 * DKIM-Signature header field, and says what a verifier would make of
 * each. The p= key is decoded locally with a small DER reader, so the RSA
 * modulus size or the Ed25519 key comes straight from the bytes. Nothing is
 * looked up: the dig command is for the reader to run.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel, ToolResult } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";
import {
  EXAMPLE_KEY_RECORDS,
  EXAMPLE_SIGNATURES,
  MAX_INPUT_LENGTH,
  analyzeKeyRecord,
  analyzeSignature,
  crossCheck,
  toZoneStrings,
  type Finding,
  type KeyRecord,
  type SignatureInfo,
  type TagRow,
  type Tone,
} from "@/lib/toolkit/dkim-record-analyzer";

const INPUT =
  "w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const PILL =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const PRE =
  "min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]";

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

const TONE_WORD: Record<Tone, string> = { ok: "Good", info: "Note", warn: "Caution", danger: "Problem" };

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function utc(seconds: number): string {
  const ms = seconds * 1000;
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return String(seconds);
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

/** Long base64 values are shortened in the tag table; the full text stays in the input. */
function shorten(value: string): string {
  const v = value.replace(/\s+/g, " ");
  return v.length > 120 ? `${v.slice(0, 64)} ... ${v.slice(-24)} (${v.replace(/\s/g, "").length} chars)` : v;
}

function FindingList({ findings, testId }: { findings: Finding[]; testId: string }) {
  if (findings.length === 0) {
    return (
      <p data-testid={testId} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        Nothing to report.
      </p>
    );
  }
  return (
    <ul className="space-y-2" data-testid={testId}>
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

function TagTable({ rows, testId }: { rows: TagRow[]; testId: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left" data-testid={testId}>
        <thead>
          <tr className="border-b border-[hsl(var(--brand-iron))]">
            <th scope="col" className={TH}>
              Tag
            </th>
            <th scope="col" className={TH}>
              Value
            </th>
            <th scope="col" className={`${TH} pr-0`}>
              Meaning
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.name}-${i}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
              <th
                scope="row"
                className={`py-3 pr-4 font-mono-tight text-sm font-normal ${
                  row.known ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-amber))]"
                }`}
              >
                {row.name}=
              </th>
              <td className="max-w-[320px] break-all py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                {row.value === "" ? <span className="text-[hsl(var(--brand-ash))]">(empty)</span> : shorten(row.value)}
              </td>
              <td className="py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">{row.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InputPanel({
  title,
  id,
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  examples,
  testId,
}: {
  title: string;
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  hint: string;
  placeholder: string;
  examples: { label: string; text: string }[];
  testId: string;
}) {
  return (
    <ToolPanel title={title}>
      <label htmlFor={id} className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={7}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        aria-invalid={error !== null}
        aria-describedby={`${id}-${error ? "error" : "hint"}`}
        placeholder={placeholder}
        data-testid={testId}
        className={`mt-3 ${INPUT}`}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" data-testid={`${testId}-error`} className={`mt-3 ${ERROR_BOX}`}>
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          {hint}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">Try</span>
        {examples.map((example) => (
          <button
            key={example.label}
            type="button"
            onClick={() => onChange(example.text)}
            data-testid={`button-example-${id}-${slug(example.label)}`}
            className={PILL}
          >
            {example.label}
          </button>
        ))}
        {value ? (
          <button type="button" onClick={() => onChange("")} data-testid={`button-clear-${id}`} className={PILL}>
            Clear
          </button>
        ) : null}
      </div>
    </ToolPanel>
  );
}

function keySummary(key: KeyRecord): string {
  if (key.revoked) return "Revoked key";
  const k = key.key;
  if (!k) return "Key unreadable";
  if (k.algorithm === "rsa") return `${k.bits} bit RSA`;
  if (k.algorithm === "ed25519") return "Ed25519";
  return k.algorithmName;
}

function KeyResults({ record }: { record: KeyRecord }) {
  const k = record.key;
  const zone = toZoneStrings(record.txt.text);
  const encoding =
    k === null
      ? null
      : k.encoding === "spki"
        ? "SubjectPublicKeyInfo (DER)"
        : k.encoding === "pkcs1"
          ? "Bare RSAPublicKey (DER)"
          : "Raw 32 bytes";
  const material = k?.modulus ? k.modulus.toString(16) : (k?.keyHex ?? null);

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Key record">
          <div
            data-testid="text-key-verdict"
            className={`mb-4 inline-flex min-h-[32px] items-center rounded-full border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] ${TONE_STYLE[record.verdict.tone]}`}
          >
            {record.verdict.label}
          </div>
          <ToolResult label="Key type (k=)" value={`${record.keyType}${record.keyTypeStated ? "" : " (default)"}`} />
          <ToolResult label="Key" value={keySummary(record)} testId="text-key-size" />
          {encoding ? <ToolResult label="Encoding" value={encoding} /> : null}
          {k?.exponent ? <ToolResult label="Public exponent" value={k.exponent.toString()} /> : null}
          {k ? <ToolResult label="Decoded size" value={`${k.byteLength} bytes`} /> : null}
          <ToolResult label="Version (v=)" value={record.version ?? "not stated (DKIM1)"} />
          <ToolResult label="Hashes (h=)" value={record.hashes ? record.hashes.join(", ") || "none" : "any"} />
          <ToolResult label="Services (s=)" value={record.services.join(", ") || "none"} />
          <ToolResult
            label="Flags (t=)"
            value={
              record.flags.length
                ? record.flags.map((f) => (f === "y" ? "y (testing)" : f === "s" ? "s (strict)" : f)).join(", ")
                : "none"
            }
          />
          {record.notes !== null ? <ToolResult label="Notes (n=)" value={record.notes || "(empty)"} mono={false} /> : null}
          <ToolResult
            label="Record length"
            value={`${new TextEncoder().encode(record.txt.text).length} bytes${
              record.txt.strings ? `, ${record.txt.strings.length} ${record.txt.strings.length === 1 ? "string" : "strings"}` : ""
            }`}
          />
        </ToolPanel>

        <ToolPanel title="Findings">
          <FindingList findings={record.findings} testId="list-key-findings" />
        </ToolPanel>
      </div>

      <ToolPanel title="Tags">
        <TagTable rows={record.tags} testId="table-key-tags" />
      </ToolPanel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Zone file form">
          <p className="mb-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            The record split into quoted strings of at most 255 bytes, ready to follow <code className="text-[hsl(var(--brand-cyan))]">IN TXT</code> in a zone file.
          </p>
          <div className="flex items-start gap-2">
            <pre className={`max-h-72 ${PRE}`} data-testid="text-zone-form">
              {zone}
            </pre>
            <CopyButton value={zone} label="Copy the zone file form" testId="button-copy-zone" />
          </div>
        </ToolPanel>

        {material ? (
          <ToolPanel title={k?.algorithm === "rsa" ? "Modulus (hex)" : "Public key (hex)"}>
            <p className="mb-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {k?.algorithm === "rsa"
                ? `The ${k.bits} bit modulus n, read out of the DER. Its length is the key size.`
                : "The 32 byte Ed25519 public key."}
            </p>
            <div className="flex items-start gap-2">
              <pre className={`max-h-72 ${PRE}`} data-testid="text-key-material">
                {material}
              </pre>
              <CopyButton value={material} label="Copy the key material" testId="button-copy-key" />
            </div>
          </ToolPanel>
        ) : null}
      </div>
    </>
  );
}

function SignatureResults({ sig }: { sig: SignatureInfo }) {
  const dig = sig.dnsName ? `dig +short TXT ${sig.dnsName}` : null;
  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Signature">
          <ToolResult label="Signing domain (d=)" value={sig.domain ?? "missing"} />
          <ToolResult label="Selector (s=)" value={sig.selector ?? "missing"} />
          <ToolResult label="Key lives at" value={sig.dnsName ?? "needs d= and s="} testId="text-dns-name" />
          <ToolResult label="Algorithm (a=)" value={sig.algorithm ?? "missing"} />
          <ToolResult
            label="Canonicalization"
            value={sig.canonHeader && sig.canonBody ? `${sig.canonHeader}/${sig.canonBody}` : "invalid"}
          />
          {sig.auid !== null ? <ToolResult label="Identity (i=)" value={sig.auid} /> : null}
          {sig.timestamp !== null ? <ToolResult label="Signed (t=)" value={utc(sig.timestamp)} /> : null}
          {sig.expiration !== null ? <ToolResult label="Expires (x=)" value={utc(sig.expiration)} /> : null}
          {sig.bodyLength !== null ? <ToolResult label="Body limit (l=)" value={`${sig.bodyLength} bytes`} /> : null}
          <ToolResult label="Body hash (bh=)" value={sig.bodyHashBytes === null ? "unreadable" : `${sig.bodyHashBytes} bytes`} />
          <ToolResult label="Signature (b=)" value={sig.signatureBytes === null ? "unreadable" : `${sig.signatureBytes} bytes`} />
          <ToolResult label="Query (q=)" value={sig.query} />
        </ToolPanel>

        <ToolPanel title="Signature findings">
          <FindingList findings={sig.findings} testId="list-signature-findings" />
        </ToolPanel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {dig ? (
          <ToolPanel title="Fetch the key">
            <p className="mb-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The record a verifier queries, selector then <code className="text-[hsl(var(--brand-cyan))]">_domainkey</code> then the signing
              domain. Run this, then paste the answer into the key record box.
            </p>
            <div className="flex items-start gap-2">
              <pre className={PRE} data-testid="text-dig-command">
                {dig}
              </pre>
              <CopyButton value={dig} label="Copy the dig command" testId="button-copy-dig" />
            </div>
          </ToolPanel>
        ) : null}

        <ToolPanel title={`Signed header fields (${sig.signedHeaders.length})`}>
          {sig.signedHeaders.length ? (
            <ol className="flex flex-wrap gap-2" data-testid="list-signed-headers">
              {sig.signedHeaders.map((h, i) => (
                <li
                  key={`${h}-${i}`}
                  className={`rounded-full border px-3 py-1 font-mono-tight text-xs ${
                    h.toLowerCase() === "from"
                      ? "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-signal))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))]"
                  }`}
                >
                  <span className="sr-only">{i + 1}. </span>
                  {h}
                </li>
              ))}
            </ol>
          ) : (
            <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">No h= list.</p>
          )}
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            In signing order. A name listed more times than the field occurs also signs its absence.
          </p>
        </ToolPanel>
      </div>

      <ToolPanel title="Signature tags">
        <TagTable rows={sig.tags} testId="table-signature-tags" />
      </ToolPanel>

      {sig.copied.length ? (
        <ToolPanel title="Copied header fields (z=)">
          <ul className="space-y-1">
            {sig.copied.map((c, i) => (
              <li key={i} className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                <span className="text-[hsl(var(--brand-signal))]">{c.name}:</span> {c.value}
              </li>
            ))}
          </ul>
        </ToolPanel>
      ) : null}
    </>
  );
}

export function DkimRecordAnalyzer() {
  const [record, setRecord] = useState("");
  const [signature, setSignature] = useState("");

  const keyOutcome = useMemo(() => analyzeKeyRecord(record), [record]);
  // x= and t= are judged against this device's clock at the moment of pasting.
  const sigOutcome = useMemo(() => analyzeSignature(signature, Date.now()), [signature]);
  const key = keyOutcome.kind === "ok" ? keyOutcome.value : null;
  const sig = sigOutcome.kind === "ok" ? sigOutcome.value : null;
  const pair = useMemo(() => (key && sig ? crossCheck(key, sig) : []), [key, sig]);

  const parts: string[] = [];
  if (key) parts.push(`Key: ${keySummary(key)}, ${key.verdict.label.toLowerCase()}.`);
  if (sig) parts.push(`Signature: ${sig.domain ?? "no domain"}, selector ${sig.selector ?? "missing"}.`);
  const summary = parts.length
    ? parts.join(" ")
    : keyOutcome.kind === "error" || sigOutcome.kind === "error"
      ? "Nothing decoded."
      : "Paste a key record, a DKIM-Signature, or both.";

  return (
    <ToolShell slug="dkim-record-analyzer">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <InputPanel
            title="Key record"
            id="dkim-record"
            label="Paste the TXT record from selector._domainkey.domain. Quoted strings, a zone file line or dig output all work."
            value={record}
            onChange={setRecord}
            error={keyOutcome.kind === "error" ? keyOutcome.message : null}
            hint={`Strings are joined the way a verifier joins them. Up to ${MAX_INPUT_LENGTH.toLocaleString("en-US")} characters.`}
            placeholder="v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
            examples={EXAMPLE_KEY_RECORDS}
            testId="input-dkim-record"
          />
          <InputPanel
            title="DKIM-Signature"
            id="dkim-signature"
            label="Optionally, paste a DKIM-Signature header field from a message. Folded lines are fine."
            value={signature}
            onChange={setSignature}
            error={sigOutcome.kind === "error" ? sigOutcome.message : null}
            hint="It names the domain and selector to query, and with a key above the two are checked against each other."
            placeholder="DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=example.com; s=s2026; ..."
            examples={EXAMPLE_SIGNATURES}
            testId="input-dkim-signature"
          />
        </div>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="break-words font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {key && sig ? (
          <ToolPanel title="Key and signature together">
            <FindingList findings={pair} testId="list-pair-findings" />
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Without the message itself, this checks only whether the key could have made the signature. Verification needs the
              exact headers and body that were signed.
            </p>
          </ToolPanel>
        ) : null}

        {key ? <KeyResults record={key} /> : null}
        {sig ? <SignatureResults sig={sig} /> : null}
      </div>
    </ToolShell>
  );
}
