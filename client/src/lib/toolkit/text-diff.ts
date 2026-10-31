/**
 * Line and word diff.
 *
 * The edit script comes from Eugene Myers, "An O(ND) Difference Algorithm
 * and Its Variations", Algorithmica 1 (1986), using the linear space
 * refinement from section 4b: find the middle snake of the shortest edit
 * path by searching forward from the top left and backward from the bottom
 * right at once, then recurse on the two halves. Memory is O(N + M) and
 * time is O((N + M) D), where D is the number of inserted plus deleted
 * lines, so near-identical files are fast however long they are.
 *
 * Two standard preprocessing steps keep the result minimal while doing less
 * work: the common prefix and suffix are matched first, and lines that
 * appear in only one of the two inputs are set aside before the search,
 * because no common subsequence can contain them.
 *
 * Unified output follows GNU diff -u: hunk headers in the form
 * "@@ -l,s +l,s @@", ",1" omitted, an empty range written as the line
 * before it with a count of 0, context lines taken from the first file,
 * and "\ No newline at end of file" after a last line that has none.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

/* ------------------------------------------------------------------ limits */

/** Lines per side. Past this the page refuses rather than freezing. */
export const MAX_LINES = 10_000;
/** Characters per side. */
export const MAX_CHARS = 1_000_000;
/**
 * Steps the edit search may take before it stops looking for the shortest
 * script and reports what remains as a block replacement. Near-identical
 * inputs never get close; two long, heavily reordered files can.
 */
export const EDIT_BUDGET = 10_000_000;
/** Word highlighting is skipped for lines longer than this. */
export const WORD_MAX_LINE = 2_000;
/** And for more changed line pairs than this. */
export const WORD_MAX_PAIRS = 2_000;
/** Rows drawn in either view. The copied unified diff is always complete. */
export const RENDER_ROW_LIMIT = 2_000;

/* ----------------------------------------------------------------- options */

/**
 * exact compares bytes. trailing ignores white space at the end of a line
 * (GNU diff -Z). change also treats any run of white space as one space
 * (diff -b). all ignores white space entirely (diff -w).
 */
export type WhitespaceMode = "exact" | "trailing" | "change" | "all";

export interface DiffOptions {
  whitespace: WhitespaceMode;
  ignoreCase: boolean;
}

export const DEFAULT_OPTIONS: DiffOptions = { whitespace: "exact", ignoreCase: false };

// The characters C's isspace() accepts, other than the newline that ends a line.
const WS_RUN = /[ \t\v\f\r]+/g;
const WS_TRAIL = /[ \t\v\f\r]+$/;

/** The form of a line that two lines are compared by. */
export function normalizeLine(line: string, options: DiffOptions): string {
  let s = line;
  switch (options.whitespace) {
    case "trailing":
      s = s.replace(WS_TRAIL, "");
      break;
    case "change":
      s = s.replace(WS_TRAIL, "").replace(WS_RUN, " ");
      break;
    case "all":
      s = s.replace(WS_RUN, "");
      break;
    default:
      break;
  }
  return options.ignoreCase ? s.toLowerCase() : s;
}

/* ------------------------------------------------------------------- input */

export interface TextSide {
  /** Lines without their terminating newline. A carriage return stays part of the line, as in diff. */
  lines: string[];
  /** True when the text is non-empty and does not end in a newline. */
  noEol: boolean;
  /** How many lines end in a carriage return. */
  crlf: number;
}

export function splitText(text: string): TextSide {
  if (text === "") return { lines: [], noEol: false, crlf: 0 };
  const lines = text.split("\n");
  let noEol = true;
  if (lines[lines.length - 1] === "") {
    lines.pop();
    noEol = false;
  }
  let crlf = 0;
  for (const l of lines) if (l.endsWith("\r")) crlf += 1;
  return { lines, noEol, crlf };
}

