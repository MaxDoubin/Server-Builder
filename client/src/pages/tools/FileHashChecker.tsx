/**
 * File checksum verifier.
 *
 * Hashes a dropped file or pasted text with MD5, SHA-1, SHA-256, SHA-384 and
 * SHA-512, all in this tab. MD5 has no Web Crypto support, so it is computed
 * here from RFC 1321 and fed the file in chunks, which also keeps a very
 * large file from arriving as one allocation. The SHA family runs through
 * SubtleCrypto. A pasted expected value, whether a bare digest, a
 * coreutils or BSD style line, or a whole checksum file, is matched against
 * the computed digest of the same length, or of the algorithm a line names.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Md5,
  md5Hex,
  subtleHex,
  algorithmsForLength,
  otherAlgorithmsForLength,
  parseExpectedAll,
  findMatch,
  MAX_EXPECTED_LINES,
} from "@/lib/toolkit/file-hash-checker";

const MAX_BYTES = 512 * 1024 * 1024; // 512 MiB
const CHUNK = 8 * 1024 * 1024; // 8 MiB read window
// Text mode rehashes on every keystroke, so it gets a smaller cap than files.
const MAX_TEXT_BYTES = 8 * 1024 * 1024; // 8 MiB

interface HashSet {
  md5: string;
  sha1: string;
  sha256: string;
  sha384: string;
  sha512: string;
}

const ROWS: { key: keyof HashSet; name: string; bits: number }[] = [
  { key: "md5", name: "MD5", bits: 128 },
  { key: "sha1", name: "SHA-1", bits: 160 },
  { key: "sha256", name: "SHA-256", bits: 256 },
  { key: "sha384", name: "SHA-384", bits: 384 },
  { key: "sha512", name: "SHA-512", bits: 512 },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} ${n === 1 ? "byte" : "bytes"}`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "unexpected error";
}

async function hashWholeBuffer(bytes: Uint8Array): Promise<HashSet> {
  const md5 = md5Hex(bytes);
  const [sha1, sha256, sha384, sha512] = await Promise.all([
    subtleHex("SHA-1", bytes),
    subtleHex("SHA-256", bytes),
    subtleHex("SHA-384", bytes),
    subtleHex("SHA-512", bytes),
  ]);
  return { md5, sha1, sha256, sha384, sha512 };
}

type Mode = "file" | "text";
type Status = "idle" | "reading" | "hashing" | "done" | "error";

export function FileHashChecker() {
  const [mode, setMode] = useState<Mode>("file");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [result, setResult] = useState<HashSet | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [expected, setExpected] = useState("");

  const runRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Invalidate any in-flight read so its callbacks stop touching state.
      runRef.current += 1;
    };
  }, []);

  // Text mode hashes reactively. The strings are small, so there is no chunk
  // loop, only the asynchronous SubtleCrypto calls, guarded by a run token.
  useEffect(() => {
    if (mode !== "text") return;
    const run = ++runRef.current;
    const bytes = new TextEncoder().encode(text);
    setFileName(null);
    setFileSize(bytes.length);
    setError(null);
    if (text === "") {
      setResult(null);
      setStatus("idle");
      return;
    }
    if (bytes.length > MAX_TEXT_BYTES) {
      setResult(null);
      setStatus("error");
      setError(
        `That text is ${formatBytes(bytes.length)} as UTF-8. Text mode is capped at ${formatBytes(MAX_TEXT_BYTES)}; save it to a file and use file mode, which allows up to ${formatBytes(MAX_BYTES)}.`,
      );
      return;
    }
    setStatus("hashing");
    hashWholeBuffer(bytes)
      .then((hashes) => {
        if (run !== runRef.current || !mountedRef.current) return;
        setResult(hashes);
        setStatus("done");
      })
      .catch((err) => {
        if (run !== runRef.current || !mountedRef.current) return;
        setError(`Could not hash the text: ${errorText(err)}`);
        setStatus("error");
      });
  }, [mode, text]);

  function switchMode(next: Mode): void {
    if (next === mode) return;
    // Drop the other mode's result and stop any in-flight file read, so a
    // digest is never shown next to an input it was not computed from.
    runRef.current += 1;
    setResult(null);
    setFileName(null);
    setFileSize(0);
    setProgress(0);
    setError(null);
    setStatus("idle");
    setMode(next);
  }

  async function loadFile(file: File): Promise<void> {
    const run = ++runRef.current;
    setError(null);
    setResult(null);
    setProgress(0);
    setFileName(file.name);
    setFileSize(file.size);

    if (file.size > MAX_BYTES) {
      setStatus("error");
      setError(
        `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}, because Web Crypto has no streaming digest and the whole file has to sit in memory while the SHA digests run. For a larger file, use sha256sum or Get-FileHash locally.`,
      );
      return;
    }

    setStatus("reading");
    try {
      const md5 = new Md5();
      const whole = new Uint8Array(file.size);
      let offset = 0;
      while (offset < file.size) {
        if (run !== runRef.current) return;
        const end = Math.min(offset + CHUNK, file.size);
        const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
        if (run !== runRef.current) return;
        md5.update(chunk);
        whole.set(chunk, offset);
        offset = end;
        if (mountedRef.current) setProgress(offset / file.size);
      }

      if (run !== runRef.current) return;
      if (mountedRef.current) setStatus("hashing");
      const md5digest = md5.hex();
      const [sha1, sha256, sha384, sha512] = await Promise.all([
        subtleHex("SHA-1", whole),
        subtleHex("SHA-256", whole),
        subtleHex("SHA-384", whole),
        subtleHex("SHA-512", whole),
      ]);
      if (run !== runRef.current || !mountedRef.current) return;
      setResult({ md5: md5digest, sha1, sha256, sha384, sha512 });
      setProgress(1);
      setStatus("done");
    } catch (err) {
      if (run !== runRef.current || !mountedRef.current) return;
      setError(`Could not read the file: ${errorText(err)}`);
      setStatus("error");
    }
  }

  function onFileChosen(e: ChangeEvent<HTMLInputElement>): void {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file) void loadFile(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    if (mode !== "file") return;
    const file = e.dataTransfer.files[0];
    if (file) void loadFile(file);
  }

  const parsedAll = useMemo(() => parseExpectedAll(expected), [expected]);
  const entries = parsedAll.entries;

  const match = useMemo(() => {
    if (!result) return null;
    const digests: Record<string, string> = {};
    for (const row of ROWS) digests[row.name] = result[row.key];
    return findMatch(entries, digests);
  }, [result, entries]);
  const matchKey = match ? (ROWS.find((r) => r.name === match.algorithm)?.key ?? null) : null;

  // The entry described in the details list: the matching line if there is
  // one, otherwise the first line that parsed.
  const parsed = match ? entries[match.index] : (entries[0] ?? null);
  const expectedHex = parsed?.hex ?? null;
  const detected = expectedHex ? algorithmsForLength(expectedHex.length) : [];
  const others = expectedHex ? otherAlgorithmsForLength(expectedHex.length) : [];
  const many = entries.length > 1;
  const inputNoun = mode === "file" ? "file" : "text";

  let verdict: { tone: "ok" | "warn" | "danger"; text: string } | null = null;
  if (parsed) {
    const where = many ? `Line ${parsed.line}${parsed.filename ? ` (${parsed.filename})` : ""}` : "The expected value";
    if (!result) {
      verdict = { tone: "warn", text: "Add a file or some text, and the expected value will be checked against it." };
    } else if (match) {
      verdict = { tone: "ok", text: `Match. ${where} equals the ${match.algorithm} of this ${inputNoun}.` };
    } else if (many) {
      verdict = {
        tone: "danger",
        text: `No match. None of the ${entries.length} checksums found in the pasted text equals a digest of this ${inputNoun}${parsedAll.truncated ? `, though only the first ${MAX_EXPECTED_LINES.toLocaleString("en-US")} lines were scanned` : ""}.`,
      };
    } else if (parsed.algorithmTag !== null && parsed.algorithm === null) {
      verdict = {
        tone: "warn",
        text: `The line names ${parsed.algorithmTag}, which this tool does not compute, so it cannot be checked here.`,
      };
    } else if (parsed.algorithm !== null && !detected.includes(parsed.algorithm)) {
      verdict = {
        tone: "warn",
        text: `The line says ${parsed.algorithm}, but ${expectedHex?.length ?? 0} hex characters is not a ${parsed.algorithm} length. The digest is probably truncated or mislabeled.`,
      };
    } else if (detected.length === 0) {
      verdict = {
        tone: "warn",
        text: `That is ${expectedHex?.length ?? 0} hex characters, which is not the length of any digest shown here. Check for a truncated or run-together paste.`,
      };
    } else {
      const algo = parsed.algorithm ?? detected[0];
      verdict = {
        tone: "danger",
        text: `No match. The expected value has the length of a ${algo} digest but does not equal the ${algo} computed here, so this ${inputNoun} is not the one that value describes${parsed.algorithm === null && others.length ? `, unless the value came from another algorithm of the same length, such as ${others.join(" or ")}` : ""}.`,
      };
    }
  } else if (expected.trim() !== "") {
    verdict = {
      tone: "warn",
      text: "No hex digest found in that text. Paste the checksum itself, a sha256sum or shasum line, or a BSD style line such as SHA256 (file) = digest.",
    };
  }

  const busy = status === "reading" || status === "hashing";
  const summary = error
    ? error
    : status === "reading"
      ? `Reading, ${Math.round(progress * 100)} percent.`
      : status === "hashing"
        ? "Computing digests."
        : result
          ? `Hashed ${formatBytes(fileSize)}.`
          : mode === "file"
            ? "Choose a file to hash it."
            : "Type or paste text to hash it.";

  const VERDICT_STYLE: Record<"ok" | "warn" | "danger", string> = {
    ok: "border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.08)] text-[hsl(var(--brand-signal))]",
    warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
    danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
  };

  return (
    <ToolShell slug="file-hash-checker">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>

      <div className="space-y-6">
        <ToolPanel title="Input">
          <div
            role="group"
            aria-label="Input source"
            className="mb-5 flex flex-wrap gap-2"
          >
            {(["file", "text"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => switchMode(m)}
                data-testid={`button-mode-${m}`}
                className={`inline-flex min-h-[44px] items-center rounded-full border px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                  mode === m
                    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]"
                    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                }`}
              >
                {m === "file" ? "File" : "Text"}
              </button>
            ))}
          </div>

          {mode === "file" ? (
            <>
              <label
                htmlFor="file-input"
                className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
              >
                Choose a file ({formatBytes(MAX_BYTES)} limit)
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  const next = e.relatedTarget;
                  if (next instanceof Node && e.currentTarget.contains(next)) return;
                  setDragging(false);
                }}
                onDrop={onDrop}
                data-testid="dropzone"
                className={`rounded-xl border border-dashed p-4 transition-colors ${
                  dragging
                    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.06)]"
                    : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)]"
                }`}
              >
                <input
                  id="file-input"
                  type="file"
                  onChange={onFileChosen}
                  data-testid="file-input"
                  className="block w-full min-h-[44px] cursor-pointer font-mono-tight text-sm text-[hsl(var(--brand-bone))] file:mr-4 file:min-h-[44px] file:cursor-pointer file:rounded-lg file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-xs file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
                />
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  The file is read in {formatBytes(CHUNK)} chunks and never leaves this tab. Drag a file onto this box, or use the picker.
                </p>
              </div>
            </>
          ) : (
            <>
              <label
                htmlFor="text-input"
                className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
              >
                Text to hash (encoded as UTF-8)
              </label>
              <textarea
                id="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="Paste or type the text whose digest you need."
                data-testid="input-text"
                aria-describedby="text-hint"
                className="w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              />
              <p id="text-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Every byte counts, including line breaks, which are hashed as LF. A trailing newline changes the digest, which is why the output of a plain echo piped into sha256sum differs from echo -n. Limit {formatBytes(MAX_TEXT_BYTES)}.
              </p>
            </>
          )}

          {error ? (
            <p
              role="alert"
              data-testid="text-error"
              className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {error}
            </p>
          ) : null}

          {fileName !== null || (mode === "text" && text !== "") ? (
            <dl className="mt-5 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              {fileName !== null ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-[hsl(var(--brand-iron)/0.5)] py-2">
                  <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                    Name
                  </dt>
                  <dd className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    {fileName || "(no name)"}
                  </dd>
                </div>
              ) : null}
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-[hsl(var(--brand-iron)/0.5)] py-2">
                <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  Size
                </dt>
                <dd className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {fileSize.toLocaleString("en-US")} bytes ({formatBytes(fileSize)})
                </dd>
              </div>
            </dl>
          ) : null}

          {busy ? (
            <div className="mt-4">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--brand-iron))]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={status === "reading" ? Math.round(progress * 100) : undefined}
                aria-label="Hashing progress"
              >
                <div
                  className="h-full bg-[hsl(var(--brand-signal))] transition-[width]"
                  style={{ width: status === "reading" ? `${Math.round(progress * 100)}%` : "100%" }}
                />
              </div>
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">
                {status === "reading" ? `Reading, ${Math.round(progress * 100)} percent` : "Computing digests"}
              </p>
            </div>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Digests">
          {result ? (
            <div className="space-y-3" data-testid="output-hashes">
              {ROWS.map((row) => {
                const matched = matchKey === row.key;
                return (
                  <div
                    key={row.key}
                    className={`rounded-lg border p-3 ${
                      matched
                        ? "border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-signal)/0.06)]"
                        : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                        {row.name}
                        <span className="ml-2 normal-case tracking-normal text-[hsl(var(--brand-bone-dim))]">
                          {row.bits} bit
                        </span>
                      </span>
                      <div className="flex items-center gap-2">
                        {matched ? (
                          <span className="inline-flex items-center rounded-full border border-[hsl(var(--brand-signal)/0.6)] px-2.5 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))]">
                            match
                          </span>
                        ) : null}
                        <CopyButton value={result[row.key]} label={`Copy the ${row.name} digest`} />
                      </div>
                    </div>
                    <p
                      data-testid={`text-hash-${row.key}`}
                      className="mt-2 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]"
                    >
                      {result[row.key]}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              {busy ? "Working." : mode === "file" ? "Choose a file to see its digests." : "Type some text to see its digests."}
            </p>
          )}
        </ToolPanel>

        <ToolPanel title="Verify against an expected checksum">
          <label
            htmlFor="expected-input"
            className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
          >
            Paste the published checksum, a sha256sum or BSD style line, or a whole checksum file
          </label>
          <textarea
            id="expected-input"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            rows={3}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08  ubuntu.iso"
            data-testid="input-expected"
            className="w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          {expectedHex ? (
            <dl className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-[hsl(var(--brand-iron)/0.5)] py-2">
                <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  Length
                </dt>
                <dd className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {expectedHex.length} hex characters
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-[hsl(var(--brand-iron)/0.5)] py-2">
                <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  Looks like
                </dt>
                <dd className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {detected.length ? detected.join(" or ") : "no known digest"}
                  {parsed?.algorithmTag ? ` (line says ${parsed.algorithmTag})` : ""}
                </dd>
              </div>
              {many ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-[hsl(var(--brand-iron)/0.5)] py-2">
                  <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                    Checksums found
                  </dt>
                  <dd className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    {entries.length.toLocaleString("en-US")}
                  </dd>
                </div>
              ) : null}
              {parsed?.filename ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-[hsl(var(--brand-iron)/0.5)] py-2">
                  <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                    Listed file
                  </dt>
                  <dd className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    {parsed.filename}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {verdict ? (
            <p
              role="status"
              aria-live="polite"
              data-testid="text-verdict"
              className={`mt-4 rounded-lg border p-3 font-mono-tight text-sm leading-relaxed ${VERDICT_STYLE[verdict.tone]}`}
            >
              {verdict.text}
            </p>
          ) : null}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
