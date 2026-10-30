/**
 * TOTP and HOTP generator.
 *
 * The secret is decoded once into bytes and every code on the page is
 * HMAC(secret, counter) through WebCrypto, truncated as RFC 4226 section 5.3
 * describes. TOTP only changes where the counter comes from: RFC 6238 makes
 * it the number of whole time steps since the Unix epoch. The secret stays
 * in component state in this tab and is never stored or sent anywhere.
 */

import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  buildOtpauthUri,
  bytesToHex,
  decodeBase32,
  DEFAULT_PERIOD,
  encodeBase32,
  findMatches,
  groupBase32,
  importOtpKey,
  MAX_DIGITS,
  MAX_HOTP_LOOKAHEAD,
  MAX_INPUT_CHARS,
  MAX_TOTP_WINDOW,
  MIN_DIGITS,
  MIN_SECRET_BYTES,
  OTP_ALGS,
  otpWithKey,
  parseOtpauthUri,
  parsePeriod,
  parseUint64,
  RECOMMENDED_SECRET_BYTES,
  secondsRemaining,
  timeStep,
  UINT64_MAX,
  type OtpAlg,
  type OtpauthUri,
  type OtpResult,
} from "@/lib/toolkit/totp-generator";

type Mode = "totp" | "hotp";

const ZERO = BigInt(0);
const ONE = BigInt(1);

/* ------------------------------------------------------------- reference */

const textBytes = (s: string) => new TextEncoder().encode(s);

const SEED_20 = textBytes("12345678901234567890");
const SEED_32 = textBytes("12345678901234567890123456789012");
const SEED_64 = textBytes("1234567890123456789012345678901234567890123456789012345678901234");

interface Reference {
  secretHex: string;
  alg: OtpAlg;
  digits: number;
  counter: bigint;
  code: string;
  source: string;
}

/**
 * Every published vector, keyed by what the code actually depends on:
 * secret, hash, digits and counter. Whenever the inputs land on one, the
 * page shows the published value next to the computed one. RFC 6238's
 * reference implementation uses a 32 byte seed for SHA-256 and a 64 byte
 * seed for SHA-512, and the Appendix B table was produced with those.
 */
const REFERENCES: Reference[] = (() => {
  const out: Reference[] = [];
  const hotp = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  hotp.forEach((code, i) =>
    out.push({
      secretHex: bytesToHex(SEED_20),
      alg: "SHA-1",
      digits: 6,
      counter: BigInt(i),
      code,
      source: `RFC 4226 Appendix D, count ${i}`,
    }),
  );
  const table: [string, string, string, string, string][] = [
    ["59", "1", "94287082", "46119246", "90693936"],
    ["1111111109", "23523EC", "07081804", "68084774", "25091201"],
    ["1111111111", "23523ED", "14050471", "67062674", "99943326"],
    ["1234567890", "273EF07", "89005924", "91819424", "93441116"],
    ["2000000000", "3F940AA", "69279037", "90698825", "38618901"],
    ["20000000000", "27BC86AA", "65353130", "77737706", "47863826"],
  ];
  for (const [time, tHex, s1, s256, s512] of table) {
    const counter = BigInt(`0x${tHex}`);
    const source = `RFC 6238 Appendix B, time ${time}`;
    out.push({ secretHex: bytesToHex(SEED_20), alg: "SHA-1", digits: 8, counter, code: s1, source });
    out.push({ secretHex: bytesToHex(SEED_32), alg: "SHA-256", digits: 8, counter, code: s256, source });
    out.push({ secretHex: bytesToHex(SEED_64), alg: "SHA-512", digits: 8, counter, code: s512, source });
  }
  return out;
})();

interface Example {
  id: string;
  label: string;
  input: string;
  mode: Mode;
  alg: OtpAlg;
  digits: number;
  fixed: string;
  counter: string;
}

