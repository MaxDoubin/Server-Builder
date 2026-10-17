/**
 * Toy RSA for small CTF-sized numbers.
 *
 * Textbook RSA with no padding, every intermediate value shown. The tool
 * factors a modulus by trial division up to a bound, falls back to
 * Fermat's method for close primes, derives phi, lambda, d and the CRT
 * values, and encrypts or decrypts integers and text blocks with the
 * square-and-multiply steps visible. Small numbers only. Real keys need
 * a 2048-bit or larger modulus, padding such as OAEP, and a vetted library.
 * Nothing leaves the page: no network request and no factor database.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

interface EuclidRow {
  q: bigint;
  r: bigint;
  x: bigint;
  y: bigint;
}

interface KeySet {
  p: bigint;
  q: bigint;
  n: bigint;
  phi: bigint;
  lambda: bigint;
  e: bigint;
  d: bigint;
  gcd: bigint;
  euclid: EuclidRow[];
  dp: bigint;
  dq: bigint;
  qInv: bigint;
}

type FactorRun =
  | { kind: "error"; message: string }
  | { kind: "prime"; n: bigint }
  | {
      kind: "factored";
      n: bigint;
      p: bigint;
      q: bigint;
      method: string;
      detail: string;
    }
  | {
      kind: "partial";
      n: bigint;
      factor: bigint;
      cofactor: bigint;
      method: string;
    }
  | { kind: "none"; n: bigint; bound: number };

interface TraceRow {
  index: number;
  bit: number;
  squared: bigint;
  result: bigint;
  multiplied: boolean;
}

interface IntEncrypted {
  m: bigint;
  c: bigint;
  trace: TraceRow[];
  check: boolean;
  view: string;
}

interface IntDecrypted {
  c: bigint;
  m: bigint;
  trace: TraceRow[];
  view: string;
}

interface TextEncrypted {
  size: number;
  bytes: number[];
  blocks: bigint[];
  cipher: bigint[];
  check: boolean;
}

interface TextDecrypted {
  size: number;
  plainBlocks: bigint[];
  bytes: number[];
  text: string;
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const B256 = BigInt(256);
const MAX_BITS = 1024;
const MAX_BOUND = 2000000;
const FERMAT_STEPS = 20000;
const TRACE_ROWS = 96;
const MAX_TEXT_BYTES = 2000;
const MR_BASES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41].map((b) => BigInt(b));

const BTN =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors";
const TOGGLE_ON =
  "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-signal))]";
const TOGGLE_OFF =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const BODY =
  "font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]";
const CELL =
  "rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)]";
const FIELD =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const OUTPUT =
  "mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]";

/* Accepts decimal or 0x-prefixed hex. Returns null for anything else. */
function parseBig(text: string): bigint | null {
  const t = text.trim();
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(t)) return null;
  try {
    return BigInt(t);
  } catch {
    return null;
  }
}

function bitLength(n: bigint): number {
  return n <= ZERO ? 0 : n.toString(2).length;
}

function mod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

function gcdBig(a: bigint, b: bigint): bigint {
  let x = a < ZERO ? -a : a;
  let y = b < ZERO ? -b : b;
  while (y !== ZERO) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function lcmBig(a: bigint, b: bigint): bigint {
  return (a / gcdBig(a, b)) * b;
}

function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let result = ONE % m;
  let b = base % m;
  let e = exp;
  while (e > ZERO) {
    if (e % TWO === ONE) result = (result * b) % m;
    b = (b * b) % m;
    e = e / TWO;
  }
  return result;
}

/* Left-to-right square and multiply, one row per exponent bit from the most significant. */
function traceModPow(base: bigint, exp: bigint, m: bigint): TraceRow[] {
  const bits = exp.toString(2);
  const rows: TraceRow[] = [];
  let r = ONE % m;
  const b = base % m;
  for (let i = 0; i < bits.length; i++) {
    const bit = bits.charAt(i) === "1" ? 1 : 0;
    r = (r * r) % m;
    const squared = r;
    if (bit === 1) r = (r * b) % m;
    rows.push({ index: i, bit, squared, result: r, multiplied: bit === 1 });
  }
  return rows;
}