/** A friendly refusal when an input is past the limits, or null. */
export function checkLimits(text: string, label: string): string | null {
  if (text.length > MAX_CHARS) {
    return `${label} is ${text.length.toLocaleString("en-US")} characters. The limit is ${MAX_CHARS.toLocaleString("en-US")} per side, so the comparison stays responsive.`;
  }
  let lines = 1;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      lines += 1;
      if (lines > MAX_LINES + 1) break;
    }
  }
  if (text.endsWith("\n")) lines -= 1;
  if (lines > MAX_LINES) {
    return `${label} has more than ${MAX_LINES.toLocaleString("en-US")} lines, the limit per side that keeps the comparison responsive.`;
  }
  return null;
}

/* ------------------------------------------------------------------- myers */

interface Budget {
  left: number;
  exhausted: boolean;
}

interface Snake {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The middle snake of the box a[left..right) by b[top..bottom): a stretch
 * of the shortest edit path that both the forward and the backward search
 * reach, with at most one insertion or deletion at one end. Returns null if
 * the budget runs out first.
 */
function midSnake(
  a: Int32Array,
  b: Int32Array,
  left: number,
  right: number,
  top: number,
  bottom: number,
  budget: Budget,
): Snake | null {
  const width = right - left;
  const height = bottom - top;
  const delta = width - height;
  const odd = (delta & 1) !== 0;
  const max = Math.ceil((width + height) / 2);
  const off = max + 1;
  const vf = new Int32Array(2 * max + 3);
  const vb = new Int32Array(2 * max + 3);
  vf[1 + off] = left;
  vb[1 + off] = bottom;

  for (let d = 0; d <= max; d += 1) {
    budget.left -= 2 * d + 1;
    if (budget.left < 0) {
      budget.exhausted = true;
      return null;
    }

    // Forward: k is the diagonal x - y, relative to the top left corner.
    for (let k = d; k >= -d; k -= 2) {
      let x: number;
      let px: number;
      if (k === -d || (k !== d && vf[k - 1 + off] < vf[k + 1 + off])) {
        px = x = vf[k + 1 + off];
      } else {
        px = vf[k - 1 + off];
        x = px + 1;
      }
      let y = top + (x - left) - k;
      const py = d === 0 || x !== px ? y : y - 1;
      const sx = x;
      while (x < right && y < bottom && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      budget.left -= x - sx;
      vf[k + off] = x;
      const c = k - delta;
      if (odd && c >= -(d - 1) && c <= d - 1 && y >= vb[c + off]) {
        return { x0: px, y0: py, x1: x, y1: y };
      }
    }

    // Backward: c is the diagonal measured from the bottom right corner.
    for (let c = d; c >= -d; c -= 2) {
      let y: number;
      let py: number;
      if (c === -d || (c !== d && vb[c - 1 + off] > vb[c + 1 + off])) {
        py = y = vb[c + 1 + off];
      } else {
        py = vb[c - 1 + off];
        y = py - 1;
      }
      const k = c + delta;
      let x = left + (y - top) + k;
      const px = d === 0 || y !== py ? x : x + 1;
      const sy = y;
      while (x > left && y > top && a[x - 1] === b[y - 1]) {
        x -= 1;
        y -= 1;
      }
      budget.left -= sy - y;
      vb[c + off] = y;
      if (!odd && k >= -d && k <= d && x <= vf[k + off]) {
        return { x0: x, y0: y, x1: px, y1: py };
      }
    }
  }
  // Unreachable for a non-empty box: the searches always meet by d = max.
  return null;
}

/**
 * Appends the matched index pairs of a[aLo..aHi) and b[bLo..bHi), in order,
 * to out as flat [i, j, i, j, ...].
 */
function solve(
  a: Int32Array,
  b: Int32Array,
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
  out: number[],
  budget: Budget,
): void {
  while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) {
    out.push(aLo, bLo);
    aLo += 1;
    bLo += 1;
  }
  let sa = aHi;
  let sb = bHi;
  while (sa > aLo && sb > bLo && a[sa - 1] === b[sb - 1]) {
    sa -= 1;
    sb -= 1;
  }
  // With both sides trimmed, a non-empty pair needs at least two edits, so
  // each half below needs fewer and the recursion always ends. Its depth is
  // about log2 of the edit count.
  if (aLo < sa && bLo < sb && !budget.exhausted) {
    const snake = midSnake(a, b, aLo, sa, bLo, sb, budget);
    if (snake) {
      solve(a, b, aLo, snake.x0, bLo, snake.y0, out, budget);
      solve(a, b, snake.x0, snake.x1, snake.y0, snake.y1, out, budget);
      solve(a, b, snake.x1, sa, snake.y1, sb, out, budget);
    }
  }
  for (let i = 0; i < aHi - sa; i += 1) out.push(sa + i, sb + i);
}

export interface MatchResult {
  /** Flat matched pairs [i, j, i, j, ...], increasing in both. */
  pairs: number[];
  /** False when the budget ran out and part of the result is a block replacement. */
  minimal: boolean;
}

/**
 * A longest common subsequence of two sequences of integer ids, by Myers'
 * algorithm. Ids that occur on only one side are discarded first.
 */
export function matchSequences(a: ArrayLike<number>, b: ArrayLike<number>, budgetSteps = EDIT_BUDGET): MatchResult {
  const inB = new Set<number>();
  for (let j = 0; j < b.length; j += 1) inB.add(b[j]);
  const inA = new Set<number>();
  for (let i = 0; i < a.length; i += 1) inA.add(a[i]);

  const aMap: number[] = [];
  for (let i = 0; i < a.length; i += 1) if (inB.has(a[i])) aMap.push(i);
  const bMap: number[] = [];
  for (let j = 0; j < b.length; j += 1) if (inA.has(b[j])) bMap.push(j);

  const ra = new Int32Array(aMap.length);
  aMap.forEach((i, n) => {
    ra[n] = a[i];
  });
  const rb = new Int32Array(bMap.length);
  bMap.forEach((j, n) => {
    rb[n] = b[j];
  });

  const budget: Budget = { left: budgetSteps, exhausted: false };
  const reduced: number[] = [];
  solve(ra, rb, 0, ra.length, 0, rb.length, reduced, budget);

  const pairs: number[] = new Array(reduced.length);
  for (let n = 0; n < reduced.length; n += 2) {
    pairs[n] = aMap[reduced[n]];
    pairs[n + 1] = bMap[reduced[n + 1]];
  }
  return { pairs, minimal: !budget.exhausted };
}

/* ------------------------------------------------------------- line diff */

export type OpKind = "equal" | "delete" | "insert";

/** One line of the edit script. a and b index the old and new lines, or are -1. */
export interface Op {
  kind: OpKind;
  a: number;
  b: number;
}

export interface LineDiff {
  old: TextSide;
  new: TextSide;
  ops: Op[];
  additions: number;
  deletions: number;
  unchanged: number;
  minimal: boolean;
}

export function diffLines(oldText: string, newText: string, options: DiffOptions = DEFAULT_OPTIONS): LineDiff {
  const oldSide = splitText(oldText);
  const newSide = splitText(newText);
  // GNU diff treats a missing final newline as a difference only when it
  // compares white space exactly; -Z, -b and -w all ignore it.
  const markEol = options.whitespace === "exact";

  const ids = new Map<string, number>();
  const intern = (side: TextSide): Int32Array => {
    const out = new Int32Array(side.lines.length);
    side.lines.forEach((line, i) => {
      let key = normalizeLine(line, options);
      if (markEol && side.noEol && i === side.lines.length - 1) key += "\n";
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size;
        ids.set(key, id);
      }
      out[i] = id;
    });
    return out;
  };
  const a = intern(oldSide);
  const b = intern(newSide);
  const { pairs, minimal } = matchSequences(a, b);

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  const flush = (toA: number, toB: number) => {
    while (i < toA) ops.push({ kind: "delete", a: i++, b: -1 });
    while (j < toB) ops.push({ kind: "insert", a: -1, b: j++ });
  };
  for (let n = 0; n < pairs.length; n += 2) {
    flush(pairs[n], pairs[n + 1]);
    ops.push({ kind: "equal", a: i++, b: j++ });
  }
  flush(a.length, b.length);