const EXAMPLES: Example[] = [
  { id: "rfc6238-sha1", label: "RFC 6238 SHA-1", input: encodeBase32(SEED_20), mode: "totp", alg: "SHA-1", digits: 8, fixed: "59", counter: "0" },
  { id: "rfc6238-sha256", label: "RFC 6238 SHA-256", input: encodeBase32(SEED_32), mode: "totp", alg: "SHA-256", digits: 8, fixed: "59", counter: "0" },
  { id: "rfc6238-sha512", label: "RFC 6238 SHA-512", input: encodeBase32(SEED_64), mode: "totp", alg: "SHA-512", digits: 8, fixed: "59", counter: "0" },
  { id: "rfc4226", label: "RFC 4226 HOTP", input: encodeBase32(SEED_20), mode: "hotp", alg: "SHA-1", digits: 6, fixed: "", counter: "0" },
  {
    id: "key-uri",
    label: "Key URI",
    input: "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example",
    mode: "totp",
    alg: "SHA-1",
    digits: 6,
    fixed: "",
    counter: "0",
  },
];

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

const pillClass = (on: boolean) =>
  `inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${on ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]" : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"}`;

const chipClass =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-40";

/* --------------------------------------------------------------- helpers */

function hexBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

function hex32(n: number): string {
  return `0x${(n >>> 0).toString(16).padStart(8, "0")}`;
}

/** The code split in two for reading, as spans so the copied text has no space. */
function CodeDigits({ code }: { code: string }) {
  const cut = code.length === 8 ? 4 : 3;
  return (
    <>
      <span>{code.slice(0, cut)}</span>
      <span className="ml-[0.35em]">{code.slice(cut)}</span>
    </>
  );
}

function utcFromSeconds(seconds: bigint): string {
  // Date covers 8.64e15 ms either side of the epoch, which is 8.64e12 s.
  if (seconds > BigInt(8_640_000_000_000)) return "beyond the range a JavaScript date can show";
  return new Date(Number(seconds) * 1000).toISOString().replace(".000Z", "Z");
}

function plural(n: bigint | number, unit: string): string {
  return `${n.toString()} ${unit}${n.toString() === "1" ? "" : "s"}`;
}

type SecretState =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; bytes: Uint8Array; base32: string; uri: OtpauthUri | null };

function readSecret(input: string): SecretState {
  const text = input.trim();
  if (text === "") return { kind: "empty" };
  if (text.length > MAX_INPUT_CHARS) {
    return { kind: "error", message: `That is ${text.length} characters. This tool reads up to ${MAX_INPUT_CHARS}.` };
  }
  if (/^otpauth:/i.test(text)) {
    const parsed = parseOtpauthUri(text);
    if (!parsed.ok) return { kind: "error", message: parsed.error };
    return { kind: "ok", bytes: parsed.value.secret, base32: parsed.value.secretBase32, uri: parsed.value };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    return { kind: "error", message: "That looks like a URL but not an otpauth:// key URI." };
  }
  const decoded = decodeBase32(text);
  if (!decoded.ok) return { kind: "error", message: decoded.error };
  if (decoded.bytes.length === 0) return { kind: "error", message: "The secret decodes to zero bytes." };
  return { kind: "ok", bytes: decoded.bytes, base32: decoded.normalized, uri: null };
}

type Codes =
  | { forId: string; ok: true; current: OtpResult; prev: OtpResult | null; next: OtpResult | null }
  | { forId: string; ok: false; error: string };

type CheckResult = { forId: string; matches: bigint[] } | { forId: string; error: string };

function errorText(e: unknown): string {
  return e instanceof Error && e.name === "CryptoUnavailableError"
    ? e.message
    : "The browser refused to compute the HMAC for this secret.";
}

/* ------------------------------------------------------------------ view */