/* Returns the gcd and the Bezout coefficients as rows, so x * a + y * b = remainder at each step. */
function extEuclid(a: bigint, b: bigint): { gcd: bigint; x: bigint; rows: EuclidRow[] } {
  let oldR = a;
  let r = b;
  let oldS = ONE;
  let s = ZERO;
  let oldT = ZERO;
  let t = ONE;
  const rows: EuclidRow[] = [];
  while (r !== ZERO) {
    const q = oldR / r;
    const nextR = oldR - q * r;
    const nextS = oldS - q * s;
    const nextT = oldT - q * t;
    oldR = r;
    r = nextR;
    oldS = s;
    s = nextS;
    oldT = t;
    t = nextT;
    rows.push({ q, r, x: s, y: t });
  }
  return { gcd: oldR, x: oldS, rows };
}

function modInverse(a: bigint, m: bigint): bigint | null {
  const e = extEuclid(a, m);
  if (e.gcd !== ONE) return null;
  return mod(e.x, m);
}

/* Integer square root by Newton's method. */
function isqrt(n: bigint): bigint {
  if (n < TWO) return n;
  let x = n;
  let y = (x + ONE) / TWO;
  while (y < x) {
    x = y;
    y = (x + n / x) / TWO;
  }
  return x;
}

/* Miller-Rabin with 13 fixed bases. Deterministic below about 3.3e24, probable above. */
function isProbablePrime(n: bigint): boolean {
  if (n < TWO) return false;
  for (const p of MR_BASES) {
    if (n === p) return true;
    if (n % p === ZERO) return false;
  }
  let d = n - ONE;
  let r = 0;
  while (d % TWO === ZERO) {
    d = d / TWO;
    r += 1;
  }
  for (const a of MR_BASES) {
    let x = modPow(a, d, n);
    if (x === ONE || x === n - ONE) continue;
    let composite = true;
    for (let i = 1; i < r; i++) {
      x = (x * x) % n;
      if (x === n - ONE) {
        composite = false;
        break;
      }
    }
    if (composite) return false;
  }
  return true;
}

function trialDivide(n: bigint, bound: number): { factor: bigint | null; steps: number } {
  if (n % TWO === ZERO) return { factor: TWO, steps: 1 };
  let steps = 1;
  for (let d = 3; d <= bound; d += 2) {
    steps += 1;
    const bd = BigInt(d);
    if (bd * bd > n) return { factor: null, steps };
    if (n % bd === ZERO) return { factor: bd, steps };
  }
  return { factor: null, steps };
}

/* Fermat: n = a^2 - b^2 = (a - b)(a + b). Fast when the two factors are close. */
function fermat(
  n: bigint,
  maxSteps: number,
): { p: bigint; q: bigint; a: bigint; b: bigint; bSquared: bigint; steps: number } | null {
  if (n % TWO === ZERO || n < BigInt(9)) return null;
  let a = isqrt(n);
  if (a * a < n) a += ONE;
  for (let i = 1; i <= maxSteps; i++) {
    const bSquared = a * a - n;
    const b = isqrt(bSquared);
    if (b * b === bSquared) {
      const p = a - b;
      const q = a + b;
      if (p > ONE && q > ONE) return { p, q, a, b, bSquared, steps: i };
    }
    a += ONE;
  }
  return null;
}

