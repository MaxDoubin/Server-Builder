/**
 * X.509 certificate decoder.
 *
 * Reads PEM (one certificate or a whole chain), bare Base64 or hex, DER
 * files and PKCS#7 bundles, and lays out every field RFC 5280 defines. The
 * parsing lives in lib/toolkit/asn1 and lib/toolkit/certificate-decoder so it
 * can be tested on its own; this file is layout. Signatures along the chain
 * are checked with the browser's Web Crypto API. Nothing is stored and no
 * request is made: a certificate is public, but the habit of pasting PKI
 * material into pages that upload it is worth not encouraging.
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "wouter";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  MAX_FILE_BYTES,
  formatUtc,
  readBinary,
  readPemText,
  toPem,
  verifySignature,
  type DistinguishedName,
  type ExtensionView,
  type InputNotice,
  type ReadResult,
  type VerifyResult,
} from "@/lib/toolkit/asn1";
import {
  analyzeChain,
  decodeCertificates,
  reviewCertificate,
  validityStatus,
  type CertificateInfo,
  type Finding,
  type Tone,
} from "@/lib/toolkit/certificate-decoder";

/* ---------------------------------------------------------------- samples */

/*
  A three certificate chain from a made-up private CA (ECDSA P-384 root,
  P-256 intermediate and leaf), generated with openssl ca for this page, and
  an expired RSA-1024 SHA-1 self-signed certificate of the kind still found
  on old appliances.
*/
const SAMPLE_LEAF = `-----BEGIN CERTIFICATE-----
MIIDBjCCAqugAwIBAgIQXBep4Es9gvFuCpt8PS4fQDAKBggqhkjOPQQDAjBDMQsw
CQYDVQQGEwJVUzEUMBIGA1UECgwLRXhhbXBsZSBQS0kxHjAcBgNVBAMMFUV4YW1w
bGUgSXNzdWluZyBDQSBFMTAeFw0yNjEwMDEwMDAwMDBaFw0yNzA0MTgyMzU5NTla
MBoxGDAWBgNVBAMMD3d3dy5leGFtcGxlLmNvbTBZMBMGByqGSM49AgEGCCqGSM49
AwEHA0IABJUtneJ9pAYfRQQJibUmcuDeb5Rr1nZOhQ+eBFumrSs/jNFrtfFZnoez
wIewfTOcs23o3uAOMcn6X0OkVzRxzEqjggGoMIIBpDBVBgNVHREETjBMgg93d3cu
ZXhhbXBsZS5jb22CC2V4YW1wbGUuY29tghQqLnN0YXRpYy5leGFtcGxlLmNvbYcE
wAACCocQIAENuAAAAAAAAAAAAAAAEDAMBgNVHRMBAf8EAjAAMA4GA1UdDwEB/wQE
AwIHgDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwHQYDVR0OBBYEFCiz
ilAtafN6abmX8sHGzc/JXU97MB8GA1UdIwQYMBaAFBA7MQ8EvZJCSCWr4cAO+dxW
B1PtMC4GA1UdHwQnMCUwI6AhoB+GHWh0dHA6Ly9jcmwuZXhhbXBsZS5uZXQvZTEu
Y3JsMF4GCCsGAQUFBwEBBFIwUDAjBggrBgEFBQcwAYYXaHR0cDovL29jc3AuZXhh
bXBsZS5uZXQwKQYIKwYBBQUHMAKGHWh0dHA6Ly9wa2kuZXhhbXBsZS5uZXQvZTEu
Y2VyMD4GA1UdIAQ3MDUwMwYGZ4EMAQIBMCkwJwYIKwYBBQUHAgEWG2h0dHBzOi8v
cGtpLmV4YW1wbGUubmV0L2NwczAKBggqhkjOPQQDAgNJADBGAiEAtME7z+tY5mF3
3IYfhFlbMDFKepiwgpUZ5+BNljduNBgCIQCuX8sqD5Rm3rki+0Prdgphcf3LlZeg
1bpJanR2cqFT2g==
-----END CERTIFICATE-----
`;
const SAMPLE_INTERMEDIATE = `-----BEGIN CERTIFICATE-----
MIICpDCCAiqgAwIBAgIKa4waL50+TFt6bzAKBggqhkjOPQQDAzBAMQswCQYDVQQG
EwJVUzEUMBIGA1UECgwLRXhhbXBsZSBQS0kxGzAZBgNVBAMMEkV4YW1wbGUgUm9v
dCBDQSBSMTAeFw0yNjAxMDEwMDAwMDBaFw0zNjAxMDEwMDAwMDBaMEMxCzAJBgNV
BAYTAlVTMRQwEgYDVQQKDAtFeGFtcGxlIFBLSTEeMBwGA1UEAwwVRXhhbXBsZSBJ
c3N1aW5nIENBIEUxMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAENWyzECi3Xsd5
77F7/WvZklnsFh84SjocfIEt6WK0Z5Cpp1DIWawe2TLzxx7dRmM3iTk7Koj+PaFW
F8cyNYUZ36OCAQcwggEDMBIGA1UdEwEB/wQIMAYBAf8CAQAwDgYDVR0PAQH/BAQD
AgGGMB0GA1UdJQQWMBQGCCsGAQUFBwMBBggrBgEFBQcDAjAdBgNVHQ4EFgQUEDsx
DwS9kkJIJavhwA753FYHU+0wHwYDVR0jBBgwFoAUaxxe25udddUgzxzNRiZNfxMr
yuMwLgYDVR0fBCcwJTAjoCGgH4YdaHR0cDovL2NybC5leGFtcGxlLm5ldC9yMS5j
cmwwOQYIKwYBBQUHAQEELTArMCkGCCsGAQUFBzAChh1odHRwOi8vcGtpLmV4YW1w
bGUubmV0L3IxLmNlcjATBgNVHSAEDDAKMAgGBmeBDAECATAKBggqhkjOPQQDAwNo
ADBlAjEAxm59Le0FMGNg7tz8BkzfaJiG26TIZquGxco8ndDi076U6twoZnGU5CwR
2mqPDg3aAjBGOg5vBqZ94XRwN+2kEWmjjH/w7AS1FcjZ0M6UeYFH54iVAQM1S7/d
1Mp//LL0BrY=
-----END CERTIFICATE-----
`;
const SAMPLE_ROOT = `-----BEGIN CERTIFICATE-----
MIIB/TCCAYOgAwIBAgIQHy49TFtqeYgAESIzRFVmdzAKBggqhkjOPQQDAzBAMQsw
CQYDVQQGEwJVUzEUMBIGA1UECgwLRXhhbXBsZSBQS0kxGzAZBgNVBAMMEkV4YW1w
bGUgUm9vdCBDQSBSMTAeFw0yNjAxMDEwMDAwMDBaFw00NjAxMDEwMDAwMDBaMEAx
CzAJBgNVBAYTAlVTMRQwEgYDVQQKDAtFeGFtcGxlIFBLSTEbMBkGA1UEAwwSRXhh
bXBsZSBSb290IENBIFIxMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERNqK0KRU0sZ8
JLEAIJlvTGJlv9+M3nhBXFnMIROhFIPMDcLTj3e3oopi3HrgxS1MQmDB+9Qxe+Li
Gi0LJ8JKUWSON9JLUcfz/DjneLm8MyhlFq8JsUdtEbW1j0M40uOSo0IwQDAPBgNV
HRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjAdBgNVHQ4EFgQUaxxe25udddUg
zxzNRiZNfxMryuMwCgYIKoZIzj0EAwMDaAAwZQIwVqCiYsoev0m4+T4FqrJWnSrT
5P1TZst/9rm+0Nwaubj9BnG4xVVsPasGEeRGGhDRAjEAhmzXGB/PZGjCkoKZgP6F
J4dKEGDCxqJPJG6hCYweNE+M5yYftpu6NmndZyl14utB
-----END CERTIFICATE-----
`;
const SAMPLE_LEGACY = `-----BEGIN CERTIFICATE-----
MIICUDCCAbkCAgDjMA0GCSqGSIb3DQEBBQUAMHAxCzAJBgNVBAYTAlVTMQ8wDQYD
VQQIDAZOZXZhZGExEjAQBgNVBAcMCUxhcyBWZWdhczEfMB0GA1UECgwWRXhhbXBs
ZSBMZWdhY3kgU3lzdGVtczEbMBkGA1UEAwwSbGVnYWN5LmV4YW1wbGUuY29tMB4X
DTE0MDMwMTAwMDAwMFoXDTE2MDMwMTAwMDAwMFowcDELMAkGA1UEBhMCVVMxDzAN
BgNVBAgMBk5ldmFkYTESMBAGA1UEBwwJTGFzIFZlZ2FzMR8wHQYDVQQKDBZFeGFt
cGxlIExlZ2FjeSBTeXN0ZW1zMRswGQYDVQQDDBJsZWdhY3kuZXhhbXBsZS5jb20w
gZ8wDQYJKoZIhvcNAQEBBQADgY0AMIGJAoGBAK/zARDZDpONGEeiVCgRjFvWuEvw
QxtzKCamhURvUvW1txRRNdOabDQpOdyEo+P/ynyK2qP0tNkBflIJmlK8esaZBYHN
uK8I767ZmtBERJOT3SbfjnKzfAYmtQOa6jExS3kF4HOVIfrIQj3NCHsIlkXByQdA
aaItyrARsnq9UgZ9AgMBAAEwDQYJKoZIhvcNAQEFBQADgYEAcQS1onokydl1Iw3b
Q2sDL5skGjT0Q1kZq7Es9D3+s2hq85QIlQpB6YkZBze6aEwopX15ebRoghMKVzvs
eWUV5VMwdjG40aiLvP2410APDpYui0TeTa58yXql21T/hFii0TRau24nS17MxG90
p35i/JeEyM1s8VvP9R87iKPQM8M=
-----END CERTIFICATE-----
`;

