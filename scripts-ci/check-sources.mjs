/**
 * Check that every source an article cites still resolves.
 *
 * Run on demand, never in CI:
 *
 *     node scripts-ci/check-sources.mjs
 *
 * A build gate here would be actively harmful. The archive cites 854 distinct
 * URLs across 90 domains, so a build gate would fail whenever any one of
 * ninety third parties had a bad minute, and the fix would never be in this
 * repository. Worse, it teaches everyone to ignore a red build.
 *
 * The methodology matters more than the tool. A first pass at this ran twelve
 * requests in parallel and reported five dead links. Four of them were NIST
 * rate limiting: re-checked one at a time they were all 200. So this runs
 * serially with a pause, and re-checks anything that fails before reporting
 * it. It is slow on purpose; a fast link checker that cries wolf is worse
 * than no link checker.
 *
 * URLs are read from the built HTML rather than the markdown, because a
 * regex over markdown truncates a URL at its first close paren and
 * https://en.wikipedia.org/wiki/Ceph_(software) then looks dead when the
 * rendered page links it correctly.
 *
 * 403 and 429 are reported separately from 404. GitHub and Cisco refuse an
 * automated request outright, and docs.zeek.org throttles one, so both say
 * something about the client rather than about the link.
 *
 * HEAD is only ever an optimisation. A server is free to answer it however it
 * likes, and several do so wrongly: nvlpubs.nist.gov answers HEAD on a PDF
 * that is plainly there with a 404, and answers GET on the same URL with a
 * 200. Two live citations were reported dead that way. So a HEAD is believed
 * only when it says 200, and anything else is confirmed with a GET before it
 * counts.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const DIST = path.resolve("dist/public");
const PAUSE_MS = 400;
const RETRY_PAUSE_MS = 3000;
const TIMEOUT_MS = 20000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (e.endsWith(".html")) out.push(full);
  }
  return out;
}

/** Links inside <article>, which is the prose rather than the site chrome. */
function articleLinks(html) {
  const start = html.indexOf("<article");
  if (start === -1) return [];
  const end = html.indexOf("</article>", start);
  const body = html.slice(start, end === -1 ? html.length : end);
  return [...body.matchAll(/href="(https?:\/\/[^"]+)"/g)]
    .map((m) => m[1].replace(/&amp;/g, "&"))
    .filter((u) => !u.includes("maxdoubin.com"));
}

const sources = new Map(); // url -> Set of pages citing it
for (const file of walk(DIST)) {
  const rel = path.relative(DIST, file);
  for (const url of articleLinks(readFileSync(file, "utf8"))) {
    if (!sources.has(url)) sources.set(url, new Set());
    sources.get(url).add(rel);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function status(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // Only a 200 from a HEAD is worth believing. Everything else is a
      // statement about how the server treats HEAD, which is not the
      // question, so confirm it with the GET the reader would make.
      if (method === "HEAD" && res.status !== 200) continue;
      return res.status;
    } catch {
      if (method === "GET") return 0;
    }
  }
  return 0;
}

const urls = [...sources.keys()].sort();
console.log(`Checking ${urls.length} distinct sources, serially. This takes a while.\n`);

const dead = [];
const blocked = [];
const flaky = [];
let done = 0;

// Worth another go rather than a verdict. A 5xx is the server having a bad
// minute, and 429 and 408 are it asking for less; none of them is a statement
// about whether the page is there.
const TRANSIENT = new Set([0, 408, 429, 500, 502, 503, 504]);

for (const url of urls) {
  let code = await status(url);
  // Back off properly rather than retrying straight into the same throttle.
  // linux-kvm.org was reported dead on a 503 that answers 200 three times in
  // a row a moment later.
  for (let attempt = 1; attempt <= 3 && code !== 200 && TRANSIENT.has(code); attempt += 1) {
    await sleep(RETRY_PAUSE_MS * attempt);
    code = await status(url);
  }

  if (code === 401 || code === 403 || code === 429) blocked.push({ url, code });
  // A host that never answers at all is worth retrying, but a host that has
  // still not answered after four tries is the most definite rot there is:
  // usually a domain that lapsed. That one stays in the dead list.
  else if (code !== 200 && code !== 0 && TRANSIENT.has(code)) flaky.push({ url, code });
  else if (code !== 200) dead.push({ url, code, pages: [...sources.get(url)] });

  done += 1;
  if (done % 50 === 0) console.log(`  ${done}/${urls.length}`);
  await sleep(PAUSE_MS);
}

const resolved = urls.length - dead.length - blocked.length - flaky.length;
console.log(`\n${resolved} of ${urls.length} sources resolved.`);

if (blocked.length) {
  console.log(
    `\n${blocked.length} refused or throttled an automated request. That is the` +
      ` client, not the link:`,
  );
  for (const b of blocked) console.log(`  ${b.code}  ${b.url}`);
}

if (flaky.length) {
  console.log(
    `\n${flaky.length} were still failing after four tries with a rising backoff.` +
      ` A 5xx or a timeout is the server, not the citation, so check these by` +
      ` hand before touching an article:`,
  );
  for (const f of flaky) console.log(`  ${f.code || "no response"}  ${f.url}`);
}

if (dead.length) {
  console.log(`\n${dead.length} answered definitively that the page is not there:`);
  for (const d of dead) {
    console.log(`  ${d.code || "no response"}  ${d.url}`);
    for (const p of d.pages.slice(0, 3)) console.log(`      cited by ${p}`);
  }
  process.exit(1);
}

console.log("\nEvery source resolves.");
