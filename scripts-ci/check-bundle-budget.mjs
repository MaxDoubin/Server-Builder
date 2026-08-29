#!/usr/bin/env node
/**
 * Static bundle budget.
 *
 * What this measures: the bytes a first-time visitor MUST download before the
 * app can run. That is the entry chunk plus everything it reaches through
 * static `import ... from "./chunk.js"`. Dynamic `import("./chunk.js")` is
 * deliberately not followed: those are the lazy routes, and the whole point of
 * the manualChunks config in vite.config.ts is to keep them out of this set.
 *
 * Why it exists: the entry chunk has twice pulled in react-three-fiber (and
 * three.js behind it) because some shared helper drifted into the r3f chunk,
 * and once pulled in the whole post archive. Each time it shipped, because a
 * total build size stays roughly flat when 950KB moves from a lazy chunk into
 * the eager one. Only the static closure shows it.
 *
 * Measured 2026-08-29 on the current build: 617.5 KB across four chunks,
 * index (331.5 KB), react (140.2 KB), motion (128.7 KB, which is gsap plus
 * lenis, not framer-motion) and icons (17.1 KB). The measured figure drifts
 * by a few KB with ordinary page work; treat a jump of tens of KB as
 * something to look at.
 *
 * Budget is 692KB, which is roughly 75KB of headroom: enough for real growth,
 * not enough to absorb a 3D engine or the post archive unnoticed. It was 700KB
 * until the nested-copy fix in vite.config.ts manualChunks returned 7.9 KB by
 * evicting react-three-fiber's private scheduler copies from the eager react
 * chunk. The budget came down by exactly that much so the win cannot be
 * silently spent; keep doing that rather than banking headroom.
 *
 * Where the remaining weight is, if you are here to cut more. The two biggest
 * items in the closure are eager only because of static imports in the app
 * shell, so neither can be fixed from vite.config.ts:
 *   - framer-motion, about 145 KB, invisible because it sits inside index-*.js
 *     rather than a named chunk. Eagerly imported by lib/framer-animations.tsx
 *     (App.tsx pulls ScrollProgressBar and CursorGlow from it) and directly by
 *     components/cinematic/CinematicNav.tsx and CinematicFooter.tsx. All three
 *     have to stop importing it at the top level before any of it moves.
 *   - motion (gsap plus lenis), 128.7 KB, reached through lib/motion/gsap.ts.
 *     Every caller only touches gsap inside a useEffect, so the static import
 *     there is the only thing keeping the chunk eager.
 *
 * Usage: node scripts-ci/check-bundle-budget.mjs   (after npm run build)
 */

import { readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist/public");
const INDEX = path.join(DIST, "index.html");

const BUDGET_BYTES = 692 * 1024;

/**
 * Chunks that must never be reachable statically from the entry.
 * three and r3f are the WebGL stack, only used by /game. posts is the whole
 * markdown archive, only used by the blog routes.
 */
const FORBIDDEN = [/^three-.*\.js$/, /^r3f-.*\.js$/, /^posts-.*\.js$/];

/**
 * A static import in Rollup's output, in any of the shapes it emits:
 *   import{a}from"./x.js"      export*from"./x.js"      import"./x.js"
 * Dynamic imports are `import(` and cannot match, because a quote has to
 * follow the keyword here.
 */
const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*["'](\.{1,2}\/[^"']+\.js)["']/g;

function fail(message) {
  console.error(`\nFAIL  ${message}\n`);
  process.exit(1);
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

if (!existsSync(INDEX)) {
  fail(`dist/public/index.html not found. Run "npm run build" first.`);
}

const html = readFileSync(INDEX, "utf8");

// Entry points: every module script the document loads eagerly.
const entries = [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((src) => src.startsWith("/"));

if (entries.length === 0) {
  fail(
    "No <script type=\"module\" src=\"/...\"> found in dist/public/index.html. " +
      "The build output changed shape and this check can no longer see the entry.",
  );
}

const visited = new Map(); // absolute path -> size in bytes
const missing = [];
const queue = entries.map((src) => path.join(DIST, src));

while (queue.length > 0) {
  const file = queue.shift();
  if (visited.has(file)) continue;

  if (!existsSync(file)) {
    missing.push(path.relative(DIST, file));
    continue;
  }

  visited.set(file, statSync(file).size);

  const source = readFileSync(file, "utf8");
  const dir = path.dirname(file);
  STATIC_IMPORT.lastIndex = 0;
  let match;
  while ((match = STATIC_IMPORT.exec(source)) !== null) {
    const target = path.resolve(dir, match[1]);
    // A path that does not exist on disk is a string that merely looked like
    // an import, not a real edge. Ignore it rather than inventing a dependency.
    if (!visited.has(target) && existsSync(target)) queue.push(target);
  }
}

if (missing.length > 0) {
  fail(
    `The entry references files that were not emitted:\n  ${missing.join("\n  ")}`,
  );
}

const closure = [...visited.entries()]
  .map(([file, size]) => ({ name: path.basename(file), size }))
  .sort((a, b) => b.size - a.size);

const total = closure.reduce((sum, chunk) => sum + chunk.size, 0);

console.log("Static entry closure:");
for (const chunk of closure) {
  console.log(`  ${kb(chunk.size).padStart(10)}  ${chunk.name}`);
}
console.log(`  ${"".padStart(10, "-")}`);
console.log(`  ${kb(total).padStart(10)}  total  (budget ${kb(BUDGET_BYTES)})`);

const offenders = closure.filter((chunk) =>
  FORBIDDEN.some((pattern) => pattern.test(chunk.name)),
);

if (offenders.length > 0) {
  fail(
    `These chunks must stay lazily loaded but are now statically reachable ` +
      `from the entry:\n  ${offenders.map((c) => `${c.name} (${kb(c.size)})`).join("\n  ")}\n\n` +
      `  Something on the eager path now imports them at the top level. Find ` +
      `the import\n  and make it dynamic, or move the shared helper into its ` +
      `own chunk in\n  vite.config.ts manualChunks.`,
  );
}

if (total > BUDGET_BYTES) {
  fail(
    `Static entry closure is ${kb(total)}, over the ${kb(BUDGET_BYTES)} budget ` +
      `by ${kb(total - BUDGET_BYTES)}.\n\n` +
      `  Either make the new dependency dynamic, or, if the growth is genuinely ` +
      `needed,\n  raise BUDGET_BYTES in this file as a deliberate decision.`,
  );
}

console.log(
  `\nOK  ${kb(total)} of ${kb(BUDGET_BYTES)} used, ` +
    `${kb(BUDGET_BYTES - total)} of headroom.`,
);
