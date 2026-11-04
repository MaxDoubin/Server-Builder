/**
 * CRC calculator.
 *
 * A CRC is described by six Rocksoft parameters, so this page is built around
 * them: pick a catalog entry to fill the six fields, or edit any field and
 * the entry drops to "Custom" (and snaps back if the fields equal one again).
 * The input is typed text (UTF-8), pasted hex bytes, or a file streamed in
 * chunks so memory stays flat. The algorithm, the catalog and its self test
 * live in lib/toolkit/crc-calculator so they can be unit tested without React.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  CATALOG,
  CHECK_INPUT,
  Crc,
  MAX_FILE_BYTES,
  MAX_MANUAL_BYTES,
  MAX_WIDTH,
  MIN_WIDTH,
  byteString,
  checkValue,
  crc,
  diagnoseMismatch,
  fieldsFor,
  findEntry,
  formatBinary,
  formatHex,
  matchEntry,
  parseExpected,
  parseHexBytes,
  parseParams,
  polynomialText,
  reflect,
  selfTest,
  textBytes,
  type CrcParams,
  type FieldName,
  type ParamFields,
} from "@/lib/toolkit/crc-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON =
  "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TONE: Record<"ok" | "warn" | "danger", string> = {
  ok: "border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.08)] text-[hsl(var(--brand-signal))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

const CHUNK = 4 * 1024 * 1024;
const DEFAULT_ENTRY = findEntry("crc-32") ?? CATALOG[0];

type Mode = "text" | "hex" | "file";
type FileStatus = "idle" | "reading" | "done" | "error";

const PARAMETER_TERMS: { term: string; meaning: string }[] = [
  {
    term: "width",
    meaning: "How many bits the register and the result have. CRC-32 is 32.",
  },
  {
    term: "poly",
    meaning:
      "The generator polynomial, written MSB first with the leading x^width term left out. 0x04C11DB7 for CRC-32.",
  },
  {
    term: "init",
    meaning:
      "The register's value before any data. A nonzero init, such as all ones, makes leading zero bytes change the CRC. With an init of 0 they cannot.",
  },
  {
    term: "refin",
    meaning: "Whether each input byte is bit reversed first, so the least significant bit goes in first.",
  },
  {
    term: "refout",
    meaning: "Whether the register is bit reversed before the final XOR.",
  },
  {
    term: "xorout",
    meaning: "A value XORed into the result last, after any reflection. All ones inverts every bit of the CRC.",
  },
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

interface FileResult {
  file: File;
  params: CrcParams;
  value: bigint;
}

export function CrcCalculator() {
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_ENTRY.id);
  const [fields, setFields] = useState<ParamFields>(() => fieldsFor(DEFAULT_ENTRY));
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState(CHECK_INPUT);
  const [hexText, setHexText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileStatus, setFileStatus] = useState<FileStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileResult, setFileResult] = useState<FileResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [expectedRaw, setExpectedRaw] = useState("");

  const runRef = useRef(0);

  /* ---- parameters */

  const parsed = useMemo(() => parseParams(fields), [fields]);
  const params = parsed.ok ? parsed.params : null;
  const errors = parsed.ok ? {} : parsed.errors;
  const entry = useMemo(() => (params ? matchEntry(params) : undefined), [params]);
  const check = useMemo(() => (params ? checkValue(params) : null), [params]);
  const selected = selectedId === "custom" ? undefined : findEntry(selectedId);

  function chooseEntry(id: string) {
    setSelectedId(id);
    const next = findEntry(id);
    if (next) setFields(fieldsFor(next));
  }

  function editField(name: FieldName, value: string) {
    const next: ParamFields = { ...fields, [name]: value };
    setFields(next);
    const result = parseParams(next);
    setSelectedId(result.ok ? (matchEntry(result.params)?.id ?? "custom") : "custom");
  }

  function editFlag(name: "refin" | "refout", value: boolean) {
    const next: ParamFields = { ...fields, [name]: value };
    setFields(next);
    const result = parseParams(next);
    setSelectedId(result.ok ? (matchEntry(result.params)?.id ?? "custom") : "custom");
  }

  /* ---- input */

  const manual = useMemo(() => {
    if (mode === "text") return textBytes(text);
    if (mode === "hex") return parseHexBytes(hexText);
    return null;
  }, [mode, text, hexText]);

  const manualValue = useMemo(() => {
    if (!params || !manual) return null;
    if (manual.kind === "error") return null;
    return crc(params, manual.kind === "ok" ? manual.bytes : new Uint8Array(0));
  }, [params, manual]);

  const manualLength = manual && manual.kind === "ok" ? manual.bytes.length : 0;

  /*
    File mode streams the file through the same Crc object in 4 MiB chunks.
    A change of parameters starts again after a short pause, so typing a
    polynomial does not re-read a large file on every keystroke, and a run
    token makes any read that has been superseded (or outlived the page)
    stop before it touches state.
  */
  useEffect(() => {
    if (mode !== "file" || !file || !params) {
      // A read cancelled by the cleanup below must not leave the progress bar up.
      setFileStatus((current) => (current === "reading" ? "idle" : current));
      return;
    }
    const run = ++runRef.current;
    setFileError(null);
    if (file.size > MAX_FILE_BYTES) {
      setFileStatus("error");
      setFileError(
        `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}. For anything larger, use a command line tool such as cksum or crc32.`,
      );
      return;
    }
    setFileStatus("reading");
    setProgress(0);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const state = new Crc(params);
          let offset = 0;
          while (offset < file.size) {
            if (run !== runRef.current) return;
            const end = Math.min(offset + CHUNK, file.size);
            const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
            if (run !== runRef.current) return;
            state.update(chunk);
            offset = end;
            setProgress(offset / file.size);
          }
          if (run !== runRef.current) return;
          setFileResult({ file, params, value: state.digest() });
          setFileStatus("done");
        } catch (err) {
          if (run !== runRef.current) return;
          setFileStatus("error");
          setFileError(`Could not read the file: ${errorText(err)}`);
        }
      })();
    }, 200);
    return () => {
      window.clearTimeout(timer);
      runRef.current += 1;
    };
  }, [mode, file, params]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const chosen = input.files?.[0] ?? null;
    input.value = "";
    if (chosen) {
      setFileResult(null);
      setFile(chosen);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) {
      setFileResult(null);
      setFile(dropped);
    }
  }

  /* ---- output */

  const fileValue =
    mode === "file" && fileResult && fileResult.file === file && fileResult.params === params ? fileResult.value : null;
  const value = mode === "file" ? fileValue : manualValue;
  const length = mode === "file" ? (file?.size ?? 0) : manualLength;
  const width = params?.width ?? 0;

  const expected = useMemo(
    () => (params ? parseExpected(expectedRaw, params.width) : ({ kind: "empty" } as const)),
    [expectedRaw, params],
  );

  let verdict: { tone: "ok" | "warn" | "danger"; text: string } | null = null;
  if (expected.kind === "error") {
    verdict = { tone: "warn", text: expected.message };
  } else if (expected.kind === "ok" && value !== null && params) {
    if (expected.value === value) {
      verdict = { tone: "ok", text: `Match. The computed CRC equals the expected value ${formatHex(value, params.width)}.` };
    } else {
      const why = diagnoseMismatch(value, expected.value, params.width);
      verdict = {
        tone: "danger",
        text: `No match. Computed ${formatHex(value, params.width)}, expected ${formatHex(expected.value, params.width)}. ${
          why ??
          "Check that the parameter set is the one the other side uses, that the input is the same bytes (text and hex are different inputs, and a line ending is one byte or two), and which byte order the expected value was written in."
        }`,
      };
    }
  } else if (expected.kind === "ok" && value === null) {
    verdict = { tone: "warn", text: "There is no computed CRC to compare with yet." };
  }

  const rows = useMemo(() => selfTest(), []);
  const passed = rows.filter((row) => row.ok).length;

  const hexValue = value !== null && params ? formatHex(value, params.width) : "";
  const statusText = (() => {
    if (!parsed.ok) return "Fix the parameters to compute a CRC.";
    if (mode === "file") {
      if (fileStatus === "reading") return `Reading, ${Math.round(progress * 100)} percent.`;
      if (fileStatus === "error" && fileError) return fileError;
    }
    if (manual && manual.kind === "error") return manual.message;
    return value !== null ? `CRC ${hexValue} over ${formatBytes(length)}.` : "Choose a file to compute its CRC.";
  })();

  const summary =
    value !== null && params
      ? [
          `${selected?.name ?? entry?.name ?? "Custom CRC"}`,
          `width ${params.width}, poly ${formatHex(params.poly, params.width)}, init ${formatHex(params.init, params.width)}, refin ${params.refin}, refout ${params.refout}, xorout ${formatHex(params.xorout, params.width)}`,
          `input ${formatBytes(length)}`,
          `crc ${hexValue}`,
        ].join("\n")
      : "";

  const paramInput = (name: FieldName, label: string, placeholder: string, hint: string) => {
    const id = `crc-${name}`;
    const error = errors[name];
    return (
      <div>
        <label htmlFor={`${id}-input`} className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
          {label}
        </label>
        <input
          id={`${id}-input`}
          type="text"
          value={fields[name]}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          inputMode={name === "width" ? "numeric" : "text"}
          onChange={(event) => editField(name, event.target.value)}
          aria-invalid={error !== undefined}
          aria-describedby={`${id}-message`}
          placeholder={placeholder}
          data-testid={`input-${name}`}
          className={INPUT_CLASS}
        />
        {error ? (
          <p id={`${id}-message`} role="alert" data-testid={`text-error-${name}`} className={`mt-3 break-words ${ERROR_BOX}`}>
            {error}
          </p>
        ) : (
          <p id={`${id}-message`} className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            {hint}
          </p>
        )}
      </div>
    );
  };

  const flagToggle = (name: "refin" | "refout", label: string, detail: string) => {
    const on = fields[name];
    return (
      <label
        className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-2 font-mono-tight text-xs transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
          on
            ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]"
            : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
        }`}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={on}
          onChange={(event) => editFlag(name, event.target.checked)}
          data-testid={`checkbox-${name}`}
        />
        <span aria-hidden>{on ? "[x]" : "[ ]"}</span>
        <span>
          <span className="block uppercase tracking-[0.18em]">{label}</span>
          <span className="block normal-case tracking-normal">{detail}</span>
        </span>
      </label>
    );
  };

  const shownEntry = selected ?? entry;

  return (
    <ToolShell slug="crc-calculator">
      <p role="status" aria-live="polite" data-testid="text-status" className="sr-only">
        {statusText}
      </p>

      <div className="space-y-6">
        <ToolPanel title="Algorithm">
          <label htmlFor="crc-algorithm" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Parameter set
          </label>
          <select
            id="crc-algorithm"
            value={selectedId}
            onChange={(event) => chooseEntry(event.target.value)}
            data-testid="select-algorithm"
            className={`${INPUT_CLASS} sm:max-w-md`}
          >
            <option value="custom">Custom parameters</option>
            <optgroup label="Common">
              {CATALOG.filter((candidate) => candidate.group === "common").map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="More">
              {CATALOG.filter((candidate) => candidate.group === "more").map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </optgroup>
          </select>

          {shownEntry ? (
            <div className="mt-3 space-y-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {shownEntry.aliases.length > 0 ? (
                <p className="break-words">
                  <span className="text-[hsl(var(--brand-ash))]">Also called </span>
                  {shownEntry.aliases.join(", ")}
                </p>
              ) : null}
              {shownEntry.usedBy ? (
                <p className="break-words">
                  <span className="text-[hsl(var(--brand-ash))]">About </span>
                  {shownEntry.usedBy}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {paramInput("width", "Width in bits", "32", `A whole number from ${MIN_WIDTH} to ${MAX_WIDTH}.`)}
            {paramInput("poly", "Polynomial (poly), hex", "0x04C11DB7", "Normal form: most significant bit first, x^width implied.")}
            {paramInput("init", "Initial value (init), hex", "0xFFFFFFFF", "The register before the first byte.")}
            {paramInput("xorout", "Final XOR (xorout), hex", "0xFFFFFFFF", "XORed into the result after any reflection.")}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {flagToggle("refin", "Reflect input", "Each byte is processed least significant bit first.")}
            {flagToggle("refout", "Reflect output", "The register is bit reversed before the final XOR.")}
          </div>

          {parsed.ok && parsed.warnings.length > 0 ? (
            <div className="mt-4 space-y-2">
              {parsed.warnings.map((warning) => (
                <p key={warning} className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE.warn}`}>
                  {warning}
                </p>
              ))}
            </div>
          ) : null}

          {params && check !== null ? (
            <div className="mt-5 border-t border-[hsl(var(--brand-iron)/0.5)] pt-4">
              <ToolResult
                label={`Check value over "${CHECK_INPUT}"`}
                value={formatHex(check, params.width)}
                testId="text-check-value"
              />
              <p className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {entry
                  ? `This equals the published check value for ${entry.name}, so the parameters are entered correctly.`
                  : "These parameters match no catalog entry. Compare this value with the check value in the specification you are following. If they differ, one parameter is wrong."}
              </p>
            </div>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Input">
          <div role="group" aria-label="Input source" className="mb-5 flex flex-wrap gap-2">
            {(
              [
                ["text", "Text"],
                ["hex", "Hex bytes"],
                ["file", "File"],
              ] as [Mode, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => switchMode(id)}
                data-testid={`button-mode-${id}`}
                className={`inline-flex min-h-[44px] items-center rounded-full border px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors ${FOCUS_RING} ${
                  mode === id ? CHIP_ON : CHIP_OFF
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "text" ? (
            <>
              <label htmlFor="crc-text" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                Text, taken as UTF-8
              </label>
              <textarea
                id="crc-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={4}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={manual?.kind === "error"}
                aria-describedby="crc-text-hint"
                placeholder="123456789"
                data-testid="input-crc"
                className={`${INPUT_CLASS} resize-y leading-relaxed`}
              />
              <p id="crc-text-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Every character counts, including spaces. A line break typed here is one byte, LF (0x0A). A file
                saved on Windows usually has CRLF, two bytes, which gives a different CRC. The box holds up to{" "}
                {MAX_MANUAL_BYTES.toLocaleString("en-US")} bytes.
              </p>
            </>
          ) : null}

          {mode === "hex" ? (
            <>
              <label htmlFor="crc-hex" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                Bytes in hex
              </label>
              <textarea
                id="crc-hex"
                value={hexText}
                onChange={(event) => setHexText(event.target.value)}
                rows={4}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={manual?.kind === "error"}
                aria-describedby="crc-hex-hint"
                placeholder="01 03 00 00 00 0A"
                data-testid="input-crc-hex"
                className={`${INPUT_CLASS} resize-y break-all leading-relaxed`}
              />
              <p id="crc-hex-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                DEADBEEF, DE AD BE EF, de:ad:be:ef, 0xDE, 0xAD and \xde\xad all work. Each group must hold whole bytes.
                Empty input is the CRC of zero bytes.
              </p>
            </>
          ) : null}

          {mode === "file" ? (
            <>
              <label htmlFor="crc-file" className="mb-2 block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                Choose a file ({formatBytes(MAX_FILE_BYTES)} limit)
              </label>
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(event) => {
                  const next = event.relatedTarget;
                  if (next instanceof Node && event.currentTarget.contains(next)) return;
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
                  id="crc-file"
                  type="file"
                  onChange={onFileChosen}
                  data-testid="input-crc-file"
                  className="block min-h-[44px] w-full cursor-pointer font-mono-tight text-sm text-[hsl(var(--brand-bone))] file:mr-4 file:min-h-[44px] file:cursor-pointer file:rounded-lg file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-xs file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
                />
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  The file is read in {formatBytes(CHUNK)} chunks in this tab and is never uploaded. Drag a file onto
                  this box, or use the picker.
                </p>
              </div>
              {file ? (
                <p className="mt-3 break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="text-[hsl(var(--brand-ash))]">File </span>
                  {file.name || "(no name)"}
                  <span className="text-[hsl(var(--brand-ash))]"> · </span>
                  {file.size.toLocaleString("en-US")} bytes
                </p>
              ) : null}
              {fileStatus === "reading" ? (
                <div className="mt-3">
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--brand-iron))]"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                    aria-label="Reading progress"
                  >
                    <div
                      className="h-full bg-[hsl(var(--brand-signal))] transition-[width]"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">
                    Reading, {Math.round(progress * 100)} percent
                  </p>
                </div>
              ) : null}
              {fileError ? (
                <p role="alert" data-testid="text-file-error" className={`mt-3 break-words ${ERROR_BOX}`}>
                  {fileError}
                </p>
              ) : null}
            </>
          ) : null}

          {manual && manual.kind === "error" ? (
            <p role="alert" data-testid="text-input-error" className={`mt-3 break-words ${ERROR_BOX}`}>
              {manual.message}
            </p>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Result">
          {value !== null && params ? (
            <div data-testid="output-crc">
              <p
                data-testid="text-crc-hex"
                className="break-all font-display text-3xl font-medium text-[hsl(var(--brand-bone))]"
              >
                {hexValue}
              </p>
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                {formatBytes(length)} in, {params.width} bit CRC
                {entry ? ` · ${entry.name}` : ""}
              </p>
              <div className="mt-4">
                <ToolResult label="Decimal" value={value.toString()} testId="text-crc-dec" />
                <ToolResult label="Binary" value={formatBinary(value, params.width)} testId="text-crc-bin" />
                <ToolResult
                  label="Bytes, big endian"
                  value={byteString(value, params.width, "big")}
                  testId="text-crc-be"
                />
                <ToolResult
                  label="Bytes, little endian"
                  value={byteString(value, params.width, "little")}
                  testId="text-crc-le"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <CopyButton value={hexValue} label="Copy the CRC in hex" testId="button-copy-hex">
                  <span>Hex</span>
                </CopyButton>
                <CopyButton value={value.toString()} label="Copy the CRC in decimal" testId="button-copy-dec">
                  <span>Decimal</span>
                </CopyButton>
                <CopyButton value={summary} label="Copy a summary with the parameters" testId="button-copy-summary">
                  <span>Summary</span>
                </CopyButton>
              </div>
            </div>
          ) : (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]" data-testid="text-waiting">
              {!parsed.ok
                ? "Fix the parameters above to compute a CRC."
                : manual && manual.kind === "error"
                  ? "Fix the input above to compute a CRC."
                  : mode === "file"
                    ? fileStatus === "reading"
                      ? "Reading the file."
                      : fileStatus === "error"
                        ? "The file could not be used."
                        : "Choose a file to compute its CRC."
                    : "Computing."}
            </p>
          )}

          {params ? (
            <div className="mt-6 border-t border-[hsl(var(--brand-iron)/0.5)] pt-4">
              <label htmlFor="crc-expected" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                Expected CRC, hex (optional)
              </label>
              <input
                id="crc-expected"
                type="text"
                value={expectedRaw}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => setExpectedRaw(event.target.value)}
                aria-invalid={expected.kind === "error"}
                placeholder={formatHex(params.init, params.width)}
                data-testid="input-expected"
                className={`${INPUT_CLASS} sm:max-w-md`}
              />
              {verdict ? (
                <p
                  role="status"
                  aria-live="polite"
                  data-testid="text-verdict"
                  className={`mt-3 break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE[verdict.tone]}`}
                >
                  {verdict.text}
                </p>
              ) : null}
            </div>
          ) : null}
        </ToolPanel>

        {params ? (
          <ToolPanel title="This polynomial">
            <ToolResult label="Normal form" value={formatHex(params.poly, params.width)} testId="text-poly-normal" />
            <ToolResult
              label="Reflected form"
              value={formatHex(reflect(params.poly, params.width), params.width)}
              testId="text-poly-reflected"
            />
            <div className="border-b border-[hsl(var(--brand-iron)/0.5)] py-2.5 last:border-b-0">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                Algebraic form
              </span>
              <p
                data-testid="text-poly-algebraic"
                className="mt-1.5 break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]"
              >
                {polynomialText(params.poly, params.width)}
              </p>
            </div>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The reflected form is the same polynomial with its bits reversed. Software that shifts the register
              right, the usual way to write a table driven CRC with reflected input, carries the constant in this
              form, which is why 0x04C11DB7 and 0xEDB88320 are the same CRC-32.
            </p>
          </ToolPanel>
        ) : null}

        <ToolPanel title={`Self-test: ${passed} of ${rows.length} entries match`}>
          <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]" data-testid="text-selftest">
            Each catalog entry is run over the nine bytes "{CHECK_INPUT}" and compared with its published check
            value. {passed === rows.length ? "All of them agree." : `${rows.length - passed} disagree and are marked.`}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left" data-testid="table-selftest">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  {["Name", "Width", "Poly", "Init", "Refin", "Refout", "Xorout", "Check", "Computed", "Result"].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="whitespace-nowrap py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry: row, got, ok }) => (
                  <tr key={row.id} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                    <th
                      scope="row"
                      className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs font-normal text-[hsl(var(--brand-signal))]"
                    >
                      {row.name}
                    </th>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {row.width}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {formatHex(row.poly, row.width)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {formatHex(row.init, row.width)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {row.refin ? "true" : "false"}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {row.refout ? "true" : "false"}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {formatHex(row.xorout, row.width)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {formatHex(row.check, row.width)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {formatHex(got, row.width)}
                    </td>
                    <td
                      className={`whitespace-nowrap py-2.5 font-mono-tight text-xs uppercase tracking-[0.18em] ${
                        ok ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-danger))]"
                      }`}
                    >
                      {ok ? "pass" : "fail"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolPanel>

        <ToolPanel title="The six parameters">
          <dl className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            {PARAMETER_TERMS.map((item) => (
              <div key={item.term} className="border-b border-[hsl(var(--brand-iron)/0.5)] py-3">
                <dt className="font-mono-tight text-sm text-[hsl(var(--brand-signal))]">{item.term}</dt>
                <dd className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {item.meaning}
                </dd>
              </div>
            ))}
          </dl>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
