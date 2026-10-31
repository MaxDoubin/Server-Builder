/**
 * PKCS#10 certificate signing request decoder.
 *
 * Reads a CSR as PEM, bare Base64 or hex, or a DER file, shows what it asks
 * a CA to certify, and runs the checks a CA runs before signing. The
 * request's self-signature, which proves the requester holds the private
 * key, is checked with the browser's Web Crypto API. The parsing lives in
 * lib/toolkit/asn1 (shared with the certificate decoder) and
 * lib/toolkit/csr-decoder; this file is layout. Nothing is stored and no
 * request is made.
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "wouter";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  MAX_FILE_BYTES,
  readBinary,
  readPemText,
  verifySignature,
  type DistinguishedName,
  type ExtensionView,
  type InputNotice,
  type ReadResult,
  type VerifyResult,
} from "@/lib/toolkit/asn1";
import type { Finding, Tone } from "@/lib/toolkit/certificate-decoder";
import {
  KEY_OPTIONS,
  buildTemplate,
  csrSans,
  decodeCsrs,
  fileStem,
  reviewCsr,
  shellQuote,
  templateFromCsr,
  type CsrInfo,
  type KeyOptionId,
} from "@/lib/toolkit/csr-decoder";

/* ---------------------------------------------------------------- samples */