  let additions = 0;
  let deletions = 0;
  for (const op of ops) {
    if (op.kind === "insert") additions += 1;
    else if (op.kind === "delete") deletions += 1;
  }
  return {
    old: oldSide,
    new: newSide,
    ops,
    additions,
    deletions,
    unchanged: ops.length - additions - deletions,
    minimal,
  };
}

/* ------------------------------------------------------------------- hunks */

export interface Hunk {
  /** Index range into ops, [start, end). */
  start: number;
  end: number;
  /** 0-based index of the first old and new line in the hunk. */
  oldIndex: number;
  newIndex: number;
  oldCount: number;
  newCount: number;
}

/**
 * Groups the edit script into hunks with `context` unchanged lines around
 * each change. Two changes separated by at most 2 * context unchanged lines
 * share a hunk, as in GNU diff and Python's difflib.
 */
export function buildHunks(ops: Op[], context: number): Hunk[] {
  const ctx = Math.max(0, Math.floor(context));
  // Old and new line position before each op.
  const oldPos = new Int32Array(ops.length + 1);
  const newPos = new Int32Array(ops.length + 1);
  for (let p = 0; p < ops.length; p += 1) {
    oldPos[p + 1] = oldPos[p] + (ops[p].kind === "insert" ? 0 : 1);
    newPos[p + 1] = newPos[p] + (ops[p].kind === "delete" ? 0 : 1);
  }
  const hunks: Hunk[] = [];
  let p = 0;
  while (p < ops.length) {
    while (p < ops.length && ops[p].kind === "equal") p += 1;
    if (p >= ops.length) break;
    const start = Math.max(0, p - ctx);
    let lastChange = p;
    let q = p;
    for (;;) {
      while (q < ops.length && ops[q].kind !== "equal") q += 1;
      lastChange = q - 1;
      let r = q;
      while (r < ops.length && ops[r].kind === "equal") r += 1;
      if (r < ops.length && r - q <= 2 * ctx) {
        q = r;
        continue;
      }
      break;
    }
    const end = Math.min(ops.length, lastChange + 1 + ctx);
    hunks.push({
      start,
      end,
      oldIndex: oldPos[start],
      newIndex: newPos[start],
      oldCount: oldPos[end] - oldPos[start],
      newCount: newPos[end] - newPos[start],
    });
    p = end;
  }
  return hunks;
}

