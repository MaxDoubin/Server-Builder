/**
 * The terminal.
 *
 * Deliberately not a contenteditable and not a canvas. It is a scrolling log
 * plus one ordinary text input, because that is the only shape that works
 * with a screen reader, a mobile keyboard, browser autofill being turned off,
 * text zoom, and the site's own high-contrast mode, all of which a
 * hand-rolled cursor breaks.
 *
 * Output arrives through a queue rather than all at once, because ping and
 * traceroute set a delay on their lines and a ping that prints four replies
 * simultaneously teaches the wrong thing about what ping is doing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runLine, type OutLine } from "@/lib/labs/shell";
import { REGISTRY, COMMAND_NAMES } from "@/lib/labs/commands/index";
import type { Machine } from "@/lib/labs/machine";
import { lookup } from "@/lib/labs/vfs";

interface Row {
  id: number;
  kind: "input" | "out" | "err" | "note";
  text: string;
}

interface Props {
  machine: Machine;
  /** Called after every command, so the page can re-check the lab. */
  onCommand: (line: string) => void;
  /** Printed once, above the first prompt. */
  banner: string[];
}

let nextId = 0;

export function Terminal({ machine, onCommand, banner }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    banner.map((text) => ({ id: nextId++, kind: "note" as const, text })),
  );
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  /* Clear any pending delayed output when the lab is restarted or unmounted. */
  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
    },
    [],
  );

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [rows]);

  const push = useCallback((kind: Row["kind"], text: string) => {
    setRows((previous) => [...previous, { id: nextId++, kind, text }]);
  }, []);

  const emit = useCallback(
    (lines: OutLine[]) => {
      let elapsed = 0;
      let anyDelay = false;
      for (const line of lines) {
        elapsed += line.delay ?? 0;
        if (line.delay) anyDelay = true;
        if (elapsed === 0) {
          push(line.stream === "err" ? "err" : "out", line.text);
        } else {
          const timer = window.setTimeout(
            () => push(line.stream === "err" ? "err" : "out", line.text),
            elapsed,
          );
          timers.current.push(timer);
        }
      }
      if (anyDelay) {
        const done = window.setTimeout(() => setBusy(false), elapsed);
        timers.current.push(done);
        return true;
      }
      return false;
    },
    [push],
  );

  const submit = useCallback(() => {
    const line = value;
    setValue("");
    setHistoryIndex(null);
    push("input", `${prompt(machine)} ${line}`);
    if (!line.trim()) return;

    if (line.trim() === "clear") {
      setRows([]);
      machine.history.push(line);
      onCommand(line);
      return;
    }

    machine.history.push(line);
    const result = runLine(line, machine, REGISTRY);
    const willBeBusy = emit(result.lines);
    if (willBeBusy) setBusy(true);
    onCommand(line);
  }, [value, machine, push, emit, onCommand]);

  /**
   * Tab completion: commands in the first word, paths after it.
   *
   * One common prefix is filled in; several candidates are listed, which is
   * what a shell does and what people expect. Completing to the first match
   * silently would be worse than not completing at all.
   */
  const complete = useCallback(() => {
    const parts = value.split(/\s+/);
    const last = parts[parts.length - 1] ?? "";
    const isFirst = parts.length === 1;

    let candidates: string[];
    if (isFirst) {
      candidates = COMMAND_NAMES.filter((name) => name.startsWith(last));
    } else {
      const slash = last.lastIndexOf("/");
      const dirPart = slash === -1 ? "." : last.slice(0, slash) || "/";
      const stem = last.slice(slash + 1);
      const found = lookup(machine.root, machine.cwd, dirPart);
      const names =
        found.ok && found.node.kind === "dir" ? Object.keys(found.node.children ?? {}) : [];
      candidates = names
        .filter((name) => name.startsWith(stem))
        .map((name) => (slash === -1 ? name : `${dirPart.replace(/\/$/, "")}/${name}`));
    }

    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      parts[parts.length - 1] = candidates[0];
      setValue(parts.join(" ") + (isFirst ? " " : ""));
      return;
    }
    /* Fill in as far as they agree, then show the options. */
    let shared = candidates[0];
    for (const candidate of candidates) {
      while (!candidate.startsWith(shared)) shared = shared.slice(0, -1);
    }
    if (shared.length > last.length) {
      parts[parts.length - 1] = shared;
      setValue(parts.join(" "));
    }
    push("input", `${prompt(machine)} ${value}`);
    push("note", candidates.join("  "));
  }, [value, machine, push]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      complete();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const list = machine.history;
      if (list.length === 0) return;
      const next = historyIndex === null ? list.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setValue(list[next]);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const list = machine.history;
      if (historyIndex === null) return;
      const next = historyIndex + 1;
      if (next >= list.length) {
        setHistoryIndex(null);
        setValue("");
      } else {
        setHistoryIndex(next);
        setValue(list[next]);
      }
      return;
    }
    if (event.key === "l" && event.ctrlKey) {
      event.preventDefault();
      setRows([]);
      return;
    }
    if (event.key === "c" && event.ctrlKey) {
      event.preventDefault();
      push("input", `${prompt(machine)} ${value}^C`);
      setValue("");
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
      setBusy(false);
    }
  };

  const promptText = useMemo(() => prompt(machine), [machine, rows.length]);

  return (
    <div
      className="overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.85)]"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex items-center gap-2 border-b border-[hsl(var(--brand-iron))] px-4 py-2">
        <span aria-hidden className="h-2 w-2 rounded-full bg-[hsl(var(--brand-signal))]" />
        <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
          {machine.user}@{machine.hostname}
        </span>
        <span className="ml-auto font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
          {busy ? "running" : "ready"}
        </span>
      </div>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Terminal output"
        className="h-[26rem] overflow-y-auto px-4 py-3"
        data-testid="terminal-log"
      >
        {rows.map((row) => (
          <pre
            key={row.id}
            className={`whitespace-pre-wrap break-words font-mono-tight text-[12.5px] leading-[1.6] ${
              row.kind === "input"
                ? "text-[hsl(var(--brand-bone))]"
                : row.kind === "err"
                  ? "text-[hsl(var(--brand-amber))]"
                  : row.kind === "note"
                    ? "text-[hsl(var(--brand-ash))]"
                    : "text-[hsl(var(--brand-bone-dim))]"
            }`}
          >
            {row.text || " "}
          </pre>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-[hsl(var(--brand-iron))] px-4 py-2.5">
        <label htmlFor="lab-input" className="sr-only">
          Type a command and press Enter
        </label>
        <span aria-hidden className="shrink-0 font-mono-tight text-[12.5px] text-[hsl(var(--brand-signal))]">
          {promptText}
        </span>
        <input
          id="lab-input"
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          data-testid="terminal-input"
          className="min-w-0 flex-1 bg-transparent font-mono-tight text-[12.5px] text-[hsl(var(--brand-bone))] outline-none placeholder:text-[hsl(var(--brand-ash))]"
          placeholder="help"
        />
      </div>
    </div>
  );
}

/** "student@lab:~$", with $HOME shortened the way a real prompt does. */
function prompt(machine: Machine): string {
  const home = machine.env.HOME ?? "/root";
  const where = machine.cwd === home ? "~" : machine.cwd.startsWith(`${home}/`) ? `~${machine.cwd.slice(home.length)}` : machine.cwd;
  return `${machine.user}@${machine.hostname}:${where}${machine.user === "root" ? "#" : "$"}`;
}