/*
  Requests generated with openssl req for this page, for made-up names
  under example.com. The weak one has an RSA-1024 key, a SHA-1 signature,
  a common name missing from its SANs, a single-label name and a
  challengePassword; the wildcard one has every wildcard mistake.
*/
const SAMPLE_GOOD = `-----BEGIN CERTIFICATE REQUEST-----
MIIBWDCB/gIBADA9MQswCQYDVQQGEwJVUzEUMBIGA1UECgwLRXhhbXBsZSBPcmcx
GDAWBgNVBAMMD3d3dy5leGFtcGxlLmNvbTBZMBMGByqGSM49AgEGCCqGSM49AwEH
A0IABJUtneJ9pAYfRQQJibUmcuDeb5Rr1nZOhQ+eBFumrSs/jNFrtfFZnoezwIew
fTOcs23o3uAOMcn6X0OkVzRxzEqgXzBdBgkqhkiG9w0BCQ4xUDBOMCcGA1UdEQQg
MB6CD3d3dy5leGFtcGxlLmNvbYILZXhhbXBsZS5jb20wDgYDVR0PAQH/BAQDAgeA
MBMGA1UdJQQMMAoGCCsGAQUFBwMBMAoGCCqGSM49BAMCA0kAMEYCIQDgC0KQEcTh
lF36azB4ritsCOLUUiKJZvpUJL3BXRjaQAIhAKUtqAni2QTnpr5gRfjAyGxAMWc4
1rKYbBIWGyam25Dr
-----END CERTIFICATE REQUEST-----
`;
const SAMPLE_WEAK = `-----BEGIN CERTIFICATE REQUEST-----
MIIBqjCCARMCAQAwHTEbMBkGA1UEAwwScG9ydGFsLmV4YW1wbGUuY29tMIGfMA0G
CSqGSIb3DQEBAQUAA4GNADCBiQKBgQDF6DPOFluiKAszBdqGacMV1eZTaYWWRkJ7
CGTRPP15qHvLQIS/YMpNXL6Bl0Xu7skXJvEIoyTjp4ZC/MvWao4Em0CB326L1+OC
1sqiNwS4j00Wc0GVVSbdEZGzdtieRxQCZs4JljzXln4dthlmAu8tpLX7pwWhZgbY
aGxREm8QgQIDAQABoE0wFgYJKoZIhvcNAQkHMQkMB2h1bnRlcjIwMwYJKoZIhvcN
AQkOMSYwJDAiBgNVHREEGzAZgg0qLmV4YW1wbGUuY29tgghpbnRyYW5ldDANBgkq
hkiG9w0BAQUFAAOBgQCH7i7HnnAyeAxX6MOPzBiRwvYEldpXwjXwhixj23k71jlS
EQk4Z/ek05WwiVgOBYRjSHwwz2aCAjmn3+XUL30XN5kVqEPG8kRL9hwv3rgsBNm4
0Uy+wA5UFgClR3rr4Sh0WKh//V5TDesudpDK5pGcVgzMKv2q+1SJ1zIVV6/Nbw==
-----END CERTIFICATE REQUEST-----
`;
const SAMPLE_CN_ONLY = `-----BEGIN CERTIFICATE REQUEST-----
MIICqDCCAZACAQAwYzELMAkGA1UEBhMCVVMxDzANBgNVBAgMBk5ldmFkYTESMBAG
A1UEBwwJTGFzIFZlZ2FzMRQwEgYDVQQKDAtFeGFtcGxlIE9yZzEZMBcGA1UEAwwQ
bWFpbC5leGFtcGxlLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEB
AKhtelniJ1SAw4NC6uFgl01jEHg7HunYgUV3g/UHQZZ39qB3qpLnh5LCXVx4zHKH
eH6ntkVbMKYkT6pQhyQQ2JULqVyPzTnHDvXgvQEEHivrFcUF8492JirQfLyaPQSO
/H8OSCGDEQPvGm6BiX6Iou2g9n7d2ySAs38sD1+US3ebW9t1Td6KdE69hOYwn1p8
aHNHGsQXA9j81NhcEOqvNjxK1qKRK2ltUVYUep6zQtiyGnUjkeruY6cdlUdgtpeR
9UOkZtlqC0zp4RBj333DxDkKsaLgXwu1CAWEclKLMynpCBa5E6pr4CvADzyiQJR+
R/MiX5W4SCrbdxKxwwmw2+8CAwEAAaAAMA0GCSqGSIb3DQEBCwUAA4IBAQBpaTDX
9S0Pc8qv7uKQfqWlXp3bbkMFo5MeEH9IZmDk35hx/jAEhef6gpphECPt6RZ8ZdXx
GZxeuwhxBeLlaKcZaWXekklPcE7irbIgp21vVOr3AEcJqiwILVhdrrEylmHaZgAS
2VqnofNiR5++xdYV8msWZo9KPnqSTn+QlBlcTxEiqHEvVcn+bO6lTP4UOUaqvBYL
eBt3IKGCRBdO1k/YFINP7MgVsm4WGdQeOsFSh4pgNP1fmLpmXpn4PL1ViRdHO6gx
CHgybCPDWzS17+zN9rxekF/HZ6Y9jBqT3bt9UQiBluVAsNrJLNU9YeXrxZqJHmgo
zFMMrXcNWJjubZel
-----END CERTIFICATE REQUEST-----
`;
const SAMPLE_WILDCARDS = `-----BEGIN CERTIFICATE REQUEST-----
MIIBajCB8AIBADAYMRYwFAYDVQQDDA0qLmV4YW1wbGUuY29tMHYwEAYHKoZIzj0C
AQYFK4EEACIDYgAEy4bOnxNuulRImY8iI8V+v+j5BORRIsmYVGVdAZLX824jPVZ2
l2bYOZhi42j3uJf9FkJSORRK5TZk2uZH+TJSQ79sTy9t79rVbNGUUjXu8Ntt728G
O2sWBiRdr1ydu0lJoFkwVwYJKoZIhvcNAQkOMUowSDBGBgNVHREEPzA9gg0qLmV4
YW1wbGUuY29tgg53Ki5leGFtcGxlLm5ldIIPYS4qLmV4YW1wbGUub3JnggUqLmNv
bYcECgECAzAKBggqhkjOPQQDAgNpADBmAjEAyRZUu5G4NsMmxtlZzyM6jtv7UGQw
Cn9GAwc9wDFtFZV4+QB4SXgHc3mrY38iLWsyAjEAtvBw4INKGDBWB62Ks85/Tvmr
b1f4yFG8VewIgOqQfJfb6mf3ZT7EPegN86pluFSq
-----END CERTIFICATE REQUEST-----
`;

const EXAMPLES: { id: string; label: string; text: string }[] = [
  { id: "good", label: "Good request", text: SAMPLE_GOOD },
  { id: "weak", label: "Weak request", text: SAMPLE_WEAK },
  { id: "cn-only", label: "CN only", text: SAMPLE_CN_ONLY },
  { id: "wildcards", label: "Bad wildcards", text: SAMPLE_WILDCARDS },
];

/* ------------------------------------------------------------------ style */

