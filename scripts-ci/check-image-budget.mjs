#!/usr/bin/env node
/**
 * Per-image size budget for client/public/images.
 *
 * Everything in that tree is copied verbatim into dist/public by Vite and
 * shipped, so one careless export goes straight to every reader on the page
 * that references it. This repo had 123MB of unreferenced PNG exports in it
 * until recently, several of them over a megabyte each, for a blog whose
 * covers render at 800px wide. This check is the guard so that cannot creep
 * back one file at a time.
 *
 * The rule is per file, not a total: a total gets gamed by adding many
 * medium-sized images, and it is the single heavy image on the page someone
 * is actually reading that costs them.
 *
 * There is no image tooling in this project (no sharp, no imagemagick, and
 * no new dependencies allowed), so this reports rather than fixes. To get a
 * file under the limit: export JPEG at quality 80 and no wider than 1600px
 * for covers, 1200x630 for OG cards.
 *
 * Usage: node scripts-ci/check-image-budget.mjs
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const IMAGE_DIR = path.resolve("client/public/images");

/** 500 KiB. Largest file at the time of writing is 466 KiB. */
const MAX_BYTES = 500 * 1024;

const TOP_N = 10;

function fail(message) {
  console.error(`\nFAIL  ${message}\n`);
  process.exit(1);
}

function kib(bytes) {
  return `${(bytes / 1024).toFixed(0)} KiB`;
}

if (!existsSync(IMAGE_DIR)) {
  // Nothing to police. Not an error: the directory is allowed to be absent.
  console.log("client/public/images does not exist, nothing to check.");
  process.exit(0);
}

function walk(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.isFile()) found.push({ file: full, size: statSync(full).size });
  }
  return found;
}

const images = walk(IMAGE_DIR).sort((a, b) => b.size - a.size);

if (images.length === 0) {
  console.log("client/public/images is empty, nothing to check.");
  process.exit(0);
}

const total = images.reduce((sum, image) => sum + image.size, 0);

console.log(
  `${images.length} files under client/public/images, ` +
    `${(total / (1024 * 1024)).toFixed(1)} MiB total. ` +
    `Per-file limit ${kib(MAX_BYTES)}.`,
);
console.log(`\nTen largest:`);
for (const image of images.slice(0, TOP_N)) {
  const marker = image.size > MAX_BYTES ? "OVER" : "    ";
  console.log(`  ${marker} ${kib(image.size).padStart(9)}  ${path.relative(process.cwd(), image.file)}`);
}

const oversized = images.filter((image) => image.size > MAX_BYTES);

if (oversized.length > 0) {
  const detail = oversized
    .map((image) => `  ${kib(image.size).padStart(9)}  ${path.relative(process.cwd(), image.file)}`)
    .join("\n");
  fail(
    `${oversized.length} image(s) over the ${kib(MAX_BYTES)} limit:\n${detail}\n\n` +
      `  Re-export smaller, or delete the file if nothing references it.`,
  );
}

console.log(`\nOK  every image is under ${kib(MAX_BYTES)}.`);
