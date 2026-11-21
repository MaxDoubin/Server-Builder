#!/usr/bin/env node
/**
 * IndexNow has to stay provable, and it has to stay opt-in.
 *
 * IndexNow (https://www.indexnow.org/documentation) only trusts a submission
 * if the site hosts <key>.txt at its root and that file contains the key.
 * Google does not use IndexNow; this is for Bing, Yandex, Seznam, Naver and
 * the other engines that do.
 *
 * Two ways this goes wrong without anyone noticing:
 *
 *   1. The key file stops being right. It is renamed without its contents, a
 *      second one is added during a rotation, an editor appends a newline, or
 *      the build stops copying it. Every submission then comes back 403 and
 *      nothing here would say why.
 *   2. script/indexnow.ts quietly starts sending. It is a script a person
 *      runs after a deploy, and a default that submits turns a test run, a
 *      typo or a CI step into a real request to a third party.
 *
 * The key is public by design, so reading and printing it here is fine.
 *
 * Usage: node scripts-ci/check-indexnow.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const PUBLIC_DIR = "client/public";
const DIST_DIR = "dist/public";
const SCRIPT = "script/indexnow.ts";

/** The documented key: 8 to 128 characters of a-z, A-Z, 0-9 and hyphen. */
const KEY_FILE = /^([A-Za-z0-9-]{8,128})\.txt$/;

const problems = [];

/* 1. Exactly one root key file, and it contains exactly its own name. */

const valid = [];
for (const name of readdirSync(PUBLIC_DIR)) {
  const match = name.match(KEY_FILE);
  if (!match || !statSync(path.join(PUBLIC_DIR, name)).isFile()) continue;
  const body = readFileSync(path.join(PUBLIC_DIR, name), "utf8");
  if (body === match[1]) valid.push(name);
  // Names that merely look like keys (security.txt has eight letters) are
  // ignored. A file whose only fault is stray whitespace is not one of them.
  else if (body.trim() === match[1]) {
    problems.push(`${PUBLIC_DIR}/${name} has whitespace around the key. It must contain the key and nothing else.`);
  }
}

if (valid.length !== 1) {
  problems.push(
    `expected exactly one IndexNow key file in ${PUBLIC_DIR}/ (<key>.txt containing only the key), found ${valid.length}` +
      (valid.length ? `: ${valid.join(", ")}` : "."),
  );
}

/* The build has to carry it to the root of the deployed site. */

let built = "not built, so the deployed copy was not checked";
if (valid.length === 1 && existsSync(DIST_DIR)) {
  const copy = path.join(DIST_DIR, valid[0]);
  if (!existsSync(copy)) problems.push(`${copy} is missing. The build did not copy the key file to the site root.`);
  else if (readFileSync(copy, "utf8") !== valid[0].replace(/\.txt$/, "")) problems.push(`${copy} differs from its source.`);
  else built = "the build copied it to the site root";
}

/* 2. The script sends only on an explicit --submit. */

const script = readFileSync(SCRIPT, "utf8");

if (!/const\s+submit\s*=\s*args\.includes\(\s*"--submit"\s*\)/.test(script)) {
  problems.push(`${SCRIPT} must decide the mode from an explicit --submit flag: const submit = args.includes("--submit").`);
}
if (!/return\s+submit\s*\?\s*"submit"\s*:\s*"dry-run"/.test(script)) {
  problems.push(`${SCRIPT} must default to "dry-run" when --submit is absent.`);
}

// The dry-run early return has to come before the first real send.
const dryRunReturn = script.search(/if\s*\(\s*mode\s*===\s*"dry-run"\s*\)/);
const firstSend = script.search(/\bawait\s+submitBatches\(/);
if (dryRunReturn === -1 || firstSend === -1 || dryRunReturn > firstSend) {
  problems.push(`${SCRIPT} must return from the dry-run branch before it first calls submitBatches.`);
}

const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts ?? {};
for (const name of ["indexnow", "indexnow:dry"]) {
  const command = scripts[name];
  if (typeof command !== "string" || !command.includes(SCRIPT)) {
    problems.push(`package.json script "${name}" must run ${SCRIPT}.`);
  } else if (command.includes("--submit")) {
    problems.push(`package.json script "${name}" must not hard-code --submit. Sending is typed at the prompt.`);
  }
}

if (problems.length) {
  console.error(`\ncheck-indexnow: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(`check-indexnow: key file ${valid[0]} holds its own name (${built}); ${SCRIPT} defaults to dry-run.`);