const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const TAB_CLASS =
  "inline-flex min-h-[44px] max-w-full items-center break-all rounded-lg border px-4 py-2 text-left font-mono-tight text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const LABEL_CLASS = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

const INPUT_CLASS =
  "mt-2 min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";

const SELECT_CLASS =
  "mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";

const PRE_CLASS =
  "min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]";

const BUTTON_CLASS =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

const TONE_LABEL: Record<Tone, string> = { ok: "OK", info: "Note", warn: "Warning", danger: "Problem" };

const VERIFY_TONE: Record<VerifyResult["status"], Tone> = { valid: "ok", invalid: "danger", unsupported: "info", error: "warn" };

/* ---------------------------------------------------------------- helpers */

function FindingList({ findings, testId }: { findings: Finding[]; testId?: string }) {
  if (findings.length === 0) return null;
  return (
    <ul className="space-y-2" data-testid={testId}>
      {findings.map((finding, i) => (
        <li key={i} className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[finding.tone]}`}>
          <strong className="font-normal uppercase tracking-[0.2em]">{TONE_LABEL[finding.tone]}: </strong>
          {finding.text}
        </li>
      ))}
    </ul>
  );
}

function noticeFindings(notices: InputNotice[]): Finding[] {
  return notices.map((n) => ({ tone: n.tone, text: n.text }));
}

function NameTable({ name }: { name: DistinguishedName }) {
  const attrs = name.rdns.flatMap((rdn, r) => rdn.map((attr, a) => ({ attr, key: `${r}-${a}`, joined: a > 0 })));
  if (attrs.length === 0) {
    return (
      <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        The subject is empty. That is allowed when every name is in the subjectAltName, which a CA then marks critical.
      </p>
    );
  }
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] border-collapse text-left">
          <caption className="sr-only">Subject distinguished name</caption>
          <thead>
            <tr className="border-b border-[hsl(var(--brand-iron))]">
              <th scope="col" className={`py-2 pr-4 font-normal ${LABEL_CLASS}`}>
                Attribute
              </th>
              <th scope="col" className={`py-2 font-normal ${LABEL_CLASS}`}>
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {attrs.map(({ attr, key, joined }) => (
              <tr key={key} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                <th scope="row" className="py-2 pr-4 font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone-dim))]">
                  {joined ? <span aria-hidden>+ </span> : null}
                  {attr.label} <span className="text-[hsl(var(--brand-ash))]">({attr.short})</span>
                </th>
                <td className="break-all py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                  {attr.display}
                  <span className="mt-0.5 block text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">{attr.valueType}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={LABEL_CLASS}>RFC 4514</span>
          <code className="min-w-0 flex-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">{name.rfc4514}</code>
          <CopyButton value={name.rfc4514} label="Copy the subject as an RFC 4514 string" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={LABEL_CLASS}>-subj</span>
          <code className="min-w-0 flex-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">{name.openssl}</code>
          <CopyButton value={name.openssl} label="Copy the subject in OpenSSL -subj form" />
        </div>
      </div>
    </>
  );
}

function ExtensionBlock({ ext }: { ext: ExtensionView }) {
  return (
    <li className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="break-all font-mono-tight text-sm text-[hsl(var(--brand-signal))]">{ext.name}</h3>
        <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
          {ext.critical ? <span className="text-[hsl(var(--brand-amber))]">critical, </span> : null}
          {ext.oid}
        </span>
      </div>
      {ext.error ? (
        <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">{ext.error}</p>
      ) : (
        <dl className="mt-2 space-y-1.5">
          {ext.rows.map((row, i) => (
            <div key={i} className="grid grid-cols-1 gap-x-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <dt className="font-mono-tight text-[0.625rem] uppercase leading-5 tracking-[0.2em] text-[hsl(var(--brand-ash))]">{row.label}</dt>
              <dd className="break-all font-mono-tight text-xs leading-5 text-[hsl(var(--brand-bone))]">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--brand-iron)/0.5)] py-2.5 last:border-b-0">
      <span className={LABEL_CLASS}>{label}</span>
      <div className="flex min-w-0 flex-1 basis-64 items-center justify-end gap-2">
        <span className="min-w-0 break-all text-right font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{value}</span>
        <CopyButton value={value} label={`Copy ${label}`} />
      </div>
    </div>
  );
}

function CommandBlock({ value, label, testId }: { value: string; label: string; testId?: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <pre className={PRE_CLASS} data-testid={testId}>
        {value}
      </pre>
      <CopyButton value={value} label={label} />
    </div>
  );
}

/* ------------------------------------------------------------- generator */

interface TemplateFields {
  commonName: string;
  organization: string;
  country: string;
  sans: string;
  key: KeyOptionId;
}

const DEFAULT_TEMPLATE: TemplateFields = {
  commonName: "www.example.com",
  organization: "",
  country: "",
  sans: "www.example.com\nexample.com",
  key: "p256",
};

function Generator({ fields, onChange }: { fields: TemplateFields; onChange: (next: TemplateFields) => void }) {
  const out = useMemo(() => buildTemplate(fields), [fields]);
  const set = <K extends keyof TemplateFields>(key: K, value: TemplateFields[K]) => onChange({ ...fields, [key]: value });
  const problems: Finding[] = [...out.errors.map((text) => ({ tone: "danger" as const, text })), ...out.warnings.map((text) => ({ tone: "warn" as const, text }))];

  return (
    <ToolPanel title="Generate a request with SANs">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor="gen-cn" className={LABEL_CLASS}>
            Common name
          </label>
          <input
            id="gen-cn"
            type="text"
            value={fields.commonName}
            onChange={(event) => set("commonName", event.target.value)}
            maxLength={256}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            placeholder="www.example.com"
            data-testid="input-template-cn"
            className={INPUT_CLASS}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor="gen-key" className={LABEL_CLASS}>
            Key
          </label>
          <select
            id="gen-key"
            value={fields.key}
            onChange={(event) => set("key", event.target.value as KeyOptionId)}
            data-testid="select-template-key"
            className={SELECT_CLASS}
          >
            {KEY_OPTIONS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="gen-org" className={LABEL_CLASS}>
            Organization (optional)
          </label>
          <input
            id="gen-org"
            type="text"
            value={fields.organization}
            onChange={(event) => set("organization", event.target.value)}
            maxLength={256}
            autoComplete="off"
            placeholder="Example Org"
            data-testid="input-template-org"
            className={INPUT_CLASS}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor="gen-country" className={LABEL_CLASS}>
            Country (optional, two letters)
          </label>
          <input
            id="gen-country"
            type="text"
            value={fields.country}
            onChange={(event) => set("country", event.target.value)}
            maxLength={8}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="US"
            data-testid="input-template-country"
            className={INPUT_CLASS}
          />
        </div>
      </div>
      <label htmlFor="gen-sans" className={`mt-4 block ${LABEL_CLASS}`}>
        Subject alternative names: host names, IP addresses, email addresses or URIs, one per line
      </label>
      <textarea
        id="gen-sans"
        value={fields.sans}
        onChange={(event) => set("sans", event.target.value)}
        rows={4}
        maxLength={20_000}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        data-testid="input-template-sans"
        className={`${INPUT_CLASS} resize-y text-xs leading-relaxed`}
      />

      {problems.length > 0 ? (
        <div className="mt-4">
          <FindingList findings={problems} testId="list-template-problems" />
        </div>
      ) : null}

      {out.errors.length === 0 ? (
        <div className="mt-5 space-y-5" data-testid="output-template">
          <div>
            <div className={LABEL_CLASS}>One command (OpenSSL 1.1.1 or later)</div>
            <div className="mt-2">
              <CommandBlock value={out.oneLiner} label="Copy the openssl req command" testId="text-template-command" />
            </div>
          </div>
          <div>
            <div className={LABEL_CLASS}>Or a config file, saved as csr.cnf</div>
            <div className="mt-2 space-y-2">
              <CommandBlock value={out.config} label="Copy the csr.cnf file" testId="text-template-config" />
              <CommandBlock value={out.configCommand} label="Copy the command that uses csr.cnf" />
            </div>
          </div>
          <div>
            <div className={LABEL_CLASS}>Then check what was written</div>
            <div className="mt-2">
              <CommandBlock value={out.inspect} label="Copy the inspection command" />
            </div>
          </div>
          <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            -nodes writes the private key unencrypted so a server can start without a passphrase. Keep the .key file readable only by its
            owner (chmod 600) and never send it to the CA: the CSR carries the public key, and that is all a CA needs.
          </p>
        </div>
      ) : null}
    </ToolPanel>
  );
}

/* ------------------------------------------------------------------- page */

interface Verdict {
  csr: CsrInfo;
  result: VerifyResult;
}

export function CsrDecoder() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; size: number; result: ReadResult } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [template, setTemplate] = useState<TemplateFields>(DEFAULT_TEMPLATE);
  const [filled, setFilled] = useState<string | null>(null);
  const readToken = useRef(0);

  useEffect(
    () => () => {
      // Any file read still in flight belongs to an unmounted page.
      readToken.current += 1;
    },
    [],
  );

  const read = useMemo<ReadResult>(() => (file ? file.result : readPemText(text)), [file, text]);
  const outcome = useMemo(() => decodeCsrs(read), [read]);
  const csrs = useMemo(() => outcome.entries.flatMap((e) => (e.ok ? [e.csr] : [])), [outcome]);
  const failures = outcome.entries.filter((e): e is { ok: false; label: string; error: string } => !e.ok);
  const index = selected < csrs.length ? selected : 0;
  const csr = csrs[index];
  const findings = useMemo(() => (csr ? reviewCsr(csr) : []), [csr]);
  const sans = csr ? csrSans(csr) : [];

  // The self-signature check is asynchronous. The result carries the request
  // it was computed for, so a slow check is never shown against input the
  // reader has since replaced.
  useEffect(() => {
    if (!csr) return;
    let cancelled = false;
    void verifySignature(csr.signatureAlgorithm, csr.publicKey, csr.signed, csr.signature).then((result) => {
      if (!cancelled) setVerdict({ csr, result });
    });
    return () => {
      cancelled = true;
    };
  }, [csr]);

  const check = verdict && verdict.csr === csr ? verdict.result : null;
  const signatureFinding: Finding = check
    ? { tone: VERIFY_TONE[check.status], text: `Proof of possession: ${check.detail}` }
    : { tone: "info", text: "Checking the self-signature." };

  function onText(value: string) {
    setText(value);
    setFile(null);
    setFileError(null);
    setSelected(0);
    setFilled(null);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    const token = ++readToken.current;
    if (picked.size > MAX_FILE_BYTES) {
      setFile(null);
      setFileError(`${picked.name} is ${(picked.size / 1_048_576).toFixed(1)} MiB. The limit is 1 MiB; a CSR is one or two KiB.`);
      return;
    }
    try {
      const bytes = new Uint8Array(await picked.arrayBuffer());
      if (token !== readToken.current) return;
      setFile({ name: picked.name, size: picked.size, result: readBinary(bytes) });
      setFileError(null);
      setText("");
      setSelected(0);
    } catch {
      if (token === readToken.current) setFileError(`${picked.name} could not be read.`);
    }
  }

  const inputError = fileError ?? outcome.error;
  const summary =
    csrs.length > 0
      ? `Decoded ${csrs.length} request${csrs.length === 1 ? "" : "s"} locally${failures.length ? `, ${failures.length} failed` : ""}.`
      : failures.length > 0
        ? "The input did not decode."
        : inputError
          ? "Nothing decoded."
          : "Paste a certificate signing request or open a file to decode it.";

  const stem = csr ? fileStem(csr.subject.commonNames[0] ?? sans.find((n) => n.type === "DNS")?.raw ?? "request") : "request";
  const csrFile = shellQuote(`${stem}.csr`);
  const inspectCommands = [
    `openssl req -in ${csrFile} -noout -text -verify`,
    `openssl req -in ${csrFile} -noout -subject -nameopt RFC2253`,
    `openssl req -in ${csrFile} -noout -pubkey | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | openssl base64`,
  ].join("\n");

  const otherAttributes = csr ? csr.attributes.filter((a) => a.oid !== "1.2.840.113549.1.9.14" && a.oid !== "1.3.6.1.4.1.311.2.1.14") : [];
  const ext = csr?.extensions ?? null;

  return (
    <ToolShell slug="csr-decoder">
      <div className="space-y-6">
        <ToolPanel title="Signing request">
          <label htmlFor="csr-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste a PEM certificate signing request. Bare Base64 or hex DER works too.
          </label>
          <textarea
            id="csr-input"
            value={text}
            onChange={(event) => onText(event.target.value)}
            rows={8}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={inputError !== null && !file}
            aria-describedby={inputError ? "csr-error" : "csr-hint"}
            placeholder={"-----BEGIN CERTIFICATE REQUEST-----\nMIIBWDCB/gIBADA9MQswCQYDVQQG...\n-----END CERTIFICATE REQUEST-----"}
            data-testid="input-csr"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          <label htmlFor="csr-file" className="mt-4 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            Or open a file: .csr, .req, .pem or .der, up to 1 MiB
          </label>
          <input
            id="csr-file"
            type="file"
            accept=".csr,.req,.pem,.der,.p10,.txt,application/pkcs10"
            onChange={(event) => void onFile(event)}
            data-testid="input-file"
            className="mt-2 block min-h-[44px] w-full font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] file:mr-3 file:min-h-[44px] file:rounded-full file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-[0.625rem] file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
          />

          {inputError ? (
            <p
              id="csr-error"
              role="alert"
              data-testid="text-input-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {inputError}
            </p>
          ) : (
            <p id="csr-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {file
                ? `Opened ${file.name} (${file.size.toLocaleString()} bytes). Typing above replaces it.`
                : "Decoding happens in this tab. Nothing is stored and no request is made. A private key pasted here is recognized and skipped."}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">Try</span>
            {EXAMPLES.map((example) => (
              <button key={example.id} type="button" onClick={() => onText(example.text)} data-testid={`button-example-${example.id}`} className={CHIP_CLASS}>
                {example.label}
              </button>
            ))}
            {text || file ? (
              <button type="button" onClick={() => onText("")} data-testid="button-clear" className={CHIP_CLASS}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <p role="status" aria-live="polite" data-testid="text-summary" className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
          {summary}
        </p>

        {outcome.notices.length > 0 || failures.length > 0 ? (
          <div className="space-y-2">
            <FindingList findings={noticeFindings(outcome.notices)} testId="list-notices" />
            <FindingList findings={failures.map((f, i) => ({ tone: "danger" as const, text: `Block ${i + 1} (${f.label}) did not decode: ${f.error}` }))} />
            {outcome.sawCertificate ? (
              <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                <Link
                  href="/tools/certificate-decoder"
                  className="inline-flex min-h-[24px] items-center text-[hsl(var(--brand-cyan))] underline underline-offset-4 hover:text-[hsl(var(--brand-bone))]"
                >
                  Open the certificate decoder
                </Link>{" "}
                to read a certificate or a chain.
              </p>
            ) : null}
          </div>
        ) : null}

        {csrs.length > 1 ? (
          <div role="group" aria-label="Choose the request to show" className="flex flex-wrap gap-2">
            {csrs.map((c, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={i === index}
                onClick={() => setSelected(i)}
                data-testid={`button-csr-${i + 1}`}
                className={`${TAB_CLASS} ${
                  i === index
                    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                    : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]"
                }`}
              >
                {i + 1}. {c.subject.commonNames[0] ?? csrSans(c)[0]?.value ?? "(no name)"}
              </button>
            ))}
          </div>
        ) : null}

        {csr ? (
          <div className="space-y-6" data-testid="output-csr">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title={csrs.length > 1 ? `Request ${index + 1} of ${csrs.length}` : "Summary"}>
                <ToolResult label="Common name" value={csr.subject.commonNames[0] ?? "none"} testId="text-common-name" />
                <ToolResult label="Names requested" value={sans.length ? `${sans.length} in the SAN` : "no SAN"} testId="text-san-count" />
                <ToolResult label="Public key" value={csr.publicKey.summary} testId="text-key" />
                <ToolResult label="Signature algorithm" value={csr.signatureAlgorithm.name} testId="text-signature-algorithm" />
                {csr.signatureAlgorithm.pss ? (
                  <ToolResult
                    label="PSS parameters"
                    value={`MGF1 with ${csr.signatureAlgorithm.pss.mgfHash}, salt ${csr.signatureAlgorithm.pss.saltLength} bytes`}
                  />
                ) : null}
                <ToolResult label="Version" value={csr.version === 0 ? "v1 (0)" : String(csr.version)} />
                <ToolResult label="Size" value={`${csr.der.length.toLocaleString()} bytes DER`} />
                <div className="mt-3">
                  <FindingList findings={[signatureFinding]} testId="text-signature-check" />
                </div>
              </ToolPanel>

              <ToolPanel title="Requested names">
                {sans.length === 0 ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]" data-testid="text-no-sans">
                    No subjectAltName extension is requested{csr.subject.commonNames.length ? `, only the common name ${csr.subject.commonNames[0]}` : ""}.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[240px] border-collapse text-left" data-testid="table-sans">
                      <caption className="sr-only">Subject alternative names requested</caption>
                      <thead>
                        <tr className="border-b border-[hsl(var(--brand-iron))]">
                          <th scope="col" className={`py-2 pr-4 font-normal ${LABEL_CLASS}`}>
                            Type
                          </th>
                          <th scope="col" className={`py-2 font-normal ${LABEL_CLASS}`}>
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sans.map((n, i) => (
                          <tr key={i} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                            <th scope="row" className="py-2 pr-4 font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone-dim))]">
                              {n.type}
                            </th>
                            <td className="break-all py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{n.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ToolPanel>
            </div>

            <ToolPanel title="Checks">
              <FindingList findings={findings} testId="list-findings" />
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                A CA decides what goes into the certificate. It may copy the request as written, drop fields it does not validate, or add its
                own, so compare the issued certificate with what was asked for.
              </p>
            </ToolPanel>

            <ToolPanel title="Subject">
              <NameTable name={csr.subject} />
            </ToolPanel>

            <ToolPanel title="Public key">
              {csr.publicKey.rows.map((row) =>
                row.label === "SPKI SHA-256 pin" ? (
                  <CopyRow key={row.label} label={row.label} value={row.value} />
                ) : (
                  <ToolResult key={row.label} label={row.label} value={row.value} />
                ),
              )}
              {csr.publicKey.rsa ? (
                <details className="mt-3">
                  <summary className="min-h-[44px] cursor-pointer py-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                    Show the {csr.publicKey.rsa.bits} bit modulus
                  </summary>
                  <p className="break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]">
                    {csr.publicKey.rsa.modulusHex}
                  </p>
                </details>
              ) : null}
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                The pin is the Base64 SHA-256 of the SubjectPublicKeyInfo. It stays the same in the certificate the CA issues, so it ties
                this request to that certificate and to the private key on disk.
              </p>
            </ToolPanel>

            <ToolPanel title={`Requested extensions (${ext?.list.length ?? 0})`}>
              {!ext || ext.list.length === 0 ? (
                <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">The request asks for no extensions.</p>
              ) : (
                <ul className="space-y-3" data-testid="list-extensions">
                  {ext.list.map((e, i) => (
                    <ExtensionBlock key={`${e.oid}-${i}`} ext={e} />
                  ))}
                </ul>
              )}
            </ToolPanel>

            {otherAttributes.length > 0 ? (
              <ToolPanel title="Other attributes">
                {otherAttributes.map((a, i) => (
                  <ToolResult key={`${a.oid}-${i}`} label={a.name} value={a.values.join(", ") || "(empty)"} />
                ))}
              </ToolPanel>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setTemplate(templateFromCsr(csr));
                  setFilled(`The generator below now holds the names from request ${index + 1}. Pick a key and copy the new command.`);
                }}
                data-testid="button-fill-template"
                className={BUTTON_CLASS}
              >
                Regenerate this request
              </button>
              <p role="status" aria-live="polite" className="min-w-0 flex-1 basis-64 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {filled ?? "Fills the generator below with these names, to make a fresh key and request."}
              </p>
            </div>
          </div>
        ) : null}

        <ToolPanel title="The same with OpenSSL">
          <CommandBlock value={inspectCommands} label="Copy the OpenSSL inspection commands" testId="text-openssl" />
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            The first line prints every field and checks the self-signature, the equivalent of this page. The last prints the SPKI pin
            shown above.
          </p>
        </ToolPanel>

        <Generator fields={template} onChange={setTemplate} />
      </div>
    </ToolShell>
  );
}