function factorN(nText: string, boundText: string): FactorRun {
  const n = parseBig(nText);
  if (n === null || n < TWO) {
    return { kind: "error", message: "Enter n as a whole number of at least 2." };
  }
  if (bitLength(n) > MAX_BITS) {
    return { kind: "error", message: `n has more than ${MAX_BITS} bits, the input limit.` };
  }
  const bound = Number.parseInt(boundText, 10);
  if (!Number.isFinite(bound) || bound < 3 || bound > MAX_BOUND) {
    return { kind: "error", message: `Trial bound must be from 3 to ${MAX_BOUND}.` };
  }
  if (isProbablePrime(n)) {
    return { kind: "prime", n };
  }

  const trial = trialDivide(n, bound);
  if (trial.factor !== null) {
    const f = trial.factor;
    const cofactor = n / f;
    const method = `Trial division up to ${bound}, ${trial.steps} candidate divisors tried`;
    if (isProbablePrime(f) && isProbablePrime(cofactor)) {
      return {
        kind: "factored",
        n,
        p: f <= cofactor ? f : cofactor,
        q: f <= cofactor ? cofactor : f,
        method,
        detail: `Smallest factor ${f.toString()}. The cofactor ${cofactor.toString()} is prime.`,
      };
    }
    return { kind: "partial", n, factor: f, cofactor, method };
  }

  const fer = fermat(n, FERMAT_STEPS);
  if (fer !== null) {
    return {
      kind: "factored",
      n,
      p: fer.p <= fer.q ? fer.p : fer.q,
      q: fer.p <= fer.q ? fer.q : fer.p,
      method: `Fermat, ${fer.steps} ${fer.steps === 1 ? "step" : "steps"}`,
      detail: `a = ${fer.a.toString()}, b = ${fer.b.toString()}, b^2 = a^2 - n = ${fer.bSquared.toString()}. p = a - b, q = a + b.`,
    };
  }
  return { kind: "none", n, bound };
}

function computeKeys(pText: string, qText: string, eText: string): Result<KeySet> {
  const p = parseBig(pText);
  const q = parseBig(qText);
  const e = parseBig(eText);
  if (p === null || q === null) return { ok: false, error: "Enter p and q as whole numbers." };
  if (e === null) return { ok: false, error: "Enter e as a whole number." };
  if (p < TWO || q < TWO) return { ok: false, error: "p and q must be at least 2." };
  if (p === q) return { ok: false, error: "p and q must be different primes." };
  if (!isProbablePrime(p) || !isProbablePrime(q)) {
    return { ok: false, error: "p and q must both be prime." };
  }
  const n = p * q;
  if (bitLength(n) > MAX_BITS) return { ok: false, error: `n has more than ${MAX_BITS} bits.` };
  const phi = (p - ONE) * (q - ONE);
  if (e < TWO || e >= phi) {
    return { ok: false, error: `e must satisfy 2 <= e < phi = ${phi.toString()}.` };
  }
  const euclid = extEuclid(e, phi);
  if (euclid.gcd !== ONE) {
    return {
      ok: false,
      error: `gcd(e, phi) = ${euclid.gcd.toString()}. e has no inverse mod phi. Pick an e with no shared factor.`,
    };
  }
  const d = mod(euclid.x, phi);
  const qInv = modInverse(q, p);
  if (qInv === null) return { ok: false, error: "q has no inverse mod p." };
  return {
    ok: true,
    value: {
      p,
      q,
      n,
      phi,
      lambda: lcmBig(p - ONE, q - ONE),
      e,
      d,
      gcd: euclid.gcd,
      euclid: euclid.rows,
      dp: d % (p - ONE),
      dq: d % (q - ONE),
      qInv,
    },
  };
}

/* Largest b with 256^b <= n. Zero when n is below 256, which rules out text mode. */
function blockSize(n: bigint): number {
  let size = 0;
  let limit = ONE;
  while (limit * B256 <= n) {
    limit = limit * B256;
    size += 1;
  }
  return size;
}

function packBytes(bytes: number[], size: number): bigint[] {
  const blocks: bigint[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    let v = ZERO;
    for (let j = 0; j < size; j++) {
      const byte = i + j < bytes.length ? (bytes[i + j] ?? 0) : 0;
      v = v * B256 + BigInt(byte);
    }
    blocks.push(v);
  }
  return blocks;
}

function unpackBlock(value: bigint, size: number): number[] | null {
  const out: number[] = Array.from({ length: size }, () => 0);
  let x = value;
  for (let j = size - 1; j >= 0; j--) {
    out[j] = Number(x % B256);
    x = x / B256;
  }
  return x === ZERO ? out : null;
}

/* Drops trailing zero bytes from block padding, then decodes UTF-8. */
function textFromBytes(bytes: number[]): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  try {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes.slice(0, end)));
  } catch {
    return "";
  }
}

