/**
 * JWT decoder.
 *
 * A JWT carries its header and payload as Base64URL text, so reading one
 * takes no key and proves nothing. This page decodes and deliberately never
 * verifies: verification needs the signing key, and a key pasted into a web
 * page is a key that has to be rotated. The token stays in component state
 * in this tab, is never persisted, and is never sent anywhere.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* --------------------------------------------------------------- decoding */

type Decoded = { ok: true; text: string } | { ok: false; reason: string };

/**
 * Base64URL swaps two characters out of Base64 and drops the padding, so the
 * segment has to be repaired before atob will look at it. The bytes then go
 * through TextDecoder because a JWT is UTF-8 and atob returns one character
 * per byte, which mangles every code point above U+007F.
 */
function decodeSegment(segment: string): Decoded {
  const repaired = segment.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*=*$/.test(repaired)) {
    return { ok: false, reason: "it holds characters outside the Base64URL alphabet" };
  }

  // A Base64 group encodes 1, 2 or 3 bytes as 2, 3 or 4 characters. A single
  // leftover character cannot have come from any whole byte, so the segment
  // lost something on the way here.
  const remainder = repaired.length % 4;
  if (remainder === 1) {
    return { ok: false, reason: "its length is impossible for Base64, so a character is missing" };
  }

  let binary: string;
  try {
    binary = atob(remainder === 0 ? repaired : repaired + "=".repeat(4 - remainder));
  } catch {
    return { ok: false, reason: "it is not valid Base64URL" };
  }

  try {
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "the bytes behind it are not valid UTF-8" };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

interface Part {
  /** The segment exactly as it appeared in the token. */
  raw: string;
  /** Pretty printed JSON, or the decoded text when it did not parse. */
  text: string;
  claims: Record<string, unknown> | null;
  error: string | null;
}

function readPart(raw: string, name: string): Part {
  const decoded = decodeSegment(raw);
  if (!decoded.ok) {
    return { raw, text: "", claims: null, error: `The ${name} did not decode: ${decoded.reason}.` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.text);
  } catch {
    return {
      raw,
      text: decoded.text,
      claims: null,
      error: `The ${name} decoded to text that is not JSON.`,
    };
  }

  const claims = asRecord(parsed);
  if (!claims) {
    return {
      raw,
      text: decoded.text,
      claims: null,
      error: `The ${name} is valid JSON but not a JSON object, which RFC 7519 requires.`,
    };
  }
  return { raw, text: JSON.stringify(claims, null, 2), claims, error: null };
}

type Outcome =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; token: string; header: Part; payload: Part; signature: string };

function parseToken(input: string): Outcome {
  // Tokens are pasted out of Authorization headers and out of wrapped log
  // lines, so the prefix and any embedded whitespace come off first.
  const token = input.trim().replace(/^Bearer\s+/i, "").replace(/\s+/g, "");
  if (!token) return { kind: "empty" };

  const parts = token.split(".");
  if (parts.length === 5) {
    return {
      kind: "error",
      message:
        "Five segments means this is a JWE, not a JWS. The payload is encrypted rather than encoded, and no amount of decoding will open it without the key.",
    };
  }
  if (parts.length !== 3) {
    return {
      kind: "error",
      message: `A compact JWS is three dot separated segments. This one has ${parts.length}. A token copied out of a wrapped log line often loses a character at the fold.`,
    };
  }

  return {
    kind: "ok",
    token,
    header: readPart(parts[0], "header"),
    payload: readPart(parts[1], "payload"),
    signature: parts[2],
  };
}

/* ----------------------------------------------------------------- claims */

