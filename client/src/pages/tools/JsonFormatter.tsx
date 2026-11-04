/**
 * JSON formatter and validator.
 *
 * Parsing, formatting, statistics and path building live in
 * lib/toolkit/json-formatter, which has its own RFC 8259 parser so errors
 * come with a line and column on every browser and large numbers are never
 * rounded on the way through. This file is the view: the text box, the
 * formatted output, the collapsible tree and the panel that names the
 * selected node as a JSON Pointer, a JavaScript expression and a jq path.
 *
 * The tree identifies a node by its child indexes from the root rather than
 * by its keys, because an object with a duplicate key has two children that
 * share a name and a key path cannot tell them apart.
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  MAX_DEPTH,
  MAX_INPUT_CHARS,
  MAX_LISTED_WARNINGS,
  MAX_OUTPUT_CHARS,
  computeStats,
  describeNumberIssue,
  errorSnippet,
  formatJsonCapped,
  indentString,
  nodeAt,
  orderedMemberIndexes,
  parseJson,
  pointerToFragment,
  previewOf,
  resolvePointer,
  segmentsAt,
  toJqPath,
  toJsPath,
  toPointer,
  utf8Length,
  type IndentChoice,
  type JsonNode,
  type NumberIssueKind,
} from "@/lib/toolkit/json-formatter";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ---------------------------------------------------------------- styles */

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD_CLASS =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PRE_CLASS =
  "max-h-[32rem] overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]";

const segmentClass = (on: boolean) =>
  `inline-flex min-h-[40px] items-center justify-center rounded-lg border px-3 py-1 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors ${FOCUS} ${
    on
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
  }`;

const toggleClass = (on: boolean) =>
  `flex min-h-[40px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-2 font-mono-tight text-xs leading-relaxed transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
    on
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-bone-dim))]"
  }`;

/* ------------------------------------------------------------ constants */

/** Characters of output drawn on the page. Copy and download carry all of it. */
const OUTPUT_PREVIEW_CHARS = 200_000;

/** Children drawn per container before a "show more" button. */
const TREE_PAGE = 100;

/** Rows "Expand all" may put on the page, so a large document cannot lock the tab. */
const EXPAND_ALL_ROWS = 3_000;

/** Files larger than this are refused before being read. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Characters of a key or a number literal drawn in a tree row or the warnings table. */
const LABEL_PREVIEW_CHARS = 120;

/** Short badge for a number that a double does not hold as written. */
const NUMBER_BADGE: Record<NumberIssueKind, string> = {
  "unsafe-integer": "past 2^53 - 1",
  "beyond-safe": "past 2^53 - 1",
  overflow: "overflows a double",
  underflow: "underflows to 0",
};

const INDENTS: { value: IndentChoice; label: string }[] = [
  { value: "2", label: "2 spaces" },
  { value: "4", label: "4 spaces" },
  { value: "tab", label: "Tab" },
  { value: "none", label: "Minify" },
];

const EXAMPLES: { label: string; value: string }[] = [
  {
    label: "API response",
    value: `{"data":{"user":{"id":1793836720485339137,"login":"ada","roles":["admin","deploy"],"profile":{"display name":"Ada L.","location":null,"mfa":true}},"repos":[{"name":"server-builder","stars":42,"private":false,"topics":["vite","react"]},{"name":"dotfiles","stars":3,"private":true,"topics":[]}]},"meta":{"request_id":"7f3c9a1e-52b4-4c55-9a7e-0f1d2c3b4a59","took_ms":12.5}}`,
  },
  {
    label: "Broken",
    value: `{
  "host": "web-01",
  "ports": [22, 80, 443],
  "tags": ['prod', 'edge'],
}`,
  },
  {
    label: "Duplicate keys",
    value: `{
  "user": "alice",
  "role": "viewer",
  "role": "admin"
}`,
  },
  {
    label: "RFC 6901",
    value: `{
  "foo": ["bar", "baz"],
  "": 0,
  "a/b": 1,
  "c%d": 2,
  "e^f": 3,
  "g|h": 4,
  "i\\\\j": 5,
  "k\\"l": 6,
  " ": 7,
  "m~n": 8
}`,
  },
];

/* --------------------------------------------------------------- helpers */

