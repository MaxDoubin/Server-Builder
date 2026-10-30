/**
 * HMAC generator and verifier.
 *
 * Every MAC on the page comes from WebCrypto's own HMAC, and the selected
 * algorithm is also rebuilt from the bare hash, step by step, so the
 * construction panel can show K0 and the inner hash. The two must agree,
 * and the page says so if they ever do not. Key and message stay in
 * component state in this tab and are never stored or sent anywhere.
 */

import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  algInfo,
  bytesToBase64,
  bytesToBase64Url,
  bytesToHex,
  computeHmac,
  diagnoseMismatch,
  formatBytes,
  HMAC_ALGS,
  HMAC_EXAMPLES,
  hmacSteps,
  matchExample,
  MAX_DIAGNOSE_BYTES,
  MAX_KEY_BYTES,
  MAX_MESSAGE_BYTES,
  parseBytes,
  parseExpectedMac,
  verifyMac,
  type ByteFormat,
  type Diagnosis,
  type ExpectedFormat,
  type HmacAlg,
  type HmacExample,
  type HmacSteps,
} from "@/lib/toolkit/hmac-generator";

/* ---------------------------------------------------------------- styles */

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const WARN_BOX =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const OK_BOX =
  "rounded-lg border border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]";
const PRE =
  "overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]";

const pillClass = (on: boolean) =>
  `inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${on ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]" : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"}`;

const chipClass =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const FORMATS: { id: ByteFormat; label: string }[] = [
  { id: "text", label: "UTF-8 text" },
  { id: "hex", label: "Hex" },
  { id: "base64", label: "Base64" },
];

const EXPECTED_FORMATS: { id: ExpectedFormat; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "hex", label: "Hex" },
  { id: "base64", label: "Base64" },
];

/* --------------------------------------------------------------- pieces */