function byteView(value: bigint, size: number): string {
  if (size === 0) return "";
  const bytes = unpackBlock(value, size);
  return bytes === null ? "" : textFromBytes(bytes);
}

function hexByte(b: number): string {
  return b.toString(16).padStart(2, "0");
}

function encryptInt(keys: KeySet, text: string): Result<IntEncrypted> {
  const m = parseBig(text);
  if (m === null) return { ok: false, error: "Message must be a whole number, decimal or 0x hex." };
  if (m >= keys.n) return { ok: false, error: `Message must be smaller than n = ${keys.n.toString()}.` };
  const c = modPow(m, keys.e, keys.n);
  const check = modPow(c, keys.d, keys.n) === m;
  return {
    ok: true,
    value: {
      m,
      c,
      trace: traceModPow(m, keys.e, keys.n),
      check,
      view: byteView(m, blockSize(keys.n)),
    },
  };
}

function decryptInt(keys: KeySet, text: string): Result<IntDecrypted> {
  const c = parseBig(text);
  if (c === null) return { ok: false, error: "Enter one ciphertext integer, decimal or 0x hex." };
  if (c >= keys.n) return { ok: false, error: `Ciphertext must be smaller than n = ${keys.n.toString()}.` };
  const m = modPow(c, keys.d, keys.n);
  return {
    ok: true,
    value: {
      c,
      m,
      trace: traceModPow(c, keys.d, keys.n),
      view: byteView(m, blockSize(keys.n)),
    },
  };
}

function encryptText(keys: KeySet, text: string): Result<TextEncrypted> {
  if (text.length === 0) return { ok: false, error: "Enter a message." };
  const size = blockSize(keys.n);
  if (size === 0) return { ok: false, error: "Text mode needs n of at least 256. Use integer mode." };
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > MAX_TEXT_BYTES) {
    return { ok: false, error: `Text is limited to ${MAX_TEXT_BYTES} bytes.` };
  }
  const blocks = packBytes(bytes, size);
  const cipher = blocks.map((m) => modPow(m, keys.e, keys.n));
  const check = cipher.every((c, i) => modPow(c, keys.d, keys.n) === blocks[i]);
  return { ok: true, value: { size, bytes, blocks, cipher, check } };
}

function decryptText(keys: KeySet, text: string): Result<TextDecrypted> {
  const tokens = text.trim().split(/[\s,]+/).filter((t) => t !== "");
  if (tokens.length === 0) {
    return { ok: false, error: "Enter ciphertext blocks as integers, separated by spaces or commas." };
  }
  const size = blockSize(keys.n);
  if (size === 0) return { ok: false, error: "Text mode needs n of at least 256. Use integer mode." };
  const cipher: bigint[] = [];
  for (const token of tokens) {
    const c = parseBig(token);
    if (c === null) return { ok: false, error: `Block "${token}" is not a whole number.` };
    if (c >= keys.n) return { ok: false, error: `Block ${token} is not smaller than n.` };
    cipher.push(c);
  }
  const plainBlocks = cipher.map((c) => modPow(c, keys.d, keys.n));
  const bytes: number[] = [];
  for (const m of plainBlocks) {
    const chunk = unpackBlock(m, size);
    if (chunk === null) {
      return { ok: false, error: "A decrypted block does not fit the block size. Check n, e and the blocks." };
    }
    for (const b of chunk) bytes.push(b);
  }
  return { ok: true, value: { size, plainBlocks, bytes, text: textFromBytes(bytes) } };
}