function clipText(text: string, max = LABEL_PREVIEW_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function keyOf(path: number[]): string {
  return path.join("/");
}

function pathOf(key: string): number[] {
  return key === "" ? [] : key.split("/").map(Number);
}

function domId(key: string): string {
  return `jf-node-r${key === "" ? "" : `-${key.replace(/\//g, "-")}`}`;
}

/** Root plus, for a document that is not too wide, its first level. */
function defaultExpansion(root: JsonNode | null): Set<string> {
  const open = new Set<string>([""]);
  if (!root) return open;
  const children =
    root.kind === "object" ? root.members.map((m) => m.value) : root.kind === "array" ? root.items : [];
  if (children.length <= 20) {
    children.forEach((child, i) => {
      if (child.kind === "object" || child.kind === "array") open.add(String(i));
    });
  }
  return open;
}

/**
 * Breadth first, so "Expand all" opens the shallow levels before it runs out
 * of budget. The budget is rows drawn, counting the first page of each
 * opened container, since that is what costs time.
 */
function expandAll(root: JsonNode): { open: Set<string>; capped: boolean } {
  const open = new Set<string>();
  const queue: { node: JsonNode; key: string }[] = [{ node: root, key: "" }];
  let rows = 1;
  for (let q = 0; q < queue.length; q++) {
    const { node, key } = queue[q];
    if (node.kind !== "object" && node.kind !== "array") continue;
    const children = node.kind === "object" ? node.members.map((m) => m.value) : node.items;
    if (children.length === 0) continue;
    const drawn = Math.min(children.length, TREE_PAGE);
    if (rows + drawn > EXPAND_ALL_ROWS && open.size > 0) return { open, capped: true };
    rows += drawn;
    open.add(key);
    for (let i = 0; i < drawn; i++) queue.push({ node: children[i], key: key === "" ? String(i) : `${key}/${i}` });
  }
  return { open, capped: false };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n.toLocaleString("en-US")} ${pluralise(n, "byte")}`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function kindLabel(node: JsonNode): string {
  if (node.kind === "object") return `object, ${node.members.length} ${pluralise(node.members.length, "member")}`;
  if (node.kind === "array") return `array, ${node.items.length} ${pluralise(node.items.length, "item")}`;
  if (node.kind === "string") return `string, ${[...node.value].length} ${pluralise([...node.value].length, "character")}`;
  return node.kind;
}

/* ------------------------------------------------------------------ tree */

interface TreeContext {
  expanded: Set<string>;
  selected: string;
  sortKeys: boolean;
  toggle: (key: string) => void;
  select: (key: string) => void;
}

const VALUE_COLOR: Record<JsonNode["kind"], string> = {
  object: "text-[hsl(var(--brand-ash))]",
  array: "text-[hsl(var(--brand-ash))]",
  string: "text-[hsl(var(--brand-cyan))]",
  number: "text-[hsl(var(--brand-amber))]",
  boolean: "text-[hsl(var(--brand-signal))]",
  null: "text-[hsl(var(--brand-signal))]",
};

function TreeRow({
  node,
  nodeKey,
  label,
  isIndex,
  duplicate,
  ctx,
}: {
  node: JsonNode;
  nodeKey: string;
  label: string;
  isIndex: boolean;
  duplicate: boolean;
  ctx: TreeContext;
}) {
  const [limit, setLimit] = useState(TREE_PAGE);
  const container = node.kind === "object" || node.kind === "array";
  const count = node.kind === "object" ? node.members.length : node.kind === "array" ? node.items.length : 0;
  const open = container && count > 0 && ctx.expanded.has(nodeKey);
  const selected = ctx.selected === nodeKey;

  const order = useMemo(() => {
    if (!open) return [];
    if (node.kind === "object") return orderedMemberIndexes(node, ctx.sortKeys);
    if (node.kind === "array") return node.items.map((_, i) => i);
    return [];
  }, [open, node, ctx.sortKeys]);

  // A child selected from outside the tree (a pointer, a warning) must be
  // drawn even when it sits past the current page.
  let shown = limit;
  if (open && ctx.selected.startsWith(nodeKey === "" ? "" : `${nodeKey}/`) && ctx.selected !== nodeKey) {
    const rest = nodeKey === "" ? ctx.selected : ctx.selected.slice(nodeKey.length + 1);
    const childIndex = Number(rest.split("/")[0]);
    const position = order.indexOf(childIndex);
    if (position >= shown) shown = position + 1;
  }

  const issue = node.kind === "number" ? node.issue : null;
  const shownLabel = isIndex ? label : clipText(JSON.stringify(label));

  return (
    <li>
      <div className="flex items-start gap-1">
        {container && count > 0 ? (
          <button
            type="button"
            onClick={() => ctx.toggle(nodeKey)}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${nodeKey === "" ? "the root" : shownLabel}`}
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))] ${FOCUS}`}
          >
            <span aria-hidden className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>
              ▸
            </span>
          </button>
        ) : (
          <span aria-hidden className="inline-block h-6 w-6 shrink-0" />
        )}
        <button
          type="button"
          id={domId(nodeKey)}
          onClick={() => ctx.select(nodeKey)}
          aria-pressed={selected}
          className={`min-h-[24px] min-w-0 rounded px-1.5 py-0.5 text-left font-mono-tight text-xs leading-relaxed ${FOCUS} ${
            selected
              ? "bg-[hsl(var(--brand-signal)/0.14)] ring-1 ring-[hsl(var(--brand-signal)/0.6)]"
              : "hover:bg-[hsl(var(--brand-iron)/0.5)]"
          }`}
        >
          <span className={isIndex ? "text-[hsl(var(--brand-ash))]" : "text-[hsl(var(--brand-bone))]"}>
            {nodeKey === "" ? "root" : shownLabel}
          </span>
          <span className="text-[hsl(var(--brand-ash))]">: </span>
          <span className={`break-all ${issue ? "text-[hsl(var(--brand-danger))]" : VALUE_COLOR[node.kind]}`}>
            {previewOf(node)}
          </span>
          {issue ? (
            <span className="ml-2 whitespace-nowrap text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-danger))]">
              {NUMBER_BADGE[issue.kind]}
            </span>
          ) : null}
          {duplicate ? (
            <span className="ml-2 whitespace-nowrap text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-amber))]">
              duplicate key
            </span>
          ) : null}
        </button>
      </div>
      {open ? (
        <ul className="ml-3 border-l border-[hsl(var(--brand-iron))] pl-2">
          {order.slice(0, shown).map((i) => {
            const childKey = nodeKey === "" ? String(i) : `${nodeKey}/${i}`;
            if (node.kind === "object") {
              const member = node.members[i];
              return (
                <TreeRow
                  key={childKey}
                  node={member.value}
                  nodeKey={childKey}
                  label={member.key}
                  isIndex={false}
                  duplicate={member.duplicate}
                  ctx={ctx}
                />
              );
            }
            if (node.kind === "array") {
              return (
                <TreeRow
                  key={childKey}
                  node={node.items[i]}
                  nodeKey={childKey}
                  label={String(i)}
                  isIndex
                  duplicate={false}
                  ctx={ctx}
                />
              );
            }
            return null;
          })}
          {order.length > shown ? (
            <li className="py-1 pl-7">
              <button type="button" onClick={() => setLimit(shown + TREE_PAGE)} className={CHIP_CLASS}>
                Show {Math.min(TREE_PAGE, order.length - shown)} more of {order.length.toLocaleString("en-US")}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ view */

export function JsonFormatter() {
  const [raw, setRaw] = useState(EXAMPLES[0].value);
  const [indent, setIndent] = useState<IndentChoice>("2");
  const [sortKeys, setSortKeys] = useState(false);
  const [selected, setSelected] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const first = parseJson(EXAMPLES[0].value);
    return defaultExpansion(first.ok ? first.root : null);
  });
  const [expandNote, setExpandNote] = useState<string | null>(null);
  const [pointerDraft, setPointerDraft] = useState("");
  const [pointerError, setPointerError] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadUrl = useRef<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    };
  }, []);

  // Parsing a few megabytes takes a moment, so typing stays responsive and
  // the parse follows behind it.
  const deferred = useDeferredValue(raw);
  const result = useMemo(() => (deferred.trim() === "" ? null : parseJson(deferred)), [deferred]);
  const ok = result && result.ok ? result : null;
  const failed = result && !result.ok ? result : null;

  // Null when the formatted text would pass MAX_OUTPUT_CHARS, which deep
  // nesting with a wide indent can do from a small input.
  const formatted = useMemo(
    () => (ok ? formatJsonCapped(ok.root, indentString(indent), sortKeys, MAX_OUTPUT_CHARS) : ""),
    [ok, indent, sortKeys],
  );
  const outputTooLong = formatted === null;
  const output = formatted ?? "";
  const stats = useMemo(() => (ok ? computeStats(ok.root) : null), [ok]);
  const inputBytes = useMemo(() => utf8Length(deferred), [deferred]);
  const outputBytes = useMemo(() => utf8Length(output), [output]);
  const outputLines = useMemo(() => {
    if (output === "") return 0;
    let lines = 1;
    for (let i = output.indexOf("\n"); i !== -1; i = output.indexOf("\n", i + 1)) lines++;
    return lines;
  }, [output]);
  const snippet = useMemo(() => (failed ? errorSnippet(failed.text, failed.error.offset) : null), [failed]);

  const selectedPath = pathOf(selected);
  const selectedNode = ok ? nodeAt(ok.root, selectedPath) : null;
  const selectedSegments = ok && selectedNode ? segmentsAt(ok.root, selectedPath) : null;
  const pointer = selectedSegments ? toPointer(selectedSegments) : "";
  // Built once per selection, not on every render: the root is selected by
  // default, and formatting a large document on each keystroke in the
  // pointer box would make typing lag.
  const selectedJson = useMemo(
    () =>
      selectedNode
        ? formatJsonCapped(selectedNode, indentString(indent === "none" ? "2" : indent), sortKeys, MAX_OUTPUT_CHARS)
        : null,
    [selectedNode, indent, sortKeys],
  );
  const selectedMember = useMemo(() => {
    const path = pathOf(selected);
    if (!ok || path.length === 0) return null;
    const parent = nodeAt(ok.root, path.slice(0, -1));
    if (parent?.kind !== "object") return null;
    return parent.members[path[path.length - 1]] ?? null;
  }, [ok, selected]);

  // A newly loaded document opens at its default depth once its parse lands.
  useEffect(() => {
    if (!resetPending || deferred !== raw) return;
    setExpanded(defaultExpansion(ok ? ok.root : null));
    setResetPending(false);
  }, [resetPending, deferred, raw, ok]);

  // Move focus to a node chosen from outside the tree, once it is drawn.
  useEffect(() => {
    if (focusTarget === null) return;
    const el = document.getElementById(domId(focusTarget));
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest" });
    }
    setFocusTarget(null);
  }, [focusTarget]);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const select = useCallback((key: string) => setSelected(key), []);

  const ctx: TreeContext = useMemo(
    () => ({ expanded, selected, sortKeys, toggle, select }),
    [expanded, selected, sortKeys, toggle, select],
  );

  function reveal(path: number[]) {
    const key = keyOf(path);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (let k = 0; k < path.length; k++) next.add(keyOf(path.slice(0, k)));
      return next;
    });
    setSelected(key);
    setFocusTarget(key);
  }

  function loadText(text: string) {
    setRaw(text);
    setSelected("");
    setPointerError(null);
    setExpandNote(null);
    setResetPending(true);
  }

  function goToPointer() {
    if (!ok) return;
    const res = resolvePointer(ok.root, pointerDraft.trim());
    if (!res.ok) {
      setPointerError(res.message);
      return;
    }
    setPointerError(null);
    reveal(res.path);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileNote(`${file.name} is ${formatBytes(file.size)}. Files up to ${formatBytes(MAX_FILE_BYTES)} are read.`);
      return;
    }
    try {
      const text = await file.text();
      if (!alive.current) return;
      setFileNote(`Read ${file.name} (${formatBytes(file.size)}) from your disk. It was not uploaded.`);
      loadText(text);
    } catch {
      if (alive.current) setFileNote(`${file.name} could not be read.`);
    }
  }

  function download() {
    if (output === "") return;
    try {
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      const url = URL.createObjectURL(new Blob([output], { type: "application/json" }));
      downloadUrl.current = url;
      const a = document.createElement("a");
      a.href = url;
      a.download = indent === "none" ? "minified.json" : "formatted.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setDownloadError(null);
    } catch {
      setDownloadError("This browser would not create the file. Copy the text instead.");
    }
  }

  const warnings = ok?.warnings ?? null;
  const warningTotal = warnings ? warnings.numberCount + warnings.duplicateCount + warnings.surrogateCount : 0;

  let summary: string;
  if (!result) summary = "Paste JSON to validate and format it.";
  else if (failed) summary = `Not valid JSON: line ${failed.error.line}, column ${failed.error.column}.`;
  else if (stats) {
    summary = `Valid JSON. ${stats.values.toLocaleString("en-US")} ${pluralise(stats.values, "value")}, depth ${stats.depth}${
      warningTotal ? `, ${warningTotal} ${pluralise(warningTotal, "warning")}` : ""
    }.`;
  } else summary = "";

  const change = inputBytes > 0 && ok ? ((outputBytes - inputBytes) / inputBytes) * 100 : 0;
  const shownOutput = output.length > OUTPUT_PREVIEW_CHARS ? output.slice(0, OUTPUT_PREVIEW_CHARS) : output;

  return (
    <ToolShell slug="json-formatter">
      <div className="space-y-6">
        <ToolPanel title="Input">
          <label htmlFor="json-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste JSON
          </label>
          <textarea
            id="json-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={12}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={failed !== null}
            aria-describedby="json-input-hint"
            placeholder='{"name": "web-01", "ports": [22, 443]}'
            data-testid="input-json"
            className={`${FIELD_CLASS} mt-3 resize-y break-all text-xs leading-relaxed`}
          />
          <p id="json-input-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Strict RFC 8259 JSON, up to {MAX_INPUT_CHARS.toLocaleString("en-US")} characters and {MAX_DEPTH} levels
            deep. Numbers and strings are copied through exactly as written, so formatting never changes a value.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => {
                  setFileNote(null);
                  loadText(example.value);
                }}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
            {raw ? (
              <button
                type="button"
                onClick={() => {
                  setFileNote(null);
                  loadText("");
                }}
                data-testid="button-clear"
                className={CHIP_CLASS}
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="mt-5">
            <label htmlFor="json-file" className={LABEL_CLASS}>
              Or open a file
            </label>
            <input
              id="json-file"
              type="file"
              accept=".json,application/json,text/plain"
              onChange={onFile}
              data-testid="input-json-file"
              className="mt-2 block w-full min-h-[40px] font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))] file:mr-4 file:min-h-[40px] file:rounded-full file:border-0 file:bg-[hsl(var(--brand-iron))] file:px-4 file:font-mono-tight file:text-[0.625rem] file:uppercase file:text-[hsl(var(--brand-bone))]"
            />
            {fileNote ? (
              <p className="mt-2 break-words font-mono-tight text-xs text-[hsl(var(--brand-ash))]" data-testid="text-file-note">
                {fileNote}
              </p>
            ) : null}
          </div>
        </ToolPanel>

        <ToolPanel title="Options">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <div id="json-indent-label" className={LABEL_CLASS}>
                Indent
              </div>
              <div role="group" aria-labelledby="json-indent-label" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {INDENTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setIndent(option.value)}
                    aria-pressed={indent === option.value}
                    data-testid={`button-indent-${option.value}`}
                    className={segmentClass(indent === option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className={LABEL_CLASS}>Order</div>
              <label className={`mt-3 ${toggleClass(sortKeys)}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={sortKeys}
                  onChange={(event) => setSortKeys(event.target.checked)}
                  data-testid="checkbox-sort-keys"
                />
                <span aria-hidden className="text-[hsl(var(--brand-signal))]">
                  {sortKeys ? "[x]" : "[ ]"}
                </span>
                Sort keys at every level, by UTF-16 code unit
              </label>
            </div>
          </div>
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {failed && snippet ? (
          <div
            role="alert"
            data-testid="text-json-error"
            className="rounded-2xl border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-5"
          >
            <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-danger))]">
              Line {failed.error.line}, column {failed.error.column}
            </div>
            <p className="mt-2 break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]">
              {failed.error.message}
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3">
              <pre className="w-max font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {snippet.clippedStart ? <span className="text-[hsl(var(--brand-ash))]">...</span> : null}
                {snippet.before}
                {snippet.at ? (
                  <span className="rounded-sm bg-[hsl(var(--brand-danger)/0.25)] px-0.5 text-[hsl(var(--brand-danger))] underline decoration-2 underline-offset-4">
                    {snippet.at}
                  </span>
                ) : null}
                {snippet.atLabel ? (
                  <span className="mx-1 rounded-sm border border-[hsl(var(--brand-danger)/0.6)] px-1 text-[0.625rem] uppercase tracking-[0.12em] text-[hsl(var(--brand-danger))]">
                    {snippet.atLabel}
                  </span>
                ) : null}
                {snippet.after}
                {snippet.clippedEnd ? <span className="text-[hsl(var(--brand-ash))]">...</span> : null}
              </pre>
            </div>
            {failed.bom ? (
              <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                A byte order mark at the start was skipped; positions count from after it.
              </p>
            ) : null}
          </div>
        ) : null}

        {ok && stats ? (
          <>
            <ToolPanel title={indent === "none" ? "Minified" : "Formatted"}>
              {outputTooLong ? (
                <p
                  role="alert"
                  data-testid="text-output-too-long"
                  className="rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                >
                  With this indent the output would pass {MAX_OUTPUT_CHARS.toLocaleString("en-US")} characters, the most
                  this tool builds. Indentation repeats on every line and grows with depth, so a deeply nested document
                  can expand far past its own size. Choose 2 spaces, Tab or Minify.
                </p>
              ) : (
                <pre data-testid="output-json" className={PRE_CLASS}>
                  {shownOutput}
                </pre>
              )}
              {output.length > OUTPUT_PREVIEW_CHARS ? (
                <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  Showing the first {OUTPUT_PREVIEW_CHARS.toLocaleString("en-US")} of{" "}
                  {output.length.toLocaleString("en-US")} characters. Copy and download take the whole text.
                </p>
              ) : null}
              {outputTooLong ? null : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <CopyButton value={output} label="Copy the formatted JSON" testId="button-copy-output">
                  <span>Copy</span>
                </CopyButton>
                <button
                  type="button"
                  onClick={download}
                  data-testid="button-download"
                  className={`inline-flex min-h-[28px] items-center rounded-md border border-[hsl(var(--brand-iron))] px-2.5 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] ${FOCUS}`}
                >
                  Download
                </button>
                {downloadError ? (
                  <span className="font-mono-tight text-xs text-[hsl(var(--brand-danger))]">{downloadError}</span>
                ) : null}
              </div>
              )}
            </ToolPanel>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <ToolPanel title="Structure">
                <ToolResult label="Depth" value={stats.depth} testId="text-depth" />
                <ToolResult
                  label="Keys"
                  value={`${stats.keys.toLocaleString("en-US")} (${stats.distinctKeys.toLocaleString("en-US")} distinct)`}
                  testId="text-keys"
                />
                <ToolResult label="Objects / arrays" value={`${stats.objects.toLocaleString("en-US")} / ${stats.arrays.toLocaleString("en-US")}`} />
                <ToolResult label="Strings" value={stats.strings.toLocaleString("en-US")} />
                <ToolResult label="Numbers" value={stats.numbers.toLocaleString("en-US")} />
                <ToolResult label="Booleans / nulls" value={`${stats.booleans.toLocaleString("en-US")} / ${stats.nulls.toLocaleString("en-US")}`} />
              </ToolPanel>
              <ToolPanel title="Size (UTF-8)">
                <ToolResult label="Input" value={formatBytes(inputBytes)} testId="text-size-before" />
                <ToolResult
                  label="Output"
                  value={outputTooLong ? "over the cap" : formatBytes(outputBytes)}
                  testId="text-size-after"
                />
                {outputTooLong ? null : (
                  <>
                    <ToolResult
                      label="Change"
                      value={`${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
                      testId="text-size-change"
                    />
                    <ToolResult label="Output lines" value={outputLines.toLocaleString("en-US")} />
                  </>
                )}
                {ok.bom ? <ToolResult label="Byte order mark" value="skipped" /> : null}
              </ToolPanel>
            </div>

            {warnings && warningTotal > 0 ? (
              <ToolPanel title="Warnings">
                <div className="space-y-5" data-testid="list-warnings">
                  {warnings.numberCount > 0 ? (
                    <div>
                      <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        <span className="text-[hsl(var(--brand-danger))]">
                          {warnings.numberCount} {pluralise(warnings.numberCount, "number")}
                        </span>{" "}
                        {warnings.numberCount === 1 ? "falls" : "fall"} outside the range a JavaScript number holds
                        safely. A JavaScript number is an IEEE 754 double, which keeps integers distinct only up to
                        2^53 - 1 (9,007,199,254,740,991) in magnitude; past that, or past about 1.8e308, values
                        change when parsed. The output above keeps the digits; a consumer that parses them into
                        doubles may not.
                      </p>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[560px] border-collapse text-left">
                          <thead>
                            <tr className="border-b border-[hsl(var(--brand-iron))]">
                              {["Where", "Literal", "In JavaScript"].map((h) => (
                                <th
                                  key={h}
                                  scope="col"
                                  className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {warnings.numbers.map((w, i) => {
                              const segs = segmentsAt(ok.root, w.path);
                              return (
                                <tr key={i} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                                  <td className="py-2 pr-4">
                                    <button
                                      type="button"
                                      onClick={() => reveal(w.path)}
                                      className={`min-h-[24px] break-all rounded px-1 text-left font-mono-tight text-xs text-[hsl(var(--brand-signal))] underline underline-offset-2 hover:text-[hsl(var(--brand-bone))] ${FOCUS}`}
                                    >
                                      {segs ? toPointer(segs) || "(root)" : "?"}
                                    </button>
                                  </td>
                                  <td className="max-w-[220px] break-all py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                                    {clipText(w.raw)}
                                  </td>
                                  <td className="py-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                                    {clipText(describeNumberIssue(w.raw, w.issue), 400)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {warnings.numberCount > warnings.numbers.length ? (
                        <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                          The first {MAX_LISTED_WARNINGS} are listed.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {warnings.duplicateCount > 0 ? (
                    <div>
                      <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        <span className="text-[hsl(var(--brand-amber))]">
                          {warnings.duplicateCount} duplicate {pluralise(warnings.duplicateCount, "key")}
                        </span>
                        . RFC 8259 says names should be unique and calls the behavior unpredictable when they are
                        not: JSON.parse keeps the last, while other parsers keep the first, keep both or reject the
                        document.
                      </p>
                      <ul className="mt-2 space-y-1">
                        {warnings.duplicates.map((w, i) => {
                          const segs = segmentsAt(ok.root, w.path);
                          return (
                            <li key={i}>
                              <button
                                type="button"
                                onClick={() => reveal(w.path)}
                                className={`min-h-[24px] break-all rounded px-1 text-left font-mono-tight text-xs text-[hsl(var(--brand-signal))] underline underline-offset-2 hover:text-[hsl(var(--brand-bone))] ${FOCUS}`}
                              >
                                {segs ? toPointer(segs) : "?"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {warnings.surrogateCount > 0 ? (
                    <div>
                      <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        <span className="text-[hsl(var(--brand-amber))]">
                          {warnings.surrogateCount} {pluralise(warnings.surrogateCount, "string")}
                        </span>{" "}
                        {warnings.surrogateCount === 1 ? "holds" : "hold"} half of a UTF-16 surrogate pair on
                        its own. The grammar allows it, but it stands for no Unicode character, so software that
                        converts the string to UTF-8 will reject it or replace it with U+FFFD.
                      </p>
                      <ul className="mt-2 space-y-1">
                        {warnings.surrogates.map((w, i) => {
                          const segs = segmentsAt(ok.root, w.path);
                          return (
                            <li key={i}>
                              <button
                                type="button"
                                onClick={() => reveal(w.path)}
                                className={`min-h-[24px] break-all rounded px-1 text-left font-mono-tight text-xs text-[hsl(var(--brand-signal))] underline underline-offset-2 hover:text-[hsl(var(--brand-bone))] ${FOCUS}`}
                              >
                                {segs ? toPointer(segs) || "(root)" : "?"}
                                {w.inKey ? " (in the key)" : ""}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </ToolPanel>
            ) : null}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <ToolPanel title="Tree" className="lg:col-span-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const all = expandAll(ok.root);
                      setExpanded(all.open);
                      setExpandNote(
                        all.capped
                          ? `Stopped at about ${EXPAND_ALL_ROWS.toLocaleString("en-US")} rows, opening the shallowest levels first. Open deeper nodes one at a time.`
                          : null,
                      );
                    }}
                    data-testid="button-expand-all"
                    className={CHIP_CLASS}
                  >
                    Expand all
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(new Set([""]));
                      setExpandNote(null);
                    }}
                    data-testid="button-collapse-all"
                    className={CHIP_CLASS}
                  >
                    Collapse all
                  </button>
                </div>
                {expandNote ? (
                  <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{expandNote}</p>
                ) : null}
                <div
                  className="mt-4 max-h-[32rem] overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-2"
                  data-testid="tree-json"
                >
                  <ul aria-label="JSON tree" className="w-max min-w-full">
                    <TreeRow node={ok.root} nodeKey="" label="" isIndex duplicate={false} ctx={ctx} />
                  </ul>
                </div>
              </ToolPanel>

              <ToolPanel title="Selected node" className="lg:col-span-2">
                {selectedNode && selectedSegments ? (
                  <div data-testid="panel-selected">
                    <ToolResult label="Type" value={kindLabel(selectedNode)} testId="text-selected-type" />
                    <div className="mt-3 space-y-3">
                      {[
                        { label: "JSON Pointer (RFC 6901)", value: pointer, shown: pointer === "" ? '"" (the whole document)' : pointer, id: "pointer" },
                        { label: "URI fragment", value: pointerToFragment(pointer), shown: pointerToFragment(pointer), id: "fragment" },
                        { label: "JavaScript", value: toJsPath(selectedSegments), shown: toJsPath(selectedSegments), id: "js" },
                        { label: "jq", value: toJqPath(selectedSegments), shown: toJqPath(selectedSegments), id: "jq" },
                      ].map((row) => (
                        <div key={row.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span className={LABEL_CLASS}>{row.label}</span>
                            <CopyButton value={row.value} label={`Copy the ${row.label}`} testId={`button-copy-${row.id}`} />
                          </div>
                          <code
                            data-testid={`text-path-${row.id}`}
                            className="mt-1 block break-all font-mono-tight text-sm text-[hsl(var(--brand-cyan))]"
                          >
                            {row.shown}
                          </code>
                        </div>
                      ))}
                    </div>
                    {selectedNode.kind === "number" && selectedNode.issue ? (
                      <p className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                        {describeNumberIssue(selectedNode.raw, selectedNode.issue)}
                      </p>
                    ) : null}
                    {selectedMember?.duplicate ? (
                      <p className="mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                        An earlier member of this object has the same key. The pointer and paths above name that
                        key, and JSON.parse would return the last member with it.
                      </p>
                    ) : null}
                    {selectedJson !== null ? (
                      <div className="mt-4">
                        <CopyButton value={selectedJson} label="Copy the selected value as JSON" testId="button-copy-selected">
                          <span>Copy value</span>
                        </CopyButton>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">Select a node in the tree.</p>
                )}

                <div className="mt-6 border-t border-[hsl(var(--brand-iron))] pt-5">
                  <label htmlFor="json-pointer" className={LABEL_CLASS}>
                    Go to a JSON Pointer
                  </label>
                  <div className="mt-3 flex gap-2">
                    <input
                      id="json-pointer"
                      type="text"
                      value={pointerDraft}
                      onChange={(event) => {
                        setPointerDraft(event.target.value);
                        setPointerError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") goToPointer();
                      }}
                      spellCheck={false}
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      placeholder="/data/repos/0/name"
                      aria-invalid={pointerError !== null}
                      aria-describedby="json-pointer-message"
                      data-testid="input-pointer"
                      className={`${FIELD_CLASS} min-w-0 flex-1 text-sm`}
                    />
                    <button
                      type="button"
                      onClick={goToPointer}
                      data-testid="button-go-pointer"
                      className={`${segmentClass(false)} shrink-0`}
                    >
                      Go
                    </button>
                  </div>
                  <p
                    id="json-pointer-message"
                    className={`mt-2 break-words font-mono-tight text-xs leading-relaxed ${
                      pointerError ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-ash))]"
                    }`}
                    role={pointerError ? "alert" : undefined}
                  >
                    {pointerError ?? "Schema validators and JSON Patch name locations this way, as in /items/3/price. A #/ fragment works too."}
                  </p>
                </div>
              </ToolPanel>
            </div>
          </>
        ) : null}
      </div>
    </ToolShell>
  );
}
