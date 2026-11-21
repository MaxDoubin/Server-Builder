/**
 * Tell IndexNow search engines which URLs are new or changed.
 *
 * IndexNow (https://www.indexnow.org/documentation) is a push protocol: the
 * site POSTs a list of URLs to one endpoint and every participating engine
 * (Bing, Yandex, Seznam, Naver and others) gets the same notice. It is a hint
 * to come and crawl, not a ranking signal and not a guarantee of indexing.
 * GOOGLE DOES NOT USE INDEXNOW. Nothing here reaches Google. Google finds
 * pages through sitemap.xml and its own crawl, so keep submitting the sitemap
 * in Search Console for that.
 *
 * The protocol, as the documentation states it:
 *
 *   - The key is 8 to 128 characters of a-z, A-Z, 0-9 and hyphen.
 *   - It is proved by hosting a UTF-8 text file named <key>.txt at the site
 *     root that contains the key. This repo ships one in client/public, so it
 *     is deployed with the site. The key is PUBLIC by design: anyone can read
 *     it at that URL, which is the whole point of the check, so committing it
 *     is correct and printing it here leaks nothing.
 *   - A batch is a JSON POST (Content-Type: application/json; charset=utf-8)
 *     with host, key, keyLocation and urlList, at most 10,000 URLs, and every
 *     URL must belong to host.
 *   - 200 means received, 202 means received with key validation pending.
 *     400 invalid format, 403 key not valid (file missing or wrong contents),
 *     422 URLs not on the host or key fails the schema, 429 too many requests.
 *
 * SAFE BY DEFAULT. With no flags this prints what it WOULD send and sends
 * nothing: no request to any host, not even a preflight. Sending needs an
 * explicit --submit. scripts-ci/check-indexnow.mjs keeps it that way.
 *
 *   npx tsx script/indexnow.ts                       # dry run (the default)
 *   npx tsx script/indexnow.ts --dry-run             # same, spelled out
 *   npx tsx script/indexnow.ts --since 2026-11-01    # only URLs with a newer lastmod
 *   npx tsx script/indexnow.ts --sitemap path.xml    # default: dist/public/sitemap.xml
 *   npx tsx script/indexnow.ts --submit              # really send, after a deploy
 *
 * Submitting reads no environment variable, no token and no credential, and
 * the only things it prints are the host, the key file URL, counts, a few
 * sample URLs and each response's status code.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HOST = "maxdoubin.com";
const SITE = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

/** Documented ceiling for one POST. */
const MAX_URLS_PER_REQUEST = 10_000;

const PUBLIC_DIR = "client/public";
const DEFAULT_SITEMAP = "dist/public/sitemap.xml";

/** The documented key shape, with the .txt a key file carries. */
const KEY_FILE = /^([A-Za-z0-9-]{8,128})\.txt$/;

export type SitemapEntry = { loc: string; lastmod?: string };

export type Payload = { host: string; key: string; keyLocation: string; urlList: string[] };

export type Mode = "dry-run" | "submit";

/**
 * The one place the mode is decided. Anything other than an explicit
 * --submit is a dry run, and asking for both is an error rather than a guess.
 */
export function resolveMode(args: string[]): Mode {
  const submit = args.includes("--submit");
  if (submit && args.includes("--dry-run")) {
    throw new Error("--submit and --dry-run contradict each other. Pick one.");
  }
  return submit ? "submit" : "dry-run";
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

const unescapeXml = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_m, name: string) => XML_ENTITIES[name]);

/** Every <url> in a sitemap, with its lastmod where it has one. */
export function parseSitemap(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = block[1].match(/<loc>\s*([^<]*?)\s*<\/loc>/)?.[1];
    if (!loc) continue;
    const lastmod = block[1].match(/<lastmod>\s*([^<]*?)\s*<\/lastmod>/)?.[1];
    entries.push({ loc: unescapeXml(loc), ...(lastmod ? { lastmod } : {}) });
  }
  return entries;
}

/**
 * Keep entries whose lastmod is on or after `since`.
 *
 * An entry with no lastmod cannot be shown to have changed, and IndexNow asks
 * for URLs that were added, updated or deleted, so it is left out and counted.
 * Run without --since to send everything.
 */
export function changedSince(entries: SitemapEntry[], since: number) {
  const kept: SitemapEntry[] = [];
  let undated = 0;
  for (const entry of entries) {
    const time = entry.lastmod ? Date.parse(entry.lastmod) : NaN;
    if (Number.isNaN(time)) undated += 1;
    else if (time >= since) kept.push(entry);
  }
  return { kept, undated };
}

/** Split into batches no larger than `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

/**
 * The key, found the way the CI gate finds it: the one root .txt file in
 * client/public whose name is a valid key and whose contents are that key.
 */
export function findKey(publicDir = PUBLIC_DIR): string {
  const keys = readdirSync(publicDir).flatMap((name) => {
    const match = name.match(KEY_FILE);
    if (!match) return [];
    return readFileSync(path.join(publicDir, name), "utf8") === match[1] ? [match[1]] : [];
  });
  if (keys.length !== 1) {
    throw new Error(
      `expected exactly one IndexNow key file in ${publicDir}/ (<key>.txt containing only the key), found ${keys.length}.`,
    );
  }
  return keys[0];
}

