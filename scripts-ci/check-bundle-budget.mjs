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

/*
 * 694 KB, raised from 692 by /nat, and the first explanation of that was wrong.
 *
 * I assumed the growth was the home page's practice act, which imports the
 * case data of ten surfaces to render a count, and wrote that down without
 * measuring it. Then I measured it. The act and the practice hub are both
 * lazily loaded, so neither is in this closure at all, and no case prose is:
 * grepping the entry for shared_buffers, influxdb or any case's brief finds
 * nothing. The data is properly split and always was.
 *
 * What a new surface actually costs here is its command palette entry: title,
 * detail and a list of search terms, 337 bytes for /nat, in an array that is
 * 8.2 KB of a 419 KB entry across 62 entries. That is the site's search index
 * and it belongs in the entry, because the palette opens on the first
 * keystroke on any page. So the cost is real, small, and the right shape, and
 * the number to watch is roughly a third of a kilobyte per surface rather
 * than anything alarming.
 *
 * 698 KB, raised from 694 by /load, /throttle, /ports and /limits, and
 * measured each time rather than assumed, because the raise before those was
 * written up from a guess. Grepping the entry for a case slug from any of
 * them finds nothing, so no case data or prose has leaked in. What is there
 * is the registration surface: the route, the lazy import identifier, a
 * couple of references to the path, and the palette entry at around 360
 * source bytes. Four surfaces cost about 3.6 KB between them.
 *
 * Read the entry from index.html rather than globbing assets/index-*.js. There
 * are seven of those and six belong to lazily loaded modules, so a glob picks
 * a chunk that contains none of the surface and the measurement comes back
 * reading zero for everything, which looks like a clean result.
 *
 * 699 KB, raised from 698 by /ndots, measured: the closure came in at 698.5,
 * over by 0.5 KB, and grepping the entry for any of its case slugs or a line
 * of its case prose finds nothing, so the cost is the palette entry and the
 * route registration and nothing else. One surface, half a kilobyte, which
 * is the rate the two raises above predicted.
 *
 * 700 KB, raised from 699 by /leases, measured at 699.4, and the same grep
 * run again: no case slug, no line of case prose, no lease figure from the
 * model is anywhere in the entry. 0.4 KB for the palette entry and the route,
 * which is the third consecutive surface to land within a rounding error of
 * the third-of-a-kilobyte figure written down two raises ago. That
 * consistency is the useful part: a surface that ever costs several KB here
 * has leaked something, and this budget will say so.
 *
 * 701 KB, raised from 700 by /backlog, measured at 700.5. This one is worth
 * recording because the grep came back non-empty for the first time:
 * "somaxconn", "ListenOverflows" and "sk_acceptq_is_full" all appear in the
 * entry chunk. They are not case data. They are inside the command palette
 * entry's search terms, which is exactly where they belong, because somebody
 * typing "listen overflow" into the palette on any page has to match this
 * surface before its route has loaded. Checked by printing the surrounding
 * 400 bytes rather than by assuming: it is one string literal in the palette
 * array. No case slug and no line of case prose is in there.
 *
 * 702 KB, raised from 701 by /keepalive, measured at 701.7. Same check, same
 * answer: tcp_keepalive_time and conntrack are in the entry, both inside that
 * route's palette terms, and its case slugs are not. This surface's palette
 * entry is longer than most because the thing a reader types is a sysctl
 * name, and there are a dozen of them that should all find it. 0.7 KB is what
 * that costs, and it is the right place to spend it.
 *
 * 703 KB, raised from 702 by /startlimit, measured at 702.7. Grepped again and
 * the pattern is now established enough to state as a rule: the only strings
 * from a new surface that reach the entry are its palette entry's title,
 * detail, href and search terms. No case slug from this one is in there, and
 * neither is any identifier from its model. Four surfaces, four raises, each
 * between 0.4 and 0.7 KB. If a surface ever costs materially more than that,
 * something has leaked and the right response is to find it rather than to
 * raise this number again.
 *
 * 704 KB, raised from 703 by /neigh, measured at 703.7, and the rule above
 * held for the fifth time: gc_thresh3 and ndisc_cache appear in the entry,
 * both inside the palette terms, and no case slug does.
 *
 * 705 KB, raised from 704 by /shm, measured at 704.7. Six surfaces, six
 * raises, every one between 0.4 and 0.7 KB, all of it palette entries.
 *
 * 706 KB, raised from 705 by /maxstartups and /retrans together, measured at
 * 705.4. Two surfaces for 0.6 KB between them, which is the cheapest pair so
 * far: both pages are lazy, both models are lazy, and the only thing either
 * one puts in the static entry is its row in the command palette. Eight
 * surfaces, seven raises, and the rule from the top of this comment has now
 * held eight times.
 *
 * 707 KB, raised from 706 by /conntrack, measured at 705.8. Nine surfaces,
 * eight raises, every one between 0.3 and 0.7 KB, and still nothing in the
 * static entry from any of them but a command palette row.
 *
 * 708 KB, raised from 707 by /writeback, measured at 706.8. Ten surfaces,
 * nine raises, and the rule has now held ten times: the page and the model
 * are both lazy, and the only thing reaching the static entry is the command
 * palette row, which is the whole reason a surface costs a kilobyte rather
 * than the twenty its code weighs.
 *
 * 709 KB, raised from 708 by /fds, measured at 707.8. Eleven surfaces, ten
 * raises, and the eleventh is the same kilobyte as the other ten.
 *
 * 710 KB, raised from 709 by /rcvbuf, measured at 708.7. Twelve surfaces,
 * eleven raises, every one under a kilobyte, and the static entry still
 * carries nothing from any of them but a command palette row.
 *
 * 711 KB, raised from 710 by /timewait, measured at 709.7. Thirteen surfaces,
 * twelve raises. The page, the model and the ten cases are all behind the
 * route's lazy import; what lands in the static entry is the palette row and
 * the practice index card, which is why the step is a kilobyte again.
 *
 * 712 KB, raised from 711 by /overcommit, measured at 710.6. Fourteen
 * surfaces, thirteen raises, and the same kilobyte each time, which is the
 * property worth watching rather than the total.
 */
const BUDGET_BYTES = 712 * 1024;

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
