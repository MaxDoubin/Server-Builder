/**
 * Encoder and decoder.
 *
 * Everything routes through a Uint8Array in the middle: the source format is
 * decoded to bytes and the bytes are encoded to the target format. That is
 * the only way the conversions stay consistent, and it is why text goes
 * through TextEncoder rather than btoa, which throws on anything outside
 * Latin-1 and silently mangles the rest.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";

type Format =
  | "text"
  | "base64"
  | "base64url"
  | "hex"
  | "url"
  | "html"
  | "binary"
  | "decimal"
  | "rot13";

const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: "text", label: "Plain text (UTF-8)", hint: "Characters, encoded as UTF-8 bytes." },
  { id: "base64", label: "Base64", hint: "Standard alphabet with + and / and = padding." },
  { id: "base64url", label: "Base64URL", hint: "URL safe alphabet with - and _ and no padding." },
  { id: "hex", label: "Hex", hint: "Two hex digits per byte. Spaces, colons and 0x are ignored on input." },
  { id: "url", label: "URL / percent encoding", hint: "Unreserved characters pass through, everything else becomes %XX." },
  { id: "html", label: "HTML entities", hint: "Escapes the five markup characters and anything above ASCII." },
  { id: "binary", label: "Binary", hint: "Eight bits per byte, space separated." },
  { id: "decimal", label: "Decimal bytes", hint: "One number per byte, 0 to 255." },
  { id: "rot13", label: "ROT13", hint: "Letters rotated 13 places. Its own inverse." },
];

const UNRESERVED = /[A-Za-z0-9\-._~]/;

// ── helpers ──────────────────────────────────────────────────────────────────

function textToBytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function bytesToText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      "These bytes are not valid UTF-8, so they cannot be shown as text. Try hex or Base64 for the output instead.",
    );
  }
}

function binaryStringToBytes(binary: string): Uint8Array {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBinaryString(bytes: Uint8Array): string {
  // btoa takes a string, and apply has an argument ceiling, so chunk it.
  let out = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return out;
}

function decodeBase64(input: string, urlSafe: boolean): Uint8Array {
  const cleaned = input.replace(/\s+/g, "");
  if (cleaned === "") return new Uint8Array(0);

  const alphabet = urlSafe ? /^[A-Za-z0-9\-_]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/;
  if (!alphabet.test(cleaned)) {
    const bad = cleaned.split("").find((c) => !(urlSafe ? /[A-Za-z0-9\-_=]/ : /[A-Za-z0-9+/=]/).test(c));
    throw new Error(
      `"${bad}" is not in the ${urlSafe ? "Base64URL" : "Base64"} alphabet. ${
        urlSafe
          ? "Base64URL uses - and _ where standard Base64 uses + and /."
          : "Standard Base64 uses + and /. If this came from a JWT or a URL, choose Base64URL."
      }`,
    );
  }

  const body = cleaned.replace(/=+$/, "");
  if (body.length % 4 === 1) {
    throw new Error("This is not a whole number of Base64 characters. A group of four encodes three bytes, and a trailing group of one is impossible.");
  }
  const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
  const normalized = urlSafe ? padded.replace(/-/g, "+").replace(/_/g, "/") : padded;

  try {
    return binaryStringToBytes(atob(normalized));
  } catch {
    throw new Error("This is not decodable Base64.");
  }
}

function encodeBase64(bytes: Uint8Array, urlSafe: boolean): string {
  const raw = btoa(bytesToBinaryString(bytes));
  return urlSafe ? raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : raw;
}

function decodeHex(input: string): Uint8Array {
  const cleaned = input.replace(/0[xX]/g, "").replace(/[\s:,\-_]/g, "");
  if (cleaned === "") return new Uint8Array(0);
  const bad = cleaned.split("").find((c) => !/[0-9a-fA-F]/.test(c));
  if (bad !== undefined) throw new Error(`"${bad}" is not a hex digit. Hex uses 0 to 9 and a to f.`);
  if (cleaned.length % 2 !== 0) {
    throw new Error(`Hex needs two digits per byte, and this has ${cleaned.length} digits. One digit is missing or one is extra.`);
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function encodeHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function decodeUrl(input: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === "%") {
      const pair = input.slice(i + 1, i + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(pair)) {
        throw new Error(`"%${pair}" is not a valid escape. A percent sign must be followed by exactly two hex digits.`);
      }
      out.push(parseInt(pair, 16));
      i += 2;
    } else {
      // A literal character in the input is taken at face value and encoded
      // as UTF-8, which is what a browser does with an unescaped character.
      textToBytes(ch).forEach((b) => out.push(b));
    }
  }
  return new Uint8Array(out);
}

function encodeUrl(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const ch = String.fromCharCode(bytes[i]);
    out += UNRESERVED.test(ch) ? ch : `%${bytes[i].toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00A0",
  cent: "\u00A2", pound: "\u00A3", curren: "\u00A4", yen: "\u00A5", brvbar: "\u00A6",
  sect: "\u00A7", uml: "\u00A8", copy: "\u00A9", ordf: "\u00AA", laquo: "\u00AB",
  not: "\u00AC", shy: "\u00AD", reg: "\u00AE", macr: "\u00AF", deg: "\u00B0",
  plusmn: "\u00B1", sup2: "\u00B2", sup3: "\u00B3", acute: "\u00B4", micro: "\u00B5",
  para: "\u00B6", middot: "\u00B7", cedil: "\u00B8", sup1: "\u00B9", ordm: "\u00BA",
  raquo: "\u00BB", frac14: "\u00BC", frac12: "\u00BD", frac34: "\u00BE", iquest: "\u00BF",
  iexcl: "\u00A1", times: "\u00D7", divide: "\u00F7", szlig: "\u00DF",
  ndash: "\u2013", mdash: "\u2014", lsquo: "\u2018", rsquo: "\u2019", sbquo: "\u201A",
  ldquo: "\u201C", rdquo: "\u201D", bdquo: "\u201E", dagger: "\u2020", Dagger: "\u2021",
  bull: "\u2022", hellip: "\u2026", permil: "\u2030", prime: "\u2032", Prime: "\u2033",
  euro: "\u20AC", trade: "\u2122", larr: "\u2190", uarr: "\u2191", rarr: "\u2192",
  darr: "\u2193", harr: "\u2194", minus: "\u2212", ne: "\u2260", le: "\u2264",
  ge: "\u2265", infin: "\u221E", radic: "\u221A", asymp: "\u2248", equiv: "\u2261",
};

function decodeHtml(input: string): Uint8Array {
  // Hand written rather than innerHTML: assigning untrusted markup to a live
  // element to "just decode it" is how a decoder becomes an XSS sink.
  const out = input.replace(/&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const value = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
        throw new Error(`"${whole}" is not a valid code point.`);
      }
      return String.fromCodePoint(value);
    }
    const named = NAMED_ENTITIES[body];
    // An unknown name is far more likely to be literal text than a typo, so
    // leave it exactly as it was rather than guessing.
    return named ?? whole;
  });
  return textToBytes(out);
}

function encodeHtml(bytes: Uint8Array): string {
  const text = bytesToText(bytes);
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else if (ch === "'") out += "&#39;";
    else if (code === 9 || code === 10 || code === 13) out += ch;
    else if (code < 32 || code > 126) out += `&#x${code.toString(16).toUpperCase()};`;
    else out += ch;
  }
  return out;
}

function decodeBinary(input: string): Uint8Array {
  const cleaned = input.replace(/[\s,_]/g, "");
  if (cleaned === "") return new Uint8Array(0);
  const bad = cleaned.split("").find((c) => c !== "0" && c !== "1");
  if (bad !== undefined) throw new Error(`"${bad}" is not a bit. Binary input takes 0 and 1 only.`);
  if (cleaned.length % 8 !== 0) {
    throw new Error(`Binary input needs a multiple of 8 bits, and this has ${cleaned.length}.`);
  }
  const out = new Uint8Array(cleaned.length / 8);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(cleaned.slice(i * 8, i * 8 + 8), 2);
  return out;
}

function encodeBinary(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(2).padStart(8, "0")).join(" ");
}

function decodeDecimal(input: string): Uint8Array {
  const trimmed = input.trim();
  if (trimmed === "") return new Uint8Array(0);
  const parts = trimmed.split(/[\s,;]+/);
  const out = new Uint8Array(parts.length);
  parts.forEach((part, i) => {
    if (!/^\d+$/.test(part)) throw new Error(`"${part}" is not a number.`);
    const value = Number(part);
    if (value > 255) throw new Error(`${value} does not fit in a byte. Decimal bytes run from 0 to 255.`);
    out[i] = value;
  });
  return out;
}

function encodeDecimal(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String(b)).join(" ");
}

function rot13(input: string): string {
  return input.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function toBytes(format: Format, input: string): Uint8Array {
  switch (format) {
    case "text":
      return textToBytes(input);
    case "base64":
      return decodeBase64(input, false);
    case "base64url":
      return decodeBase64(input, true);
    case "hex":
      return decodeHex(input);
    case "url":
      return decodeUrl(input);
    case "html":
      return decodeHtml(input);
    case "binary":
      return decodeBinary(input);
    case "decimal":
      return decodeDecimal(input);
    case "rot13":
      return textToBytes(rot13(input));
  }
}

function fromBytes(format: Format, bytes: Uint8Array): string {
  switch (format) {
    case "text":
      return bytesToText(bytes);
    case "base64":
      return encodeBase64(bytes, false);
    case "base64url":
      return encodeBase64(bytes, true);
    case "hex":
      return encodeHex(bytes);
    case "url":
      return encodeUrl(bytes);
    case "html":
      return encodeHtml(bytes);
    case "binary":
      return encodeBinary(bytes);
    case "decimal":
      return encodeDecimal(bytes);
    case "rot13":
      return rot13(bytesToText(bytes));
  }
}

function formatLabel(id: Format): string {
  return FORMATS.find((f) => f.id === id)?.label ?? id;
}

export function EncoderDecoder() {
  const [source, setSource] = useState<Format>("text");
  const [target, setTarget] = useState<Format>("base64");
  const [input, setInput] = useState("Café naïve résumé £5 ✓ 日本語");

  const converted = useMemo(() => {
    const blank = { output: "", bytes: 0, error: null as string | null, onOutput: false };
    if (input === "") return blank;

    let bytes: Uint8Array;
    try {
      bytes = toBytes(source, input);
    } catch (err) {
      return { ...blank, error: err instanceof Error ? err.message : "Could not read that." };
    }
    try {
      return { output: fromBytes(target, bytes), bytes: bytes.length, error: null, onOutput: false };
    } catch (err) {
      return {
        output: "",
        bytes: bytes.length,
        error: err instanceof Error ? err.message : "Could not write that.",
        onOutput: true,
      };
    }
  }, [input, source, target]);

  function swap() {
    const previousOutput = converted.output;
    const previousSource = source;
    setSource(target);
    setTarget(previousSource);
    if (converted.error === null) setInput(previousOutput);
  }

  const sourceHint = FORMATS.find((f) => f.id === source)?.hint ?? "";
  const targetHint = FORMATS.find((f) => f.id === target)?.hint ?? "";

  return (
    <ToolShell
      slug="encoder-decoder"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
        <ToolPanel title="Input">
          <label htmlFor="source-format" className="sr-only">
            Input format
          </label>
          <select
            id="source-format"
            value={source}
            onChange={(e) => setSource(e.target.value as Format)}
            data-testid="select-source"
            className="min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          >
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            {sourceHint}
          </p>

          <label htmlFor="source-text" className="sr-only">
            Text to convert
          </label>
          <textarea
            id="source-text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            rows={9}
            aria-invalid={converted.error !== null}
            aria-describedby={converted.error ? "convert-error" : undefined}
            data-testid="input-source"
            className="mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          {converted.error ? (
            <p
              id="convert-error"
              role="alert"
              data-testid="text-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              <strong className="font-normal uppercase tracking-[0.2em]">
                {converted.onOutput
                  ? `Cannot render as ${formatLabel(target)}: `
                  : `Not valid ${formatLabel(source)}: `}
              </strong>
              {converted.error}
            </p>
          ) : null}
        </ToolPanel>

        <div className="flex justify-center lg:pt-24">
          <button
            type="button"
            onClick={swap}
            data-testid="button-swap"
            aria-label="Swap the input and output formats"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-5 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
          >
            <span aria-hidden>⇄</span> Swap
          </button>
        </div>

        <ToolPanel title="Output">
          <label htmlFor="target-format" className="sr-only">
            Output format
          </label>
          <select
            id="target-format"
            value={target}
            onChange={(e) => setTarget(e.target.value as Format)}
            data-testid="select-target"
            className="min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          >
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            {targetHint}
          </p>

          <label htmlFor="target-text" className="sr-only">
            Converted output
          </label>
          <textarea
            id="target-text"
            value={converted.output}
            readOnly
            rows={9}
            spellCheck={false}
            data-testid="output-target"
            className="mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              {converted.bytes.toLocaleString()} byte{converted.bytes === 1 ? "" : "s"} ·{" "}
              {converted.output.length.toLocaleString()} chars out
            </p>
            <CopyButton value={converted.output} label="Copy the output" testId="button-copy-output" />
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
