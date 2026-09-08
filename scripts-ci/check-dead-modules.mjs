/**
 * No file under client/src may be unreachable from the entry point.
 *
 * Sixty-five were. Unused shadcn primitives that came with the template,
 * four hero components nothing mounted, five NOC and network panels whose
 * only importers were three pages that had no route, a whole second rack
 * scene, and a 404 page superseded by a cinematic one. Between them they
 * kept twenty-seven npm packages installed. None of it shipped to a
 * browser, because a module no import reaches is a module the bundler
 * never sees, which is exactly why nothing complained: every gate here
 * scanned those files, typecheck compiled them, and CI installed their
 * dependencies, all to serve code that could not run.
 *
 * Dead code is quiet. It has to be looked for on purpose, so it is looked
 * for here on every push.
 *
 * The one trap worth knowing: it is not enough to leave a file out of the
 * root list. The first version of this walk seeded from main.tsx, which
 * imports App.tsx, which imported the very pages being tested for, so the
 * closure under test leaked back into the live set one hop later and the
 * answer came out empty. A file is either a root or it is entered, never
 * filtered.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = "client/src";
const ENTRY = "client/src/main.tsx";

/**
 * Files reached by something other than an import, with the reason.
 *
 * A file listed here that HAS become reachable is also a failure: the note
 * would then be wrong, and a stale allowlist is how the next dead file gets
 * waved through.
 */
const REACHED_ANOTHER_WAY = new Map([
  [
    "client/src/lib/blogPosts.source.ts",
    'the archive\'s source of truth, read by script/stampUpdated.ts and script/syncPostBodies.ts rather than by the app',
  ],
  [
    "client/src/lib/crypto-shim.ts",
    'the target of vite.config.ts\'s "crypto" alias, so nothing names it by path',
  ],
]);

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const file = path.join(dir, entry);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });

const FILES = walk(ROOT).filter((f) => /\.tsx?$/.test(f));

/** A specifier to a file in the tree, or null for a package or an asset. */
function resolve(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return path.relative(".", c);
  }
  return null;
}

/**
 * Parsed on demand rather than only for FILES, because the walk leaves the
 * directory: client code imports server/storage.ts, and a module reached
 * only through that hop would otherwise look dead.
 */
const cache = new Map();
function importsOf(file) {
  const hit = cache.get(file);
  if (hit) return hit;
  const src = readFileSync(file, "utf8");
  const specs = [
    ...[...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    ...[...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
    ...[...src.matchAll(/^\s*export\s+[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]),
  ];
  const deps = specs.map((s) => resolve(file, s)).filter(Boolean);
  cache.set(file, deps);
  return deps;
}

if (!existsSync(ENTRY)) {
  console.error(`FAIL  ${ENTRY} does not exist, so this check proved nothing.`);
  console.error("      The entry point moved; point this script at the new one.");
  process.exit(1);
}

const reachable = new Set();
const stack = [ENTRY];
while (stack.length) {
  const file = stack.pop();
  if (reachable.has(file) || !/\.tsx?$/.test(file)) continue;
  reachable.add(file);
  for (const dep of importsOf(file)) stack.push(dep);
}

/** Only the ones this check is about: reachable can wander outside ROOT. */
const live = FILES.filter((f) => reachable.has(f));

if (live.length < 100) {
  console.error(`FAIL  only ${live.length} files under ${ROOT} are reachable from ${ENTRY}.`);
  console.error("      The import syntax this script parses probably changed; fix it.");
  process.exit(1);
}

const dead = FILES.filter((f) => !reachable.has(f) && !REACHED_ANOTHER_WAY.has(f));
const notDeadAfterAll = [...REACHED_ANOTHER_WAY.keys()].filter(
  (f) => reachable.has(f) || !existsSync(f),
);

if (dead.length || notDeadAfterAll.length) {
  if (dead.length) {
    console.error(`FAIL  ${dead.length} file(s) under ${ROOT} that no import reaches:\n`);
    for (const f of dead) console.error(`        ${f}`);
    console.error("\n      Delete them, or import them from something the app reaches.");
    console.error("      If one is loaded by a build script or a bundler alias, add it");
    console.error("      to REACHED_ANOTHER_WAY in this file with the reason.");
  }
  if (notDeadAfterAll.length) {
    console.error(`\nFAIL  ${notDeadAfterAll.length} allowlisted file(s) no longer need the exemption:`);
    for (const f of notDeadAfterAll) {
      console.error(`        ${f} ${existsSync(f) ? "is reachable by import now" : "no longer exists"}`);
    }
    console.error("\n      Drop the entry from REACHED_ANOTHER_WAY.");
  }
  process.exit(1);
}

console.log(
  `OK  all ${FILES.length} modules under ${ROOT} are reachable ` +
    `(${live.length} by import, ${REACHED_ANOTHER_WAY.size} another way).`,
);