export function TotpGenerator() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("totp");
  const [alg, setAlg] = useState<OtpAlg>("SHA-1");
  const [digits, setDigits] = useState(6);
  const [periodDraft, setPeriodDraft] = useState(String(DEFAULT_PERIOD));
  const [counterDraft, setCounterDraft] = useState("0");
  const [fixedDraft, setFixedDraft] = useState("");
  const [issuer, setIssuer] = useState("");
  const [account, setAccount] = useState("");
  const [checkDraft, setCheckDraft] = useState("");
  const [windowDraft, setWindowDraft] = useState("1");
  const [lookaheadDraft, setLookaheadDraft] = useState("10");

  const secret = useMemo(() => readSecret(input), [input]);
  const secretBytes = secret.kind === "ok" ? secret.bytes : null;
  const secretHex = secretBytes ? bytesToHex(secretBytes) : "";

  const period = useMemo(() => parsePeriod(periodDraft), [periodDraft]);
  const counter = useMemo(() => parseUint64(counterDraft, "counter"), [counterDraft]);
  const fixed = useMemo(
    () => (fixedDraft.trim() === "" ? null : parseUint64(fixedDraft, "Unix time")),
    [fixedDraft],
  );

  // The live clock is the only thing that moves on its own, and only runs
  // while a TOTP code is on screen following it.
  const live = mode === "totp" && fixed === null && secret.kind === "ok";
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [live]);

  const unixSeconds: bigint | null = live ? BigInt(Math.floor(nowMs / 1000)) : fixed && fixed.ok ? fixed.value : null;
  const step: bigint | null = mode === "totp" && period.ok && unixSeconds !== null ? timeStep(unixSeconds, period.value) : null;
  const center: bigint | null = mode === "totp" ? step : counter.ok ? counter.value : null;

  const computeId = secretBytes && center !== null ? `${secretHex}|${alg}|${digits}|${center.toString()}` : "";
  const [codes, setCodes] = useState<Codes | null>(null);
  useEffect(() => {
    if (!secretBytes || center === null) return;
    let cancelled = false;
    const id = `${bytesToHex(secretBytes)}|${alg}|${digits}|${center.toString()}`;
    (async () => {
      try {
        const key = await importOtpKey(secretBytes, alg);
        const current = await otpWithKey(key, center, digits);
        const prev = center > ZERO ? await otpWithKey(key, center - ONE, digits) : null;
        const next = center < UINT64_MAX ? await otpWithKey(key, center + ONE, digits) : null;
        if (!cancelled) setCodes({ forId: id, ok: true, current, prev, next });
      } catch (e) {
        if (!cancelled) setCodes({ forId: id, ok: false, error: errorText(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [secretBytes, alg, digits, center]);
  const fresh = codes && codes.forId === computeId ? codes : null;
  const current = fresh && fresh.ok ? fresh.current : null;

  /* ---- check a code */
  const checkCode = checkDraft.replace(/\s/g, "");
  const windowParsed = useMemo(() => {
    const max = mode === "totp" ? MAX_TOTP_WINDOW : MAX_HOTP_LOOKAHEAD;
    const raw = (mode === "totp" ? windowDraft : lookaheadDraft).trim();
    if (!/^\d+$/.test(raw) || Number(raw) > max) {
      return { ok: false as const, error: `Use a whole number from 0 to ${max}.` };
    }
    return { ok: true as const, value: Number(raw) };
  }, [mode, windowDraft, lookaheadDraft]);
  const checkReady =
    secretBytes !== null && center !== null && windowParsed.ok && /^\d+$/.test(checkCode) && checkCode.length === digits;
  const checkId = checkReady && windowParsed.ok ? `${computeId}|${mode}|${checkCode}|${windowParsed.value}` : "";
  const [check, setCheck] = useState<CheckResult | null>(null);
  useEffect(() => {
    if (!checkReady || !secretBytes || center === null || !windowParsed.ok) return;
    let cancelled = false;
    const id = checkId;
    const behind = mode === "totp" ? windowParsed.value : 0;
    const ahead = windowParsed.value;
    findMatches(secretBytes, alg, digits, checkCode, center, behind, ahead)
      .then((matches) => {
        if (!cancelled) setCheck({ forId: id, matches });
      })
      .catch((e: unknown) => {
        if (!cancelled) setCheck({ forId: id, error: errorText(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [checkReady, checkId, secretBytes, alg, digits, checkCode, center, mode, windowParsed]);
  const freshCheck = check && check.forId === checkId ? check : null;

  /* ---- published vector, if the inputs land on one */
  const reference = current
    ? REFERENCES.find(
        (r) => r.secretHex === secretHex && r.alg === alg && r.digits === digits && r.counter === current.counter,
      ) ?? null
    : null;

  /* ---- countdown */
  let secondsLeft: number | null = null;
  let fraction = 1;
  if (mode === "totp" && period.ok && unixSeconds !== null) {
    if (live) {
      const periodMs = period.value * 1000;
      const msLeft = periodMs - (nowMs % periodMs);
      secondsLeft = Math.ceil(msLeft / 1000);
      fraction = msLeft / periodMs;
    } else {
      secondsLeft = secondsRemaining(unixSeconds, period.value);
      fraction = secondsLeft / period.value;
    }
  }

  /* ---- actions */
  function applyInput(value: string) {
    setInput(value);
    const text = value.trim();
    if (!/^otpauth:/i.test(text)) return;
    const parsed = parseOtpauthUri(text);
    if (!parsed.ok) return;
    const u = parsed.value;
    setMode(u.type);
    setAlg(u.algorithm);
    setDigits(u.digits);
    setPeriodDraft(String(u.period));
    if (u.counter !== null) setCounterDraft(u.counter.toString());
    setIssuer(u.issuer ?? "");
    setAccount(u.account);
    setFixedDraft("");
  }

  function loadExample(ex: Example) {
    applyInput(ex.input);
    if (!/^otpauth:/i.test(ex.input)) {
      setMode(ex.mode);
      setAlg(ex.alg);
      setDigits(ex.digits);
      setPeriodDraft(String(DEFAULT_PERIOD));
      setCounterDraft(ex.counter);
      setFixedDraft(ex.fixed);
      setIssuer("");
      setAccount("");
    }
    setCheckDraft("");
  }

  function randomSecret() {
    try {
      const bytes = new Uint8Array(RECOMMENDED_SECRET_BYTES);
      globalThis.crypto.getRandomValues(bytes);
      setInput(encodeBase32(bytes));
      setFixedDraft("");
    } catch {
      // No CSPRNG means no secret worth having; leave the field as it was.
    }
  }

  function bumpCounter(delta: bigint) {
    if (!counter.ok) return;
    const next = counter.value + delta;
    if (next < ZERO || next > UINT64_MAX) return;
    setCounterDraft(next.toString());
  }

  const secretWarnings: string[] =
    secret.kind === "ok"
      ? secret.uri
        ? secret.uri.warnings
        : secret.bytes.length < MIN_SECRET_BYTES
          ? [`This secret is ${secret.bytes.length * 8} bits. RFC 4226 requires at least 128 bits and recommends 160.`]
          : []
      : [];

  const uri =
    secret.kind === "ok" && period.ok && counter.ok
      ? buildOtpauthUri({
          type: mode,
          issuer,
          account,
          secretBase32: secret.base32,
          algorithm: alg,
          digits,
          period: period.value,
          counter: counter.value,
        })
      : null;

  const stepLabel = mode === "totp" ? "T" : "C";
  const t = current?.truncation ?? null;

  return (
    <ToolShell slug="totp-generator">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <ToolPanel title="Secret">
              <label htmlFor="totp-secret" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                Base32 secret, or a whole otpauth:// URI from an enrollment QR code.
              </label>
              <textarea
                id="totp-secret"
                value={input}
                onChange={(e) => applyInput(e.target.value)}
                rows={3}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={secret.kind === "error"}
                aria-describedby={secret.kind === "error" ? "totp-secret-error" : "totp-secret-hint"}
                placeholder="JBSW Y3DP EHPK 3PXP"
                data-testid="input-secret"
                className={`${FIELD} resize-y break-all leading-relaxed`}
              />
              {secret.kind === "error" ? (
                <p id="totp-secret-error" role="alert" data-testid="text-secret-error" className={`mt-3 ${ERROR_BOX}`}>
                  {secret.message}
                </p>
              ) : (
                <p id="totp-secret-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  Case, spaces, hyphens and missing = padding are all fine. Nothing is stored or sent.
                </p>
              )}

              {secret.kind === "ok" && secret.uri ? (
                <p className={`mt-3 ${OK_BOX}`} data-testid="text-uri-summary">
                  Read from the URI: {secret.uri.type.toUpperCase()}
                  {secret.uri.issuer ? `, issuer ${secret.uri.issuer}` : ""}
                  {secret.uri.account ? `, account ${secret.uri.account}` : ""}, {secret.uri.algorithm}, {secret.uri.digits} digits
                  {secret.uri.type === "totp" ? `, ${secret.uri.period} second period` : `, counter ${secret.uri.counter?.toString() ?? "0"}`}. The
                  settings were set from it.
                </p>
              ) : null}

              {secretWarnings.length ? (
                <ul className="mt-3 space-y-2" data-testid="list-secret-warnings">
                  {secretWarnings.map((w) => (
                    <li key={w} className={WARN_BOX}>
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  Try
                </span>
                {EXAMPLES.map((ex) => (
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
                <button type="button" onClick={randomSecret} data-testid="button-random-secret" className={chipClass}>
                  Random 160 bit secret
                </button>
                {input ? (
                  <button type="button" onClick={() => applyInput("")} data-testid="button-clear" className={chipClass}>
                    Clear
                  </button>
                ) : null}
              </div>
            </ToolPanel>

            <ToolPanel title="Settings">
              <div role="group" aria-labelledby="totp-mode-label">
                <div id="totp-mode-label" className={LABEL}>
                  Type
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["totp", "hotp"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      aria-pressed={mode === m}
                      data-testid={`button-mode-${m}`}
                      className={pillClass(mode === m)}
                    >
                      {m === "totp" ? "TOTP (time)" : "HOTP (counter)"}
                    </button>
                  ))}
                </div>
              </div>

              <div role="group" aria-labelledby="totp-alg-label" className="mt-5">
                <div id="totp-alg-label" className={LABEL}>
                  HMAC hash
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {OTP_ALGS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAlg(a.id)}
                      aria-pressed={alg === a.id}
                      data-testid={`button-alg-${a.uri.toLowerCase()}`}
                      className={pillClass(alg === a.id)}
                    >
                      {a.id}
                    </button>
                  ))}
                </div>
              </div>

              <div role="group" aria-labelledby="totp-digits-label" className="mt-5">
                <div id="totp-digits-label" className={LABEL}>
                  Digits
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Array.from({ length: MAX_DIGITS - MIN_DIGITS + 1 }, (_, i) => MIN_DIGITS + i).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDigits(d)}
                      aria-pressed={digits === d}
                      data-testid={`button-digits-${d}`}
                      className={pillClass(digits === d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {mode === "totp" ? (
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="totp-period" className={LABEL}>
                      Period, seconds
                    </label>
                    <input
                      id="totp-period"
                      value={periodDraft}
                      onChange={(e) => setPeriodDraft(e.target.value)}
                      inputMode="numeric"
                      spellCheck={false}
                      aria-invalid={!period.ok}
                      aria-describedby={!period.ok ? "totp-period-error" : undefined}
                      data-testid="input-period"
                      className={FIELD}
                    />
                    {!period.ok ? (
                      <p id="totp-period-error" role="alert" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                        {period.error}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="totp-fixed" className={LABEL}>
                      Fixed Unix time
                    </label>
                    <input
                      id="totp-fixed"
                      value={fixedDraft}
                      onChange={(e) => setFixedDraft(e.target.value)}
                      inputMode="numeric"
                      spellCheck={false}
                      placeholder="empty: live clock"
                      aria-invalid={fixed !== null && !fixed.ok}
                      aria-describedby={fixed !== null && !fixed.ok ? "totp-fixed-error" : "totp-fixed-hint"}
                      data-testid="input-fixed-time"
                      className={FIELD}
                    />
                    {fixed !== null && !fixed.ok ? (
                      <p id="totp-fixed-error" role="alert" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                        {fixed.error}
                      </p>
                    ) : (
                      <p id="totp-fixed-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                        {fixed === null ? "Following this device's clock." : "Frozen. Clear it to follow the clock."}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-5">
                  <label htmlFor="totp-counter" className={LABEL}>
                    Counter
                  </label>
                  <div className="mt-2 flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => bumpCounter(-ONE)}
                      disabled={!counter.ok || counter.value === ZERO}
                      aria-label="Decrease the counter by one"
                      data-testid="button-counter-down"
                      className={chipClass}
                    >
                      -1
                    </button>
                    <input
                      id="totp-counter"
                      value={counterDraft}
                      onChange={(e) => setCounterDraft(e.target.value)}
                      inputMode="numeric"
                      spellCheck={false}
                      aria-invalid={!counter.ok}
                      aria-describedby={!counter.ok ? "totp-counter-error" : undefined}
                      data-testid="input-counter"
                      className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => bumpCounter(ONE)}
                      disabled={!counter.ok || counter.value === UINT64_MAX}
                      aria-label="Increase the counter by one"
                      data-testid="button-counter-up"
                      className={chipClass}
                    >
                      +1
                    </button>
                  </div>
                  {!counter.ok ? (
                    <p id="totp-counter-error" role="alert" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                      {counter.error}
                    </p>
                  ) : null}
                </div>
              )}
            </ToolPanel>
          </div>

          <div className="space-y-6">
            <ToolPanel title={mode === "totp" ? "Current code" : "Code for this counter"}>
              {secret.kind !== "ok" ? (
                <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="text-code-empty">
                  Enter a secret, paste a key URI, or load one of the examples.
                </p>
              ) : fresh && !fresh.ok ? (
                <p role="alert" className={ERROR_BOX}>
                  {fresh.error}
                </p>
              ) : center === null ? (
                <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Fix the setting marked in red to see a code.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <p
                      data-testid="text-current-code"
                      className="font-mono-tight text-4xl tracking-[0.12em] text-[hsl(var(--brand-signal))] sm:text-5xl"
                    >
                      {current ? <CodeDigits code={current.code} /> : <span className="text-[hsl(var(--brand-ash))]">{"-".repeat(digits)}</span>}
                    </p>
                    {current ? <CopyButton value={current.code} label="Copy the current code" testId="button-copy-code" /> : null}
                  </div>

                  {secondsLeft !== null && period.ok ? (
                    <div className="mt-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]" data-testid="text-countdown">
                          {live ? `Changes in ${plural(secondsLeft, "second")}` : `${plural(secondsLeft, "second")} left in this step at the fixed time`}
                        </span>
                        <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                          {period.value} s step
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--brand-iron))]" aria-hidden>
                        <div
                          className={`h-full rounded-full ${secondsLeft <= 5 ? "bg-[hsl(var(--brand-amber))]" : "bg-[hsl(var(--brand-signal))]"}`}
                          style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {reference && current ? (
                    <p className={`mt-4 ${reference.code === current.code ? OK_BOX : ERROR_BOX}`} data-testid="text-reference">
                      {reference.source} publishes {reference.code} for this secret, hash and {stepLabel}.{" "}
                      {reference.code === current.code ? "The computed code matches." : "The computed code does not match."}
                    </p>
                  ) : null}

                  <div className="mt-4">
                    <ToolResult
                      label={`Previous (${stepLabel} - 1)`}
                      value={fresh && fresh.ok ? (fresh.prev ? fresh.prev.code : "none, already at 0") : "..."}
                      testId="text-previous-code"
                    />
                    <ToolResult
                      label={`Next (${stepLabel} + 1)`}
                      value={fresh && fresh.ok ? (fresh.next ? fresh.next.code : "none, at 2^64 - 1") : "..."}
                      testId="text-next-code"
                    />
                    {mode === "totp" && unixSeconds !== null ? (
                      <>
                        <ToolResult label="Unix time" value={unixSeconds.toString()} testId="text-unix-time" />
                        <ToolResult label="UTC" value={utcFromSeconds(unixSeconds)} />
                      </>
                    ) : null}
                    <ToolResult
                      label={mode === "totp" ? "Time step T" : "Counter C"}
                      value={center.toString()}
                      testId="text-step"
                    />
                    <ToolResult label={`${stepLabel} as 8 bytes`} value={center.toString(16).padStart(16, "0")} />
                  </div>
                  {live ? (
                    <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                      Codes follow this device's clock. If it is off by more than a step, these will not match the
                      server's.
                    </p>
                  ) : null}
                </>
              )}
            </ToolPanel>

            <ToolPanel title="Check a code">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <label htmlFor="totp-check" className={LABEL}>
                    Code to check
                  </label>
                  <input
                    id="totp-check"
                    value={checkDraft}
                    onChange={(e) => setCheckDraft(e.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={"0".repeat(digits)}
                    data-testid="input-check-code"
                    className={FIELD}
                  />
                </div>
                <div>
                  <label htmlFor="totp-window" className={LABEL}>
                    {mode === "totp" ? "Steps either side" : "Look-ahead"}
                  </label>
                  <input
                    id="totp-window"
                    value={mode === "totp" ? windowDraft : lookaheadDraft}
                    onChange={(e) => (mode === "totp" ? setWindowDraft(e.target.value) : setLookaheadDraft(e.target.value))}
                    inputMode="numeric"
                    spellCheck={false}
                    aria-invalid={!windowParsed.ok}
                    data-testid="input-check-window"
                    className={`${FIELD} sm:w-32`}
                  />
                </div>
              </div>
              <div className="mt-3" role="status" aria-live="polite" data-testid="text-check-result">
                {!windowParsed.ok ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">{windowParsed.error}</p>
                ) : checkCode === "" ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {mode === "totp"
                      ? `Searches ${windowDraft.trim() || "0"} step(s) before and after now, the way a server tolerates clock drift (RFC 6238 section 5.2). The most is ${MAX_TOTP_WINDOW}.`
                      : `Searches the current counter and up to ${lookaheadDraft.trim() || "0"} ahead, the resynchronization window of RFC 4226 section 7.4. The most is ${MAX_HOTP_LOOKAHEAD}.`}
                  </p>
                ) : !/^\d+$/.test(checkCode) ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">A code is digits only.</p>
                ) : checkCode.length !== digits ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    Enter all {digits} digits. This has {checkCode.length}.
                  </p>
                ) : secret.kind !== "ok" || center === null ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">Needs a valid secret and settings first.</p>
                ) : !freshCheck ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">Checking...</p>
                ) : "error" in freshCheck ? (
                  <p className={ERROR_BOX}>{freshCheck.error}</p>
                ) : freshCheck.matches.length === 0 ? (
                  <p className={ERROR_BOX}>
                    No match.{" "}
                    {mode === "totp"
                      ? `Not valid at ${stepLabel} or within ${plural(windowParsed.ok ? windowParsed.value : 0, "step")} of it.`
                      : `Not valid for counters ${center.toString()} to ${(center + BigInt(windowParsed.ok ? windowParsed.value : 0)).toString()}.`}{" "}
                    Check the hash, digit count and period, which change every code.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {freshCheck.matches.map((m) => {
                      const delta = m - center;
                      const abs = delta < ZERO ? -delta : delta;
                      let text: string;
                      if (mode === "totp") {
                        const secs = period.ok ? abs * BigInt(period.value) : ZERO;
                        text =
                          delta === ZERO
                            ? "Match at the current time step."
                            : delta < ZERO
                              ? `Match ${plural(abs, "step")} behind (${plural(secs, "second")}). The code is from an earlier step, or the device that made it runs that far slow.`
                              : `Match ${plural(abs, "step")} ahead (${plural(secs, "second")}). The device that made it runs that far fast, or this clock is slow.`;
                      } else {
                        text =
                          delta === ZERO
                            ? `Match at counter ${m.toString()}. A server would accept it and move its counter to ${(m + ONE).toString()}.`
                            : `Match at counter ${m.toString()}, ${plural(abs, "step")} ahead. A server with this look-ahead would accept it and resynchronize to ${(m + ONE).toString()}.`;
                      }
                      return (
                        <li key={m.toString()} className={OK_BOX}>
                          {text}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </ToolPanel>
          </div>
        </div>

        {current && t ? (
          <ToolPanel title="Dynamic truncation, RFC 4226 section 5.3">
            <ol className="space-y-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="list-truncation">
              <li>
                <div className={LABEL}>1. Counter as 8 bytes, big-endian</div>
                <div className="mt-1 break-all text-sm text-[hsl(var(--brand-bone))]">
                  {stepLabel} = {current.counter.toString()} = {hexBytes(current.counterBytes)}
                </div>
              </li>
              <li>
                <div className={LABEL}>
                  2. HMAC-{alg}(secret, counter), {current.hmac.length} bytes
                </div>
                <div className="mt-2 flex flex-wrap gap-x-1.5 gap-y-1 text-sm" data-testid="text-hmac-bytes">
                  {Array.from(current.hmac, (b, i) => {
                    const picked = i >= t.offset && i < t.offset + 4;
                    const last = i === current.hmac.length - 1;
                    return (
                      <span
                        key={i}
                        className={
                          picked
                            ? "rounded bg-[hsl(var(--brand-signal)/0.16)] px-0.5 text-[hsl(var(--brand-signal))]"
                            : last
                              ? "rounded bg-[hsl(var(--brand-amber)/0.16)] px-0.5 text-[hsl(var(--brand-amber))]"
                              : "px-0.5 text-[hsl(var(--brand-bone))]"
                        }
                      >
                        {b.toString(16).padStart(2, "0")}
                      </span>
                    );
                  })}
                </div>
                <p className="mt-2 text-[hsl(var(--brand-ash))]">
                  <span className="text-[hsl(var(--brand-amber))]">Amber</span> is the last byte, which picks the
                  offset. <span className="text-[hsl(var(--brand-signal))]">Green</span> is the four bytes it picks.
                </p>
              </li>
              <li>
                <div className={LABEL}>3. Offset from the low four bits of the last byte</div>
                <div className="mt-1 break-all text-sm text-[hsl(var(--brand-bone))]">
                  0x{t.lastByte.toString(16).padStart(2, "0")} &amp; 0x0f = {t.offset}
                </div>
              </li>
              <li>
                <div className={LABEL}>
                  4. Bytes {t.offset} to {t.offset + 3} as a 32 bit integer
                </div>
                <div className="mt-1 break-all text-sm text-[hsl(var(--brand-bone))]">
                  {hexBytes(t.selected)} = {hex32(t.word)}
                </div>
              </li>
              <li>
                <div className={LABEL}>5. Clear the top bit, leaving 31 bits</div>
                <div className="mt-1 break-all text-sm text-[hsl(var(--brand-bone))]">
                  {hex32(t.word)} &amp; 0x7fffffff = {hex32(t.binCode)} = {t.binCode}
                </div>
              </li>
              <li>
                <div className={LABEL}>6. Keep the last {digits} decimal digits</div>
                <div className="mt-1 break-all text-sm text-[hsl(var(--brand-bone))]">
                  {t.binCode} mod 10^{digits} = {t.binCode % 10 ** digits}
                  {String(t.binCode % 10 ** digits).length < digits ? `, zero padded to ${current.code}` : ""}
                </div>
              </li>
            </ol>
          </ToolPanel>
        ) : null}

        {secret.kind === "ok" ? (
          <ToolPanel title="Key URI">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="totp-issuer" className={LABEL}>
                  Issuer
                </label>
                <input
                  id="totp-issuer"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  spellCheck={false}
                  placeholder="Example Corp"
                  data-testid="input-issuer"
                  className={FIELD}
                />
              </div>
              <div>
                <label htmlFor="totp-account" className={LABEL}>
                  Account
                </label>
                <input
                  id="totp-account"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  spellCheck={false}
                  placeholder="alice@example.com"
                  data-testid="input-account"
                  className={FIELD}
                />
              </div>
            </div>
            <div className="mt-4">
              <ToolResult
                label={`Secret, Base32 (${secret.bytes.length * 8} bits)`}
                value={groupBase32(secret.base32)}
                testId="text-secret-base32"
              />
              <ToolResult label="Secret, hex" value={secretHex} />
            </div>
            {uri ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <pre
                  data-testid="text-otpauth-uri"
                  className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]"
                >
                  {uri}
                </pre>
                <CopyButton value={uri} label="Copy the otpauth URI" testId="button-copy-uri" />
              </div>
            ) : null}
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              This is what an enrollment QR code encodes. Anyone holding it can generate every future code, so treat
              it like a password.
            </p>
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