function Value({ label, value }: { label: string; value: bigint }) {
  return (
    <div className="py-2.5">
      <dt className={LABEL}>
        {label} · {bitLength(value)} bits
      </dt>
      <dd className="mt-1 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
        {value.toString()}
      </dd>
      <dd className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
        hex {value.toString(16)}
      </dd>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={`mb-2 block ${LABEL}`}>
        {label}
      </label>
      <input
        id={id}
        data-testid={testId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={FIELD}
      />
    </div>
  );
}

function TraceTable({ rows, label }: { rows: TraceRow[]; label: string }) {
  const shown = rows.slice(0, TRACE_ROWS);
  return (
    <div className="mt-4">
      <p className={LABEL}>{label}</p>
      <ol className="mt-2 space-y-1.5">
        {shown.map((row) => (
          <li
            key={row.index}
            className={`px-3 py-1.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] ${CELL}`}
          >
            <span className="text-[hsl(var(--brand-signal))]">bit {row.bit}</span> · square{" "}
            <span className="break-all text-[hsl(var(--brand-bone))]">{row.squared.toString()}</span> ·{" "}
            {row.multiplied ? "multiply" : "no multiply"} · result{" "}
            <span className="break-all text-[hsl(var(--brand-bone))]">{row.result.toString()}</span>
          </li>
        ))}
      </ol>
      {rows.length > TRACE_ROWS ? (
        <p className={`mt-2 ${BODY}`}>{rows.length - TRACE_ROWS} more rows not shown.</p>
      ) : null}
    </div>
  );
}

function FactorView({ run }: { run: FactorRun }) {
  if (run.kind === "error") {
    return <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">{run.message}</p>;
  }
  if (run.kind === "prime") {
    return (
      <p className={BODY}>
        n = {run.n.toString()} passes Miller-Rabin, so n is prime. It has no two-prime factorization to
        recover.
      </p>
    );
  }
  if (run.kind === "factored") {
    return (
      <div>
        <p className="font-mono-tight text-xs text-[hsl(var(--brand-signal))]">Method: {run.method}</p>
        <p className={`mt-2 ${BODY}`}>{run.detail}</p>
        <dl className="mt-3 divide-y divide-[hsl(var(--brand-iron)/0.6)]">
          <Value label="p" value={run.p} />
          <Value label="q" value={run.q} />
          <Value label="p q" value={run.p * run.q} />
        </dl>
        <p className={`mt-2 ${BODY}`}>
          {run.p * run.q === run.n ? "p * q equals n." : "p * q does not equal n. Check the input."}
        </p>
      </div>
    );
  }
  if (run.kind === "partial") {
    return (
      <div>
        <p className="font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
          Found a factor, but n is not a two-prime modulus.
        </p>
        <p className={`mt-2 ${BODY}`}>
          {run.method}. Smallest factor {run.factor.toString()}, cofactor {run.cofactor.toString()}. The
          cofactor is composite or the factor is not prime, so RSA key derivation does not apply.
        </p>
      </div>
    );
  }
  return (
    <p className={BODY}>
      No factor found. Trial division checked odd divisors up to {run.bound}, and Fermat ran {FERMAT_STEPS}{" "}
      steps. The factors are larger than the bound and not close together. Raise the bound up to{" "}
      {MAX_BOUND}, or use a larger search elsewhere.
    </p>
  );
}

export function RsaTool() {
  const [pText, setPText] = useState("61");
  const [qText, setQText] = useState("53");
  const [eText, setEText] = useState("17");
  const [nText, setNText] = useState("3233");
  const [boundText, setBoundText] = useState("1000000");
  const [factorRun, setFactorRun] = useState<FactorRun | null>(null);
  const [msgMode, setMsgMode] = useState<"integer" | "text">("integer");
  const [message, setMessage] = useState("65");
  const [cipherText, setCipherText] = useState("2790");

  const keyResult = useMemo(() => computeKeys(pText, qText, eText), [pText, qText, eText]);
  const keys = keyResult.ok ? keyResult.value : null;
  const nField = parseBig(nText);
  const nMismatch = keys !== null && nField !== null && nField !== keys.n;
  const blockBytes = keys !== null ? blockSize(keys.n) : 0;

  const encInt = useMemo(
    () => (keys !== null && msgMode === "integer" ? encryptInt(keys, message) : null),
    [keys, msgMode, message],
  );
  const encText = useMemo(
    () => (keys !== null && msgMode === "text" ? encryptText(keys, message) : null),
    [keys, msgMode, message],
  );
  const decInt = useMemo(
    () => (keys !== null && msgMode === "integer" ? decryptInt(keys, cipherText) : null),
    [keys, msgMode, cipherText],
  );
  const decText = useMemo(
    () => (keys !== null && msgMode === "text" ? decryptText(keys, cipherText) : null),
    [keys, msgMode, cipherText],
  );

  function runFactor() {
    const run = factorN(nText, boundText);
    setFactorRun(run);
    if (run.kind === "factored") {
      setPText(run.p.toString());
      setQText(run.q.toString());
    }
  }

  let summary = "Enter p, q and e to derive keys.";
  if (keys !== null) {
    summary = `Modulus ${keys.n.toString()}, public exponent ${keys.e.toString()}, private exponent ${keys.d.toString()}.`;
  } else if (!keyResult.ok) {
    summary = keyResult.error;
  }

  return (
    <ToolShell slug="rsa-tool">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <ToolPanel title="Scope">
            <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-amber))]">
              Toy RSA for small CTF-sized numbers only. Textbook RSA with no padding is insecure, so the
              output here is for learning and arithmetic checks. Real keys use a 2048-bit or larger modulus,
              OAEP padding, and a vetted library.
            </p>
            <p className={`mt-2 ${BODY}`}>
              Everything runs in the browser. No network request is made, and no factor database is
              consulted.
            </p>
          </ToolPanel>
        </div>

        <ToolPanel title="Inputs">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="rsa-p" label="Prime p" value={pText} onChange={setPText} testId="input-p" />
            <Field id="rsa-q" label="Prime q" value={qText} onChange={setQText} testId="input-q" />
            <Field id="rsa-e" label="Public exponent e" value={eText} onChange={setEText} testId="input-e" />
            <Field id="rsa-n" label="Modulus n, to factor" value={nText} onChange={setNText} testId="input-n" />
            <Field
              id="rsa-bound"
              label="Trial bound, 3 to 2000000"
              value={boundText}
              onChange={setBoundText}
              testId="input-bound"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={runFactor} className={`${BTN} ${TOGGLE_OFF}`}>
              Factor n
            </button>
          </div>
          <p className={`mt-3 ${BODY}`}>
            Factor n fills p and q when it finds a two-prime split. Trial division can take up to a second at
            the largest bound.
          </p>
          {nMismatch ? (
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              The n field differs from p times q. Keys use p and q.
            </p>
          ) : null}
          {!keyResult.ok ? (
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              {keyResult.error}
            </p>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Factoring">
          <p className={BODY}>
            Trial division tests odd divisors up to the bound. Fermat's method finds p and q when they lie close
            together.
          </p>
          <div data-testid="output-factor" className="mt-4">
            {factorRun === null ? (
              <p className={BODY}>Enter n and press Factor n.</p>
            ) : (
              <FactorView run={factorRun} />
            )}
          </div>
        </ToolPanel>

        <div className="lg:col-span-2">
          <ToolPanel title="Key values">
            {keys === null ? (
              <p className={BODY}>Enter valid p, q and e to see the key values.</p>
            ) : (
              <div data-testid="output-keys">
                <p className={BODY}>
                  Public key is (e, n). Private key is (d, n). Each value shows decimal, hex and bit length.
                </p>
                <dl className="mt-4 divide-y divide-[hsl(var(--brand-iron)/0.6)]">
                  <Value label="p" value={keys.p} />
                  <Value label="q" value={keys.q} />
                  <Value label="n = p q" value={keys.n} />
                  <Value label="phi = (p - 1)(q - 1)" value={keys.phi} />
                  <Value label="lambda = lcm(p - 1, q - 1)" value={keys.lambda} />
                  <Value label="e" value={keys.e} />
                  <Value label="d = e^-1 mod phi" value={keys.d} />
                  <Value label="dp = d mod (p - 1)" value={keys.dp} />
                  <Value label="dq = d mod (q - 1)" value={keys.dq} />
                  <Value label="qInv = q^-1 mod p" value={keys.qInv} />
                </dl>
              </div>
            )}
          </ToolPanel>
        </div>

        <div className="lg:col-span-2">
          <ToolPanel title="Derivation">
            {keys === null ? (
              <p className={BODY}>Needs valid p, q and e.</p>
            ) : (
              <div data-testid="output-derivation">
                <ul className="space-y-2 break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <li>
                    n = p * q = {keys.p.toString()} * {keys.q.toString()} = {keys.n.toString()}
                  </li>
                  <li>
                    phi = (p - 1) * (q - 1) = {(keys.p - ONE).toString()} * {(keys.q - ONE).toString()} ={" "}
                    {keys.phi.toString()}
                  </li>
                  <li>
                    lambda = lcm(p - 1, q - 1) = {keys.lambda.toString()}. Shown for reference. d below comes
                    from phi, the textbook choice.
                  </li>
                  <li>gcd(e, phi) = {keys.gcd.toString()}, so e is invertible mod phi.</li>
                  <li>d = e^-1 mod phi = {keys.d.toString()}</li>
                  <li>
                    Check: e * d mod phi = {((keys.e * keys.d) % keys.phi).toString()}, which must be 1.
                  </li>
                  <li>
                    CRT values: dp = {keys.dp.toString()}, dq = {keys.dq.toString()}, qInv ={" "}
                    {keys.qInv.toString()}. Fast decryption splits the exponentiation across p and q.
                  </li>
                </ul>
                <p className={`mt-5 ${LABEL}`}>Extended Euclid on e and phi</p>
                <p className={`mt-2 ${BODY}`}>
                  Each row divides the previous remainder. Coefficients satisfy x * e + y * phi = remainder. The row
                  before remainder 0 holds the gcd, and its x reduced mod phi is d.
                </p>
                <ol className="mt-3 space-y-1.5">
                  {keys.euclid.map((row, i) => (
                    <li
                      key={i}
                      className={`px-3 py-1.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] ${CELL}`}
                    >
                      <span className="text-[hsl(var(--brand-ash))]">step {i + 1}</span> · q{" "}
                      {row.q.toString()} · remainder <span className="break-all">{row.r.toString()}</span> · x{" "}
                      <span className="break-all">{row.x.toString()}</span> · y{" "}
                      <span className="break-all">{row.y.toString()}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </ToolPanel>
        </div>

        <div className="lg:col-span-2">
          <ToolPanel title="Encrypt and decrypt">
            {keys === null ? (
              <p className={BODY}>Enter valid keys above first.</p>
            ) : (
              <div data-testid="output-messages">
                <div role="group" aria-label="Message type" className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={msgMode === "integer"}
                    onClick={() => setMsgMode("integer")}
                    className={`${BTN} ${msgMode === "integer" ? TOGGLE_ON : TOGGLE_OFF}`}
                  >
                    Integer
                  </button>
                  <button
                    type="button"
                    aria-pressed={msgMode === "text"}
                    onClick={() => setMsgMode("text")}
                    className={`${BTN} ${msgMode === "text" ? TOGGLE_ON : TOGGLE_OFF}`}
                  >
                    Text
                  </button>
                </div>
                <p className={`mt-3 ${BODY}`}>
                  {msgMode === "integer"
                    ? "One integer below n. The exponentiation is shown one bit at a time."
                    : blockBytes > 0
                      ? `Text is packed into blocks of ${blockBytes} byte${blockBytes === 1 ? "" : "s"} for this n. Trailing zero bytes are dropped on decrypt.`
                      : "Text mode needs n of at least 256."}
                </p>

                <label htmlFor="rsa-message" className={`mt-5 block ${LABEL}`}>
                  Message
                </label>
                <textarea
                  id="rsa-message"
                  data-testid="input-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  className={`mt-2 resize-y break-all ${FIELD}`}
                />

                {encInt !== null ? (
                  encInt.ok ? (
                    <div data-testid="output-encrypt" className="mt-4">
                      <p className={LABEL}>Ciphertext c = m^e mod n</p>
                      <dl className="mt-2 divide-y divide-[hsl(var(--brand-iron)/0.6)]">
                        <Value label="m" value={encInt.value.m} />
                        <Value label="c" value={encInt.value.c} />
                      </dl>
                      <p className={`mt-2 ${BODY}`}>
                        Round trip: decrypting c {encInt.value.check ? "returns m." : "does not return m."}
                      </p>
                      <TraceTable rows={encInt.value.trace} label="Square and multiply, exponent e" />
                    </div>
                  ) : (
                    <p className="mt-4 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">{encInt.error}</p>
                  )
                ) : null}

                {encText !== null ? (
                  encText.ok ? (
                    <div data-testid="output-encrypt" className="mt-4">
                      <p className={LABEL}>
                        Blocks of {encText.value.size} byte{encText.value.size === 1 ? "" : "s"}, {encText.value.bytes.length} bytes total
                      </p>
                      <ol className="mt-2 space-y-1.5">
                        {encText.value.blocks.slice(0, 32).map((m, i) => (
                          <li
                            key={i}
                            className={`px-3 py-1.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] ${CELL}`}
                          >
                            block {i} · bytes{" "}
                            <span className="text-[hsl(var(--brand-bone))]">
                              {Array.from({ length: encText.value.size }, (_, j) =>
                                hexByte(encText.value.bytes[i * encText.value.size + j] ?? 0),
                              ).join(" ")}
                            </span>{" "}
                            · m <span className="break-all">{m.toString()}</span> · c{" "}
                            <span className="break-all text-[hsl(var(--brand-signal))]">
                              {(encText.value.cipher[i] ?? ZERO).toString()}
                            </span>
                          </li>
                        ))}
                      </ol>
                      {encText.value.blocks.length > 32 ? (
                        <p className={`mt-2 ${BODY}`}>{encText.value.blocks.length - 32} more blocks not shown.</p>
                      ) : null}
                      <p className={`mt-4 ${LABEL}`}>Ciphertext blocks</p>
                      <pre data-testid="output-cipher-blocks" className={OUTPUT}>
                        {encText.value.cipher.map((c) => c.toString()).join(" ")}
                      </pre>
                      <p className={`mt-2 ${BODY}`}>
                        Round trip: decrypting every block {encText.value.check ? "returns the blocks." : "does not return the blocks."}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">{encText.error}</p>
                  )
                ) : null}

                <label htmlFor="rsa-cipher" className={`mt-6 block ${LABEL}`}>
                  {msgMode === "integer" ? "Ciphertext integer to decrypt" : "Ciphertext blocks to decrypt"}
                </label>
                <textarea
                  id="rsa-cipher"
                  data-testid="input-cipher"
                  value={cipherText}
                  onChange={(e) => setCipherText(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder={msgMode === "integer" ? "2790" : "Integers separated by spaces"}
                  className={`mt-2 resize-y break-all ${FIELD}`}
                />

                {decInt !== null ? (
                  decInt.ok ? (
                    <div data-testid="output-decrypt" className="mt-4">
                      <p className={LABEL}>Plaintext m = c^d mod n</p>
                      <dl className="mt-2 divide-y divide-[hsl(var(--brand-iron)/0.6)]">
                        <Value label="c" value={decInt.value.c} />
                        <Value label="m" value={decInt.value.m} />
                      </dl>
                      {decInt.value.view ? (
                        <p className={`mt-2 ${BODY}`}>m as bytes: {decInt.value.view}</p>
                      ) : null}
                      <TraceTable rows={decInt.value.trace} label="Square and multiply, exponent d" />
                    </div>
                  ) : (
                    <p className="mt-4 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">{decInt.error}</p>
                  )
                ) : null}

                {decText !== null ? (
                  decText.ok ? (
                    <div data-testid="output-decrypt" className="mt-4">
                      <p className={LABEL}>Plaintext</p>
                      <pre data-testid="output-plain" className={OUTPUT}>
                        {decText.value.text || "(empty)"}
                      </pre>
                      <p className={`mt-4 ${LABEL}`}>Plaintext bytes, hex</p>
                      <pre className={OUTPUT}>{decText.value.bytes.map(hexByte).join(" ")}</pre>
                      <p className={`mt-4 ${LABEL}`}>Block values m</p>
                      <pre className={OUTPUT}>{decText.value.plainBlocks.map((m) => m.toString()).join(" ")}</pre>
                    </div>
                  ) : (
                    <p className="mt-4 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">{decText.error}</p>
                  )
                ) : null}
              </div>
            )}
          </ToolPanel>
        </div>
      </div>
    </ToolShell>
  );
}
