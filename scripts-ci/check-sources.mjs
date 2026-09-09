/**
 * Check that every source an article cites still resolves.
 *
 * Run on demand, never in CI:
 *
 *     node scripts-ci/check-sources.mjs            # every cited source
 *     node scripts-ci/check-sources.mjs iana.org   # just the ones matching
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
 * That cuts the other way too. A 404 from a host that is turning the client
 * away is not a statement about the page either, and neither code can be read
 * without knowing which of the two is happening. So every dead code now gets
 * a control request for the host's own front page. A host that will not serve
 * that is refusing the client; a host that serves it and 404s the document is
 * telling you the document is gone.
 *
 * The control paid for itself immediately by contradicting me. A cisa.gov
 * citation reported 404, and curl got 403 for that URL, for its parent and for
 * the site root, so I had it written down as bot management inventing a code.
 * The control asked with the same client the checker uses and got 200 from the
 * root and 404 from the document. CISA had removed the topic tree. The
 * citation was dead, the theory was wrong, and the difference between those
 * two is one request.
 *
 * And a 200 is not on its own proof that the page is there. A Cisco VLAN
 * security page cited in a draft answered 200 with no "native VLAN", no
 * "trunk" and no "802.1Q" anywhere in it, because the request had been
 * redirected to /c/en/us/support/index.html. A soft 404, which this file
 * would have accepted forever, because it read status codes and nothing
 * else. Every 200 is now checked for having come from where it was asked
 * for, which needs no response body and costs nothing.
 *
 * It found one on the first full run: an IANA registry cited at its old
 * .xhtml address, which now answers from the parent. Not a landing page in
 * that case but a restructure, and indistinguishable from one on the wire.
 * Either way the citation points somewhere that is no longer the document.
 *
 * HEAD is only ever an optimization. A server is free to answer it however it
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
      return { code: res.status, landed: res.url || url };
    } catch {
      if (method === "GET") return { code: 0, landed: url };
    }
  }
  return { code: 0, landed: url };
}

/**
 * Whether a 200 landed somewhere shallower than it was asked for.
 *
 * A soft 404: the document is gone and the server answers 200 with a landing
 * page instead of saying so. Found by hand, on a Cisco VLAN security page
 * cited in a draft. It returned 200 and contained no "native VLAN", no
 * "trunk" and no "802.1Q", because the request had been redirected to
 * /c/en/us/support/index.html. A check that reads status codes accepts that
 * link forever, and this file read only status codes.
 *
 * Detected without fetching the body, because comparing the requested path
 * against the one the response actually came from is enough and costs
 * nothing: a document that is there does not answer from its own parent.
 *
 * Deliberately conservative. Landing at the same depth or deeper is fine,
 * which allows the locale prefixes and .html suffixes that plenty of sites
 * add. A different host is a site move rather than a missing page. What is
 * flagged is landing on an ancestor of what was asked for, or on a bare
 * index page, both of which mean the address being cited is not the
 * document's address any more.
 *
 * One exclusion, because it would otherwise be the commonest false positive
 * here: /foo/index.html answering from /foo/ is trailing-slash normalization
 * and not a redirect away from anything. Those two are the same document by
 * a convention older than most of the sites cited on this site.
 */
function misdirected(requested, landed) {
  let want;
  let got;
  try {
    want = new URL(requested);
    got = new URL(landed);
  } catch {
    return false;
  }
  if (want.host !== got.host) return false;
  const segments = (u) => u.pathname.split("/").filter(Boolean);
  const asked = segments(want);
  const arrived = segments(got);
  if (arrived.length >= asked.length) return false;
  // /foo/index.html served from /foo/ is one document with two addresses.
  const last = asked[asked.length - 1] ?? "";
  if (/^index\.html?$/i.test(last) && arrived.length === asked.length - 1) return false;
  const isAncestor = arrived.every((segment, index) => segment === asked[index]);
  const isIndex = got.pathname === "/" || /(?:^|\/)index\.html?$/.test(got.pathname);
  return isAncestor || isIndex;
}

/*
  An optional substring filter, because the whole corpus takes twenty minutes
  and the question after fixing one citation is about one host:

      node scripts-ci/check-sources.mjs iana.org
*/
const only = process.argv[2];
const urls = [...sources.keys()].sort().filter((url) => !only || url.includes(only));
if (only && urls.length === 0) {
  console.error(`No cited source contains ${only}.`);
  process.exit(2);
}
console.log(
  only
    ? `Checking ${urls.length} of ${sources.size} sources, the ones matching ${only}.\n`
    : `Checking ${urls.length} distinct sources, serially. This takes a while.\n`,
);

// Worth another go rather than a verdict. A 5xx is the server having a bad
// minute, and 429 and 408 are it asking for less; none of them is a statement
// about whether the page is there.
const TRANSIENT = new Set([0, 408, 429, 500, 502, 503, 504]);