/** One side of a hunk header, as GNU diff prints it. */
function range(index: number, count: number): string {
  if (count === 0) return `${index},0`;
  if (count === 1) return `${index + 1}`;
  return `${index + 1},${count}`;
}

export function hunkHeader(h: Hunk): string {
  return `@@ -${range(h.oldIndex, h.oldCount)} +${range(h.newIndex, h.newCount)} @@`;
}

export const NO_EOL_MARKER = "\\ No newline at end of file";

/** The full diff -u text, or "" when nothing differs. */
export function unifiedDiff(
  diff: LineDiff,
  context = 3,
  oldLabel = "original",
  newLabel = "changed",
): string {
  const hunks = buildHunks(diff.ops, context);
  if (hunks.length === 0) return "";
  const out: string[] = [`--- ${oldLabel}`, `+++ ${newLabel}`];
  const oldLast = diff.old.lines.length - 1;
  const newLast = diff.new.lines.length - 1;
  for (const h of hunks) {
    out.push(hunkHeader(h));
    for (let p = h.start; p < h.end; p += 1) {
      const op = diff.ops[p];
      if (op.kind === "insert") {
        out.push(`+${diff.new.lines[op.b]}`);
        if (diff.new.noEol && op.b === newLast) out.push(NO_EOL_MARKER);
      } else {
        out.push(`${op.kind === "delete" ? "-" : " "}${diff.old.lines[op.a]}`);
        if (diff.old.noEol && op.a === oldLast) out.push(NO_EOL_MARKER);
      }
    }
  }
  return `${out.join("\n")}\n`;
}

