/**
 * JWT encoder and verifier.
 *
 * Builds a JWS Compact Serialization from header and payload JSON and signs
 * it with WebCrypto (HS256, HS384, HS512 with a shared secret, RS256 and
 * ES256 with a PKCS#8 private key), then verifies pasted tokens with a secret
 * or an SPKI public key. The verifier lets the key decide the algorithm
 * family, so a public key never checks an HMAC token. Keys, secrets and
 * tokens stay in component state in this tab; nothing is stored or sent.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  algInfo,
  buildToken,
  CryptoUnavailableError,
  generateKeyPair,
  JWS_ALGS,
  MAX_JSON_CHARS,
  prettyJson,
  randomSecret,
  setHeaderAlg,
  setNumericClaim,
  verifyToken,
  type BuildInput,
  type BuildResult,
  type JwsAlg,
  type KeyInput,
  type Note,
  type SecretFormat,
  type VerifyResult,
} from "@/lib/toolkit/jwt-encoder";

/* ---------------------------------------------------------------- styles */

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const PRE =
  "max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]";
const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:opacity-60";

const pillClass = (on: boolean) =>
  `inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${on ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]" : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"}`;

const TONE_STYLE: Record<Note["tone"], string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
};
const TONE_LABEL: Record<Note["tone"], string> = { danger: "Risk", warn: "Warning", info: "Note", ok: "Good" };
const TONE_ORDER: Record<Note["tone"], number> = { danger: 0, warn: 1, info: 2, ok: 3 };

/* -------------------------------------------------------------- defaults */

// The long-standing jwt.io example, so the first token on the page is one
// that can be checked against an independent source.
const DEFAULT_HEADER = JSON.stringify({ alg: "HS256", typ: "JWT" }, null, 2);
const DEFAULT_PAYLOAD = JSON.stringify({ sub: "1234567890", name: "John Doe", iat: 1516239022 }, null, 2);
const DEFAULT_SECRET = "your-256-bit-secret";

const CLAIM_HELPERS: { id: string; label: string; claim: "iat" | "nbf" | "exp"; offset: number }[] = [
  { id: "iat", label: "iat: now", claim: "iat", offset: 0 },
  { id: "nbf", label: "nbf: now", claim: "nbf", offset: 0 },
  { id: "exp-15m", label: "exp: +15 min", claim: "exp", offset: 900 },
  { id: "exp-1h", label: "exp: +1 hour", claim: "exp", offset: 3600 },
  { id: "exp-1d", label: "exp: +1 day", claim: "exp", offset: 86_400 },
];

/* ------------------------------------------------------------------ view */