function FormatPicker({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          data-testid={`button-${id}-${o.id}`}
          className={pillClass(value === o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface Computed {
  key: Uint8Array;
  message: Uint8Array;
  alg: HmacAlg;
  macs: Record<HmacAlg, Uint8Array> | null;
  steps: HmacSteps | null;
  error: string | null;
}

function errorText(e: unknown): string {
  return e instanceof Error && e.name === "CryptoUnavailableError"
    ? e.message
    : "The browser refused to compute this HMAC.";
}

/* ------------------------------------------------------------------ view */

export function HmacGenerator() {
  const [alg, setAlg] = useState<HmacAlg>("SHA-256");
  const [message, setMessage] = useState("");
  const [messageFormat, setMessageFormat] = useState<ByteFormat>("text");
  const [key, setKey] = useState("");
  const [keyFormat, setKeyFormat] = useState<ByteFormat>("text");
  const [expected, setExpected] = useState("");
  const [expectedFormat, setExpectedFormat] = useState<ExpectedFormat>("auto");

  const keyParsed = useMemo(() => parseBytes(key, keyFormat, MAX_KEY_BYTES, "key"), [key, keyFormat]);
  const messageParsed = useMemo(
    () => parseBytes(message, messageFormat, MAX_MESSAGE_BYTES, "message"),
    [message, messageFormat],
  );
  // Both fields empty is a valid HMAC input, but it is not what anyone came
  // for, so the page waits for something to be typed before computing.
  const blank = key === "" && message === "";
  const keyBytes = keyParsed.ok && !blank ? keyParsed.bytes : null;
  const messageBytes = messageParsed.ok && !blank ? messageParsed.bytes : null;

  const [computed, setComputed] = useState<Computed | null>(null);
  useEffect(() => {
    if (!keyBytes || !messageBytes) return;
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(
          HMAC_ALGS.map(async (a) => [a.id, await computeHmac(a.id, keyBytes, messageBytes)] as const),
        );
        const macs = Object.fromEntries(entries) as Record<HmacAlg, Uint8Array>;
        const steps = await hmacSteps(alg, keyBytes, messageBytes);
        if (!cancelled) setComputed({ key: keyBytes, message: messageBytes, alg, macs, steps, error: null });
      } catch (e) {
        if (!cancelled) {
          setComputed({ key: keyBytes, message: messageBytes, alg, macs: null, steps: null, error: errorText(e) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [keyBytes, messageBytes, alg]);

  // Shown only when it belongs to the inputs on screen right now.
  const fresh =
    computed && computed.key === keyBytes && computed.message === messageBytes && computed.alg === alg ? computed : null;
  const mac = fresh?.macs ? fresh.macs[alg] : null;
  const steps = fresh?.steps ?? null;
  const constructionAgrees = mac && steps ? bytesToHex(mac) === bytesToHex(steps.mac) : true;

  const example: HmacExample | null = useMemo(
    () => (keyBytes && messageBytes ? matchExample(keyBytes, messageBytes) : null),
    [keyBytes, messageBytes],
  );

  /* ---- verify */
  const expectedParsed = useMemo(
    () => (expected.trim() === "" ? null : parseExpectedMac(expected, expectedFormat)),
    [expected, expectedFormat],
  );
  const outcome = mac && expectedParsed && expectedParsed.ok ? verifyMac(mac, expectedParsed.bytes) : null;
  const needsDiagnosis = outcome !== null && (outcome.kind === "mismatch" || outcome.kind === "length");
  const messageTooBigToDiagnose = (messageBytes?.length ?? 0) > MAX_DIAGNOSE_BYTES;
  const providedHex = expectedParsed && expectedParsed.ok ? bytesToHex(expectedParsed.bytes) : "";

  const diagToken = useMemo(
    () => ({ providedHex, key, keyFormat, message, messageFormat, alg }),
    [providedHex, key, keyFormat, message, messageFormat, alg],
  );
  const [diagnosis, setDiagnosis] = useState<{ token: object; result: Diagnosis | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!needsDiagnosis || messageTooBigToDiagnose || !expectedParsed || !expectedParsed.ok) return;
    let cancelled = false;
    const token = diagToken;
    diagnoseMismatch(expectedParsed.bytes, key, keyFormat, message, messageFormat, alg)
      .then((result) => {
        if (!cancelled) setDiagnosis({ token, result, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setDiagnosis({ token, result: null, error: errorText(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [needsDiagnosis, messageTooBigToDiagnose, expectedParsed, diagToken, key, keyFormat, message, messageFormat, alg]);
  const freshDiagnosis = diagnosis && diagnosis.token === diagToken ? diagnosis : null;

  /* ---- notes about the key and message */
  const info = algInfo(alg);
  const keyNotes: string[] = [];
  if (keyBytes) {
    if (keyBytes.length === 0) {
      keyNotes.push(
        `An empty key is legal in RFC 2104: it is padded to ${info.blockBytes} zero bytes. It is also no secret at all, so anyone can compute this MAC.`,
      );
    } else if (keyBytes.length > info.blockBytes) {
      keyNotes.push(
        `This ${keyBytes.length} byte key is longer than the ${info.blockBytes} byte block of ${alg}, so HMAC first replaces it with its ${info.outBytes} byte hash.`,
      );
    } else if (keyBytes.length < info.outBytes) {
      keyNotes.push(
        `This key is ${keyBytes.length} ${keyBytes.length === 1 ? "byte" : "bytes"}, shorter than the ${info.outBytes} byte output. RFC 2104 section 3 strongly discourages keys shorter than the output length.`,
      );
    }
    if (keyFormat === "text" && /^[0-9a-f]{16,}$/i.test(key.trim()) && key.trim().length % 2 === 0) {
      keyNotes.push(
        "This key is all hex digits but is being read as text, so each character is one byte. If it was meant as hex, switch the key format.",
      );
    }
    if (keyFormat === "text" && key !== "" && key !== key.trimEnd()) {
      keyNotes.push("The key ends in whitespace, and that whitespace is part of the key.");
    }
  }
  const messageNotes: string[] = [];
  if (messageBytes && messageFormat === "text" && /\r?\n$/.test(message)) {
    messageNotes.push("The message ends with a line break, and that line break is part of what is hashed.");
  }

  function loadExample(ex: HmacExample) {
    setKey(ex.key);
    setKeyFormat(ex.keyFormat);
    setMessage(ex.message);
    setMessageFormat(ex.messageFormat);
    if (!ex.expected[alg]) setAlg("SHA-256");
  }

  return (
    <ToolShell slug="hmac-generator">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Inputs">
            <div role="group" aria-labelledby="hmac-alg-label">
              <div id="hmac-alg-label" className={LABEL}>
                Hash
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {HMAC_ALGS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAlg(a.id)}
                    aria-pressed={alg === a.id}
                    data-testid={`button-alg-${a.id.toLowerCase()}`}
                    className={pillClass(alg === a.id)}
                  >
                    {a.id}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <label htmlFor="hmac-message" className={LABEL}>
                Message
              </label>
              <div className="mt-2">
                <FormatPicker
                  id="message-format"
                  label="Message format"
                  value={messageFormat}
                  onChange={(v) => setMessageFormat(v as ByteFormat)}
                  options={FORMATS}
                />
              </div>
              <textarea
                id="hmac-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={!messageParsed.ok}
                aria-describedby="hmac-message-status"
                placeholder={messageFormat === "text" ? "what do ya want for nothing?" : messageFormat === "hex" ? "48 69 20 54 68 65 72 65" : "SGkgVGhlcmU="}
                data-testid="input-message"
                className={`${FIELD} resize-y break-all leading-relaxed`}
              />
              <div id="hmac-message-status" className="mt-2">
                {!messageParsed.ok ? (
                  <p role="alert" data-testid="text-message-error" className={ERROR_BOX}>
                    {messageParsed.error}
                  </p>
                ) : (
                  <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    {formatBytes(messageParsed.bytes.length)} of message. Up to {formatBytes(MAX_MESSAGE_BYTES)}.
                  </p>
                )}
                {messageNotes.map((n) => (
                  <p key={n} className={`mt-2 ${WARN_BOX}`}>
                    {n}
                  </p>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <label htmlFor="hmac-key" className={LABEL}>
                Key
              </label>
              <div className="mt-2">
                <FormatPicker
                  id="key-format"
                  label="Key format"
                  value={keyFormat}
                  onChange={(v) => setKeyFormat(v as ByteFormat)}
                  options={FORMATS}
                />
              </div>
              <textarea
                id="hmac-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                rows={2}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={!keyParsed.ok}
                aria-describedby="hmac-key-status"
                placeholder={keyFormat === "text" ? "Jefe" : keyFormat === "hex" ? "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b" : "Ckpl"}
                data-testid="input-key"
                className={`${FIELD} resize-y break-all leading-relaxed`}
              />
              <div id="hmac-key-status" className="mt-2">
                {!keyParsed.ok ? (
                  <p role="alert" data-testid="text-key-error" className={ERROR_BOX}>
                    {keyParsed.error}
                  </p>
                ) : (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {formatBytes(keyParsed.bytes.length)} of key. Use test keys: nothing leaves this tab, but a
                    production secret pasted into any web page is one to rotate.
                  </p>
                )}
                {keyNotes.map((n) => (
                  <p key={n} className={`mt-2 ${WARN_BOX}`} data-testid="text-key-note">
                    {n}
                  </p>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Try
              </span>
              {HMAC_EXAMPLES.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => loadExample(ex)}
                  data-testid={`button-example-${ex.id}`}
                  className={chipClass}
                >
                  {ex.label}
                </button>
              ))}
              {key || message || expected ? (
                <button
                  type="button"
                  onClick={() => {
                    setKey("");
                    setMessage("");
                    setExpected("");
                  }}
                  data-testid="button-clear"
                  className={chipClass}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </ToolPanel>

          <div className="space-y-6">
            <ToolPanel title={`HMAC-${alg}`}>
              {fresh?.error ? (
                <p role="alert" className={ERROR_BOX}>
                  {fresh.error}
                </p>
              ) : blank ? (
                <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="text-hmac-empty">
                  Type a message and a key, or load one of the RFC 4231 examples.
                </p>
              ) : !keyParsed.ok || !messageParsed.ok ? (
                <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Fix the input marked in red to see the MAC.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-start gap-2">
                    <pre
                      data-testid="text-hmac-hex"
                      className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-signal))]"
                    >
                      {mac ? bytesToHex(mac) : "..."}
                    </pre>
                    {mac ? <CopyButton value={bytesToHex(mac)} label="Copy the MAC as hex" testId="button-copy-hex" /> : null}
                  </div>
                  <div className="mt-3">
                    <ToolResult
                      label="Base64"
                      value={
                        mac ? (
                          <span className="inline-flex flex-wrap items-center justify-end gap-2">
                            <span data-testid="text-hmac-base64">{bytesToBase64(mac)}</span>
                            <CopyButton value={bytesToBase64(mac)} label="Copy the MAC as Base64" testId="button-copy-base64" />
                          </span>
                        ) : (
                          "..."
                        )
                      }
                    />
                    <ToolResult
                      label="Base64URL"
                      value={
                        mac ? (
                          <span className="inline-flex flex-wrap items-center justify-end gap-2">
                            <span data-testid="text-hmac-base64url">{bytesToBase64Url(mac)}</span>
                            <CopyButton value={bytesToBase64Url(mac)} label="Copy the MAC as Base64URL" testId="button-copy-base64url" />
                          </span>
                        ) : (
                          "..."
                        )
                      }
                    />
                    <ToolResult label="Length" value={`${info.outBytes} bytes, ${info.outBytes * 8} bits`} />
                  </div>
                  {example && mac ? (
                    example.expected[alg] ? (
                      <p
                        className={`mt-4 ${example.expected[alg] === bytesToHex(mac) ? OK_BOX : ERROR_BOX}`}
                        data-testid="text-reference"
                      >
                        These inputs are {example.source}. Published HMAC-{alg}: {example.expected[alg]}.{" "}
                        {example.expected[alg] === bytesToHex(mac) ? "The computed value matches." : "The computed value does not match."}
                      </p>
                    ) : (
                      <p className={`mt-4 ${WARN_BOX}`} data-testid="text-reference">
                        These inputs are {example.source}, which publishes no HMAC-{alg} value.
                      </p>
                    )
                  ) : null}
                  {!constructionAgrees ? (
                    <p role="alert" className={`mt-4 ${ERROR_BOX}`}>
                      The step-by-step construction disagrees with WebCrypto. That should be impossible; please treat
                      both values as suspect.
                    </p>
                  ) : null}
                </>
              )}
            </ToolPanel>

            <ToolPanel title="Verify a MAC">
              <label htmlFor="hmac-expected" className={LABEL}>
                MAC to check
              </label>
              <div className="mt-2">
                <FormatPicker
                  id="expected-format"
                  label="Format of the MAC to check"
                  value={expectedFormat}
                  onChange={(v) => setExpectedFormat(v as ExpectedFormat)}
                  options={EXPECTED_FORMATS}
                />
              </div>
              <textarea
                id="hmac-expected"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                rows={2}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="sha256=5bdcc146bf60754e..."
                data-testid="input-expected"
                className={`${FIELD} resize-y break-all leading-relaxed`}
              />
              <div className="mt-3 space-y-2" role="status" aria-live="polite" data-testid="text-verify-result">
                {expectedParsed === null ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    Paste a MAC in hex or Base64. A GitHub style sha256= prefix is accepted.
                  </p>
                ) : !expectedParsed.ok ? (
                  <p className={ERROR_BOX}>{expectedParsed.error}</p>
                ) : !mac ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    Waiting for a valid key and message.
                  </p>
                ) : (
                  <>
                    <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                      Read as {expectedParsed.format === "hex" ? "hex" : "Base64"}, {expectedParsed.bytes.length} bytes
                      {expectedParsed.prefix ? `, with the ${expectedParsed.prefix}= label removed` : ""}.
                    </p>
                    {outcome?.kind === "match" ? (
                      <p className={OK_BOX}>Match. The MAC equals HMAC-{alg} of this message under this key.</p>
                    ) : outcome?.kind === "truncated-match" ? (
                      <p className={OK_BOX}>
                        Match as a truncated MAC: it equals the first {outcome.bytes} of {info.outBytes} bytes. RFC 2104
                        section 5 allows truncation to no less than half the output and no less than 80 bits.
                      </p>
                    ) : outcome?.kind === "length" ? (
                      <p className={ERROR_BOX}>
                        No match. The MAC is {outcome.provided} bytes and HMAC-{alg} is {outcome.computed}
                        {outcome.prefixChecked
                          ? `. It is not the first ${outcome.provided} bytes of it either, so it is not a truncated HMAC-${alg}.`
                          : ", so they cannot be equal."}
                      </p>
                    ) : (
                      <p className={ERROR_BOX}>No match. Same length, different bytes.</p>
                    )}
                    {needsDiagnosis ? (
                      messageTooBigToDiagnose ? (
                        <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                          The usual-mistakes search runs only on messages up to {formatBytes(MAX_DIAGNOSE_BYTES)}.
                        </p>
                      ) : !freshDiagnosis ? (
                        <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                          Trying the usual mistakes...
                        </p>
                      ) : freshDiagnosis.result ? (
                        <p className={WARN_BOX} data-testid="text-diagnosis">
                          It does match with {freshDiagnosis.result.changes.join(", and ")}.
                        </p>
                      ) : (
                        <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]" data-testid="text-diagnosis">
                          Not explained by a different hash, a key read in another format, or a trailing line break.
                          The key or the exact message bytes differ.
                        </p>
                      )
                    ) : null}
                  </>
                )}
              </div>
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                The comparison reads every byte before it answers. An early-exit comparison on a server answers sooner
                the earlier the first wrong byte is, and over many requests that difference can be measured.
              </p>
            </ToolPanel>
          </div>
        </div>

        {fresh?.macs ? (
          <ToolPanel title="Every hash">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] border-collapse text-left" data-testid="table-all-hashes">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      Hash
                    </th>
                    <th scope="col" className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      MAC, hex
                    </th>
                    {example ? (
                      <th scope="col" className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                        Published
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {HMAC_ALGS.map((a) => {
                    const value = bytesToHex(fresh.macs![a.id]);
                    const published = example?.expected[a.id];
                    return (
                      <tr key={a.id} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                        <th scope="row" className="py-3 pr-4 font-normal">
                          <button
                            type="button"
                            onClick={() => setAlg(a.id)}
                            aria-pressed={alg === a.id}
                            className={`inline-flex min-h-[32px] items-center rounded-md px-2 font-mono-tight text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${alg === a.id ? "bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone-dim))] hover:text-[hsl(var(--brand-bone))]"}`}
                          >
                            {a.id}
                          </button>
                          <span className="mt-1 block px-2 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                            {a.outBytes * 8} bits
                          </span>
                        </th>
                        <td className="break-all py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]">
                          {value}
                        </td>
                        {example ? (
                          <td className="py-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                            {published ? (
                              published === value ? (
                                <span className="text-[hsl(var(--brand-signal))]">matches</span>
                              ) : (
                                <span className="text-[hsl(var(--brand-danger))]">differs</span>
                              )
                            ) : (
                              "none"
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The output length alone identifies the hash: 20, 32, 48 or 64 bytes. A MAC that matches none of these
              rows under any hash came from different key or message bytes.
            </p>
          </ToolPanel>
        ) : null}

        {steps && mac ? (
          <ToolPanel title="How it was built, RFC 2104">
            <pre className={PRE}>
              {`K0    = ${steps.keyHashed ? `${alg}(K)` : "K"} padded with zeros to B = ${steps.blockBytes} bytes
inner = ${alg}((K0 xor 0x36 repeated) || message)
MAC   = ${alg}((K0 xor 0x5c repeated) || inner)`}
            </pre>
            <div className="mt-4">
              <ToolResult label="Block size B" value={`${steps.blockBytes} bytes`} />
              <ToolResult label="Key length" value={`${steps.keyBytes} ${steps.keyBytes === 1 ? "byte" : "bytes"}`} />
              <ToolResult
                label="Key handling"
                value={
                  steps.keyHashed
                    ? `longer than B, so hashed to ${info.outBytes} bytes first`
                    : steps.keyBytes === steps.blockBytes
                      ? "exactly B, used as is"
                      : `zero padded from ${steps.keyBytes} to ${steps.blockBytes} bytes`
                }
              />
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <div className={LABEL}>K0, {steps.k0.length} bytes</div>
                <pre className={`mt-2 ${PRE}`} data-testid="text-k0">
                  {bytesToHex(steps.k0)}
                </pre>
              </div>
              <div>
                <div className={LABEL}>Inner hash, {steps.inner.length} bytes</div>
                <pre className={`mt-2 ${PRE}`} data-testid="text-inner-hash">
                  {bytesToHex(steps.inner)}
                </pre>
              </div>
              <div>
                <div className={LABEL}>Outer hash, the MAC</div>
                <pre className={`mt-2 ${PRE}`}>{bytesToHex(steps.mac)}</pre>
              </div>
            </div>
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