/* -------------------------------------------------------------- word diff */

export interface Segment {
  text: string;
  changed: boolean;
}

const TOKEN = /[\p{L}\p{N}_]+|[ \t\v\f\r]+|[^\p{L}\p{N}_ \t\v\f\r]/gu;

/** Words, runs of white space, and single punctuation characters. */
export function tokenize(line: string): string[] {
  return line.match(TOKEN) ?? [];
}

function isSpace(token: string): boolean {
  return /^[ \t\v\f\r]+$/.test(token);
}

function segments(tokens: string[], changed: boolean[]): Segment[] {
  const out: Segment[] = [];
  tokens.forEach((t, i) => {
    const last = out[out.length - 1];
    if (last && last.changed === changed[i]) last.text += t;
    else out.push({ text: t, changed: changed[i] });
  });
  return out;
}

/**
 * Which words changed between two lines that the line diff paired up.
 * Null when either line is too long, or when the two have so little in
 * common that highlighting individual words would only add noise.
 */
export function wordDiff(
  oldLine: string,
  newLine: string,
  options: DiffOptions = DEFAULT_OPTIONS,
): { old: Segment[]; new: Segment[] } | null {
  if (oldLine.length > WORD_MAX_LINE || newLine.length > WORD_MAX_LINE) return null;
  const ta = tokenize(oldLine);
  const tb = tokenize(newLine);

  // White space the line comparison ignored is never highlighted, so it is
  // left out of the word comparison too.
  const ids = new Map<string, number>();
  const keyed = (tokens: string[]) => {
    const idx: number[] = [];
    const seq: number[] = [];
    let trailFrom = tokens.length;
    while (trailFrom > 0 && isSpace(tokens[trailFrom - 1])) trailFrom -= 1;
    tokens.forEach((t, i) => {
      const space = isSpace(t);
      if (space && options.whitespace === "all") return;
      if (space && i >= trailFrom && options.whitespace !== "exact") return;
      let key = space && options.whitespace === "change" ? " " : t;
      if (options.ignoreCase) key = key.toLowerCase();
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size;
        ids.set(key, id);
      }
      idx.push(i);
      seq.push(id);
    });
    return { idx, seq };
  };
  const ka = keyed(ta);
  const kb = keyed(tb);
  const { pairs } = matchSequences(ka.seq, kb.seq, 500_000);

  const changedA = ta.map(() => false);
  const changedB = tb.map(() => false);
  for (const i of ka.idx) changedA[i] = true;
  for (const j of kb.idx) changedB[j] = true;
  let common = 0;
  for (let n = 0; n < pairs.length; n += 2) {
    const i = ka.idx[pairs[n]];
    changedA[i] = false;
    changedB[kb.idx[pairs[n + 1]]] = false;
    if (!isSpace(ta[i])) common += ta[i].length;
  }
  const solidA = ta.reduce((s, t) => s + (isSpace(t) ? 0 : t.length), 0);
  const solidB = tb.reduce((s, t) => s + (isSpace(t) ? 0 : t.length), 0);
  if (solidA + solidB > 0 && (2 * common) / (solidA + solidB) < 0.3) return null;
  return { old: segments(ta, changedA), new: segments(tb, changedB) };
}

/* ------------------------------------------------------------------- views */

export interface Cell {
  /** 0-based line index on its side. */
  index: number;
  text: string;
  kind: OpKind;
  /** Word-level segments when the line was paired with one on the other side. */
  segments: Segment[] | null;
}

export type SideRow =
  | { type: "line"; left: Cell | null; right: Cell | null }
  | { type: "gap"; count: number };