const EXAMPLES: { id: string; label: string; text: string }[] = [
  { id: "chain", label: "Chain", text: SAMPLE_LEAF + SAMPLE_INTERMEDIATE + SAMPLE_ROOT },
  { id: "reversed", label: "Reversed chain", text: SAMPLE_ROOT + SAMPLE_INTERMEDIATE + SAMPLE_LEAF },
  { id: "legacy", label: "Legacy self-signed", text: SAMPLE_LEGACY },
];

/* ------------------------------------------------------------------ style */

const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const TAB_CLASS =
  "inline-flex min-h-[44px] max-w-full items-center break-all rounded-lg border px-4 py-2 text-left font-mono-tight text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const LABEL_CLASS = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

const PRE_CLASS =
  "min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]";

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
        <li key={i} className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[finding.tone]}`}>
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

function NameTable({ name, caption }: { name: DistinguishedName; caption: string }) {
  const attrs = name.rdns.flatMap((rdn, r) => rdn.map((attr, a) => ({ attr, key: `${r}-${a}`, joined: a > 0 })));
  if (attrs.length === 0) {
    return <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">Empty name. The identity, if any, is in the subjectAltName.</p>;
  }
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">{name.rfc4514}</code>
        <CopyButton value={name.rfc4514} label={`Copy the ${caption.toLowerCase()} as an RFC 4514 string`} />
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
          {ext.critical ? <span className="text-[hsl(var(--brand-amber))]">critical · </span> : null}
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

/** A host name to put in the example commands. */
function exampleHost(cert: CertificateInfo | undefined): string {
  const dns = cert?.extensions.san?.find((n) => n.type === "DNS" && !n.raw.includes("*"))?.raw;
  const cn = cert?.subject.commonNames[0];
  if (dns) return dns;
  if (cn && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cn)) return cn;
  return "example.com";
}

/* ------------------------------------------------------------------- page */

interface Verdicts {
  key: string;
  links: VerifyResult[];
  self: (VerifyResult | null)[];
}

export function CertificateDecoder() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; size: number; result: ReadResult } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [verdicts, setVerdicts] = useState<Verdicts | null>(null);
  const readToken = useRef(0);

  useEffect(
    () => () => {
      // Any file read still in flight belongs to an unmounted page.
      readToken.current += 1;
    },
    [],
  );

  const read = useMemo<ReadResult>(() => (file ? file.result : readPemText(text)), [file, text]);
  const outcome = useMemo(() => decodeCertificates(read), [read]);
  const certs = useMemo(() => outcome.entries.flatMap((e) => (e.ok ? [e.cert] : [])), [outcome]);
  const failures = outcome.entries.filter((e): e is { ok: false; label: string; error: string } => !e.ok);
  const chain = useMemo(() => analyzeChain(certs), [certs]);
  const chainKey = certs.map((c) => c.sha256).join("|");

  // Signature checks are asynchronous. The key ties a result to the exact
  // certificates it was computed for, so a slow check can never be shown
  // against input the reader has since replaced.
  useEffect(() => {
    let cancelled = false;
    if (certs.length === 0) return;
    void (async () => {
      const links = await Promise.all(
        certs.slice(0, -1).map((c, i) => verifySignature(c.signatureAlgorithm, certs[i + 1].publicKey, c.tbs, c.signature)),
      );
      const self = await Promise.all(
        certs.map((c) => (c.selfIssued ? verifySignature(c.signatureAlgorithm, c.publicKey, c.tbs, c.signature) : Promise.resolve(null))),
      );
      if (!cancelled) setVerdicts({ key: chainKey, links, self });
    })();
    return () => {
      cancelled = true;
    };
  }, [certs, chainKey]);

  const current = verdicts && verdicts.key === chainKey ? verdicts : null;
  const index = selected < certs.length ? selected : 0;
  const cert = certs[index];
  const findings = useMemo(() => (cert ? reviewCertificate(cert, nowMs) : []), [cert, nowMs]);
  const validity = cert ? validityStatus(cert, nowMs) : null;

  function onText(value: string) {
    setText(value);
    setFile(null);
    setFileError(null);
    setSelected(0);
    setNowMs(Date.now());
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    const token = ++readToken.current;
    if (picked.size > MAX_FILE_BYTES) {
      setFile(null);
      setFileError(`${picked.name} is ${(picked.size / 1_048_576).toFixed(1)} MiB. The limit is 1 MiB; a certificate is a few KiB.`);
      return;
    }
    try {
      const bytes = new Uint8Array(await picked.arrayBuffer());
      if (token !== readToken.current) return;
      setFile({ name: picked.name, size: picked.size, result: readBinary(bytes) });
      setFileError(null);
      setText("");
      setSelected(0);
      setNowMs(Date.now());
    } catch {
      if (token === readToken.current) setFileError(`${picked.name} could not be read.`);
    }
  }

  const inputError = fileError ?? outcome.error;
  const summary =
    certs.length > 0
      ? `Decoded ${certs.length} certificate${certs.length === 1 ? "" : "s"} locally${failures.length ? `, ${failures.length} failed` : ""}.`
      : failures.length > 0
        ? "The input did not decode."
        : inputError
          ? "Nothing decoded."
          : "Paste a certificate or open a file to decode it.";

  /** The signature verdict for one certificate, from its issuer in the list or from itself. */
  function signatureVerdict(i: number): { tone: Tone; text: string } {
    const c = certs[i];
    if (c.selfIssued) {
      const v = current?.self[i];
      return v ? { tone: VERIFY_TONE[v.status], text: `Self-signature: ${v.detail}` } : { tone: "info", text: "Checking the self-signature." };
    }
    if (i + 1 < certs.length) {
      const v = current?.links[i];
      return v
        ? { tone: VERIFY_TONE[v.status], text: `Against the key of certificate ${i + 2}: ${v.detail}` }
        : { tone: "info", text: `Checking against the key of certificate ${i + 2}.` };
    }
    return { tone: "info", text: "Not checked: the issuer's certificate is not in the input." };
  }

  const host = exampleHost(certs[0]);
  const commands = [
    "openssl x509 -in cert.pem -noout -text",
    "openssl x509 -in cert.pem -noout -fingerprint -sha256",
    `openssl s_client -connect ${host}:443 -servername ${host} -showcerts </dev/null`,
    "openssl verify -CAfile root.pem -untrusted intermediate.pem cert.pem",
  ].join("\n");

  return (
    <ToolShell slug="certificate-decoder">
      <div className="space-y-6">
        <ToolPanel title="Certificate">
          <label htmlFor="cert-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste one or more PEM certificates. A whole chain works, and so does bare Base64 or hex DER.
          </label>
          <textarea
            id="cert-input"
            value={text}
            onChange={(event) => onText(event.target.value)}
            rows={8}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={inputError !== null && !file}
            aria-describedby={inputError ? "cert-error" : "cert-hint"}
            placeholder={"-----BEGIN CERTIFICATE-----\nMIIDBjCCAqugAwIBAgIQ...\n-----END CERTIFICATE-----"}
            data-testid="input-certificate"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          <label htmlFor="cert-file" className="mt-4 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            Or open a file: .pem, .crt, .cer, .der or .p7b, up to 1 MiB
          </label>
          <input
            id="cert-file"
            type="file"
            accept=".pem,.crt,.cer,.der,.p7b,.p7c,.txt,application/x-x509-ca-cert,application/pkix-cert,application/x-pem-file,application/pkcs7-mime"
            onChange={(event) => void onFile(event)}
            data-testid="input-file"
            className="mt-2 block min-h-[44px] w-full font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] file:mr-3 file:min-h-[44px] file:rounded-full file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-[0.625rem] file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
          />

          {inputError ? (
            <p
              id="cert-error"
              role="alert"
              data-testid="text-input-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {inputError}
            </p>
          ) : (
            <p id="cert-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {file
                ? `Opened ${file.name} (${file.size.toLocaleString()} bytes). Typing above replaces it.`
                : "Decoding happens in this tab. Nothing is stored and no request is made."}
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
            {outcome.sawCsr ? (
              <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                <Link href="/tools/csr-decoder" className="text-[hsl(var(--brand-cyan))] underline underline-offset-4 hover:text-[hsl(var(--brand-bone))]">
                  Open the CSR decoder
                </Link>{" "}
                to read a certificate signing request.
              </p>
            ) : null}
          </div>
        ) : null}

        {certs.length > 1 ? (
          <ToolPanel title="Chain">
            <ol className="space-y-3" data-testid="list-chain">
              {certs.map((c, i) => {
                const link = chain.links[i];
                const sig = signatureVerdict(i);
                const state = validityStatus(c, nowMs).state;
                return (
                  <li key={`${c.sha256}-${i}`}>
                    <div className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {i + 1}. {c.displayName}
                        </span>
                        <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                          {c.selfIssued ? "self-signed" : c.isCA ? "CA" : "end entity"} ·{" "}
                          <span className={state === "valid" ? "text-[hsl(var(--brand-signal))]" : state === "expired" ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-amber))]"}>
                            {state.replace(/-/g, " ")}
                          </span>
                        </span>
                      </div>
                      <p className="mt-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                        Issued by {c.issuer.commonNames[0] ?? (c.issuer.rfc4514 || "an empty name")}
                      </p>
                    </div>
                    {link || c.selfIssued ? (
                      <div className="mt-2 border-l border-[hsl(var(--brand-iron))] pl-4">
                        <FindingList findings={[...(link?.findings ?? []), sig]} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 space-y-2">
              <FindingList findings={[...chain.ending, ...chain.notes]} testId="list-chain-ending" />
            </div>
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              A matching name and a verified signature show that each certificate was issued by the next. They do not show that the root is
              trusted, that nothing was revoked, or that the names fit the host you connect to: a client checks those against its own trust
              store and policy.
            </p>
          </ToolPanel>
        ) : null}

        {certs.length > 1 ? (
          <div role="group" aria-label="Choose the certificate to show" className="flex flex-wrap gap-2">
            {certs.map((c, i) => (
              <button
                key={`${c.sha256}-${i}`}
                type="button"
                aria-pressed={i === index}
                onClick={() => setSelected(i)}
                data-testid={`button-cert-${i + 1}`}
                className={`${TAB_CLASS} ${
                  i === index
                    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                    : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]"
                }`}
              >
                {i + 1}. {c.displayName}
              </button>
            ))}
          </div>
        ) : null}

        {cert && validity ? (
          <div className="space-y-6" data-testid="output-certificate">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title={certs.length > 1 ? `Certificate ${index + 1} of ${certs.length}` : "Summary"}>
                <ToolResult label="Subject" value={cert.displayName} testId="text-subject" />
                <ToolResult label="Issuer" value={cert.issuer.commonNames[0] ?? (cert.issuer.rfc4514 || "empty")} testId="text-issuer" />
                <ToolResult label="Version" value={`v${cert.version}`} />
                <ToolResult label="Serial (hex)" value={cert.serial.hex} testId="text-serial" />
                <ToolResult label="Serial (decimal)" value={cert.serial.decimal} />
                <ToolResult label="Signature algorithm" value={cert.signatureAlgorithm.name} testId="text-signature-algorithm" />
                {cert.signatureAlgorithm.pss ? (
                  <ToolResult
                    label="PSS parameters"
                    value={`MGF1 with ${cert.signatureAlgorithm.pss.mgfHash}, salt ${cert.signatureAlgorithm.pss.saltLength} bytes`}
                  />
                ) : null}
                <ToolResult label="Public key" value={cert.publicKey.summary} testId="text-key" />
                <ToolResult
                  label="Role"
                  value={`${cert.isCA ? `CA${cert.extensions.basicConstraints?.pathLen != null ? `, pathLen ${cert.extensions.basicConstraints.pathLen}` : ""}` : cert.version < 3 ? "unknown (no extensions)" : "end entity"}${cert.selfIssued ? ", self-signed" : ""}`}
                />
                <div className="mt-3">
                  <FindingList findings={[signatureVerdict(index)]} testId="text-signature-check" />
                </div>
              </ToolPanel>

              <ToolPanel title="Validity">
                <p
                  data-testid="text-validity"
                  className={`rounded-lg border p-3 font-mono-tight text-sm ${TONE_STYLE[validity.state === "valid" ? ((validity.daysRemaining ?? 0) < 30 ? "warn" : "ok") : validity.state === "expired" ? "danger" : validity.state === "unknown" ? "info" : "warn"]}`}
                >
                  {validity.text}
                </p>
                <div className="mt-3">
                  <ToolResult label="Not before" value={cert.notBefore.ms !== null ? formatUtc(cert.notBefore.ms) : cert.notBefore.raw} />
                  <ToolResult label="Not after" value={cert.notAfter.ms !== null ? formatUtc(cert.notAfter.ms) : cert.notAfter.raw} />
                  <ToolResult label="Lifetime" value={validity.lifetimeDays !== null ? `${Math.round(validity.lifetimeDays)} days` : "unknown"} />
                  <ToolResult label="Encoding" value={`${cert.notBefore.type} / ${cert.notAfter.type}`} />
                </div>
                <button
                  type="button"
                  onClick={() => setNowMs(Date.now())}
                  data-testid="button-recheck"
                  className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  <span aria-hidden>↻</span> Re-check the clock
                </button>
                <p className="mt-2 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                  Compared against {formatUtc(nowMs)}
                </p>
              </ToolPanel>
            </div>

            <ToolPanel title="Findings">
              <FindingList findings={findings} testId="list-findings" />
            </ToolPanel>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Subject">
                <NameTable name={cert.subject} caption="Subject" />
              </ToolPanel>
              <ToolPanel title="Issuer">
                <NameTable name={cert.issuer} caption="Issuer" />
              </ToolPanel>
            </div>

            <ToolPanel title="Public key">
              {cert.publicKey.rows.map((row) =>
                row.label === "SPKI SHA-256 pin" ? (
                  <CopyRow key={row.label} label={row.label} value={row.value} />
                ) : (
                  <ToolResult key={row.label} label={row.label} value={row.value} />
                ),
              )}
              {cert.publicKey.rsa ? (
                <details className="mt-3">
                  <summary className="min-h-[44px] cursor-pointer py-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                    Show the {cert.publicKey.rsa.bits} bit modulus
                  </summary>
                  <p className="break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]">
                    {cert.publicKey.rsa.modulusHex}
                  </p>
                </details>
              ) : null}
            </ToolPanel>

            <ToolPanel title={`Extensions (${cert.extensions.list.length})`}>
              {cert.extensions.list.length === 0 ? (
                <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  {cert.version < 3 ? "A version 1 certificate cannot carry extensions." : "No extensions."}
                </p>
              ) : (
                <ul className="space-y-3" data-testid="list-extensions">
                  {cert.extensions.list.map((ext, i) => (
                    <ExtensionBlock key={`${ext.oid}-${i}`} ext={ext} />
                  ))}
                </ul>
              )}
            </ToolPanel>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Fingerprints">
                <CopyRow label="SHA-256" value={cert.sha256} />
                <CopyRow label="SHA-1" value={cert.sha1} />
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  Computed over the DER encoding, which is what OpenSSL, browsers and certificate pinning configurations compare.
                </p>
              </ToolPanel>
              <ToolPanel title="This certificate as PEM">
                <pre className={`${PRE_CLASS} max-h-64 text-[hsl(var(--brand-bone))]`}>{toPem(cert.der, "CERTIFICATE")}</pre>
                <div className="mt-3 flex justify-end">
                  <CopyButton value={toPem(cert.der, "CERTIFICATE")} label="Copy this certificate as PEM" testId="button-copy-pem" />
                </div>
              </ToolPanel>
            </div>
          </div>
        ) : null}

        <ToolPanel title="The same with OpenSSL">
          <div className="flex flex-wrap items-start gap-2">
            <pre className={PRE_CLASS} data-testid="text-openssl">
              {commands}
            </pre>
            <CopyButton value={commands} label="Copy the OpenSSL commands" />
          </div>
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            The s_client line prints the chain a server actually sends, which is the input this page is built for.
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