/** RFC 7519 registered claims, plus the OIDC and OAuth ones seen most often. */
const CLAIM_NOTES: Record<string, string> = {
  iss: "Issuer. Who minted the token. Check it against an allowlist, never against the token's own hint.",
  sub: "Subject. The principal the token is about, unique and stable within the issuer.",
  aud: "Audience. Who may accept the token. A service must reject a token addressed to someone else.",
  exp: "Expiry. The token must be rejected at or after this instant.",
  nbf: "Not before. The token must be rejected before this instant.",
  iat: "Issued at. When the token was minted, useful for an age policy of your own.",
  jti: "JWT ID. Unique per token, so a replay can be detected and a token can be revoked by id.",
  azp: "Authorised party. The client the token was issued to, when that differs from the audience.",
  scope: "OAuth scopes, space separated. What the bearer is permitted to ask for.",
  scp: "OAuth scopes as an array. Same meaning as scope, different serialisation.",
  client_id: "The OAuth client this token was issued to.",
  nonce: "Replay guard from the authentication request. Must match what the client sent.",
  auth_time: "When the user actually authenticated, which can be much earlier than iat.",
  acr: "Authentication context class. How strongly the user was authenticated.",
  amr: "Authentication methods. For example pwd, otp, mfa.",
  at_hash: "Hash of the access token, binding an ID token to the access token issued with it.",
  sid: "Session id at the issuer, used for back channel logout.",
  email: "Not proof of anything on its own. Trust it only when email_verified is true.",
  email_verified: "Whether the issuer verified that address.",
  name: "Display name. A profile claim, never an identifier.",
  preferred_username: "Display handle. Mutable, so do not key records on it.",
  roles: "Application roles. Authorisation data, only as trustworthy as the issuer.",
  groups: "Group membership, same caveat as roles.",
  typ: "Media type of the token itself. JWT, or at+jwt for an OAuth access token.",
  alg: "Signing algorithm. The verifier picks this from its own policy, not from here.",
  kid: "Key id. Tells the verifier which key in the JWKS signed this token.",
  cty: "Content type, present when the payload is itself a nested JWT.",
  crit: "Extensions a verifier must understand, or reject the token.",
  jku: "URL of the issuer's key set. A verifier that fetches this blindly is trusting the token.",
  jwk: "An embedded public key. Verifying against it is circular and is never correct.",
  x5t: "SHA-1 thumbprint of the X.509 certificate behind the key.",
  enc: "Content encryption algorithm. Only appears on a JWE.",
};

/** Claims whose value is a NumericDate: seconds since the Unix epoch. */
const TIME_CLAIMS = new Set(["exp", "nbf", "iat", "auth_time", "updated_at"]);

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/* ------------------------------------------------------------------ times */

