#!/usr/bin/env node
/**
 * No em dashes. Project rule, no exceptions.
 *
 * The character is U+2014 (EM DASH). En dash (U+2013) and hyphen-minus are
 * fine and are not touched here. Box drawing characters like U+2500, which
 * script/prerender.ts uses for its section rules, are a different character
 * again and are also fine.
 *
 * Scope: the source trees plus the built HTML. Built HTML is included because
 * blog bodies are markdown that only becomes HTML during prerender, and
 * because it catches anything injected by the build itself.
 *
 * Usage: node scripts-ci/check-em-dashes.mjs
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

// Written as an escape on purpose: this file must not contain the character
// it bans, or a repo-wide grep reports the checker itself.
const EM_DASH = "—";

const SOURCE_DIRS = ["client/src", "script", "server", "shared"];
const BUILT_HTML_DIR = "dist/public";

/**
 * Anything whose bytes are not text we should be reading.
 *
 * This list is a cheap first pass and it is not the guarantee. It cannot
 * be: it is a list of the binary formats that happened to be in the tree
 * when it was written, so the next format added to the repository is
 * always missing from it. Vendor 3D models arriving under script/ is what
 * demonstrated that, six compressed mesh buffers whose bytes happened to
 * decode to an em dash, reported as prose defects at column 161 of a
 * Draco stream. The NUL sniff below is the actual guarantee.
 */
const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".mp4", ".webm", ".mp3", ".wav", ".pdf", ".zip", ".gz",
  ".glb", ".gltf", ".bin", ".wasm", ".ktx2", ".basis", ".drc",
]);

/**
 * Is this file binary?
 *
 * A NUL byte anywhere near the start is what git and grep both use to
 * decide, and it is right for the same reason here: no text file this
 * project ships contains one, and every binary format worth skipping
 * contains several in its header.
 */
function looksBinary(buffer) {
  return buffer.subarray(0, 8192).includes(0);
}

const SKIP_DIRS = new Set(["node_modules", ".git"]);

function fail(message) {
  console.error(`\nFAIL  ${message}\n`);
  process.exit(1);
}

function walk(dir, filter, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, filter, found);
    } else if (filter(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

const isTextFile = (name) => !SKIP_EXTENSIONS.has(path.extname(name).toLowerCase());
const isHtml = (name) => name.endsWith(".html");

const targets = [];
for (const dir of SOURCE_DIRS) {
  const resolved = path.resolve(dir);
  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    targets.push(...walk(resolved, isTextFile));
  }
}

const distDir = path.resolve(BUILT_HTML_DIR);
const distChecked = existsSync(distDir);
if (distChecked) targets.push(...walk(distDir, isHtml));

const hits = [];
for (const file of targets) {
  let text;
  try {
    const bytes = readFileSync(file);
    if (looksBinary(bytes)) continue;
    text = bytes.toString("utf8");
  } catch {
    continue;
  }
  if (!text.includes(EM_DASH)) continue;

  const relative = path.relative(process.cwd(), file);
  text.split("\n").forEach((line, index) => {
    if (!line.includes(EM_DASH)) return;
    const column = line.indexOf(EM_DASH) + 1;
    const excerpt = line.trim().slice(0, 100);
    hits.push(`  ${relative}:${index + 1}:${column}  ${excerpt}`);
  });
}

console.log(
  `Scanned ${targets.length} files for em dashes ` +
    `(${SOURCE_DIRS.join(", ")}${distChecked ? `, ${BUILT_HTML_DIR} HTML` : ""}).`,
);

if (hits.length > 0) {
  const shown = hits.slice(0, 50).join("\n");
  const more = hits.length > 50 ? `\n  ... and ${hits.length - 50} more` : "";
  fail(
    `${hits.length} em dash(es) found. Replace each with a comma, a colon, ` +
      `a full stop, or an en dash:\n${shown}${more}`,
  );
}

console.log("\nOK  no em dashes.");
