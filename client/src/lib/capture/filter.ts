/**
 * Wireshark display filter syntax, the useful subset.
 *
 * Supported, because these are what a filter is actually made of:
 *
 *   ip.addr == 10.0.0.1          equality, on any field
 *   tcp.port != 443              inequality
 *   frame.len > 1000             ordering, on numeric fields
 *   http.host contains "example" substring
 *   http.request.method          existence: true when the field is present
 *   tcp && !(ip.src == 10.0.0.1) and, or, not, parentheses
 *
 * Refused, loudly, rather than silently ignored: slices, arithmetic, membership
 * sets, regex matching, and layer indices. A filter bar that quietly drops the
 * half of an expression it did not understand teaches a filter that does not
 * work anywhere else.
 *
 * `ip.addr == x` matching either source or destination is a real Wireshark
 * behavior worth reproducing, and it is the one that surprises people: it is
 * true when ANY ip.addr field on the packet matches, which is why
 * `ip.addr != x` does not mean what most people expect.
 */

import { fieldsOf, type Packet } from "./types";

type Node =
  | { kind: "and" | "or"; left: Node; right: Node }
  | { kind: "not"; inner: Node }
  | { kind: "exists"; field: string }
  | { kind: "compare"; field: string; op: string; value: string };

export interface FilterResult {
  test: (packet: Packet) => boolean;
  error?: undefined;
}
export interface FilterError {
  test?: undefined;
  error: string;
}

const OPERATORS = ["==", "!=", ">=", "<=", ">", "<", "contains"];

/** Fields that exist twice per packet and match if either side does. */
const EITHER_SIDE: Record<string, [string, string]> = {
  "ip.addr": ["ip.src", "ip.dst"],
  "tcp.port": ["tcp.srcport", "tcp.dstport"],
  "udp.port": ["udp.srcport", "udp.dstport"],
  "eth.addr": ["eth.src", "eth.dst"],
};

export function compileFilter(input: string): FilterResult | FilterError {
  const text = input.trim();
  if (!text) return { test: () => true };

  const rejected = /\[|\]|\bmatches\b|\bin\s*\{|~/.exec(text);
  if (rejected) {
    return {
      error:
        `This filter bar does not support ${rejected[0].startsWith("[") ? "slices" : `"${rejected[0].trim()}"`}. ` +
        `It supports ==, !=, >, <, >=, <=, contains, field existence, and && || ! with parentheses.`,
    };
  }

  const tokens = tokenise(text);
  if ("error" in tokens) return tokens;

  let position = 0;
  const peek = () => tokens.list[position];
  const take = () => tokens.list[position++];

  function parseOr(): Node | FilterError {
    let left = parseAnd();
    if ("error" in (left as FilterError)) return left as FilterError;
    while (peek() === "||" || peek() === "or") {
      take();
      const right = parseAnd();
      if ("error" in (right as FilterError)) return right as FilterError;
      left = { kind: "or", left: left as Node, right: right as Node };
    }
    return left;
  }

  function parseAnd(): Node | FilterError {
    let left = parseUnary();
    if ("error" in (left as FilterError)) return left as FilterError;
    while (peek() === "&&" || peek() === "and") {
      take();
      const right = parseUnary();
      if ("error" in (right as FilterError)) return right as FilterError;
      left = { kind: "and", left: left as Node, right: right as Node };
    }
    return left;
  }

  function parseUnary(): Node | FilterError {
    if (peek() === "!" || peek() === "not") {
      take();
      const inner = parseUnary();
      if ("error" in (inner as FilterError)) return inner as FilterError;
      return { kind: "not", inner: inner as Node };
    }
    if (peek() === "(") {
      take();
      const inner = parseOr();
      if ("error" in (inner as FilterError)) return inner as FilterError;
      if (take() !== ")") return { error: "Missing a closing bracket." };
      return inner;
    }
    const field = take();
    if (field === undefined) return { error: "The filter ends where a field name should be." };
    if (!/^[a-z][\w.]*$/i.test(field)) return { error: `"${field}" is not a field name.` };
    const next = peek();
    if (next !== undefined && OPERATORS.includes(next)) {
      const op = take();
      const value = take();
      if (value === undefined) return { error: `"${field} ${op}" has nothing to compare against.` };
      return { kind: "compare", field, op, value: value.replace(/^"|"$/g, "") };
    }
    return { kind: "exists", field };
  }

  const tree = parseOr();
  if ("error" in (tree as FilterError)) return tree as FilterError;
  if (position < tokens.list.length) {
    return { error: `Unexpected "${tokens.list[position]}" at the end of the filter.` };
  }
  return { test: (packet) => evaluate(tree as Node, packet) };
}

function tokenise(text: string): { list: string[] } | FilterError {
  const list: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      const end = text.indexOf('"', i + 1);
      if (end === -1) return { error: "There is an opening quote with no closing quote." };
      list.push(text.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) {
      list.push(two);
      i += 2;
      continue;
    }
    if ("()!<>".includes(ch)) {
      list.push(ch);
      i++;
      continue;
    }
    const word = /^[\w.:/@-]+/.exec(text.slice(i));
    if (!word) return { error: `Cannot read "${ch}" in the filter.` };
    list.push(word[0]);
    i += word[0].length;
  }
  return { list };
}

function evaluate(node: Node, packet: Packet): boolean {
  switch (node.kind) {
    case "and":
      return evaluate(node.left, packet) && evaluate(node.right, packet);
    case "or":
      return evaluate(node.left, packet) || evaluate(node.right, packet);
    case "not":
      return !evaluate(node.inner, packet);
    case "exists": {
      const fields = fieldsOf(packet);
      if (fields.has(node.field)) return true;
      const either = EITHER_SIDE[node.field];
      return Boolean(either && (fields.has(either[0]) || fields.has(either[1])));
    }
    case "compare": {
      const fields = fieldsOf(packet);
      const names = EITHER_SIDE[node.field] ?? [node.field];
      const present = names.filter((name) => fields.has(name));
      if (present.length === 0) return false;
      /*
        Any side matching is enough. This is what makes `ip.addr != x`
        counterintuitive in real Wireshark too: a packet from x to y has an
        ip.addr that is not x, so the filter is true. `!(ip.addr == x)` is
        the one people mean.
      */
      return present.some((name) => compare(fields.get(name)!, node.op, node.value));
    }
  }
}

function compare(actual: string | number, op: string, wanted: string): boolean {
  if (op === "contains") return String(actual).toLowerCase().includes(wanted.toLowerCase());
  const bothNumeric = typeof actual === "number" && /^-?\d+(\.\d+)?$/.test(wanted);
  const a = bothNumeric ? actual : String(actual).toLowerCase();
  const b = bothNumeric ? Number(wanted) : wanted.toLowerCase();
  switch (op) {
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case "<":
      return a < b;
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    default:
      return false;
  }
}