function NoteList({ notes, testId }: { notes: Note[]; testId?: string }) {
  if (!notes.length) return null;
  const sorted = [...notes].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  return (
    <ul className="space-y-2" data-testid={testId}>
      {sorted.map((n, i) => (
        <li key={`${i}-${n.text}`} className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[n.tone]}`}>
          <span className="uppercase tracking-[0.2em]">{TONE_LABEL[n.tone]}: </span>
          {n.text}
        </li>
      ))}
    </ul>
  );
}

function ColoredToken({ headerSeg, payloadSeg, signatureSeg, testId }: { headerSeg: string; payloadSeg: string; signatureSeg: string; testId: string }) {
  return (
    <p
      data-testid={testId}
      className="break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3 font-mono-tight text-xs leading-relaxed"
    >
      <span className="text-[hsl(var(--brand-amber))]">{headerSeg}</span>
      <span className="text-[hsl(var(--brand-ash))]">.</span>
      <span className="text-[hsl(var(--brand-signal))]">{payloadSeg}</span>
      <span className="text-[hsl(var(--brand-ash))]">.</span>
      <span className="text-[hsl(var(--brand-cyan))]">{signatureSeg}</span>
    </p>
  );
}

function Pills<T extends string>({
  label,
  value,
  options,
  onChange,
  idPrefix,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  idPrefix: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          data-testid={`button-${idPrefix}-${o.id.toLowerCase()}`}
          className={pillClass(value === o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SECRET_FORMATS: { id: SecretFormat; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "base64", label: "Base64" },
];

function keyGenError(e: unknown): string {
  return e instanceof CryptoUnavailableError ? e.message : "The browser could not generate a key here.";
}

export function JwtEncoder() {
  /* ---- build state */
  const [alg, setAlg] = useState<JwsAlg>("HS256");
  const [headerText, setHeaderText] = useState(DEFAULT_HEADER);
  const [payloadText, setPayloadText] = useState(DEFAULT_PAYLOAD);
  const [secret, setSecret] = useState(DEFAULT_SECRET);
  const [secretFormat, setSecretFormat] = useState<SecretFormat>("text");
  const [rsaPem, setRsaPem] = useState("");
  const [ecPem, setEcPem] = useState("");
  const [helperError, setHelperError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const info = algInfo(alg);
  const pem = info.family === "rsa" ? rsaPem : ecPem;
  const setPem = info.family === "rsa" ? setRsaPem : setEcPem;

  const buildInput: BuildInput = useMemo(
    () => ({
      alg,
      headerText,
      payloadText,
      key: info.family === "hmac" ? { kind: "secret", text: secret, format: secretFormat } : { kind: "pem", text: pem },
    }),
    [alg, headerText, payloadText, secret, secretFormat, pem, info.family],
  );

  const [built, setBuilt] = useState<{ input: BuildInput; result: BuildResult } | null>(null);
  useEffect(() => {
    let cancelled = false;
    buildToken(buildInput)
      .then((result) => {
        if (!cancelled) setBuilt({ input: buildInput, result });
      })
      .catch(() => {
        if (!cancelled) setBuilt({ input: buildInput, result: { ok: false, error: "The browser refused to sign this token.", notes: [] } });
      });
    return () => {
      cancelled = true;
    };
  }, [buildInput]);
  // The last result stays on screen, dimmed, while the next one is computed,
  // so typing does not flash a placeholder. Signing takes milliseconds.
  const result = built ? built.result : null;
  const buildPending = !built || built.input !== buildInput;

  // A key pair generation outlives a click; drop its result if the page is gone.
  // Set on every mount, so a remount (React StrictMode runs effects twice) does not leave it false.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function chooseAlg(next: JwsAlg) {
    setAlg(next);
    setHeaderText((h) => setHeaderAlg(h, next) ?? h);
    setGenerateError(null);
  }

  function addClaim(claim: "iat" | "nbf" | "exp", offset: number) {
    const r = setNumericClaim(payloadText, claim, Math.floor(Date.now() / 1000) + offset);
    if (r.ok) {
      setPayloadText(r.text);
      setHelperError(null);
    } else setHelperError(r.error);
  }

  function newSecret() {
    try {
      setSecret(randomSecret(info));
      setSecretFormat("base64");
      setGenerateError(null);
    } catch (e) {
      setGenerateError(keyGenError(e));
    }
  }

  async function newKeyPair() {
    const forAlg = info;
    const setter = setPem;
    setGenerating(true);
    setGenerateError(null);
    try {
      const pair = await generateKeyPair(forAlg);
      if (mounted.current) setter(pair.privatePem);
    } catch (e) {
      if (mounted.current) setGenerateError(keyGenError(e));
    } finally {
      if (mounted.current) setGenerating(false);
    }
  }

  /* ---- verify state */
  const [verifyText, setVerifyText] = useState("");
  const [keyKind, setKeyKind] = useState<"secret" | "pem">("secret");
  const [verifySecret, setVerifySecret] = useState("");
  const [verifySecretFormat, setVerifySecretFormat] = useState<SecretFormat>("text");
  const [verifyPem, setVerifyPem] = useState("");
  const verifyRef = useRef<HTMLTextAreaElement>(null);

  const verifyKey: KeyInput = useMemo(
    () => (keyKind === "secret" ? { kind: "secret", text: verifySecret, format: verifySecretFormat } : { kind: "pem", text: verifyPem }),
    [keyKind, verifySecret, verifySecretFormat, verifyPem],
  );
  const verifyInput = useMemo(() => ({ token: verifyText, key: verifyKey }), [verifyText, verifyKey]);
  const [verified, setVerified] = useState<{ input: typeof verifyInput; result: VerifyResult } | null>(null);
  const verifyReady = verifyText.trim() !== "";
  useEffect(() => {
    if (!verifyReady) return;
    let cancelled = false;
    verifyToken(verifyInput.token, verifyInput.key, Math.floor(Date.now() / 1000))
      .then((r) => {
        if (!cancelled) setVerified({ input: verifyInput, result: r });
      })
      .catch(() => {
        if (!cancelled) setVerified({ input: verifyInput, result: { ok: false, error: "The browser refused to run the verification." } });
      });
    return () => {
      cancelled = true;
    };
  }, [verifyInput, verifyReady]);
  const vResult = verifyReady && verified ? verified.result : null;
  const verifyPending = !verified || verified.input !== verifyInput;

  function sendToVerifier() {
    if (!result || !result.ok || buildPending) return;
    setVerifyText(result.token);
    if (info.family === "hmac") {
      setKeyKind("secret");
      setVerifySecret(secret);
      setVerifySecretFormat(secretFormat);
    } else {
      setKeyKind("pem");
      setVerifyPem(result.publicPem ?? "");
    }
    verifyRef.current?.focus();
  }

  const headerTooLong = headerText.length > MAX_JSON_CHARS;
  const payloadTooLong = payloadText.length > MAX_JSON_CHARS;

  return (
    <ToolShell slug="jwt-encoder">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Build and sign">
            <div role="group" aria-labelledby="jwt-alg-label">
              <div id="jwt-alg-label" className={LABEL}>
                Algorithm
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {JWS_ALGS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => chooseAlg(a.id)}
                    aria-pressed={alg === a.id}
                    title={a.label}
                    data-testid={`button-alg-${a.id.toLowerCase()}`}
                    className={pillClass(alg === a.id)}
                  >
                    {a.id}
                  </button>
                ))}
              </div>
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{info.label}.</p>
            </div>

            <div className="mt-6">
              <label htmlFor="jwt-header" className={LABEL}>
                Header (JSON)
              </label>
              <textarea
                id="jwt-header"
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                rows={4}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={headerTooLong}
                data-testid="input-header"
                className={`${FIELD} resize-y break-all text-xs leading-relaxed`}
              />
            </div>

            <div className="mt-5">
              <label htmlFor="jwt-payload" className={LABEL}>
                Payload (JSON claims)
              </label>
              <textarea
                id="jwt-payload"
                value={payloadText}
                onChange={(e) => {
                  setPayloadText(e.target.value);
                  setHelperError(null);
                }}
                rows={8}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={payloadTooLong}
                aria-describedby="jwt-claim-help"
                data-testid="input-payload"
                className={`${FIELD} resize-y break-all text-xs leading-relaxed`}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Set a time claim">
                {CLAIM_HELPERS.map((c) => (
                  <button key={c.id} type="button" onClick={() => addClaim(c.claim, c.offset)} data-testid={`button-claim-${c.id}`} className={CHIP}>
                    {c.label}
                  </button>
                ))}
              </div>
              <p id="jwt-claim-help" className={`mt-2 font-mono-tight text-xs leading-relaxed ${helperError ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-ash))]"}`} role={helperError ? "alert" : undefined}>
                {helperError ?? "Times are NumericDate: whole seconds since 1970 UTC, from this device's clock."}
              </p>
            </div>

            <div className="mt-6">
              {info.family === "hmac" ? (
                <>
                  <label htmlFor="jwt-secret" className={LABEL}>
                    Shared secret
                  </label>
                  <div className="mt-2">
                    <Pills label="Secret format" value={secretFormat} options={SECRET_FORMATS} onChange={setSecretFormat} idPrefix="secret-format" />
                  </div>
                  <textarea
                    id="jwt-secret"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    rows={2}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    data-testid="input-secret"
                    className={`${FIELD} resize-y break-all text-xs leading-relaxed`}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={newSecret} data-testid="button-random-secret" className={CHIP}>
                      Random {info.hashBytes}-byte secret
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label htmlFor="jwt-private-key" className={LABEL}>
                    Private key (PKCS#8 PEM, {info.family === "rsa" ? "RSA" : "EC P-256"})
                  </label>
                  <textarea
                    id="jwt-private-key"
                    value={pem}
                    onChange={(e) => setPem(e.target.value)}
                    rows={6}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
                    data-testid="input-private-key"
                    className={`${FIELD} resize-y break-all text-xs leading-relaxed`}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={newKeyPair} disabled={generating} data-testid="button-generate-keys" className={CHIP}>
                      {generating ? "Generating..." : `Generate a test ${info.family === "rsa" ? "RSA 2048" : "P-256"} key`}
                    </button>
                  </div>
                </>
              )}
              {generateError ? (
                <p role="alert" className={`mt-3 rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE.danger}`}>
                  {generateError}
                </p>
              ) : null}
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Use test keys. Nothing leaves this tab, but a production secret or private key pasted into any web page is one to rotate.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setAlg("HS256");
                  setHeaderText(DEFAULT_HEADER);
                  setPayloadText(DEFAULT_PAYLOAD);
                  setSecret(DEFAULT_SECRET);
                  setSecretFormat("text");
                  setHelperError(null);
                  setGenerateError(null);
                }}
                data-testid="button-reset"
                className={CHIP}
              >
                Reset to the example
              </button>
            </div>
          </ToolPanel>

          <ToolPanel title="Signed token">
            <div aria-live="polite" aria-busy={buildPending} className={buildPending && result ? "opacity-60" : ""}>
              {result === null ? (
                <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]" data-testid="output-token">
                  Signing...
                </p>
              ) : !result.ok ? (
                <p role="alert" data-testid="output-token" className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE.danger}`}>
                  {result.error}
                </p>
              ) : (
                <ColoredToken headerSeg={result.headerSeg} payloadSeg={result.payloadSeg} signatureSeg={result.signatureSeg} testId="output-token" />
              )}
            </div>

            {result && result.ok ? (
              <>
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={sendToVerifier} data-testid="button-send-to-verify" className={CHIP}>
                    Check it in the verifier
                  </button>
                  <CopyButton value={result.token} label="Copy the token" testId="button-copy-token" />
                </div>
                <div className="mt-4">
                  <ToolResult label="Header segment" value={`${result.headerSeg.length} characters`} />
                  <ToolResult label="Payload segment" value={`${result.payloadSeg.length} characters`} />
                  <ToolResult label="Signature" value={`${result.signatureBytes} bytes, ${info.id}`} />
                  <ToolResult label="Token length" value={`${result.token.length.toLocaleString("en-US")} characters`} />
                </div>
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  The segments carry the compact form of the JSON you entered, so its whitespace and line breaks are not signed. The signature covers the two segments joined by a dot, exactly as they appear above.
                </p>
              </>
            ) : null}

            {result && result.notes.length ? (
              <div className="mt-5">
                <h3 className={LABEL}>Findings</h3>
                <div className="mt-3">
                  <NoteList notes={result.notes} testId="list-build-notes" />
                </div>
              </div>
            ) : null}

            {result && result.ok && result.publicPem ? (
              <div className="mt-5">
                <h3 className={LABEL}>Public key that verifies it (SPKI PEM)</h3>
                <pre className={`mt-3 ${PRE}`} data-testid="text-public-key">
                  {result.publicPem}
                </pre>
                <div className="mt-2 flex justify-end">
                  <CopyButton value={result.publicPem} label="Copy the public key" />
                </div>
              </div>
            ) : null}
          </ToolPanel>
        </div>

        <ToolPanel title="Verify a token">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="jwt-verify-token" className={LABEL}>
                Token
              </label>
              <textarea
                id="jwt-verify-token"
                ref={verifyRef}
                value={verifyText}
                onChange={(e) => setVerifyText(e.target.value)}
                rows={5}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="eyJhbGciOi..."
                data-testid="input-verify-token"
                className={`${FIELD} resize-y break-all text-xs leading-relaxed`}
              />

              <div className="mt-5">
                <div className={LABEL}>
                  Verify with
                </div>
                <div className="mt-2">
                  <Pills
                    label="Verify with"
                    value={keyKind}
                    options={[
                      { id: "secret", label: "Shared secret (HS*)" },
                      { id: "pem", label: "Public key (RS256, ES256)" },
                    ]}
                    onChange={setKeyKind}
                    idPrefix="key-kind"
                  />
                </div>
              </div>

              {keyKind === "secret" ? (
                <div className="mt-4">
                  <label htmlFor="jwt-verify-secret" className={LABEL}>
                    Secret
                  </label>
                  <div className="mt-2">
                    <Pills label="Verification secret format" value={verifySecretFormat} options={SECRET_FORMATS} onChange={setVerifySecretFormat} idPrefix="verify-secret-format" />
                  </div>
                  <textarea
                    id="jwt-verify-secret"
                    value={verifySecret}
                    onChange={(e) => setVerifySecret(e.target.value)}
                    rows={2}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    data-testid="input-verify-secret"
                    className={`${FIELD} resize-y break-all text-xs leading-relaxed`}
                  />
                </div>
              ) : (
                <div className="mt-4">
                  <label htmlFor="jwt-verify-key" className={LABEL}>
                    Public key (SPKI PEM)
                  </label>
                  <textarea
                    id="jwt-verify-key"
                    value={verifyPem}
                    onChange={(e) => setVerifyPem(e.target.value)}
                    rows={6}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder={"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}
                    data-testid="input-verify-key"
                    className={`${FIELD} resize-y break-all text-xs leading-relaxed`}
                  />
                </div>
              )}
            </div>

            <div className={`min-w-0 ${verifyPending && vResult ? "opacity-60" : ""}`} aria-live="polite" aria-busy={verifyReady && verifyPending} data-testid="output-verify">
              {!verifyReady ? (
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  Paste a token, or sign one above and send it here. The key decides the algorithm family: a secret only checks HS256, HS384 and HS512, and a public key only RS256 and ES256.
                </p>
              ) : vResult === null ? (
                <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">Checking...</p>
              ) : !vResult.ok ? (
                <p role="alert" className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE.danger}`}>
                  {vResult.error}
                </p>
              ) : (
                <div className="space-y-4">
                  <div
                    data-testid="text-verdict"
                    className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${vResult.accepted ? TONE_STYLE.ok : vResult.checked ? TONE_STYLE.danger : TONE_STYLE.warn}`}
                  >
                    <div className="uppercase tracking-[0.24em]">{vResult.accepted ? "Accepted" : vResult.checked ? "Rejected" : "Not checked"}</div>
                    <p className="mt-1">{vResult.verdict}</p>
                  </div>
                  <ColoredToken
                    headerSeg={vResult.token.headerSeg}
                    payloadSeg={vResult.token.payloadSeg}
                    signatureSeg={vResult.token.signatureSeg}
                    testId="text-verify-token"
                  />
                  <div>
                    <h3 className={LABEL}>Header</h3>
                    <pre className={`mt-2 ${PRE}`}>{prettyJson(vResult.token.header)}</pre>
                  </div>
                  <div>
                    <h3 className={LABEL}>Payload</h3>
                    <pre className={`mt-2 ${PRE}`}>
                      {vResult.token.payload ? prettyJson(vResult.token.payload) : vResult.token.payloadText ?? "(not UTF-8 text)"}
                    </pre>
                  </div>
                  <NoteList notes={vResult.notes} testId="list-verify-notes" />
                </div>
              )}
            </div>
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
