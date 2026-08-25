#!/usr/bin/env node
/**
 * Check that every external link in the writing still resolves.
 *
 * Run on demand, not in CI: this hits the network several hundred times and
 * a build should not fail because someone else's server had a bad minute.
 *
 *   node script/checkPostLinks.mjs            # check everything
 *   node script/checkPostLinks.mjs --json     # machine readable report
 *
 * Two things make the naive version of this script lie:
 *
 *   1. URLs inside fenced code blocks are examples, not citations.
 *      http://127.0.0.1:3000 in an nginx config is not a broken link.
 *   2. Several hosts return 403 or 418 to anything that is not a consumer
 *      browser, including this checker. Those are listed in BLOCKS_ROBOTS
 *      below, and a non-200 from one of them is reported as UNCHECKABLE
 *      rather than BROKEN, because failing them would train whoever runs
 *      this to ignore the output.
 *
 * Anything reported BROKEN is a real defect. Fix the link or remove it; do
 * not add the host to BLOCKS_ROBOTS to make the report go green.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POSTS_DIR = path.join(ROOT, "client/src/content/posts");

/**
 * Hosts that refuse non-browser clients from a datacenter address.
 *
 * Every URL on one of these hosts was opened by hand before being added to
 * a post, so a non-200 here means the host is filtering the checker rather
 * than that the page is gone.
 */
const BLOCKS_ROBOTS = new Set([
  // Oracle fronts the MySQL manual with a filter that returns 403 to
  // anything without a browser fingerprint. The pages are live.
  "dev.mysql.com",
  // Cisco does the same to its documentation from a datacenter address.
  // Every cisco.com URL cited here was opened and read before being added.
  "www.cisco.com",
]);

const CONCURRENCY = 8;
const TIMEOUT_MS = 30_000;
const RETRY_STATUS = new Set([0, 429, 502, 503, 504]);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const URL_RE = /https?:\/\/[^\s<>"'`\]]+/g;

/** Pull citation URLs out of one post, skipping fenced and inline code. */
function extractUrls(markdown) {
  const urls = new Map();
  let inFence = false;
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const withoutCode = line.replace(/`[^`]*`/g, "");
    for (const match of withoutCode.matchAll(URL_RE)) {
      let url = match[0].replace(/[.,;:]+$/, "");
      // A markdown link's closing paren is not part of the URL, but a
      // Wikipedia title like Ceph_(software) legitimately ends in one.
      while (url.endsWith(")") && countChar(url, ")") > countChar(url, "(")) {
        url = url.slice(0, -1);
      }
      url = url.replace(/[.,;:]+$/, "");
      if (!url) continue;
      if (!urls.has(url)) urls.set(url, i + 1);
    }
  }
  return urls;
}

function countChar(text, char) {
  let n = 0;
  for (const c of text) if (c === char) n += 1;
  return n;
}

async function statusOf(url) {
  let last = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let status = 0;
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/pdf,*/*" },
      });
      status = res.status;
      // Drain so the socket can be reused rather than left half open.
      await res.arrayBuffer().catch(() => undefined);
    } catch {
      status = 0;
    } finally {
      clearTimeout(timer);
    }
    last = status;
    if (!RETRY_STATUS.has(status)) return status;
    // Several documentation hosts rate limit a burst of requests from one
    // address. Back off hard rather than reporting their throttling as a
    // dead link.
    await new Promise((r) => setTimeout(r, (attempt + 1) * 8000));
  }
  return last;
}

async function main() {
  const asJson = process.argv.includes("--json");
  const files = (await readdir(POSTS_DIR)).filter((f) => f.endsWith(".md")).sort();

  /** url -> [{file, line}] */
  const sites = new Map();
  for (const file of files) {
    const body = await readFile(path.join(POSTS_DIR, file), "utf8");
    for (const [url, line] of extractUrls(body)) {
      if (!sites.has(url)) sites.set(url, []);
      sites.get(url).push({ file, line });
    }
  }

  const urls = [...sites.keys()].sort();
  if (!asJson) {
    console.log(`Checking ${urls.length} unique URLs across ${files.length} posts.`);
  }

  /**
   * Read the Docs and a few others throttle a burst from one address, so a
   * URL that comes back 429 or times out under load gets one more try on
   * its own, slowly, before it is called broken.
   */
  const RATE_LIMITED = new Set([408, 429, 500, 502, 503, 504, 0]);

  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      const status = await statusOf(url);
      const host = safeHost(url);
      const ok = status >= 200 && status < 300;
      const verdict = ok
        ? "OK"
        : BLOCKS_ROBOTS.has(host)
          ? "UNCHECKABLE"
          : "BROKEN";
      results.push({ url, status, verdict, cites: sites.get(url) });
      if (!asJson && verdict !== "OK") {
        console.log(`${verdict.padEnd(11)} ${String(status).padStart(3)}  ${url}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const suspect = results.filter(
    (r) => r.verdict === "BROKEN" && RATE_LIMITED.has(r.status),
  );
  if (suspect.length > 0) {
    if (!asJson) {
      console.log("");
      console.log(`Re-checking ${suspect.length} throttled URLs one at a time.`);
    }
    for (const entry of suspect) {
      await new Promise((r) => setTimeout(r, 4000));
      const status = await statusOf(entry.url);
      entry.status = status;
      if (status >= 200 && status < 300) {
        entry.verdict = "OK";
      } else if (RATE_LIMITED.has(status)) {
        entry.verdict = "UNCHECKABLE";
      }
      if (!asJson) {
        console.log(`  ${entry.verdict.padEnd(11)} ${String(status).padStart(3)}  ${entry.url}`);
      }
    }
  }

  const broken = results.filter((r) => r.verdict === "BROKEN");
  const unchecked = results.filter((r) => r.verdict === "UNCHECKABLE");

  if (asJson) {
    console.log(JSON.stringify({ total: results.length, broken, unchecked }, null, 2));
  } else {
    console.log("");
    console.log(`  checked      ${results.length}`);
    console.log(`  resolved     ${results.length - broken.length - unchecked.length}`);
    console.log(`  robot walled ${unchecked.length}`);
    console.log(`  broken       ${broken.length}`);
    for (const b of broken) {
      for (const c of b.cites) console.log(`    ${c.file}:${c.line}  ${b.url}`);
    }
  }

  process.exit(broken.length === 0 ? 0 : 1);
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