function utcString(ms: number): string {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

function localString(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function span(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds < 60) return plural(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return plural(hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 60) return plural(days, "day");
  const months = Math.round(days / 30.44);
  if (months < 24) return plural(months, "month");
  return plural(Math.round(days / 365.25), "year");
}

function relative(targetMs: number, nowMs: number): string {
  const delta = Math.round((targetMs - nowMs) / 1000);
  if (delta === 0) return "right now";
  return delta < 0 ? `${span(-delta)} ago` : `in ${span(delta)}`;
}

/* ---------------------------------------------------------------- verdicts */

type Tone = "ok" | "warn" | "danger";

interface Finding {
  tone: Tone;
  text: string;
}

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

function numericClaim(claims: Record<string, unknown> | null, key: string): number | null {
  const value = claims?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function review(header: Part, payload: Part, signature: string, nowMs: number): Finding[] {
  const findings: Finding[] = [];
  const alg = typeof header.claims?.alg === "string" ? header.claims.alg : null;

  if (alg !== null && alg.toLowerCase() === "none") {
    findings.push({
      tone: "danger",
      text: "The header asks for alg: none, an unsecured JWT. Any library that honours it accepts a token anybody can write. Every verifier should pin the algorithms it will accept and reject this outright.",
    });
  } else if (signature === "") {
    findings.push({
      tone: "danger",
      text: "The signature segment is empty while the header names a signing algorithm. Nothing here is authenticated.",
    });
  }

  if (alg !== null && /^HS/i.test(alg)) {
    findings.push({
      tone: "warn",
      text: "HMAC signing means the verifier holds the same secret the issuer used, so anyone who can verify can also mint. It is also the half of the algorithm confusion attack: a verifier that reads alg from the token can be handed an HS256 token signed with the RSA public key it published.",
    });
  }

  const exp = numericClaim(payload.claims, "exp");
  if (exp === null) {
    findings.push({
      tone: "warn",
      text: "There is no exp claim, so this token never expires on its own. Revocation then depends entirely on the issuer keeping a blocklist.",
    });
  } else if (exp * 1000 <= nowMs) {
    findings.push({ tone: "danger", text: `Expired ${relative(exp * 1000, nowMs)}, at ${utcString(exp * 1000)}.` });
  } else {
    findings.push({ tone: "ok", text: `Within its exp window: valid for another ${span(Math.round((exp * 1000 - nowMs) / 1000))}.` });
  }

  const nbf = numericClaim(payload.claims, "nbf");
  if (nbf !== null && nbf * 1000 > nowMs) {
    findings.push({ tone: "warn", text: `Not valid yet. The nbf claim opens ${relative(nbf * 1000, nowMs)}.` });
  }

  const iat = numericClaim(payload.claims, "iat");
  if (iat !== null && iat * 1000 > nowMs + 60_000) {
    findings.push({
      tone: "warn",
      text: "The iat claim is in the future by more than a minute, which usually means a clock is wrong somewhere rather than that the token is forged.",
    });
  }

  if (payload.claims && !("aud" in payload.claims)) {
    findings.push({
      tone: "warn",
      text: "No aud claim. Nothing in the token says which service it was meant for, so any service sharing the issuer will accept it.",
    });
  }

  return findings;
}

/* --------------------------------------------------------------- examples */

const EXAMPLES: { label: string; token: string }[] = [
  {
    label: "HS256",
    token:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2F1dGguZXhhbXBsZS5jb20iLCJzdWIiOiIxMjM0NTY3ODkwIiwiYXVkIjoiYXBpLmV4YW1wbGUuY29tIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsInNjb3BlIjoicmVhZDpwcm9maWxlIHdyaXRlOm5vdGVzIiwiaWF0IjoyMDUxMjIyNDAwLCJuYmYiOjIwNTEyMjI0MDAsImV4cCI6MjA1MTIyNjAwMCwianRpIjoiNmY5YzJkMTgtM2E1ZS00Yjc3LTlkMjEtMGM4ZTVhMWI0ZjMwIn0.3Qm1kZ9xW2sVbN7pLqYtR4hJgFdSaCxZvBnMk0oPiUy",
  },
  {
    label: "Expired RS256",
    token:
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjIwMjQtMDYtcm90YXRpb24ifQ.eyJpc3MiOiJodHRwczovL2xvZ2luLmV4YW1wbGUub3JnIiwic3ViIjoiYXV0aDB8NjFiMmMzZDRlNWY2IiwiYXVkIjpbImFwaS5leGFtcGxlLm9yZyIsImJpbGxpbmcuZXhhbXBsZS5vcmciXSwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDAsImF6cCI6InNwYS1jbGllbnQiLCJlbWFpbCI6ImFkYUBleGFtcGxlLm9yZyIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlfQ.kK4tVvQ2n8sYbXeR1zPfLmJhGdAcUoIyTwSqNrBv0Xe",
  },
  {
    label: "alg: none",
    token:
      "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJzdXBlcnVzZXIiLCJpYXQiOjE3MDAwMDAwMDB9.",
  },
];

/* ------------------------------------------------------------------- view */

/** One decoded segment, shown as pretty JSON with its own copy button. */
function SegmentPanel({ title, part, testId }: { title: string; part: Part; testId: string }) {
  return (
    <ToolPanel title={title}>
      {part.error ? (
        <p
          role="alert"
          className="rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
        >
          {part.error}
        </p>
      ) : null}
      {part.text ? (
        <>
          <pre
            data-testid={testId}
            className="mt-3 max-h-80 overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]"
          >
            {part.text}
          </pre>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              {part.raw.length} chars encoded
            </span>
            <CopyButton value={part.text} label={`Copy the ${title.toLowerCase()} JSON`} />
          </div>
        </>
      ) : null}
    </ToolPanel>
  );
}

export function JwtDecoder() {
  const [raw, setRaw] = useState("");
  // exp and nbf are read against the clock, so the reader needs a way to ask
  // the question again without retyping the token.
  const [nowTick, setNowTick] = useState(() => Date.now());

  const outcome = useMemo(() => parseToken(raw), [raw]);
  const decoded = outcome.kind === "ok" ? outcome : null;

  const findings = useMemo(
    () => (decoded ? review(decoded.header, decoded.payload, decoded.signature, nowTick) : []),
    [decoded, nowTick],
  );

  const header = decoded?.header ?? null;
  const payload = decoded?.payload ?? null;
  const alg = typeof header?.claims?.alg === "string" ? header.claims.alg : "unknown";
  const claimCount = payload?.claims ? Object.keys(payload.claims).length : 0;

  const summary = decoded
    ? `Decoded locally. Algorithm ${alg}, ${claimCount} payload ${claimCount === 1 ? "claim" : "claims"}, signature not verified.`
    : outcome.kind === "error"
      ? "Nothing decoded."
      : "Paste a token to decode it.";

  return (
    <ToolShell slug="jwt-decoder">
      <div className="space-y-6">
        <ToolPanel title="Token">
          <label
            htmlFor="jwt-input"
            className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
          >
            Paste a JWT. A leading Bearer and any line breaks are ignored.
          </label>
          <textarea
            id="jwt-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={5}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={outcome.kind === "error"}
            aria-describedby={outcome.kind === "error" ? "jwt-error" : "jwt-hint"}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"
            data-testid="input-jwt"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          {outcome.kind === "error" ? (
            <p
              id="jwt-error"
              role="alert"
              data-testid="text-jwt-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {outcome.message}
            </p>
          ) : (
            <p id="jwt-hint" className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              Decoding happens in this tab. The token is not stored and no request is made.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setRaw(example.token)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className="inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                {example.label}
              </button>
            ))}
            {raw ? (
              <button
                type="button"
                onClick={() => setRaw("")}
                data-testid="button-clear"
                className="inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <div className="rounded-2xl border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.07)] p-5">
          <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
            The signature is not verified
          </div>
          <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            This page reads the token, it does not check it. A decoded payload tells you what the
            token claims, never whether the claim is true: anybody can edit a payload and re-encode
            it. Verification needs the issuer's key, which belongs on your server, so decide nothing
            about trust from what you read here.
          </p>
        </div>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {decoded ? (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <SegmentPanel title="Header" part={decoded.header} testId="text-header-json" />
              <SegmentPanel title="Payload" part={decoded.payload} testId="text-payload-json" />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <ToolPanel title="Shape">
                <ToolResult label="Algorithm" value={alg} testId="text-alg" />
                <ToolResult
                  label="Type"
                  value={typeof decoded.header.claims?.typ === "string" ? decoded.header.claims.typ : "not stated"}
                />
                <ToolResult
                  label="Key id"
                  value={typeof decoded.header.claims?.kid === "string" ? decoded.header.claims.kid : "none"}
                />
                <ToolResult
                  label="Signature"
                  value={
                    decoded.signature === ""
                      ? "empty"
                      : `${decoded.signature.length} chars, unchecked`
                  }
                  testId="text-signature"
                />
                <ToolResult label="Token length" value={`${decoded.token.length} chars`} />
              </ToolPanel>

              <ToolPanel title="Findings">
                <ul className="space-y-2" data-testid="list-findings">
                  {findings.map((finding) => (
                    <li
                      key={finding.text}
                      className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[finding.tone]}`}
                    >
                      {finding.text}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setNowTick(Date.now())}
                  data-testid="button-recheck"
                  className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-5 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  <span aria-hidden>↻</span> Re-check the clock
                </button>
                <p className="mt-2 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                  Compared against {localString(nowTick)} local
                </p>
              </ToolPanel>
            </div>

            {decoded.payload.claims ? (
              <ToolPanel title="Claims">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        <th
                          scope="col"
                          className="py-2 pr-4 font-mono-tight text-[10px] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                        >
                          Claim
                        </th>
                        <th
                          scope="col"
                          className="py-2 pr-4 font-mono-tight text-[10px] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                        >
                          Value
                        </th>
                        <th
                          scope="col"
                          className="py-2 font-mono-tight text-[10px] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                        >
                          What it means
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(decoded.payload.claims).map(([key, value]) => {
                        const isTime = TIME_CLAIMS.has(key) && typeof value === "number";
                        const ms = isTime ? (value as number) * 1000 : 0;
                        return (
                          <tr
                            key={key}
                            className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top"
                          >
                            <th
                              scope="row"
                              className="py-3 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]"
                            >
                              {key}
                            </th>
                            <td className="max-w-[280px] break-all py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                              {formatValue(value)}
                              {isTime ? (
                                <span className="mt-1 block font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                                  {utcString(ms)}
                                  <br />
                                  {localString(ms)} local
                                  <br />
                                  <span className="text-[hsl(var(--brand-amber))]">
                                    {relative(ms, nowTick)}
                                  </span>
                                </span>
                              ) : null}
                            </td>
                            <td className="py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                              {CLAIM_NOTES[key] ??
                                "Private claim. Its meaning is whatever the issuer and the audience agreed."}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </ToolPanel>
            ) : null}

            <ToolPanel title="Segments">
              <p className="break-all font-mono-tight text-xs leading-relaxed">
                <span className="text-[hsl(var(--brand-signal))]">{decoded.header.raw}</span>
                <span className="text-[hsl(var(--brand-ash))]">.</span>
                <span className="text-[hsl(var(--brand-cyan))]">{decoded.payload.raw}</span>
                <span className="text-[hsl(var(--brand-ash))]">.</span>
                <span className="text-[hsl(var(--brand-amber))]">{decoded.signature || "(empty)"}</span>
              </p>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                <span className="text-[hsl(var(--brand-signal))]">Header</span>,{" "}
                <span className="text-[hsl(var(--brand-cyan))]">payload</span> and{" "}
                <span className="text-[hsl(var(--brand-amber))]">signature</span>. The first two are
                Base64URL encoded JSON that anyone can read. The third is bytes over the first two,
                and it is the only part that carries any authority.
              </p>
            </ToolPanel>
          </>
        ) : null}
      </div>
    </ToolShell>
  );
}