/** What each documented status means, in words that say what to do next. */
function explain(status: number): string {
  switch (status) {
    case 200:
      return "received";
    case 202:
      return "received, key validation pending";
    case 400:
      return "invalid format. The request body was malformed.";
    case 403:
      return "key not valid. The key file is missing at keyLocation or does not contain the key. Deploy it, then retry.";
    case 422:
      return "unprocessable. A URL is not on the host, or the key does not match the protocol's schema.";
    case 429:
      return "too many requests, possibly flagged as spam. Stop and wait before trying again.";
    default:
      return "unexpected status, not one the documentation lists";
  }
}

type Fetch = typeof fetch;

/**
 * Before sending anything, confirm the key file is live at the root. An
 * engine that cannot fetch it answers 403, and repeated failures look like
 * spam. A redirect is refused rather than followed: the protocol asks for
 * the file at this exact address.
 */
export async function keyIsLive(payload: Payload, fetchImpl: Fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(payload.keyLocation, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (res.status !== 200) return `${payload.keyLocation} answered ${res.status}, expected 200`;
    const body = await res.text();
    if (body.trim() !== payload.key) return `${payload.keyLocation} does not contain the key`;
    return null;
  } catch (err) {
    return `${payload.keyLocation} could not be fetched (${err instanceof Error ? err.message : String(err)})`;
  }
}

/**
 * POST each batch in order. Stops at the first failure: after a 403 or a 429
 * the next batch would only repeat it. Returns true when every batch got a
 * 200 or a 202.
 */
export async function submitBatches(
  payloads: Payload[],
  fetchImpl: Fetch = fetch,
  log: (line: string) => void = console.log,
): Promise<boolean> {
  for (const [index, payload] of payloads.entries()) {
    const label = `batch ${index + 1} of ${payloads.length} (${payload.urlList.length} URLs)`;
    let status: number;
    try {
      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
      status = res.status;
    } catch (err) {
      log(`${label}: request failed (${err instanceof Error ? err.message : String(err)})`);
      return false;
    }
    const ok = status === 200 || status === 202;
    log(`${label}: HTTP ${status}, ${explain(status)}`);
    if (!ok) return false;
  }
  return true;
}

function flagValue(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  if (at === -1) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
  return value;
}

const KNOWN_FLAGS = new Set(["--submit", "--dry-run", "--sitemap", "--since"]);

async function main(args: string[]) {
  const unknown = args.filter((a) => a.startsWith("--") && !KNOWN_FLAGS.has(a));
  if (unknown.length) throw new Error(`unknown option ${unknown.join(", ")}`);

  const mode = resolveMode(args);

  const sitemapPath = flagValue(args, "--sitemap") ?? DEFAULT_SITEMAP;
  let xml: string;
  try {
    xml = readFileSync(sitemapPath, "utf8");
  } catch {
    throw new Error(`cannot read ${sitemapPath}. Run "npm run build" first, or pass --sitemap <path>.`);
  }

  let entries = parseSitemap(xml);
  if (entries.length === 0) throw new Error(`${sitemapPath} lists no URLs, so there is nothing to submit.`);

  const offHost = entries.filter((e) => !e.loc.startsWith(`${SITE}/`));
  if (offHost.length) {
    console.log(`skipping ${offHost.length} URL(s) that are not on ${HOST}, which IndexNow would reject with 422`);
    entries = entries.filter((e) => e.loc.startsWith(`${SITE}/`));
  }

  const sinceArg = flagValue(args, "--since");
  let undated = 0;
  if (sinceArg !== undefined) {
    const since = Date.parse(sinceArg);
    if (Number.isNaN(since)) throw new Error(`--since "${sinceArg}" is not a date. Use ISO 8601, e.g. 2026-11-01.`);
    ({ kept: entries, undated } = changedSince(entries, since));
  }

  const urls = [...new Set(entries.map((e) => e.loc))];
  const key = findKey();
  const keyLocation = `${SITE}/${key}.txt`;
  const payloads: Payload[] = chunk(urls, MAX_URLS_PER_REQUEST).map((urlList) => ({
    host: HOST,
    key,
    keyLocation,
    urlList,
  }));

  console.log(`IndexNow ${mode === "submit" ? "SUBMIT" : "DRY RUN"}`);
  console.log(`  host         ${HOST}`);
  console.log(`  key location ${keyLocation}`);
  console.log(`  sitemap      ${sitemapPath}`);
  if (sinceArg !== undefined) {
    console.log(`  since        ${sinceArg} (${undated} URL(s) with no lastmod left out)`);
  }
  console.log(`  URLs         ${urls.length} in ${payloads.length} batch(es) of at most ${MAX_URLS_PER_REQUEST}`);
  for (const url of urls.slice(0, 5)) console.log(`    ${url}`);
  if (urls.length > 5) console.log(`    ... and ${urls.length - 5} more`);

  if (mode === "dry-run") {
    console.log("\nDry run: nothing was sent. Add --submit to send, once the key file is live at the root.");
    return;
  }

  if (urls.length === 0) {
    console.log("\nNothing to submit.");
    return;
  }

  const problem = await keyIsLive(payloads[0]);
  if (problem) throw new Error(`not submitting: ${problem}. Deploy first so the key file is live at the root.`);
  console.log("  key file is live at the root");

  if (!(await submitBatches(payloads))) process.exit(1);
  console.log("\nDone. This notifies IndexNow engines only. Google does not use IndexNow.");
}

// Run only when invoked directly, so the helpers above can be imported.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`indexnow: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
