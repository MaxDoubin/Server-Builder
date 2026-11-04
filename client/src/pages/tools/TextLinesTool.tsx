/**
 * Line tools: sort, uniq, count, filter and friends, chained in order.
 *
 * The operations live in lib/toolkit/text-lines-tool, where each one is
 * checked against GNU coreutils under LC_ALL=C, so the pipeline printed
 * beside the result produces the same lines. Small inputs without a regex
 * run on the main thread as you type. A chain with a regex, or a large
 * input, runs in a Web Worker with a time budget: a pattern with
 * catastrophic backtracking cannot be interrupted any other way, and
 * terminating the worker is what stops it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RefreshCw, X } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_COUNT,
  MAX_LINES,
  MAX_STEPS,
  OP_LABELS,
  WORKER_BUDGET_MS,
  countLines,
  defaultStep,
  randomWords,
  runLines,
  shellPipeline,
  stepCommands,
  type NumberStyle,
  type RunResult,
  type SortMode,
  type Step,
  type StepOp,
  type StepSpec,
  type TrimSide,
} from "@/lib/toolkit/text-lines-tool";
import { ToolPanel, ToolShell } from "./ToolShell";

/** Inputs up to this size, with no regex step, run synchronously as you type. */
const SYNC_CHARS = 200000;

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD_CLASS =
  "mt-1.5 min-h-[40px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const TEXTAREA_CLASS =
  "mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-40";
const ICON_BUTTON_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-30";
const TOGGLE_CLASS =
  "flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))]";
const CHECKBOX_CLASS = "h-4 w-4 shrink-0 accent-[hsl(var(--brand-signal))]";

const ADDABLE: StepOp[] = [
  "sort",
  "uniq",
  "dedupe",
  "count",
  "dropBlank",
  "trim",
  "reverse",
  "shuffle",
  "grep",
  "head",
  "tail",
  "number",
];

const SORT_MODES: { value: SortMode; label: string }[] = [
  { value: "lexical", label: "Lexical (byte order)" },
  { value: "natural", label: "Natural, version (-V)" },
  { value: "numeric", label: "Numeric (-n)" },
  { value: "human", label: "Human sizes, 2K 1G (-h)" },
];

const TOP_TALKERS = [
  "203.0.113.42",
  "198.51.100.7",
  "203.0.113.42",
  "192.0.2.15",
  "203.0.113.42",
  "198.51.100.7",
  "192.0.2.200",
  "203.0.113.42",
  "198.51.100.23",
  "192.0.2.15",
  "203.0.113.42",
  "198.51.100.7",
  "203.0.113.9",
  "192.0.2.15",
  "203.0.113.42",
  "198.51.100.7",
].join("\n");

interface Example {
  label: string;
  text: string;
  steps: StepSpec[];
}

const EXAMPLES: Example[] = [
  {
    label: "Top talkers",
    text: TOP_TALKERS,
    steps: [{ op: "count", ignoreCase: false }, { op: "head", count: "3" }],
  },
  {
    label: "Disk usage",
    text: [
      "4.0K\t/etc/hostname",
      "1.2G\t/var/log",
      "512M\t/var/cache",
      "88K\t/home/alice/.ssh",
      "2.5G\t/opt",
      "16M\t/usr/local/bin",
      "0\t/tmp/empty",
      "1.5T\t/srv/backups",
    ].join("\n"),
    steps: [{ op: "sort", mode: "human", reverse: true, ignoreCase: false }],
  },
  {
    label: "Versions",
    text: [
      "build-3.0.9",
      "build-3.0.13",
      "build-3.0.2",
      "build-1.1.1",
      "build-3.2.0",
      "build-3.2.0~rc1",
      "build-3.10.0",
    ].join("\n"),
    steps: [{ op: "sort", mode: "natural", reverse: false, ignoreCase: false }],
  },
  {
    label: "Clean a list",
    text: "  alice\nbob\n\nalice  \n  carol\n\t\nbob\ndave\n",
    steps: [{ op: "trim", side: "both" }, { op: "dropBlank" }, { op: "dedupe", ignoreCase: false }],
  },
  {
    label: "Errors only",
    text: [
      "2026-10-30T08:00:01Z INFO  sshd[812]: Accepted publickey for deploy from 198.51.100.7",
      "2026-10-30T08:00:04Z WARN  nginx: upstream response time 2.31s",
      "2026-10-30T08:00:09Z ERROR app: database connection refused",
      "2026-10-30T08:00:12Z INFO  cron[1201]: (root) CMD (run-parts /etc/cron.hourly)",
      "2026-10-30T08:00:15Z ERROR app: database connection refused",
      "2026-10-30T08:00:21Z WARN  kernel: possible SYN flooding on port 443",
    ].join("\n"),
    steps: [
      { op: "grep", pattern: "\\b(ERROR|WARN)\\b", invert: false, ignoreCase: false },
      { op: "number", style: "cat" },
    ],
  },
];