// The client being turned away. 418 belongs here with the rest: freedesktop
// answers every request for systemd's man pages with one, browser headers and
// all, which is a refusal to talk to us and not a missing page.
const REFUSED = new Set([401, 403, 418, 429, 451]);

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * Which bucket a checked source belongs in.
 *
 * Pure, and deliberately separated from the requests, because this is the
 * part that has been wrong twice and the only part a test can reach without
 * a network. `controlCode` is the host's answer for its own front page, and
 * it is needed only when the code looks dead.
 *
 * A code 0 is not transient here even though it is in that set: it means the
 * host never answered across four tries with a rising backoff, which is the
 * most definite rot there is, usually a lapsed domain.
 */
function verdict({ url, code, landed, controlCode }) {
  if (REFUSED.has(code)) return "refused";
  if (code !== 200 && code !== 0 && TRANSIENT.has(code)) return "flaky";
  if (code !== 200) return REFUSED.has(controlCode) ? "unverifiable" : "dead";
  return misdirected(url, landed) ? "misdirected" : "resolved";
}

const buckets = { refused: [], flaky: [], unverifiable: [], dead: [], misdirected: [], resolved: [] };
const controls = new Map();
let done = 0;

for (const url of urls) {
  let { code, landed } = await status(url);
  // Back off properly rather than retrying straight into the same throttle.
  // linux-kvm.org was reported dead on a 503 that answers 200 three times in
  // a row a moment later.
  for (let attempt = 1; attempt <= 3 && code !== 200 && TRANSIENT.has(code); attempt += 1) {
    await sleep(RETRY_PAUSE_MS * attempt);
    ({ code, landed } = await status(url));
  }

  /*
    A control, so a dead code can be read.

    A 404 means the document is gone only if the host was willing to talk at
    all. Ask it for its own front page with the same client: freedesktop.org
    answers 418 to that as it does to everything, which makes its 418 on a
    systemd man page a refusal and not a verdict. cisa.gov answers 200, which
    makes its 404 on a topic page real, whatever curl says about it.

    Only a dead-looking code needs one, so this costs one request per dead
    host, which is the whole point of a control: it does not need to scale.
  */
  let controlCode = null;
  if (verdict({ url, code, landed, controlCode: null }) === "dead") {
    const host = hostOf(url);
    if (!controls.has(host)) {
      controls.set(host, (await status(`https://${host}/`)).code);
      await sleep(PAUSE_MS);
    }
    controlCode = controls.get(host);
  }

  buckets[verdict({ url, code, landed, controlCode })].push({
    url,
    code,
    landed,
    controlCode,
    pages: [...(sources.get(url) ?? [])],
  });

  done += 1;
  if (done % 50 === 0) console.log(`  ${done}/${urls.length}`);
  await sleep(PAUSE_MS);
}

console.log(`\n${buckets.resolved.length} of ${urls.length} sources resolved.`);

if (buckets.refused.length) {
  console.log(
    `\n${buckets.refused.length} refused or throttled an automated request. That is the` +
      ` client, not the link:`,
  );
  for (const b of buckets.refused) console.log(`  ${b.code}  ${b.url}`);
}

if (buckets.flaky.length) {
  console.log(
    `\n${buckets.flaky.length} were still failing after four tries with a rising backoff.` +
      ` A 5xx or a timeout is the server, not the citation, so check these by` +
      ` hand before touching an article:`,
  );
  for (const f of buckets.flaky) console.log(`  ${f.code || "no response"}  ${f.url}`);
}

if (buckets.unverifiable.length) {
  console.log(
    `\n${buckets.unverifiable.length} looked dead from a host that will not serve its own` +
      ` front page either, so the code is about this client and the page cannot be` +
      ` checked from here:`,
  );
  for (const u of buckets.unverifiable) {
    console.log(`  ${u.code}  ${u.url}`);
    console.log(`      ${hostOf(u.url)} answered ${u.controlCode} for its own front page`);
    for (const p of u.pages.slice(0, 3)) console.log(`      cited by ${p}`);
  }
}

const broken = [...buckets.dead, ...buckets.misdirected];
if (broken.length) {
  console.log(`\n${broken.length} are not where the article says they are:`);
  for (const d of buckets.dead) {
    console.log(`  ${d.code || "no response"}  ${d.url}`);
    console.log(`      ${hostOf(d.url)} answered ${d.controlCode} for its own front page, so this is the document and not the client`);
    for (const p of d.pages.slice(0, 3)) console.log(`      cited by ${p}`);
  }
  for (const d of buckets.misdirected) {
    console.log(`  200  ${d.url}`);
    console.log(`      answered from ${d.landed}, which is shallower, so this is not the document's address any more`);
    for (const p of d.pages.slice(0, 3)) console.log(`      cited by ${p}`);
  }
  process.exit(1);
}

console.log("\nEvery source resolves.");