export type UnifiedRow =
  | { type: "header"; text: string }
  | { type: "line"; kind: OpKind; oldIndex: number; newIndex: number; text: string; segments: Segment[] | null; noEol: boolean }
  | { type: "gap"; count: number };

export interface PairInfo {
  /** For each op index, the word segments of that line, if paired. */
  seg: Map<number, Segment[]>;
  /** For each delete op index, the insert op index it is paired with, and the reverse. */
  partner: Map<number, number>;
  /**
   * For each change block, keyed by the op index it starts at, the rows of a
   * side-by-side view as [delete op, insert op], either of which may be -1.
   */
  layout: Map<number, [number, number][]>;
  /** True when word highlighting stopped early at the pair cap. */
  capped: boolean;
}

/** Below this similarity a deleted and an inserted line are not treated as one edited line. */
export const PAIR_THRESHOLD = 0.3;
/** Change blocks larger than this many line pairs are aligned in order instead of by similarity. */
export const ALIGN_MAX_CELLS = 40_000;

const WORD = /[\p{L}\p{N}_]+/gu;

/** The words of a line, as normalized counts, for a cheap similarity measure. */
function wordCounts(line: string, options: DiffOptions): { counts: Map<string, number>; total: number } {
  const counts = new Map<string, number>();
  let total = 0;
  if (line.length > WORD_MAX_LINE) return { counts, total };
  for (const w of line.match(WORD) ?? []) {
    const key = options.ignoreCase ? w.toLowerCase() : w;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  return { counts, total };
}

/** Dice coefficient of two word multisets: 1 for the same words, 0 for none shared. */
function similarity(a: { counts: Map<string, number>; total: number }, b: { counts: Map<string, number>; total: number }): number {
  if (a.total + b.total === 0) return 0;
  let common = 0;
  a.counts.forEach((n, w) => {
    common += Math.min(n, b.counts.get(w) ?? 0);
  });
  return (2 * common) / (a.total + b.total);
}

/**
 * Which deleted and inserted lines of one change block are edits of each
 * other: the order-preserving pairing with the greatest total similarity,
 * found by dynamic programming over the block. Returns [del, ins] index
 * pairs into the two lists, ascending.
 */
export function alignBlock(dels: string[], ins: string[], options: DiffOptions): [number, number][] {
  const n = dels.length;
  const m = ins.length;
  if (n === 0 || m === 0) return [];
  const wa = dels.map((l) => wordCounts(l, options));
  const wb = ins.map((l) => wordCounts(l, options));
  if (n * m > ALIGN_MAX_CELLS) {
    const pairs: [number, number][] = [];
    for (let k = 0; k < Math.min(n, m); k += 1) if (similarity(wa[k], wb[k]) >= PAIR_THRESHOLD) pairs.push([k, k]);
    return pairs;
  }
  const sim = new Float64Array(n * m);
  for (let i = 0; i < n; i += 1) for (let j = 0; j < m; j += 1) sim[i * m + j] = similarity(wa[i], wb[j]);
  const w = m + 1;
  const dp = new Float64Array((n + 1) * w);
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      let best = Math.max(dp[(i - 1) * w + j], dp[i * w + j - 1]);
      const s = sim[(i - 1) * m + j - 1];
      if (s >= PAIR_THRESHOLD) best = Math.max(best, dp[(i - 1) * w + j - 1] + s);
      dp[i * w + j] = best;
    }
  }
  const pairs: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const s = sim[(i - 1) * m + j - 1];
    if (s >= PAIR_THRESHOLD && dp[i * w + j] === dp[(i - 1) * w + j - 1] + s) {
      pairs.push([i - 1, j - 1]);
      i -= 1;
      j -= 1;
    } else if (dp[i * w + j] === dp[(i - 1) * w + j]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return pairs.reverse();
}

/**
 * Pairs the deleted and inserted lines of each change that are edits of
 * one another, lays each change out as side-by-side rows, and runs the word
 * diff on the pairs.
 */