/** Shipped into the worker. __name is a no-op shim in case a build keeps function names. */
const WORKER_SRC = `var __name = function (f) { return f; };
var runLines = ${runLines.toString()};
self.onmessage = function (e) {
  var d = e.data;
  try {
    self.postMessage({ id: d.id, ok: true, result: runLines(d.text, d.steps, d.options) });
  } catch (err) {
    self.postMessage({ id: d.id, ok: false, message: String((err && err.message) || err) });
  }
};`;

interface AsyncState {
  result: RunResult | null;
  failure: string | null;
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function Toggle({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  testId: string;
}) {
  return (
    <label className={TOGGLE_CLASS}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        data-testid={testId}
        className={CHECKBOX_CLASS}
      />
      {label}
    </label>
  );
}

export function TextLinesTool() {
  const [text, setText] = useState(EXAMPLES[0].text);
  const nextId = useRef(0);
  const makeStep = useCallback((spec: StepSpec): Step => {
    nextId.current += 1;
    return { ...spec, id: `step-${nextId.current}` } as Step;
  }, []);
  const [steps, setSteps] = useState<Step[]>(() =>
    EXAMPLES[0].steps.map((spec, i) => ({ ...spec, id: `init-${i}` }) as Step),
  );
  const [shuffleNonce, setShuffleNonce] = useState(0);
  const [workerOk, setWorkerOk] = useState(true);
  const [pending, setPending] = useState(false);
  const [asyncState, setAsyncState] = useState<AsyncState>({ result: null, failure: null });

  // Random words per shuffle step, so a shuffle holds still while other
  // steps or the input are edited, and changes only on Reshuffle.
  const poolsRef = useRef<Map<string, Uint32Array>>(new Map());
  const lineCount = useMemo(() => countLines(text), [text]);

  const pools = useMemo(() => {
    const need = Math.min(lineCount, MAX_LINES) + 64;
    const out: Record<string, Uint32Array> = {};
    for (const step of steps) {
      if (step.op !== "shuffle") continue;
      let pool = poolsRef.current.get(step.id);
      if (!pool || pool.length < need) {
        const grown = randomWords(Math.max(need, 1024));
        if (pool) grown.set(pool);
        pool = grown;
        poolsRef.current.set(step.id, pool);
      }
      out[step.id] = pool;
    }
    return out;
    // shuffleNonce is not read here, but a reshuffle drops a pool from the
    // ref and bumps it, which is how this memo knows to refill.
  }, [steps, lineCount, shuffleNonce]);

  const hasGrep = steps.some((step) => step.op === "grep");
  const useWorker = workerOk && (hasGrep || text.length > SYNC_CHARS);

  const syncResult = useMemo(
    () =>
      useWorker
        ? null
        : runLines(text, steps, { maxLines: MAX_LINES, maxCount: MAX_COUNT, pools, allowRegex: workerOk }),
    [useWorker, text, steps, pools, workerOk],
  );

  const workerRef = useRef<Worker | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const inFlightRef = useRef(false);

  const disposeWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    inFlightRef.current = false;
  }, []);

  useEffect(
    () => () => {
      disposeWorker();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [disposeWorker],
  );

  const ensureWorker = useCallback((): Worker | null => {
    if (workerRef.current) return workerRef.current;
    try {
      if (typeof Worker === "undefined" || typeof Blob === "undefined") return null;
      if (!urlRef.current) {
        urlRef.current = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
      }
      workerRef.current = new Worker(urlRef.current);
      return workerRef.current;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!useWorker) {
      // Anything still running belongs to an input that is gone.
      requestRef.current += 1;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (inFlightRef.current) disposeWorker();
      setPending(false);
      return;
    }
    const debounce = window.setTimeout(() => {
      // A request still running may be the runaway one. Start clean rather
      // than queue behind it.
      if (inFlightRef.current) disposeWorker();
      const worker = ensureWorker();
      if (!worker) {
        setWorkerOk(false);
        setPending(false);
        return;
      }
      const id = requestRef.current + 1;
      requestRef.current = id;
      inFlightRef.current = true;
      setPending(true);

      if (timerRef.current) window.clearTimeout(timerRef.current);
      // Only a regular expression can run away. Every other step is bounded
      // by the line cap, so a slow device just takes longer and is not cut off.
      if (hasGrep) {
        timerRef.current = window.setTimeout(() => {
          if (requestRef.current !== id) return;
          disposeWorker();
          setPending(false);
          setAsyncState({
            result: null,
            failure: `Stopped after ${WORKER_BUDGET_MS / 1000} seconds without finishing. A regular expression with nested quantifiers, such as (a+)+$, can take exponential time on a line it almost matches. Simplify the pattern or remove the step. A very large input can also be slow.`,
          });
        }, WORKER_BUDGET_MS);
      }

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as
          | { id: number; ok: true; result: RunResult }
          | { id: number; ok: false; message: string };
        if (data.id !== requestRef.current) return;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        inFlightRef.current = false;
        setPending(false);
        setAsyncState(
          data.ok
            ? { result: data.result, failure: null }
            : { result: null, failure: `The worker reported an error: ${data.message}` },
        );
      };
      worker.onerror = (event: ErrorEvent) => {
        event.preventDefault();
        if (requestRef.current !== id) return;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        disposeWorker();
        setPending(false);
        // The worker could not run at all, most likely blocked by policy.
        // Fall back to the main thread with regex steps refused.
        setWorkerOk(false);
      };

      try {
        worker.postMessage({
          id,
          text,
          steps,
          options: { maxLines: MAX_LINES, maxCount: MAX_COUNT, pools, allowRegex: true },
        });
      } catch {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        disposeWorker();
        setPending(false);
        setWorkerOk(false);
      }
    }, 150);
    return () => window.clearTimeout(debounce);
  }, [useWorker, hasGrep, text, steps, pools, ensureWorker, disposeWorker]);

  const result: RunResult | null = useWorker ? asyncState.result : syncResult;
  const failure = useWorker ? asyncState.failure : null;
  const output = useMemo(() => (result ? result.lines.join("\n") : ""), [result]);
  const pipeline = useMemo(() => shellPipeline(steps, { crlf: text.includes("\r\n") }), [steps, text]);

  function updateStep(id: string, patch: Partial<StepSpec>) {
    setSteps((current) => current.map((step) => (step.id === id ? ({ ...step, ...patch } as Step) : step)));
  }

  function moveStep(index: number, delta: number) {
    setSteps((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = current.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeStep(id: string) {
    poolsRef.current.delete(id);
    setSteps((current) => current.filter((step) => step.id !== id));
  }

  function addStep(op: StepOp) {
    setSteps((current) => (current.length >= MAX_STEPS ? current : [...current, makeStep(defaultStep(op))]));
  }

  function reshuffle(id: string) {
    poolsRef.current.delete(id);
    setShuffleNonce((n) => n + 1);
  }

  function loadExample(example: Example) {
    poolsRef.current.clear();
    setText(example.text);
    setSteps(example.steps.map((spec) => makeStep(spec)));
    setAsyncState({ result: null, failure: null });
  }

  const truncatedNote =
    result && result.truncated
      ? `Only the first ${MAX_LINES.toLocaleString("en-US")} of ${result.totalLines.toLocaleString("en-US")} lines are processed.`
      : null;
  const stopped = result && result.stoppedAt >= 0 ? result.stoppedAt : -1;
  const hasShuffle = steps.some((step) => step.op === "shuffle");

  return (
    <ToolShell slug="text-lines-tool">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <ToolPanel title="Input">
            <label htmlFor="lines-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              Text, one item per line
            </label>
            <textarea
              id="lines-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={10}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              aria-describedby="lines-input-hint"
              placeholder={"paste lines here\none per line"}
              data-testid="input-lines"
              className={TEXTAREA_CLASS}
            />
            <p id="lines-input-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {plural(lineCount, "line", "lines")}. A final newline ends the last line rather than adding an empty
              one, and Windows CRLF endings are read as plain line breaks.
              {lineCount > MAX_LINES
                ? ` Only the first ${MAX_LINES.toLocaleString("en-US")} lines are processed.`
                : ""}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Try
              </span>
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => loadExample(example)}
                  data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className={CHIP_CLASS}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </ToolPanel>

          <ToolPanel title="Steps, applied top to bottom">
            {steps.length === 0 ? (
              <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                No steps yet, so the output is the input. Add one below.
              </p>
            ) : (
              <ol className="space-y-3" data-testid="list-steps">
                {steps.map((step, index) => {
                  const outcome = result?.steps[index];
                  const skipped = stopped >= 0 && index > stopped;
                  return (
                    <li
                      key={step.id}
                      className={`rounded-xl border p-4 ${
                        outcome?.error
                          ? "border-[hsl(var(--brand-danger)/0.6)]"
                          : "border-[hsl(var(--brand-iron))]"
                      } bg-[hsl(var(--brand-obsidian)/0.4)]`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          <span className="text-[hsl(var(--brand-ash))]">{index + 1}.</span> {OP_LABELS[step.op]}
                        </h3>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => moveStep(index, -1)}
                            disabled={index === 0}
                            aria-label={`Move step ${index + 1} up`}
                            data-testid={`button-step-up-${index}`}
                            className={ICON_BUTTON_CLASS}
                          >
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStep(index, 1)}
                            disabled={index === steps.length - 1}
                            aria-label={`Move step ${index + 1} down`}
                            data-testid={`button-step-down-${index}`}
                            className={ICON_BUTTON_CLASS}
                          >
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStep(step.id)}
                            aria-label={`Remove step ${index + 1}`}
                            data-testid={`button-step-remove-${index}`}
                            className={ICON_BUTTON_CLASS}
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <StepOptions
                        step={step}
                        index={index}
                        onChange={(patch) => updateStep(step.id, patch)}
                        onReshuffle={() => reshuffle(step.id)}
                      />

                      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <code className="min-w-0 break-all font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">
                          {stepCommands(step).join(" | ")}
                        </code>
                        <span
                          className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]"
                          data-testid={`text-step-count-${index}`}
                        >
                          {outcome && outcome.count !== null
                            ? `${plural(outcome.count, "line", "lines")} out`
                            : skipped
                              ? "not run"
                              : ""}
                        </span>
                      </div>
                      {outcome?.error ? (
                        <p
                          role="alert"
                          className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
                          data-testid={`text-step-error-${index}`}
                        >
                          {outcome.error}
                        </p>
                      ) : null}
                      {outcome?.note ? (
                        <p className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                          {outcome.note}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="mt-5">
              <div className={LABEL_CLASS}>Add a step</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {ADDABLE.map((op) => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => addStep(op)}
                    disabled={steps.length >= MAX_STEPS}
                    data-testid={`button-add-${op}`}
                    className={CHIP_CLASS}
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    {OP_LABELS[op]}
                  </button>
                ))}
              </div>
              {steps.length >= MAX_STEPS ? (
                <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  A chain holds at most {MAX_STEPS} steps.
                </p>
              ) : null}
            </div>
          </ToolPanel>
        </div>

        <div className="min-w-0 space-y-6">
          <ToolPanel title="Output">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
                role="status"
                aria-live="polite"
                data-testid="text-output-summary"
              >
                {pending
                  ? "Working…"
                  : result
                    ? `${plural(result.inputLines, "line", "lines")} in, ${plural(result.lines.length, "line", "lines")} out`
                    : ""}
              </p>
              <CopyButton value={output} label="Copy output lines" testId="button-copy-output">
                <span>Copy output</span>
              </CopyButton>
            </div>
            {failure ? (
              <p
                role="alert"
                className="mt-3 break-words rounded-lg border border-[hsl(var(--brand-danger)/0.5)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
                data-testid="text-output-failure"
              >
                {failure}
              </p>
            ) : null}
            {stopped >= 0 ? (
              <p className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                Step {stopped + 1} has an error, so the output shows the lines as they were before it.
              </p>
            ) : null}
            {truncatedNote ? (
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">{truncatedNote}</p>
            ) : null}
            {!workerOk && hasGrep ? (
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                Regex steps are off because this browser refused to start a Web Worker.
              </p>
            ) : null}
            <label htmlFor="lines-output" className="sr-only">
              Output lines
            </label>
            <textarea
              id="lines-output"
              value={output}
              readOnly
              rows={14}
              wrap="off"
              spellCheck={false}
              data-testid="output-lines"
              className={`${TEXTAREA_CLASS} ${pending ? "opacity-60" : ""}`}
            />
          </ToolPanel>

          <ToolPanel title="Equivalent shell pipeline">
            <div className="overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
              <pre className="w-max min-w-full p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]" data-testid="text-pipeline">
                {pipeline}
              </pre>
            </div>
            <div className="mt-3">
              <CopyButton value={pipeline} label="Copy shell pipeline" testId="button-copy-pipeline">
                <span>Copy pipeline</span>
              </CopyButton>
            </div>
            <ul className="mt-4 list-disc space-y-2 pl-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <li>
                <code className="text-[hsl(var(--brand-cyan))]">LC_ALL=C</code> makes sort compare bytes and fold only
                ASCII letters, which is the order computed here. In a UTF-8 locale such as en_US.UTF-8, sort uses
                the locale&apos;s collation rules and the order changes.
              </li>
              {text.includes("\r\n") ? (
                <li>
                  The input has Windows line endings, so the pipeline starts by stripping the carriage return
                  before each newline.
                </li>
              ) : null}
              {hasGrep ? (
                <li>
                  Patterns here are JavaScript regular expressions in Unicode mode. grep -P uses PCRE, which reads
                  the common syntax the same way but is not identical, and under LC_ALL=C it matches bytes, so a
                  dot matches one byte of a multibyte character.
                </li>
              ) : null}
              {hasShuffle ? <li>shuf draws its own randomness, so its order will differ from the one shown.</li> : null}
            </ul>
          </ToolPanel>
        </div>
      </div>
    </ToolShell>
  );
}

function StepOptions({
  step,
  index,
  onChange,
  onReshuffle,
}: {
  step: Step;
  index: number;
  onChange: (patch: Partial<StepSpec>) => void;
  onReshuffle: () => void;
}) {
  const base = `step-${index}`;
  switch (step.op) {
    case "sort":
      return (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <div className="min-w-0">
            <label htmlFor={`${base}-mode`} className={LABEL_CLASS}>
              Order
            </label>
            <select
              id={`${base}-mode`}
              value={step.mode}
              onChange={(event) => onChange({ mode: event.target.value as SortMode })}
              data-testid={`select-step-mode-${index}`}
              className={FIELD_CLASS}
            >
              {SORT_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>
          <Toggle
            checked={step.reverse}
            onChange={(reverse) => onChange({ reverse })}
            label="Reverse"
            testId={`checkbox-step-reverse-${index}`}
          />
          <Toggle
            checked={step.ignoreCase}
            onChange={(ignoreCase) => onChange({ ignoreCase })}
            label="Ignore case"
            testId={`checkbox-step-case-${index}`}
          />
        </div>
      );
    case "uniq":
    case "dedupe":
    case "count":
      return (
        <div className="mt-3 flex flex-wrap gap-2">
          <Toggle
            checked={step.ignoreCase}
            onChange={(ignoreCase) => onChange({ ignoreCase })}
            label="Ignore case"
            testId={`checkbox-step-case-${index}`}
          />
        </div>
      );
    case "trim":
      return (
        <div className="mt-3 max-w-[260px]">
          <label htmlFor={`${base}-side`} className={LABEL_CLASS}>
            Trim from
          </label>
          <select
            id={`${base}-side`}
            value={step.side}
            onChange={(event) => onChange({ side: event.target.value as TrimSide })}
            data-testid={`select-step-side-${index}`}
            className={FIELD_CLASS}
          >
            <option value="both">Both ends</option>
            <option value="leading">Start only</option>
            <option value="trailing">End only</option>
          </select>
        </div>
      );
    case "shuffle":
      return (
        <div className="mt-3">
          <button type="button" onClick={onReshuffle} data-testid={`button-step-reshuffle-${index}`} className={CHIP_CLASS}>
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Reshuffle
          </button>
        </div>
      );
    case "grep":
      return (
        <div className="mt-3 space-y-2">
          <div>
            <label htmlFor={`${base}-pattern`} className={LABEL_CLASS}>
              Pattern (JavaScript regex)
            </label>
            <input
              id={`${base}-pattern`}
              type="text"
              value={step.pattern}
              onChange={(event) => onChange({ pattern: event.target.value })}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="^ERROR|timeout"
              data-testid={`input-step-pattern-${index}`}
              className={FIELD_CLASS}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Toggle
              checked={step.invert}
              onChange={(invert) => onChange({ invert })}
              label="Drop matching lines"
              testId={`checkbox-step-invert-${index}`}
            />
            <Toggle
              checked={step.ignoreCase}
              onChange={(ignoreCase) => onChange({ ignoreCase })}
              label="Ignore case"
              testId={`checkbox-step-case-${index}`}
            />
          </div>
        </div>
      );
    case "head":
    case "tail":
      return (
        <div className="mt-3 max-w-[200px]">
          <label htmlFor={`${base}-count`} className={LABEL_CLASS}>
            Lines to keep
          </label>
          <input
            id={`${base}-count`}
            type="text"
            inputMode="numeric"
            value={step.count}
            onChange={(event) => onChange({ count: event.target.value })}
            spellCheck={false}
            autoComplete="off"
            data-testid={`input-step-count-${index}`}
            className={FIELD_CLASS}
          />
        </div>
      );
    case "number":
      return (
        <div className="mt-3 max-w-[300px]">
          <label htmlFor={`${base}-style`} className={LABEL_CLASS}>
            Format
          </label>
          <select
            id={`${base}-style`}
            value={step.style}
            onChange={(event) => onChange({ style: event.target.value as NumberStyle })}
            data-testid={`select-step-style-${index}`}
            className={FIELD_CLASS}
          >
            <option value="cat">Padded with a tab, as cat -n</option>
            <option value="compact">Compact, as 12: line</option>
          </select>
        </div>
      );
    default:
      return null;
  }
}
