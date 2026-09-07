/**
 * Every localStorage and sessionStorage access sits inside a try.
 *
 * The trap is that storage does not fail by returning null. In a browser set
 * to block site data, and in a cross-origin iframe with a restrictive
 * sandbox, touching window.localStorage throws SecurityError on the property
 * access itself. Code written against "it might be empty" is not written
 * against that.
 *
 * What that cost here: ThemeProvider wraps the whole app and read three keys
 * during its first render, unwrapped. With site data blocked, the site was a
 * blank page. Not a degraded page, a blank one, because these pages are
 * prerendered: the served HTML was legible, React threw on its first render,
 * and with no boundary above the provider the root unmounted and took the
 * served content with it. Three more files could do the same to their own
 * page, one of them from a click handler.
 *
 * The convention was already here and already written down. readingHistory,
 * spacedRepetition, save-system, achievements and the study timer each wrap
 * every access and four of them say why in a comment. Eleven accesses in
 * four files did not, which is what a convention with nothing enforcing it
 * turns into.
 *
 * Lexical, not clever: it strips comments and string bodies so their braces
 * do not move the brace depth, then asks whether the access is inside a try
 * block. A guard in a function the access merely calls does not count, which
 * is the right answer, because that is not what the throw does.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve("client/src");

/** Replace comment and string contents with spaces, preserving line breaks. */
function blank(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") { out += " "; i += 1; }
      continue;
    }
    if (c === "/" && d === "*") {
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      out += c;
      i += 1;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") { out += "  "; i += 2; continue; }
        out += src[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += c;
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const ACCESS = /^(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem|clear|key)/;

let total = 0;
const unguarded = [];

for (const file of walk(ROOT)) {
  const raw = readFileSync(file, "utf8");
  if (!raw.includes("localStorage") && !raw.includes("sessionStorage")) continue;
  const src = blank(raw);

  /* Brace depths at which a try block is currently open. */
  const open = [];
  let depth = 0;
  let line = 1;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "\n") { line += 1; continue; }
    if (ch === "{") {
      if (/\btry\s*$/.test(src.slice(Math.max(0, i - 12), i))) open.push(depth);
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      while (open.length && open[open.length - 1] >= depth) open.pop();
      continue;
    }
    if (ch !== "l" && ch !== "s") continue;
    const m = src.slice(i, i + 40).match(ACCESS);
    if (!m) continue;
    total += 1;
    if (open.length === 0) {
      unguarded.push(`${path.relative(process.cwd(), file)}:${line}  ${m[1]}.${m[2]}`);
    }
    i += m[0].length - 1;
  }
}

if (total < 20) {
  console.error(
    `check-storage-guards: only found ${total} storage accesses, which is fewer\n` +
      `  than this site has. The scan is probably not reaching the source.`,
  );
  process.exit(1);
}

if (unguarded.length) {
  console.error(
    `${unguarded.length} storage access${unguarded.length === 1 ? " is" : "es are"} not inside a try:\n`,
  );
  for (const u of unguarded) console.error(`    ${u}`);
  console.error(
    `\n  Reading storage throws outright where a browser blocks site data, so an\n` +
      `  unguarded access does not lose a preference, it throws through React and\n` +
      `  blanks the page. Wrap it and carry on without the stored value.`,
  );
  process.exit(1);
}

console.log(
  `check-storage-guards: all ${total} localStorage and sessionStorage accesses are wrapped.`,
);