export function pairChanges(diff: LineDiff, options: DiffOptions, words: boolean): PairInfo {
  const seg = new Map<number, Segment[]>();
  const partner = new Map<number, number>();
  const layout = new Map<number, [number, number][]>();
  let budget = WORD_MAX_PAIRS;
  let capped = false;
  const ops = diff.ops;
  let p = 0;
  while (p < ops.length) {
    if (ops[p].kind === "equal") {
      p += 1;
      continue;
    }
    const blockStart = p;
    const dels: number[] = [];
    const ins: number[] = [];
    while (p < ops.length && ops[p].kind !== "equal") {
      if (ops[p].kind === "delete") dels.push(p);
      else ins.push(p);
      p += 1;
    }
    const pairs = alignBlock(
      dels.map((q) => diff.old.lines[ops[q].a]),
      ins.map((q) => diff.new.lines[ops[q].b]),
      options,
    );

    // Unpaired lines between two pairs share rows in order, as most
    // side-by-side views draw them; paired lines always share a row.
    const rows: [number, number][] = [];
    let di = 0;
    let ii = 0;
    const zip = (toD: number, toI: number) => {
      while (di < toD || ii < toI) rows.push([di < toD ? dels[di++] : -1, ii < toI ? ins[ii++] : -1]);
    };
    for (const [pd, pi] of pairs) {
      zip(pd, pi);
      rows.push([dels[pd], ins[pi]]);
      di = pd + 1;
      ii = pi + 1;
      partner.set(dels[pd], ins[pi]);
      partner.set(ins[pi], dels[pd]);
      if (!words) continue;
      if (budget <= 0) {
        capped = true;
        continue;
      }
      budget -= 1;
      const w = wordDiff(diff.old.lines[ops[dels[pd]].a], diff.new.lines[ops[ins[pi]].b], options);
      if (w) {
        seg.set(dels[pd], w.old);
        seg.set(ins[pi], w.new);
      }
    }
    zip(dels.length, ins.length);
    layout.set(blockStart, rows);
  }
  return { seg, partner, layout, capped };
}

function cellFor(diff: LineDiff, op: Op, p: number, info: PairInfo): Cell {
  const onOld = op.kind !== "insert";
  return {
    index: onOld ? op.a : op.b,
    text: onOld ? diff.old.lines[op.a] : diff.new.lines[op.b],
    kind: op.kind,
    segments: info.seg.get(p) ?? null,
  };
}

/** Rows for a side-by-side view, collapsing unchanged runs outside the hunks. */
export function sideBySideRows(diff: LineDiff, hunks: Hunk[], info: PairInfo, limit = RENDER_ROW_LIMIT): { rows: SideRow[]; truncated: boolean } {
  const rows: SideRow[] = [];
  const ops = diff.ops;
  let cursor = 0;
  let truncated = false;
  for (const h of hunks) {
    if (h.start > cursor) rows.push({ type: "gap", count: h.start - cursor });
    let p = h.start;
    while (p < h.end) {
      if (rows.length >= limit) {
        truncated = true;
        return { rows, truncated };
      }
      const op = ops[p];
      if (op.kind === "equal") {
        rows.push({
          type: "line",
          left: cellFor(diff, op, p, info),
          right: { index: op.b, text: diff.new.lines[op.b], kind: "equal", segments: null },
        });
        p += 1;
        continue;
      }
      const blockStart = p;
      while (p < h.end && ops[p].kind !== "equal") p += 1;
      for (const [d, n] of info.layout.get(blockStart) ?? []) {
        if (rows.length >= limit) {
          truncated = true;
          return { rows, truncated };
        }
        rows.push({
          type: "line",
          left: d >= 0 ? cellFor(diff, ops[d], d, info) : null,
          right: n >= 0 ? cellFor(diff, ops[n], n, info) : null,
        });
      }
    }
    cursor = h.end;
  }
  if (hunks.length > 0 && cursor < ops.length) rows.push({ type: "gap", count: ops.length - cursor });
  return { rows, truncated };
}

/** Rows for a colored unified view: the same lines unifiedDiff prints. */
export function unifiedRows(diff: LineDiff, hunks: Hunk[], info: PairInfo, limit = RENDER_ROW_LIMIT): { rows: UnifiedRow[]; truncated: boolean } {
  const rows: UnifiedRow[] = [];
  const ops = diff.ops;
  const oldLast = diff.old.lines.length - 1;
  const newLast = diff.new.lines.length - 1;
  let cursor = 0;
  for (const h of hunks) {
    if (h.start > cursor) rows.push({ type: "gap", count: h.start - cursor });
    rows.push({ type: "header", text: hunkHeader(h) });
    for (let p = h.start; p < h.end; p += 1) {
      if (rows.length >= limit) return { rows, truncated: true };
      const op = ops[p];
      const onOld = op.kind !== "insert";
      rows.push({
        type: "line",
        kind: op.kind,
        oldIndex: op.a,
        newIndex: op.b,
        text: onOld ? diff.old.lines[op.a] : diff.new.lines[op.b],
        segments: info.seg.get(p) ?? null,
        noEol: onOld ? diff.old.noEol && op.a === oldLast : diff.new.noEol && op.b === newLast,
      });
    }
    cursor = h.end;
  }
  if (hunks.length > 0 && cursor < ops.length) rows.push({ type: "gap", count: ops.length - cursor });
  return { rows, truncated: false };
}

/* ------------------------------------------------------------------- stats */

export interface DiffStats {
  additions: number;
  deletions: number;
  unchanged: number;
  /** Deleted lines that were paired with an inserted line. */
  modified: number;
  hunks: number;
  /** 2 * unchanged / (old lines + new lines), 1 when both are empty. */
  similarity: number;
}

export function diffStats(diff: LineDiff, hunks: Hunk[], info: PairInfo): DiffStats {
  const total = diff.old.lines.length + diff.new.lines.length;
  return {
    additions: diff.additions,
    deletions: diff.deletions,
    unchanged: diff.unchanged,
    modified: info.partner.size / 2,
    hunks: hunks.length,
    similarity: total === 0 ? 1 : (2 * diff.unchanged) / total,
  };
}

/**
 * Applies a unified diff to the old text, for testing: returns the new text,
 * or throws if a hunk does not match.
 */
export function applyUnified(oldText: string, patch: string): string {
  if (patch === "") return oldText;
  const old = splitText(oldText);
  const lines = patch.replace(/\n$/, "").split("\n");
  const out: string[] = [];
  let cursor = 0;
  let newNoEol = false;
  let n = 2;
  while (n < lines.length) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@$/.exec(lines[n]);
    if (!m) throw new Error(`bad hunk header at line ${n + 1}: ${lines[n]}`);
    const oldCount = m[2] === undefined ? 1 : Number(m[2]);
    const oldStart = oldCount === 0 ? Number(m[1]) : Number(m[1]) - 1;
    while (cursor < oldStart) out.push(old.lines[cursor++]);
    n += 1;
    while (n < lines.length && !lines[n].startsWith("@@")) {
      const line = lines[n];
      const tag = line[0];
      const body = line.slice(1);
      if (line === NO_EOL_MARKER) {
        if (lines[n - 1][0] !== "-") newNoEol = true;
      } else if (tag === " " || tag === "-") {
        if (old.lines[cursor] !== body) throw new Error(`mismatch at old line ${cursor + 1}`);
        if (tag === " ") out.push(body);
        cursor += 1;
        newNoEol = false;
      } else if (tag === "+") {
        out.push(body);
        newNoEol = false;
      } else {
        throw new Error(`bad line ${n + 1}: ${line}`);
      }
      n += 1;
    }
  }
  while (cursor < old.lines.length) {
    out.push(old.lines[cursor++]);
    newNoEol = old.noEol && cursor === old.lines.length;
  }
  if (out.length === 0) return "";
  return out.join("\n") + (newNoEol ? "" : "\n");
}
