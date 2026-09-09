/**
 * Static pre-renderer for maxdoubin.com
 *
 * Runs after `vite build` and writes per-page HTML files into dist/public.
 * Each file contains correct <title>, <meta>, <link rel="canonical">, JSON-LD
 * schema, and the full rendered blog content inside the <div id="root"> so
 * Google can read everything without executing JavaScript.
 *
 * React's createRoot will take over the root div when JS loads. The page
 * content is identical, so there is no visible flash for users.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { Marked } from "marked";
import { scrollableTables } from "../client/src/lib/markdownTables";
import { uniqueHeadingId } from "../client/src/lib/headingSlug";
import { RACKS, KIND_LABELS, portSummary, publishedWatts, unitsUsed } from "../client/src/lib/racks";
import { staticEquipmentCatalog } from "../client/src/lib/static-equipment";
import { FIELD_LABEL, TERMS, slugFor } from "../client/src/lib/glossary/index";
import { CASES as TRANSFERS, analyse, rate, size } from "../client/src/lib/transfer/index";
import { CASES as LOGS, render as renderLine } from "../client/src/lib/logs/index";
import { PATHS as MTU_PATHS, PING_DEFAULT, mssFor, pathMtu, pingLies } from "../client/src/lib/mtu/index";
import { CASES as PERMISSION_CASES, octal as modeOctal, symbolic as lsLine } from "../client/src/lib/permissions/index";
import { FINDINGS as PATCH_FINDINGS, PRIORITY_LABEL, byPriority, byScore, invertedPairs, priorityFor, worstMove } from "../client/src/lib/patch/index";
import { CHAINS as RETRY_CHAINS, amplification, elapsed as retryElapsed, ms as retryMs, orphaned as retryOrphaned, requestsAt, truncatingCaller } from "../client/src/lib/retry/index";
import { PATHS as VLAN_PATHS, accessVlanOf, canonical as vlanAnswer, carry, nativeMismatches, nativeVlanOf, onWire } from "../client/src/lib/vlan/index";
import { CASES as CLOCK_CASES, narrowed as clockNarrowed, passing as clockPassing, spanText as clockSpan, toleranceSpread as clockToleranceSpread, tolerances as clockToleranceList } from "../client/src/lib/clock/index";
import { CASES as CACHE_CASES, SHARED as CACHE_SHARED, hits as cacheHits, leakAt as cacheLeakAt, replay as cacheReplay, varyOn as cacheVaryOn } from "../client/src/lib/cache/index";
import { CASES as THROTTLE_CASES, asCpuMax as thrMax, asCpuStat as thrStat, everThrottled as thrEver, exhaustsAt as thrExhausts, finishesAt as thrFinishes, limitCpus as thrLimit, ms as thrMs, rate as thrRate, run as thrRun, stat as thrStatOf, correctOption as thrCorrect } from "../client/src/lib/throttle/index";
import { CASES as LOAD_CASES, LOAD_FREQ as loadFreq, blame as loadBlame, clock as loadClock, correctOption as loadCorrect, countsAt as loadCounts, peak as loadPeak, perCore as loadPerCore, procLine as loadProc, readAt as loadReadAt, run as loadRun, windowOf as loadWindow } from "../client/src/lib/load/index";
import { CASES as ALERT_CASES, asYaml as alertYaml, clock as alertClock, correctOption as alertCorrect, evaluationTimes as alertTicks, firesAt as alertFires, run as alertRun, staleFrom as alertStale } from "../client/src/lib/alerts/index";
import { CASES as NAT_CASES, OUTCOME_LABEL as NAT_OUTCOME, correctOption as natCorrect, isPrivate as natIsPrivate, trace as natTrace, wanRoutable as natRoutable } from "../client/src/lib/nat/index";
import { CASES as UNIT_CASES, correctOption as unitCorrect, directivesOf as unitDirectives, levels as unitLevels, meansStarted as unitMeansStarted, outcomeOf as unitOutcome } from "../client/src/lib/units/index";
import { CASES as OOM_CASES, adjWorth as oomAdjWorth, fattestSurvives as oomFattestSurvives, human as oomHuman, killed as oomKilled, correctOption as oomCorrect, scope as oomScope, scored as oomScored } from "../client/src/lib/oom/index";
import { CASES as SPACE_CASES, CAUSE_LABEL as SPACE_CAUSE, availableTo as spaceAvailableTo, candidates as spaceCandidates, dfAvailable, dfPercent, dfUsed, duTotal, errnoFor as spaceErrno, failure as spaceFailure, human as spaceHuman, inodePercent, invisible as spaceInvisible, reserved as spaceReserved, tell as spaceTell } from "../client/src/lib/space/index";
import { TABLES as ROUTE_TABLES, lookup as routeLookup, prefixOf } from "../client/src/lib/route/index";
import { SCENARIOS as RESTORES, domains as failureDomains } from "../client/src/lib/restore/index";
import { GROUPS, GROUP_BLURB, GROUP_HEADING, PRACTISE_SURFACES } from "../client/src/lib/practiseSurfaces";

// ─── import blog data (tsx handles .ts extensions at runtime) ────────────────
// postIndex is plain data with no Vite-only syntax in it, so it imports
// cleanly here. lib/blogPosts.ts cannot: it reaches for the bodies through
// import.meta.glob, which only exists inside a Vite build.
const { postIndex } = await import("../client/src/lib/postIndex.ts");
const { pageTitle } = await import("../client/src/lib/pageTitle.ts");
const { NCL_GUIDES: NCL_GUIDE_DATA } = await import("../client/src/lib/nclGuides.ts");
const { getTagPage } = await import("../client/src/lib/tagPages.ts");
const { EXAMS } = await import("../client/src/lib/examObjectives.ts");
const { TAG_PAGES } = await import("../client/src/lib/tagPages.ts");
const { TOOLS } = await import("../client/src/lib/toolsRegistry.ts");
const { formatPostDate } = await import("../client/src/lib/formatDate.ts");
const { FAQS } = await import("../client/src/lib/faqs.ts");
const { KIT_SESSIONS, KIT_RULES, KIT_RESOURCES } = await import("../client/src/lib/clubKit.ts");
const { siteConfig, PRESS } = await import("../client/src/lib/siteConfig.ts");
const { clubConfig } = await import("../client/src/lib/clubConfig.ts");
const { nowConfig } = await import("../client/src/lib/nowConfig.ts");
const { usesConfig } = await import("../client/src/lib/usesConfig.ts");
const { readingPaths } = await import("../client/src/lib/readingPaths.ts");
const { TIMELINE_GROUPS } = await import("../client/src/lib/timelineConfig.ts");
const { ALL_CERTS } = await import("../client/src/lib/certConfig.ts");
const { ROADMAP, ROADMAP_UPDATED, roadmapCounts } = await import("../client/src/lib/roadmap.ts");
const { DECKS } = await import("../client/src/lib/flashcardDecks.ts");
const { LINK_GROUPS } = await import("../client/src/lib/linksConfig.ts");
const { STACK, DECISIONS } = await import("../client/src/lib/colophonConfig.ts");
const { READERS } = await import("../client/src/lib/subscribeConfig.ts");
const { ANSWERED } = await import("../client/src/lib/askConfig.ts");
const { COVERS, TAKEAWAYS } = await import("../client/src/lib/campsConfig.ts");
const { DAY_CHECKLIST, MISTAKES } = await import("../client/src/lib/nclHubConfig.ts");
const { TOOL_NOTES } = await import("../client/src/lib/toolNotes.ts");
const { SCENARIOS } = await import("../client/src/lib/scenarios/index.ts");
const { LABS } = await import("../client/src/lib/labs/labs.ts");
const { CHALLENGES } = await import("../client/src/lib/challenges/index.ts");
const { MESSAGES: TRIAGE_MESSAGES } = await import("../client/src/lib/triage/index.ts");
const { EXERCISES: FIREWALL } = await import("../client/src/lib/firewall/data/exercises.ts");
const { CASES: DNS_CASES } = await import("../client/src/lib/resolve/data/cases.ts");
const { CHAIN_CASES } = await import("../client/src/lib/chain/data/cases.ts");
const { PROBLEMS: PLANS } = await import("../client/src/lib/allocate/data/problems.ts");
const { CONFIGS: ARRAY_CONFIGS } = await import("../client/src/lib/array/data/configs.ts");
const { HANDSHAKES } = await import("../client/src/lib/handshake/data/handshakes.ts");
const { CAPTURES } = await import("../client/src/lib/capture/index.ts");
const { DIFFICULTY_LABEL, DIFFICULTY_BLURB, GRADE_LABEL, pathCount } = await import(
  "../client/src/lib/scenarios/types.ts"
);
const POSTS_DIR = path.resolve("client/src/content/posts");

/** One post's markdown, straight off disk. */
async function readBody(slug: string): Promise<string> {
  return readFile(path.join(POSTS_DIR, `${slug}.md`), "utf-8");
}

// ─── constants ───────────────────────────────────────────────────────────────
const SITE_URL = "https://maxdoubin.com";
const DIST = path.resolve("dist/public");
const BATCH = 10; // blog posts per parallel batch

const marked = new Marked({ gfm: true, breaks: true });
marked.use(scrollableTables);

// ─── helpers ─────────────────────────────────────────────────────────────────

/*
  Escapes, and tolerates a missing value.

  Three entries in the vendor catalogue arrived with a null description and
  a null SKU, and because this took a plain string it did not produce a page
  with a gap in it, it took the whole prerender down at the last step with a
  stack trace pointing at the escaper rather than at the data. A field that
  is not there should render as nothing.
*/
function esc(str: string | null | undefined): string {
  if (str == null) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/*
  Make a value safe to interpolate into a String.replace replacement.

  The second argument of String.replace is not a plain string. A dollar in it
  begins a pattern: $& is the whole match, $1 a capture group, $` and $' the
  text either side. So a value carrying one of those does not land in the
  output, something else does.

  Five posts shipped this way. One contains the shell line

      grep -q "^install ok installed$"

  and esc() above turns that closing quote into &quot;, which puts a literal
  $& in front of it. injectRootContent then spliced the entire page shell,
  the match for its own regex, into the middle of the article, and left
  <pre>, <code>, <article> and <main> open for the rest of the document. A
  third of the page sat inside a stylesheet. Eleven other gates passed it:
  the page had a title, a description, a canonical, valid JSON-LD and
  resolving links.

  Note the direction of the trap: esc() makes a value MORE dangerous here,
  not less, because it introduces the ampersands. Any $ before a character
  that escapes to an entity is enough, and a regex anchor at the end of a
  quoted string is the common way to write one.

  $$ is the escape for a literal dollar, so doubling every one is the whole
  fix. Applied to values, not to the replacement as a whole, because several
  callers below use $1 and $3 backreferences on purpose.
*/
function literal(value: string): string {
  return value.replace(/\$/g, "$$$$");
}

/** Replace a meta tag's attribute value in raw HTML using a regex. */
function replaceMeta(
  html: string,
  selector: string,
  attrName: string,
  value: string,
): string {
  // Match e.g. <meta property="og:title" content="...">
  // The selector here is something like: meta[property="og:title"]
  // We convert it into a regex that matches the attribute value.
  const escaped = selector.replace(/[\[\]"]/g, (c) =>
    ({ "[": "\\[", "]": "\\]", '"': '"' })[c] ?? c,
  );
  const re = new RegExp(
    `(<${escaped}[^>]*\\s${attrName}=")([^"]*)(")`,
    "i",
  );
  return html.replace(re, `$1${literal(esc(value))}$3`);
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`);
}

function replaceCanonical(html: string, url: string): string {
  return html.replace(
    /(<link rel="canonical" href=")[^"]*(")/,
    `$1${literal(url)}$2`,
  );
}

function injectBeforeHead(html: string, injection: string): string {
  return html.replace("</head>", () => `${injection}\n</head>`);
}

/**
 * Site navigation, appended to every prerendered page.
 *
 * The real footer is a React component, so it exists only after hydration.
 * A crawler on its first pass sees the prerendered body and nothing else,
 * which meant nine pages were linked from nowhere at all: /now, /uses,
 * /projects, /paths, /timeline, /links, /subscribe, /roadmap and
 * /study-timer were each reachable only from themselves. They were in the
 * sitemap, so Google knew the URLs existed, but a URL with no inbound link
 * is a URL nothing vouches for, and it is crawled last if at all.
 *
 * This is the same set of destinations the rendered footer offers. It is
 * replaced by React on hydration like the rest of the prerendered body, so
 * readers never see it and it cannot drift visually from the real footer.
 */
const SITE_NAV = `
<nav aria-label="Site" data-nosnippet>
  <a href="${SITE_URL}/">Home</a>
  <a href="${SITE_URL}/blog">Field Notes</a>
  <a href="${SITE_URL}/topics">Topics</a>
  <a href="${SITE_URL}/archive">Archive</a>
  <a href="${SITE_URL}/projects">Projects</a>
  <a href="${SITE_URL}/tools">Tools</a>
  <a href="${SITE_URL}/study">Study</a>
  <a href="${SITE_URL}/data">Open data</a>
  <a href="${SITE_URL}/game">Simulator</a>
  <a href="${SITE_URL}/ncl">National Cyber League</a>
  <a href="${SITE_URL}/cyber-club">Cyber Club</a>
  <a href="${SITE_URL}/cyber-club/kit">Cyber Club in a Box</a>
  <a href="${SITE_URL}/coding-camps">Coding camps</a>
  <a href="${SITE_URL}/certifications">Certifications</a>
  <a href="${SITE_URL}/paths">Paths</a>
  <a href="${SITE_URL}/roadmap">Roadmap</a>
  <a href="${SITE_URL}/resume">Resume</a>
  <a href="${SITE_URL}/timeline">Timeline</a>
  <a href="${SITE_URL}/now">Now</a>
  <a href="${SITE_URL}/uses">Uses</a>
  <a href="${SITE_URL}/faq">FAQ</a>
  <a href="${SITE_URL}/links">Links</a>
  <a href="${SITE_URL}/subscribe">Subscribe</a>
  <a href="${SITE_URL}/study-timer">Study timer</a>
  <a href="${SITE_URL}/colophon">Colophon</a>
  <a href="${SITE_URL}/contact">Contact</a>
</nav>`;

/*
  Critical styles for the prerendered body, shipped inside #root.

  The prerendered HTML carries no classes, because it is written for readers
  that do not run JavaScript. Nothing in the stylesheet can reach it, and the
  dark theme lives on .cinematic, a class React adds when it mounts, while
  :root sets --background to a near-white. So the first paint of every page
  was a black-on-white text dump: the whole document plus a wall of 27 nav
  links, for as long as it takes 623KB of JavaScript to download and execute.
  On a phone that is not a flicker, it is a second or more of a page that
  looks broken.

  Painting it in the site's own colours is the honest fix. Hiding it would
  show crawlers something readers never see, and it would throw away the
  no-JavaScript fallback that the whole prerendering effort exists to
  provide. Styled, the same markup reads as the page arriving rather than
  the page failing.

  Values are literal rather than var() because this must paint before the
  stylesheet defining those tokens is guaranteed to have applied. It sits
  inside #root, so document order beats the stylesheet on the body rule, and
  createRoot removes the whole block on mount: nothing here can leak into the
  app.
*/
const PRERENDER_CSS = `<style>
body{background:hsl(220 12% 4%);margin:0}
#prerender{color:hsl(40 16% 92%);font:400 15px/1.7 "Space Grotesk",Inter,system-ui,-apple-system,sans-serif;max-width:68ch;margin:0 auto;padding:12vh 7vw 8vh;-webkit-font-smoothing:antialiased;overflow-wrap:break-word}
#prerender h1{font-size:clamp(1.7rem,6vw,2.4rem);line-height:1.1;letter-spacing:-.03em;margin:0 0 .55em;font-weight:500}
#prerender h2{font-size:1.1rem;font-weight:500;margin:2.2em 0 .5em;letter-spacing:-.01em}
#prerender h3{font-size:.95rem;font-weight:500;margin:1.6em 0 .35em}
#prerender p,#prerender li,#prerender dd{color:hsl(40 10% 72%);margin:0 0 .85em}
#prerender dt{color:hsl(40 16% 92%);margin-top:1.1em}
#prerender dd{margin:.15em 0 .6em}
#prerender ul,#prerender ol{padding-left:1.2em;margin:0 0 1em}
#prerender li{margin:0 0 .35em}
#prerender a{color:hsl(72 100% 50%);text-decoration:none}
#prerender code{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.9em;color:hsl(180 85% 62%)}
#prerender img{max-width:100%;height:auto;display:block;border-radius:6px;margin:0 0 1.4em}
#prerender pre{overflow-x:auto;background:hsl(220 10% 9%);border:1px solid hsl(220 6% 22%);border-radius:6px;padding:.9em 1em;font-size:12.5px;line-height:1.55;margin:0 0 1.2em}
#prerender pre code{color:hsl(40 10% 72%)}
#prerender table{display:block;overflow-x:auto;border-collapse:collapse;font-size:13px;margin:0 0 1.2em}
#prerender td,#prerender th{border:1px solid hsl(220 6% 22%);padding:.4em .7em;text-align:left}
#prerender blockquote{margin:0 0 1.2em;padding-left:1.1em;border-left:2px solid hsl(72 100% 50%);color:hsl(40 10% 72%)}
#prerender nav{margin-top:2.5em;font-size:12px;line-height:2.1;color:hsl(220 5% 56%)}
#prerender nav a{color:hsl(220 5% 56%);margin-right:1.1em;white-space:nowrap}
#prerender nav[aria-label="Site"]{margin-top:4em;padding-top:1.5em;border-top:1px solid hsl(220 6% 22%)}
</style>`;

function injectRootContent(html: string, content: string): string {
  // Replace the spinner placeholder with pre-rendered content.
  // React's createRoot overwrites this on mount, styles and all.
  // A function, not a string: its return value is used literally, so neither
  // the article nor the two constants can be read as a $ pattern.
  return html.replace(
    /<div id="root">[\s\S]*?<\/div>\s*<style>/,
    () =>
      // One </div>, not two. The regex stops at the spinner's <style>, so the
      // </div> that closes #root in index.html is still there after the match
      // and closes it. Emitting a second one left every page with three
      // closes against two opens. Browsers drop the orphan, so it never
      // looked wrong, and all 377 pages served invalid markup.
      `<div id="root">${PRERENDER_CSS}<div id="prerender">${content}${SITE_NAV}</div>\n    <style>`,
  );
}

// ─── page injection ───────────────────────────────────────────────────────────

interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogType?: string;
  ogImage?: string;
  ogImageAlt?: string;
  schema?: string;
  rootContent?: string;
  /** Keep a page out of the index. For interactive pages with little prose. */
  noindex?: boolean;
  /**
   * Whether this page plays the entrance animation.
   *
   * Marks the document so the inline script in index.html knows to veil the
   * prerendered content until the preloader takes over. Only true for pages
   * that actually render one, which means CinematicLayout without
   * skipPreloader: the five dashboards use the game header instead, and the
   * 404 page opts out, and on those a veil would never be lifted.
   */
  boot?: boolean;
}

function buildPageHtml(base: string, meta: PageMeta): string {
  let html = base;
  const {
    title,
    description,
    canonical,
    ogType = "website",
    ogImage = `${SITE_URL}/images/og-image.jpg`,
    ogImageAlt = "Max Doubin",
    schema,
    rootContent,
    noindex = false,
    boot = true,
  } = meta;

  if (boot) {
    html = html.replace(/<html([^>]*)>/, '<html$1 data-boot="1">');
  }

  html = replaceTitle(html, title);
  html = replaceCanonical(html, canonical);

  // <meta name="description">
  html = html.replace(
    /(<meta name="description" content=")[^"]*(")/,
    `$1${literal(esc(description))}$2`,
  );

  // Open Graph
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/,   `$1${literal(esc(title))}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/,`$1${literal(esc(description))}$2`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/,     `$1${literal(canonical)}$2`);
  html = html.replace(/(<meta property="og:type" content=")[^"]*(")/,    `$1${literal(ogType)}$2`);
  html = html.replace(/(<meta property="og:image" content=")[^"]*(")/,   `$1${literal(ogImage)}$2`);
  html = html.replace(/(<meta property="og:image:alt" content=")[^"]*(")/,`$1${literal(esc(ogImageAlt))}$2`);

  // Twitter
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/,      `$1${literal(esc(title))}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/,`$1${literal(esc(description))}$2`);
  html = html.replace(/(<meta name="twitter:image" content=")[^"]*(")/,      `$1${literal(ogImage)}$2`);
  html = html.replace(/(<meta name="twitter:image:alt" content=")[^"]*(")/,  `$1${literal(esc(ogImageAlt))}$2`);
  html = html.replace(/(<meta name="twitter:url" content=")[^"]*(")/,        `$1${literal(canonical)}$2`);

  if (noindex) {
    html = html.replace(
      /(<meta name="robots" content=")[^"]*(")/,
      "$1noindex, follow$2",
    );
  }

  if (schema) html = injectBeforeHead(html, schema);
  // Always inject, even with no body: the nav has to reach every page, and
  // the pages with no body of their own are exactly the ones that were
  // otherwise linked from nowhere.
  html = injectRootContent(html, rootContent ?? "");

  return html;
}


// ─── write helpers ────────────────────────────────────────────────────────────

/**
 * Write one prerendered page.
 *
 * As <path>.html, not <path>/index.html, because of how Cloudflare Pages
 * resolves a request. Given foo/index.html it answers /foo with a 308 to
 * /foo/ and serves the page on the second request. Given foo.html it answers
 * /foo with the page, 200, first time.
 *
 * That mattered because every canonical tag, every sitemap entry and every
 * internal link on this site uses the extensionless form. All 331 of them
 * were redirecting: two round trips per page for every visitor and every
 * crawl, and a canonical URL that did not itself resolve.
 *
 * Verified against the live host before making the change: /404 returned 200
 * from 404.html while /404.html returned a 308, which is the same rule in the
 * other direction.
 */

/*
  Stamp ids onto the h2 and h3 of a rendered article.

  Without these a section is not linkable until the page hydrates: the
  table of contents assigns ids client side, so a visitor arriving on a
  #section URL, and every crawler, sees headings with no targets at all.
  Google cannot offer a jump to a section it cannot address.

  The slug rule is shared with usePostHeadings rather than reimplemented, so
  the id the crawler indexes is the id the page still has after hydration.

  Heading text can contain inline markup like <code>, and the client derives
  its slug from textContent, so tags are stripped and entities decoded before
  slugifying. scroll-margin-top matches the client's NAV_OFFSET, otherwise an
  anchor jump lands underneath the fixed nav.
*/
function addHeadingIds(html: string): string {
  const used = new Set<string>();
  return html.replace(
    /<(h[23])>([\s\S]*?)<\/\1>/g,
    (whole, tag: string, inner: string) => {
      const text = inner
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return whole;
      const id = uniqueHeadingId(text, used);
      return `<${tag} id="${id}" style="scroll-margin-top:96px">${inner}</${tag}>`;
    },
  );
}

/**
 * Display names for the path segments that are also real pages.
 *
 * A breadcrumb item must point somewhere. /study/ccna/ip-connectivity has
 * three segments but only two of them are pages: there is no /study/ccna, so
 * the trail is Home > Study > IP Connectivity rather than inventing a level
 * that would send a crawler to a 404.
 */
const CRUMB_NAMES: Record<string, string> = {
  blog: "Field Notes",
  topics: "Topics",
  tools: "Tools",
  racks: "Rack Library",
  ncl: "National Cyber League",
  study: "Study",
  "cyber-club": "Cyber Club",
  // Derived, so a fourth certification appears in the trail without an edit.
  ...Object.fromEntries(
    EXAMS.map((e: { slug: string; name: string; code: string }) => [
      `study/${e.slug}`,
      `${e.name} ${e.code}`,
    ]),
  ),
};

/**
 * "Resume | Max Doubin" -> "Resume".
 *
 * The site name is already the root crumb, and everything after the first
 * pipe is context the trail now carries itself: an exam domain titled
 * "IP Connectivity | Cisco CCNA 200-301" sits under a Cisco CCNA 200-301
 * crumb, so repeating it in the leaf is noise.
 */
function crumbLabel(title: string): string {
  const withoutSite = title.replace(/\s*\|\s*Max Doubin\s*$/, "").trim();
  const head = withoutSite.split(" | ")[0].trim();
  return head || withoutSite || title;
}

/**
 * BreadcrumbList for a page, derived from its own path.
 *
 * Google replaces the bare URL in a result with this trail, which matters
 * most on the pages furthest from the root: the seventeen exam domain pages
 * under /study were three levels deep and showed a raw URL.
 *
 * Pages that build a richer trail themselves pass one in meta.schema; this
 * only fills the gap, and never emits a second list beside an existing one.
 */
function breadcrumbSchema(relDir: string, title: string): string {
  const segments = relDir.split("/");
  const items: Array<{ "@type": string; position: number; name: string; item: string }> = [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
  ];

  let prefix = "";
  for (const seg of segments.slice(0, -1)) {
    prefix = prefix ? `${prefix}/${seg}` : seg;
    const name = CRUMB_NAMES[prefix];
    if (!name) continue; // not a page, so not a crumb
    items.push({
      "@type": "ListItem",
      position: items.length + 1,
      name,
      item: `${SITE_URL}/${prefix}`,
    });
  }

  // A page that is itself a named node uses that name, so the same node reads
  // identically whether it is the leaf or an ancestor.
  items.push({
    "@type": "ListItem",
    position: items.length + 1,
    name: CRUMB_NAMES[relDir] ?? crumbLabel(title),
    item: `${SITE_URL}/${relDir}`,
  });

  return `<script type="application/ld+json">
${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items })}
</script>`;
}

async function writePage(
  relDir: string,
  base: string,
  meta: PageMeta,
): Promise<void> {
  const target = path.join(DIST, `${relDir}.html`);
  await mkdir(path.dirname(target), { recursive: true });

  /*
    Standalone pages get their own social card when one has been generated,
    the same way posts do. /resume, /projects and /certifications are the
    pages most likely to be sent to an admissions officer or a recruiter, and
    they used to share the one generic site image with everything else, so a
    shared link said nothing about what it pointed at.

    Resolved here rather than at each call site so a new page picks its card
    up automatically: add the slug to STANDALONE in scripts-ci/make-og-images.py,
    regenerate, and this finds it. Falls back to the generic image when no
    card exists, which is correct for the home page and for utility pages.
  */
  const cardPath = `/images/og/${relDir}.jpg`;
  const ogImage =
    meta.ogImage ??
    (existsSync(path.join(DIST, cardPath.slice(1)))
      ? `${SITE_URL}${cardPath}`
      : undefined);

  /*
    Every page gets a breadcrumb unless it already carries one. Blog posts,
    tool pages, topic hubs and the competition guides build richer trails at
    their call sites; everything else had none, including the seventeen exam
    domain pages three levels down.
  */
  const schema = (meta.schema ?? "").includes("BreadcrumbList")
    ? meta.schema
    : `${meta.schema ?? ""}\n${breadcrumbSchema(relDir, meta.title)}`.trim();

  const html = buildPageHtml(base, { ...meta, ogImage, schema });
  await writeFile(target, html, "utf-8");
}

/**
 * The 404 document, served by Cloudflare Pages with a real 404 status.
 *
 * Pages looks for 404.html at the output root when a request matches neither
 * a static file nor a rewrite in _redirects. It has to sit at the root as
 * 404.html rather than 404/index.html, which is why this does not go through
 * writePage.
 *
 * It carries the app shell, so React boots and the client router renders the
 * real not-found page. The crawler gets the status code it needs before any
 * of that runs.
 */
async function writeNotFoundPage(base: string): Promise<void> {
  const html = buildPageHtml(base, {
    title: "Page not found | Max Doubin",
    description:
      "That page does not exist on maxdoubin.com. The writing is in Field Notes and everything else is linked from the home page.",
    // Stripped again below. buildPageHtml requires one, but a page that does
    // not exist has no canonical URL to point at, and claiming one that also
    // does not exist just leaves a dead reference in the HTML.
    canonical: `${SITE_URL}/404`,
    noindex: true,
    // CinematicNotFound passes skipPreloader, so nothing here would ever
    // lift a veil, and somebody who has just hit a dead link should see the
    // explanation immediately rather than an entrance animation.
    boot: false,
    rootContent: `
<main>
  <h1>Page not found</h1>
  <p>
    There is nothing at this address. It may have been renamed, or the link
    that brought you here may have been wrong.
  </p>
  <ul>
    <li><a href="${SITE_URL}/">Home</a></li>
    <li><a href="${SITE_URL}/blog">Field Notes, the writing archive</a></li>
    <li><a href="${SITE_URL}/topics">Topics</a></li>
    <li><a href="${SITE_URL}/tools">Browser tools</a></li>
    <li><a href="${SITE_URL}/sitemap.xml">Sitemap</a></li>
  </ul>
</main>`,
  });
  await writeFile(
    path.join(DIST, "404.html"),
    html.replace(/\s*<link rel="canonical"[^>]*>/i, ""),
    "utf-8",
  );
}

// ─── blog post pre-render ─────────────────────────────────────────────────────

async function prerenderPost(
  base: string,
  post: (typeof postIndex)[number],
  all: (typeof postIndex)[number][] = [],
): Promise<void> {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const body = await readBody(post.slug);
  /*
    Social preview uses the branded card, not the raw cover.

    A shared link used to show the bare photo, so every post looked alike in
    a feed and none of them said what they were. The cards in images/og
    carry the title and tags baked in at 1200x630, generated by
    scripts-ci/make-og-images.py. Scrapers do not run JavaScript, so setting
    this here in the static HTML is what actually reaches them.

    Falls back to the cover if a card is missing, which is better than
    emitting a URL that 404s.
  */
  const cardPath = `/images/og/${post.slug}.jpg`;
  const hasCard = existsSync(path.join(DIST, cardPath.slice(1)));
  const ogImage = `${SITE_URL}${hasCard ? cardPath : post.coverImage}`;
  /*
    Absolute for the structured data, which schema.org requires and which
    Google reads off whatever origin it crawls. The <img> further down uses
    post.coverImage as it is, root relative, because an absolute src pins the
    element to the production hostname: on a preview deployment that is a
    cross origin request and img-src 'self' refuses it, so every post
    reviewed on a preview showed no cover at all.
  */
  const coverImage = `${SITE_URL}${post.coverImage}`;

  /*
    articleSection is the one section-level fact a BlogPosting can carry, and
    it is what lets a result be understood as part of a subject rather than as
    a loose page. The section is the post's primary tag, which is the tag the
    listing pages already treat as primary, resolved through the topic hub so
    the JSON-LD says "Networking" exactly as /topics/networking does rather
    than the lowercase slug the reader never sees.

    Three primary tags have no hub (three.js, proxmox, community). Those fall
    back to the tag verbatim: a tag is a real value, and title-casing it here
    would invent a section name the site does not use anywhere else.

    Left undefined, never empty, when a post somehow has no tags at all.
    JSON.stringify drops an undefined property, and an absent articleSection
    is correct where an empty one would claim a section named nothing.
  */
  const primaryTag: string | undefined = post.tags[0];
  const articleSection = primaryTag
    ? (getTagPage(primaryTag)?.title ?? primaryTag)
    : undefined;

  const schema = `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "@id": url,
  headline: post.title,
  description: post.excerpt,
  datePublished: post.date,
  dateModified: post.updated ?? post.date,
  url,
  image: { "@type": "ImageObject", url: coverImage, contentUrl: coverImage },
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin", url: SITE_URL },
  publisher: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin", url: SITE_URL },
  isPartOf: { "@type": "Blog", "@id": `${SITE_URL}/#blog` },
  keywords: post.tags.join(", "),
  articleSection,
  inLanguage: "en-US",
  wordCount: post.wordCount,
  mainEntityOfPage: { "@type": "WebPage", "@id": url },
})}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Field Notes", item: `${SITE_URL}/blog` },
    { "@type": "ListItem", position: 3, name: post.title, item: url },
  ],
})}
</script>`;

  // Full article HTML. Google reads this on the first HTML crawl
  const contentHtml = addHeadingIds(await Promise.resolve(marked.parse(body)));
  /*
    Formatted from the string parts, not through a Date.

    `new Date("2026-05-09")` is UTC midnight, and toLocaleDateString then
    renders it in whatever zone the machine is in. On a build runner set to
    anything west of Greenwich that prints the day before, so the static
    HTML would disagree with what the browser shows. A post date is a
    calendar date, not an instant, and should never touch a timezone.
  */
  const dateStr = formatPostDate(post.date);
  const updatedStr = post.updated
    ? ` · Rewritten <time datetime="${post.updated}">${formatPostDate(post.updated)}</time>`
    : "";
  const readMins = Math.max(1, Math.ceil(post.wordCount / 200));
  // Point each tag at its topic hub where one exists. Every tag on every
  // post used to link to /blog, so roughly 700 crawler-visible links pointed
  // at the index and the 26 hubs had almost no inbound links from the
  // archive they summarise. Tags without a hub still go to the index.
  const tagLinks = post.tags
    .map((t) => {
      const href = getTagPage(t) ? `${SITE_URL}/topics/${t}` : `${SITE_URL}/blog`;
      return `<a href="${href}">${esc(t)}</a>`;
    })
    .join(" ");

  /*
    Onward links in the static HTML.

    The React page renders neighbours and related posts, but a crawler that
    does not execute JavaScript only ever saw a link back to the index, so
    every one of 236 posts was a dead end on the first pass. These mirror
    what the page shows.
  */
  const idx = all.findIndex((p) => p.slug === post.slug);
  const newer = idx > 0 ? all[idx - 1] : undefined;
  const older = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : undefined;

  const tagCounts = new Map<string, number>();
  all.forEach((p) => p.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));
  const related = all
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({
      p,
      score: p.tags
        .filter((t) => post.tags.includes(t))
        .reduce((sum, t) => sum + 1 / (tagCounts.get(t) ?? 1), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.p.date < b.p.date ? 1 : -1))
    .slice(0, 3)
    .map((x) => x.p);

  const link = (p: (typeof postIndex)[number]) =>
    `<a href="${SITE_URL}/blog/${p.slug}">${esc(p.title)}</a>`;

  const neighbourNav =
    older || newer
      ? `<nav aria-label="Adjacent posts">${
          older ? `<span>Previous: ${link(older)}</span>` : ""
        }${newer ? `<span>Next: ${link(newer)}</span>` : ""}</nav>`
      : "";

  const relatedNav = related.length
    ? `<aside aria-label="Related posts"><h2>Related</h2><ul>${related
        .map((r) => `<li>${link(r)}</li>`)
        .join("")}</ul></aside>`
    : "";

  const rootContent = `
<main>
  <a href="${SITE_URL}/blog">← Back to Blog</a>
  <img src="${post.coverImage}" alt="${esc(post.title)}" width="800" height="320" />
  <article>
    <time datetime="${post.date}">${dateStr}</time>${updatedStr} · ${readMins} min read
    <h1>${esc(post.title)}</h1>
    <p>${esc(post.excerpt)}</p>
    <nav>${tagLinks}</nav>
    ${contentHtml}
  </article>
  ${neighbourNav}
  ${relatedNav}
</main>`;

  await writePage(`blog/${post.slug}`, base, {
    title: pageTitle(post.title),
    description: post.excerpt,
    canonical: url,
    ogType: "article",
    ogImage,
    ogImageAlt: post.title,
    schema,
    rootContent,
  });
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!existsSync(DIST)) {
    console.log("⚠  dist/public not found, skipping prerender");
    return;
  }

  const base = await readFile(path.join(DIST, "index.html"), "utf-8");
  const posts = postIndex.filter((p) => !p.draft);

  /*
    The home page had no prerendered body at all.

    Every other page goes through writePage, which injects content and the
    site nav. index.html is the Vite output that those pages are built FROM,
    so it never went through that path: a crawler's first pass at
    maxdoubin.com found an empty div and a spinner. That is the most
    important page on the site.

    Written last, after the base has been used as the template for everything
    else, so this content cannot leak into the other 332 pages.
  */
  const homeContent = `
<main>
  <h1>Max Doubin</h1>
  <p>
    Cybersecurity student in Las Vegas. This site is a working notebook:
    ${posts.length} articles on enterprise networking, servers, storage and
    security, each one sourced, plus browser tools, exam study material and an
    openly licensed hardware dataset.
  </p>
  <h2>Start here</h2>
  <ul>
    <li><a href="${SITE_URL}/blog">Field Notes</a>, ${posts.length} articles on infrastructure and security.</li>
    <li><a href="${SITE_URL}/topics">Topics</a>, the same archive grouped by subject.</li>
    <li><a href="${SITE_URL}/tools">Browser tools</a>, subnet and VLSM calculators, packet header references, hash identification and more.</li>
    <li><a href="${SITE_URL}/study">Certification study</a>, mapped to the published Security+, Network+ and CCNA exam objectives.</li>
    <li><a href="${SITE_URL}/data">Open rack hardware dataset</a>, power, heat, rack units and port counts as JSON and CSV under CC BY 4.0.</li>
    <li><a href="${SITE_URL}/game">Hyperscale</a>, a datacenter simulator running on real power and cooling maths.</li>
    <li><a href="${SITE_URL}/ncl">National Cyber League guides</a> for all nine scored categories.</li>
    <li><a href="${SITE_URL}/cyber-club/kit">Cyber Club in a Box</a>, a free twelve week plan for starting a school cybersecurity club.</li>
  </ul>
  <h2>Practise, in the browser</h2>
  <p>
    ${PRACTISE_SURFACES.filter((surface) => surface.group !== "ground").length} places to
    practise, none of which need anything installed, none of which reach a
    real machine, and none of which send anything anywhere.
    Every exercise ships a solution that CI replays on every push.
  </p>
  <ul>
    <li><a href="${SITE_URL}/today">Today</a>, one thing from each of these, chosen by the date.</li>
    <li><a href="${SITE_URL}/scenarios">Incident scenarios</a>, the first fifteen minutes of an incident with many endings.</li>
    <li><a href="${SITE_URL}/labs">Hands-on labs</a>, a Linux host simulated in the browser with something wrong with it.</li>
    <li><a href="${SITE_URL}/capture">Packet captures</a>, a real trace and a Wireshark display filter bar.</li>
    <li><a href="${SITE_URL}/challenges">Capture the flag</a>, an artefact and a question with one exact answer.</li>
    <li><a href="${SITE_URL}/triage">Phishing triage</a>, a morning of mail with every header intact.</li>
    <li><a href="${SITE_URL}/firewall">Firewall exercises</a>, broken iptables chains with a rule-by-rule match trace.</li>
    <li><a href="${SITE_URL}/resolve">DNS resolution</a>, telling a lame delegation from a missing glue record.</li>
    <li><a href="${SITE_URL}/chain">Certificate chains</a>, and which party can fix a given TLS error.</li>
    <li><a href="${SITE_URL}/allocate">Address plans</a>, dividing a block with the map drawn to scale.</li>
    <li><a href="${SITE_URL}/handshake">Protocol handshakes</a>, breaking one step and seeing where it stops.</li>
    <li><a href="${SITE_URL}/logs">Read the log</a>, what happened and the one line that proves it.</li>
    <li><a href="${SITE_URL}/mtu">Ping works and the transfer hangs</a>, path MTU and the firewall that swallowed the explanation.</li>
    <li><a href="${SITE_URL}/permissions">The first class that matches</a>, Unix mode bits and the two thirds of them the kernel never looks at.</li>
    <li><a href="${SITE_URL}/patch">The queue is sorted wrong</a>, why a base score is not a risk score and what to sort by instead.</li>
    <li><a href="${SITE_URL}/retry">Three retries, four layers</a>, how one button press becomes eighty-one queries.</li>
    <li><a href="${SITE_URL}/vlan">The frame that arrived untagged</a>, native VLAN mismatches and the wire that says nothing.</li>
    <li><a href="${SITE_URL}/clock">Four errors, none of which says the word time</a>, how wrong the clock is, worked backwards from what broke.</li>
    <li><a href="${SITE_URL}/space">No space left on device</a>, six filesystems and six different things that message means.</li>
    <li><a href="${SITE_URL}/oom">Something has to die</a>, ten machines out of memory and one expression that decides which process the kernel kills.</li>
    <li><a href="${SITE_URL}/units">It started before the thing it needs</a>, ten sets of systemd unit files where After= and Requires= mean different things.</li>
    <li><a href="${SITE_URL}/nat">It works from outside</a>, ten port forwards and the paths their replies take.</li>
    <li><a href="${SITE_URL}/alerts">The graph crossed the line</a>, ten runs of one alerting rule and what each one actually does.</li>
    <li><a href="${SITE_URL}/load">Forty, and idle</a>, ten readings of the load average and what the number is actually counting.</li>
    <li><a href="${SITE_URL}/throttle">Thirty percent, and stalling</a>, ten containers under a CPU limit and when the quota runs out.</li>
    <li><a href="${SITE_URL}/cache">The page that showed somebody else's name</a>, what a shared cache keys on and what it does not.</li>
    <li><a href="${SITE_URL}/route">Longest prefix wins</a>, why a routing table is not read like a firewall chain.</li>
    <li><a href="${SITE_URL}/array">Array calculator</a>, capacity, rebuild time and the URE arithmetic behind them.</li>
    <li><a href="${SITE_URL}/transfer">Why the transfer is slow</a>, the three ceilings over a single TCP stream.</li>
    <li><a href="${SITE_URL}/restore">You have backups, not restores</a>, which copies survive the incident.</li>
    <li><a href="${SITE_URL}/practise">The practise hub</a>, all of it with what each one is for.</li>
  </ul>
  <h2>About</h2>
  <ul>
    <li><a href="${SITE_URL}/resume">Resume</a> and <a href="${SITE_URL}/timeline">timeline</a>.</li>
    <li><a href="${SITE_URL}/projects">Projects</a>, <a href="${SITE_URL}/uses">uses</a> and <a href="${SITE_URL}/now">what I am working on now</a>.</li>
    <li><a href="${SITE_URL}/contact">Contact</a>.</li>
  </ul>
</main>`;

  // ── blog posts ──
  console.log(`Prerendering ${posts.length} blog posts...`);
  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH);
    await Promise.all(batch.map((p) => prerenderPost(base, p, posts)));
    process.stdout.write(`  ${Math.min(i + BATCH, posts.length)}/${posts.length}\r`);
  }
  console.log(`  ${posts.length}/${posts.length} done          `);

  // ── blog list ──
  const blogListSchema = `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Blog",
  "@id": `${SITE_URL}/blog`,
  name: "Max Doubin's Blog",
  url: `${SITE_URL}/blog`,
  description: "Technical writing on enterprise networking, cybersecurity, homelab infrastructure, and systems engineering.",
  author: { "@id": `${SITE_URL}/#person` },
  inLanguage: "en-US",
  blogPost: posts.slice(0, 20).map((p) => ({
    "@type": "BlogPosting",
    "@id": `${SITE_URL}/blog/${p.slug}`,
    headline: p.title,
    url: `${SITE_URL}/blog/${p.slug}`,
    datePublished: p.date,
    description: p.excerpt,
  })),
})}
</script>`;

  const blogRootContent = `
<main>
  <h1>Blog | Max Doubin</h1>
  <p>Technical writing on enterprise networking, cybersecurity, homelab infrastructure, and systems engineering.</p>
  <ul>
    ${posts
      .map(
        (p) =>
          `<li><a href="${SITE_URL}/blog/${p.slug}">${esc(p.title)}</a>: <span>${esc(p.excerpt)}</span></li>`,
      )
      .join("\n    ")}
  </ul>
</main>`;

  await writePage("blog", base, {
    title: "Blog | Max Doubin",
    description:
      "Technical writing on enterprise networking, cybersecurity, homelab infrastructure, and systems engineering by Max Doubin.",
    canonical: `${SITE_URL}/blog`,
    schema: blogListSchema,
    rootContent: blogRootContent,
  });

  /*
    The competition hub as a list of its nine children.

    A hub page whose only markup is a BreadcrumbList tells Google what is
    above it and nothing about what is below it, so the nine category guides
    read as nine unrelated pages that happen to share a path prefix. An
    ItemList is how a hub says "these are my children, in this order", and it
    is what makes the set eligible to appear together rather than one guide
    at a time.

    Sorted by the guides' own `order` field, which is documented as the sort
    order for this index, so the list Google reads is the list a reader sees.
  */
  const nclIndexSchema = `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "National Cyber League category guides",
  url: `${SITE_URL}/ncl`,
  numberOfItems: NCL_GUIDE_DATA.length,
  itemListOrder: "https://schema.org/ItemListOrderAscending",
  itemListElement: [...NCL_GUIDE_DATA]
    .sort((a, b) => a.order - b.order)
    .map((guide, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: guide.category,
      description: guide.tagline,
      url: `${SITE_URL}/ncl/${guide.slug}`,
    })),
})}
</script>`;

  /*
    Standalone pages.

    Every one of these is a real page in the router, so every one needs a
    static document. Without it a crawler following a link gets the SPA
    fallback: the home page's title, the home page's canonical, and no
    indication the target exists. Descriptions are per page and unique,
    which check-meta enforces.
  */
  const STANDALONE: Array<PageMeta & { dir: string }> = [
    {
      dir: "archive",
      title: "Archive | Max Doubin",
      description:
        "Every field note on maxdoubin.com in one chronological list, grouped by year and month, with tags and read times.",
      canonical: `${SITE_URL}/archive`,
    },
    {
      dir: "paths",
      title: "Reading paths | Max Doubin",
      description:
        "Four curated routes through the archive: networking from scratch, security fundamentals, AI meets infrastructure, and homelab operations.",
      canonical: `${SITE_URL}/paths`,
    },
    {
      dir: "now",
      title: "Now | Max Doubin",
      description:
        "What Max Doubin is focused on this month: certification study, what he is building, what he is reading, and what the South CTA Cyber Club is working on.",
      canonical: `${SITE_URL}/now`,
    },
    {
      dir: "uses",
      title: "Uses | Max Doubin",
      description:
        "The software Max Doubin actually uses: terminal and analysis tools, languages, virtualization, monitoring, and this site's own stack, with why for each.",
      canonical: `${SITE_URL}/uses`,
    },
    {
      dir: "resume",
      title: "Resume | Max Doubin",
      description:
        "Resume for Max Doubin: cybersecurity study at South Career Technical Academy, National Cyber League results, leadership roles, projects, and skills.",
      canonical: `${SITE_URL}/resume`,
    },
    {
      dir: "timeline",
      title: "Timeline | Max Doubin",
      description:
        "Competitions, awards, and milestones for Max Doubin, from National Cyber League results and certifications to leadership roles and press coverage.",
      canonical: `${SITE_URL}/timeline`,
    },
    {
      dir: "cyber-club",
      title: "South CTA Cyber Club | Max Doubin",
      description:
        "Join the Cyber Club at South Career Technical Academy in Las Vegas: capture the flag practice, a lab built to be broken, and no experience required.",
      canonical: `${SITE_URL}/cyber-club`,
    },
    {
      dir: "cyber-club/kit",
      title: "Cyber Club in a Box: a free 12 week plan | Max Doubin",
      description:
        "A free twelve week plan for starting a high school cybersecurity club: meeting plans, rules of engagement, a no budget materials list, and what kills clubs.",
      canonical: `${SITE_URL}/cyber-club/kit`,
    },
    {
      dir: "coding-camps",
      title: "Youth Coding Camps | Max Doubin",
      description:
        "Youth coding camps across the Las Vegas Valley taught by Max Doubin: what they cover, what a session looks like, and what a beginner takes home.",
      canonical: `${SITE_URL}/coding-camps`,
    },
    {
      dir: "racks/build",
      title: "Rack builder | Max Doubin",
      description:
        "Build a rack from 75 real rack mountable devices across six vendors in 3D. Pick hardware, stack it, see what it weighs in rack units and megabytes, and share the build as a link.",
      canonical: `${SITE_URL}/racks/build`,
    },
    {
      dir: "racks/wired",
      title: "The wired UniFi rack | Max Doubin",
      description:
        "A fourteen unit UniFi rack in real 3D, built from Ubiquiti's own product models and fully patched: two PoE switches down to surge panels, fibre uplinks to the aggregation switch, and every power lead landing in the distribution unit.",
      canonical: `${SITE_URL}/racks/wired`,
    },
    {
      dir: "teardown",
      title: "PowerEdge R760 teardown | Max Doubin",
      description:
        "A Dell PowerEdge R760 taken apart in the browser, thirty four assemblies at a time, using Dell's own service geometry: bezel, cover, shrouds, drives, fans, GPUs, four expansion risers, memory, heatsinks, power supplies and system board.",
      canonical: `${SITE_URL}/teardown`,
    },
    {
      dir: "colophon",
      title: "Colophon | Max Doubin",
      description:
        "How maxdoubin.com is built: React and TypeScript, Vite with manual chunk splitting, static prerendering so crawlers read full articles, no backend.",
      canonical: `${SITE_URL}/colophon`,
    },
    {
      dir: "faq",
      title: "Frequently Asked Questions | Max Doubin",
      description:
        "Answers about Max Doubin: what he studies, his National Cyber League placement, the South CTA Cyber Club, what he builds and teaches, and how to reach him.",
      canonical: `${SITE_URL}/faq`,
    },
    {
      dir: "links",
      title: "Links | Max Doubin",
      description:
        "Free and freemium resources Max Doubin recommends for learning networking and security: fundamentals, capture the flag practice, and certification prep.",
      canonical: `${SITE_URL}/links`,
    },
    {
      dir: "subscribe",
      title: "Subscribe | Max Doubin",
      description:
        "Follow the field notes by RSS. What a feed actually is, why it beats an algorithm, five readers worth trying, and the feed URL for maxdoubin.com.",
      canonical: `${SITE_URL}/subscribe`,
    },
    {
      dir: "study-timer",
      title: "Study timer | Max Doubin",
      description:
        "A pomodoro study timer that keeps correct time in a background tab, with configurable work and break lengths, a session counter and an optional chime.",
      canonical: `${SITE_URL}/study-timer`,
    },
    {
      dir: "ask",
      title: "Ask | Max Doubin",
      description:
        "Ask about networking, security, homelabs or competition. The page composes your question for email or GitHub and shows the text before anything is sent.",
      canonical: `${SITE_URL}/ask`,
    },
    {
      dir: "ncl",
      title: "National Cyber League Study Guide | Max Doubin",
      description:
        "What the National Cyber League is, how scoring works, how to prepare, and guides to all nine challenge categories, from a top 1 percent competitor.",
      canonical: `${SITE_URL}/ncl`,
      schema: nclIndexSchema,
      // The seven guides were reachable from nowhere: this index rendered its
      // list client side, so a crawler saw an empty page with no links out.
      rootContent: `
<main>
  <h1>National Cyber League study guide</h1>
  <p>
    The National Cyber League scores nine categories. Each guide below covers
    what that category tests, the tools worth knowing, a worked example, and
    the mistakes that cost the most time.
  </p>
  <ul>
${[...NCL_GUIDE_DATA]
  .sort((a, b) => a.order - b.order)
  .map(
    (g) =>
      `    <li><a href="${SITE_URL}/ncl/${g.slug}">${esc(g.category)}</a>: ${esc(g.tagline)}</li>`,
  )
  .join("\n")}
  </ul>
  <p>
    The competition itself is covered in the
    <a href="${SITE_URL}/blog">Field Notes archive</a>, and the
    <a href="${SITE_URL}/tools">browser tools</a> cover several of the same
    techniques.
  </p>
</main>`,
    },
    {
      dir: "certifications",
      title: "Certifications | Max Doubin",
      description:
        "An honest status board: CompTIA Tech+ earned, with Security+, Network+, and CCNA in progress, plus each exam's official domains and resources.",
      canonical: `${SITE_URL}/certifications`,
    },
    {
      // A trainer, not an article. Indexing it would put a page of controls
      // into results alongside the writing.
      dir: "flashcards",
      title: "Flashcards | Max Doubin",
      description:
        "A spaced-repetition flashcard trainer for networking, ports, security, Linux, and cryptography, with an SM-2 scheduler that plans each card's next review.",
      canonical: `${SITE_URL}/flashcards`,
      noindex: true,
    },
    /*
      The five simulator dashboards.

      They were not prerendered at all. _redirects rewrote each of them to /
      with a 200, so the document a crawler received at /noc was the home
      page: its title, its h1, and a canonical pointing at the home page.
      Google calls serving the home page in place of a page that does not
      exist a soft 404, and Search Console started reporting exactly that.

      Worse than the wasted crawl was the pairing. Those URLs carried
      X-Robots-Tag: noindex and a rel=canonical to https://maxdoubin.com,
      and a noindex alongside a canonical pointing somewhere else is the one
      combination Google warns against, because the noindex can be taken to
      apply to the canonical target. The target was the home page.

      So each one gets its own document, its own title, a canonical to
      itself, and noindex on the page rather than only in a header. Still
      out of the index, and no longer claiming to be the home page.
    */
    {
      dir: "noc",
      title: "NOC Overview | Max Doubin",
      description:
        "The simulator's network operations dashboard: alert volume, uptime stability, and response cadence over the modelled datacenter floor.",
      canonical: `${SITE_URL}/noc`,
      noindex: true,
      // Game header, not CinematicLayout, so no preloader ever mounts here
      // and a veil would have nothing to lift it.
      boot: false,
    },
    {
      dir: "network",
      title: "Network Operations | Max Doubin",
      description:
        "The simulator's network dashboard: topology overview, throughput trends, and link health across the modelled datacenter.",
      canonical: `${SITE_URL}/network`,
      noindex: true,
      // Game header, not CinematicLayout, so no preloader ever mounts here
      // and a veil would have nothing to lift it.
      boot: false,
    },
    {
      dir: "floor",
      title: "Floor Operations | Max Doubin",
      description:
        "The simulator's floor dashboard: thermal zones, airflow balance, and how racks are distributed across the modelled datacenter floor.",
      canonical: `${SITE_URL}/floor`,
      noindex: true,
      // Game header, not CinematicLayout, so no preloader ever mounts here
      // and a veil would have nothing to lift it.
      boot: false,
    },
    {
      dir: "incidents",
      title: "Incident Command | Max Doubin",
      description:
        "The simulator's incident dashboard: severity distribution, response speed, and tracking of open incidents on the modelled floor.",
      canonical: `${SITE_URL}/incidents`,
      noindex: true,
      // Game header, not CinematicLayout, so no preloader ever mounts here
      // and a veil would have nothing to lift it.
      boot: false,
    },
    {
      dir: "build",
      title: "Build Command Center | Max Doubin",
      description:
        "The simulator's build dashboard: layout changes, the power impact of each one, and the health of the build workflow.",
      canonical: `${SITE_URL}/build`,
      noindex: true,
      // Game header, not CinematicLayout, so no preloader ever mounts here
      // and a veil would have nothing to lift it.
      boot: false,
    },
  ];

  /*
    The FAQ needs its schema and its answers in the first response.

    FAQPage markup that only appears after React runs is markup Google may
    never see, which made the rich result it was written for unreachable.
    Both are built from the same array the page renders, so they cannot
    disagree.
  */
  const faqSchema = `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${SITE_URL}/faq#faq`,
  url: `${SITE_URL}/faq`,
  inLanguage: "en-US",
  about: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
})}
</script>`;
  const faqContent = `
<main>
  <h1>Questions and answers</h1>
  <p>Straight answers to what people actually ask about Max Doubin.</p>
  ${FAQS.map(
    (item) => `<section><h2>${esc(item.q)}</h2><p>${esc(item.a)}</p></section>`,
  ).join("\n  ")}
  <nav><a href="${SITE_URL}/resume">Resume</a> · <a href="${SITE_URL}/blog">Field Notes</a> · <a href="${SITE_URL}/contact">Contact</a></nav>
</main>`;

  /*
    The claim ledger and the club plan are the two pages most likely to be
    read by something that does not run JavaScript: a crawler deciding
    whether the site is credible, or an assistant answering "is this real".
    Both were empty shells on the first response. These mirror what the
    React pages render.
  */
  const kitContent = `
<main>
  <h1>Start a cyber club</h1>
  <p>Twelve meetings, from a room where nobody has opened a terminal to a team registered for the National Cyber League. Free, CC BY 4.0, and downloadable in full at <a href="${SITE_URL}/data/cyber-club-kit.md">cyber-club-kit.md</a>.</p>
  <section>
    <h2>Rules of engagement, before week one</h2>
    <ol>${KIT_RULES.map((rule) => `<li>${esc(rule)}</li>`).join("")}</ol>
  </section>
  ${KIT_SESSIONS.map(
    (session) => `<section>
    <h2>Week ${session.week}: ${esc(session.title)}</h2>
    <p>${esc(session.goal)}</p>
    <p>Before the meeting: ${esc(session.prep)}</p>
    <ol>${session.run.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
    <p>How you know it worked: ${esc(session.evidence)}</p>
  </section>`,
  ).join("\n  ")}
  <section>
    <h2>Tools the plan uses</h2>
    <ul>${KIT_RESOURCES.map(
      (r) => `<li><a href="${r.url}">${esc(r.name)}</a> (${esc(r.cost)}): ${esc(r.what)}</li>`,
    ).join("")}</ul>
  </section>
  <nav><a href="${SITE_URL}/cyber-club">South CTA Cyber Club</a> · <a href="${SITE_URL}/ncl">National Cyber League notes</a> · <a href="${SITE_URL}/tools">Browser tools</a></nav>
</main>`;

  /*
    Static bodies for the pages that had none.

    Nineteen routes prerendered the site nav and nothing else: 297 characters,
    no heading, no prose. /resume, /projects, /contact and /certifications
    were among them, so a crawler reading the page a hiring manager or an
    admissions officer would be sent to found an empty document. React filled
    them in on the client, which does not help anything that does not run it.

    Every body below is generated from the same module the React page renders
    from, so the two cannot drift. Where a page's copy lives in the component
    rather than a config module, the summary here is deliberately short: it
    states what the page is and links onward, rather than duplicating prose
    that would go stale silently.
  */
  const li = (items: string[]) => items.map((i) => `<li>${i}</li>`).join("");
  const dl = (items: Array<{ title: string; detail: string }>) =>
    items
      .map((i) => `<dt>${esc(i.title)}</dt><dd>${esc(i.detail)}</dd>`)
      .join("\n    ");
  const backLinks = (
    links: Array<[string, string]>,
  ) => `<nav>${links.map(([href, label]) => `<a href="${SITE_URL}${href}">${esc(label)}</a>`).join(" · ")}</nav>`;

  const resumeContent = `
<main>
  <h1>Resume: ${esc(siteConfig.name)}</h1>
  <p>${esc(siteConfig.tagline)}</p>
  ${siteConfig.fullBio.map((para) => `<p>${esc(para)}</p>`).join("\n  ")}
  <section>
    <h2>Currently</h2>
    ${siteConfig.currently
      .map(
        (group) => `<h3>${esc(group.category)}</h3>
    <ul>${li(group.items.map(esc))}</ul>`,
      )
      .join("\n    ")}
  </section>
  <section>
    <h2>Leadership and service</h2>
    ${siteConfig.leadership
      .map(
        (role) => `<h3>${esc(role.title)}, ${esc(role.org)}</h3>
    <ul>${li(role.details.map(esc))}</ul>`,
      )
      .join("\n    ")}
  </section>
  <section>
    <h2>Achievements</h2>
    <dl>${dl(siteConfig.achievements.map((a) => ({ title: a.title, detail: a.description })))}</dl>
  </section>
  <section>
    <h2>Skills</h2>
    ${siteConfig.skillCategories
      .map(
        (cat) => `<h3>${esc(cat.name)}</h3>
    <ul>${li(cat.skills.map(esc))}</ul>`,
      )
      .join("\n    ")}
  </section>
  <section>
    <h2>Contact</h2>
    <p><a href="mailto:${esc(siteConfig.email)}">${esc(siteConfig.email)}</a></p>
  </section>
  ${backLinks([["/projects", "Projects"], ["/timeline", "Timeline"], ["/certifications", "Certifications"], ["/contact", "Contact"]])}
</main>`;

  const projectsContent = `
<main>
  <h1>Projects</h1>
  <p>Work by ${esc(siteConfig.name)} across cybersecurity, enterprise networking, 3D simulation and web development. Each one is something that runs, not a description of something planned.</p>
  ${siteConfig.projects
    .map(
      (project) => `<section>
    <h2>${esc(project.title)}</h2>
    <p>${esc(project.description)}</p>
    <p>Built with: ${project.tech.map(esc).join(", ")}</p>
    ${project.link ? `<p><a href="${project.link.startsWith("http") ? project.link : SITE_URL + project.link}">Open ${esc(project.title)}</a></p>` : ""}
  </section>`,
    )
    .join("\n  ")}
  ${backLinks([["/resume", "Resume"], ["/blog", "Field Notes"], ["/game", "Simulator"]])}
</main>`;

  const timelineContent = `
<main>
  <h1>Timeline</h1>
  <p>Competitions, awards and milestones for ${esc(siteConfig.name)}. Entries carry a date only where one is actually recorded; the rest are grouped as undated rather than given a guessed year.</p>
  ${TIMELINE_GROUPS.map(
    (group) => `<section>
    <h2>${esc(group.label)}</h2>
    ${group.note ? `<p>${esc(group.note)}</p>` : ""}
    <dl>${group.entries
      .map(
        (entry) =>
          `<dt>${esc(entry.title)}${entry.when ? ` (${esc(entry.when)})` : ""}</dt><dd>${esc(entry.description)}</dd>`,
      )
      .join("\n    ")}</dl>
  </section>`,
  ).join("\n  ")}
  <p>Press: <a href="${PRESS.url}">${esc(PRESS.headline)}</a>, ${esc(PRESS.outlet)}, ${esc(PRESS.displayDate)}.</p>
  ${backLinks([["/resume", "Resume"], ["/certifications", "Certifications"], ["/ncl", "National Cyber League"]])}
</main>`;

  const certificationsContent = `
<main>
  <h1>Certifications</h1>
  <p>What ${esc(siteConfig.name)} has earned, what is in progress, and what each exam actually covers. Nothing in progress is listed as earned.</p>
  ${ALL_CERTS.map(
    (cert) => `<section>
    <h2>${esc(cert.name)} (${esc(cert.code)})</h2>
    <p>${esc(cert.vendor)}, ${esc(cert.level)}. Status: ${esc(cert.statusLabel)}. ${esc(cert.statusDetail)}</p>
    <p>${esc(cert.covers)}</p>
    <p>${esc(cert.worth)}</p>
    <h3>Exam domains</h3>
    <dl>${dl(
      cert.domains.map((d: { name: string; weight: string; summary: string }) => ({
        title: `${d.name} (${d.weight})`,
        detail: d.summary,
      })),
    )}</dl>
    <p><a href="${cert.officialUrl}">Official ${esc(cert.code)} objectives</a></p>
  </section>`,
  ).join("\n  ")}
  ${backLinks([["/study", "Study guides"], ["/flashcards", "Flashcards"], ["/resume", "Resume"]])}
</main>`;

  const cyberClubContent = `
<main>
  <h1>${esc(clubConfig.fullName)}</h1>
  <p>${esc(clubConfig.intro)}</p>
  <p>${esc(clubConfig.school)}, ${esc(clubConfig.city)}, ${esc(clubConfig.region)}. President: ${esc(clubConfig.president)}.</p>
  <section>
    <h2>What the club does</h2>
    <dl>${dl(clubConfig.whatWeDo)}</dl>
  </section>
  <section>
    <h2>What you learn</h2>
    <dl>${dl(clubConfig.whatYouLearn)}</dl>
  </section>
  <section>
    <h2>How to join</h2>
    <ul>${li(clubConfig.howToJoin.map(esc))}</ul>
  </section>
  <section>
    <h2>Questions parents ask</h2>
    <dl>${clubConfig.parentFaq
      .map((f: { q: string; a: string }) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`)
      .join("\n    ")}</dl>
  </section>
  ${backLinks([["/cyber-club/kit", "Cyber Club in a Box"], ["/ncl", "National Cyber League notes"], ["/contact", "Contact"]])}
</main>`;

  const nowContent = `
<main>
  <h1>Now</h1>
  <p>${esc(nowConfig.intro)}</p>
  <p>Covering ${esc(nowConfig.period)}. Last updated ${esc(nowConfig.lastUpdatedDisplay)}.</p>
  ${nowConfig.sections
    .map(
      (section) => `<section>
    <h2>${esc(section.heading)}</h2>
    ${section.summary ? `<p>${esc(section.summary)}</p>` : ""}
    <dl>${dl(section.items.map((i: { title: string; detail: string }) => ({ title: i.title, detail: i.detail })))}</dl>
  </section>`,
    )
    .join("\n  ")}
  ${backLinks([["/uses", "Uses"], ["/roadmap", "Roadmap"], ["/blog", "Field Notes"]])}
</main>`;

  const usesContent = `
<main>
  <h1>Uses</h1>
  <p>${esc(usesConfig.intro)}</p>
  ${usesConfig.groups
    .map((group) => {
      // unconfirmed entries are placeholders the React page also refuses to
      // render. Prerendering them would publish a claim the site withholds.
      const items = group.items.filter(
        (i: { unconfirmed?: boolean }) => !i.unconfirmed,
      );
      if (!items.length) return "";
      return `<section>
    <h2>${esc(group.heading)}</h2>
    ${group.summary ? `<p>${esc(group.summary)}</p>` : ""}
    <dl>${items
      .map(
        (i: { name: string; why: string }) =>
          `<dt>${esc(i.name)}</dt><dd>${esc(i.why)}</dd>`,
      )
      .join("\n    ")}</dl>
  </section>`;
    })
    .filter(Boolean)
    .join("\n  ")}
  ${backLinks([["/now", "Now"], ["/colophon", "How this site is built"], ["/tools", "Browser tools"]])}
</main>`;

  const pathsContent = `
<main>
  <h1>Reading paths</h1>
  <p>Curated routes through the archive, in the order the ideas actually build on each other. Each step says why it comes after the one before it.</p>
  ${readingPaths
    .map(
      (rp) => `<section>
    <h2>${esc(rp.title)}</h2>
    <p>${esc(rp.blurb)}</p>
    <ol>${rp.steps
      .map((step: { slug: string; why: string }) => {
        const post = postIndex.find((p) => p.slug === step.slug);
        const label = post ? post.title : step.slug;
        return `<li><a href="${SITE_URL}/blog/${step.slug}">${esc(label)}</a>: ${esc(step.why)}</li>`;
      })
      .join("")}</ol>
  </section>`,
    )
    .join("\n  ")}
  ${backLinks([["/blog", "Field Notes"], ["/archive", "Archive"], ["/topics", "Topics"]])}
</main>`;

  const archiveContent = `
<main>
  <h1>Archive</h1>
  <p>Every field note on ${esc(siteConfig.siteUrl.replace("https://", ""))}, newest first. ${postIndex.length} articles.</p>
  <ul>${postIndex
    .map(
      (p) =>
        `<li><a href="${SITE_URL}/blog/${p.slug}">${esc(p.title)}</a> (${esc(formatPostDate(p.date))}): ${esc(p.excerpt)}</li>`,
    )
    .join("\n    ")}</ul>
  ${backLinks([["/blog", "Field Notes"], ["/topics", "Topics"], ["/paths", "Reading paths"]])}
</main>`;

  const roadmapContent = (() => {
    const counts = roadmapCounts();
    return `
<main>
  <h1>Roadmap</h1>
  <p>What is planned, in progress, done and blocked on this site, tracked in public. Last updated ${esc(ROADMAP_UPDATED)}. Done: ${counts.done}. In progress: ${counts["in-progress"]}. Planned: ${counts.planned}. Blocked: ${counts.blocked}.</p>
  ${ROADMAP.map(
    (group) => `<section>
    <h2>${esc(group.title)}</h2>
    <p>${esc(group.blurb)}</p>
    <ul>${group.items
      .map(
        (item: { id: number; title: string; status: string; note?: string }) =>
          `<li>${esc(item.title)} (${esc(item.status)})${item.note ? `: ${esc(item.note)}` : ""}</li>`,
      )
      .join("")}</ul>
  </section>`,
  ).join("\n  ")}
  ${backLinks([["/roadmap", "Roadmap"], ["/colophon", "Colophon"], ["/now", "Now"]])}
</main>`;
  })();


  const flashcardsContent = `
<main>
  <h1>Flashcards</h1>
  <p>Spaced repetition decks for networking, ports, security, Linux and cryptography. ${DECKS.reduce((n: number, d: { cards: unknown[] }) => n + d.cards.length, 0)} cards across ${DECKS.length} decks, scheduled in the browser with nothing sent anywhere.</p>
  ${DECKS.map(
    (deck) => `<section>
    <h2>${esc(deck.name)}</h2>
    <p>${esc(deck.description)} ${deck.cards.length} cards.</p>
  </section>`,
  ).join("\n  ")}
  ${backLinks([["/study", "Study guides"], ["/certifications", "Certifications"], ["/tools", "Browser tools"]])}
</main>`;

  const linksContent = `
<main>
  <h1>Links</h1>
  <p>Free and freemium resources worth the time, grouped by what they are for. Every entry points at a site root rather than a deep path, because a guessed deep link rots and takes the reader's trust with it.</p>
  ${LINK_GROUPS.map(
    (group) => `<section>
    <h2>${esc(group.heading)}</h2>
    <p>${esc(group.summary)}</p>
    <dl>${group.items
      .map(
        (r: { name: string; url: string; why: string; access: string }) =>
          `<dt><a href="${r.url}">${esc(r.name)}</a> (${esc(r.access)})</dt><dd>${esc(r.why)}</dd>`,
      )
      .join("\n    ")}</dl>
  </section>`,
  ).join("\n  ")}
  ${backLinks([["/study", "Study guides"], ["/ncl", "National Cyber League notes"], ["/tools", "Browser tools"]])}
</main>`;

  const colophonContent = `
<main>
  <h1>Colophon</h1>
  <p>How ${esc(siteConfig.siteUrl.replace("https://", ""))} is built, and why each piece was chosen over the alternative.</p>
  <section>
    <h2>Stack</h2>
    <dl>${STACK.map(
      (item: { name: string; role: string; detail: string }) =>
        `<dt>${esc(item.name)} (${esc(item.role)})</dt><dd>${esc(item.detail)}</dd>`,
    ).join("\n    ")}</dl>
  </section>
  <section>
    <h2>Decisions</h2>
    ${DECISIONS.map(
      (d: { title: string; body: string[] }) => `<h3>${esc(d.title)}</h3>
    ${d.body.map((para) => `<p>${esc(para)}</p>`).join("\n    ")}`,
    ).join("\n    ")}
  </section>
  ${backLinks([["/roadmap", "Roadmap"], ["/colophon", "Colophon"], ["/uses", "Uses"]])}
</main>`;

  const subscribeContent = `
<main>
  <h1>Subscribe</h1>
  <p>The field notes publish to a feed at <a href="${SITE_URL}/feed.xml">${SITE_URL}/feed.xml</a>. A feed is a plain file this site updates when something new goes out; your reader checks it and shows you the new posts. No account, no algorithm deciding what you see, and no way for anyone here to know you are reading.</p>
  <section>
    <h2>Readers worth trying</h2>
    <p>One per situation rather than a ranked list. Which one is right depends far more on which devices you own than on features.</p>
    <dl>${READERS.map(
      (r: { name: string; url: string; platforms: string; note: string }) =>
        `<dt><a href="${r.url}">${esc(r.name)}</a> (${esc(r.platforms)})</dt><dd>${esc(r.note)}</dd>`,
    ).join("\n    ")}</dl>
  </section>
  ${backLinks([["/blog", "Field Notes"], ["/archive", "Archive"], ["/paths", "Reading paths"]])}
</main>`;

  const askContent = `
<main>
  <h1>Ask</h1>
  <p>Questions about networking, security, the home lab, competition prep or starting a club. This site is static files on a CDN with nothing running behind it, so the page composes your message and hands it to something that can deliver it: a mail client, or GitHub. You see the full text before anything is sent.</p>
  <section>
    <h2>Already answered</h2>
    <p>These have a written answer already. Worth checking before asking.</p>
    <ul>${ANSWERED.map(
      (a: { question: string; href: string; answer: string }) =>
        `<li>${esc(a.question)}: <a href="${SITE_URL}${a.href}">${esc(a.answer)}</a></li>`,
    ).join("\n    ")}</ul>
  </section>
  <p>Direct email: <a href="mailto:${esc(siteConfig.email)}">${esc(siteConfig.email)}</a></p>
  ${backLinks([["/contact", "Contact"], ["/faq", "FAQ"], ["/blog", "Field Notes"]])}
</main>`;

  const campsContent = `
<main>
  <h1>Youth coding camps</h1>
  <p>Coding camps taught by ${esc(siteConfig.name)} across the Las Vegas Valley. Students write real code from the first session; nothing is dragged into place on their behalf.</p>
  <section>
    <h2>What the camps cover</h2>
    <dl>${dl(COVERS)}</dl>
  </section>
  <section>
    <h2>What a beginner takes home</h2>
    <dl>${dl(TAKEAWAYS)}</dl>
  </section>
  <p>To ask about a session, email <a href="mailto:${esc(siteConfig.email)}">${esc(siteConfig.email)}</a>.</p>
  ${backLinks([["/contact", "Contact"], ["/cyber-club", "Cyber Club"], ["/projects", "Projects"]])}
</main>`;

  const contactContent = `
<main>
  <h1>Contact</h1>
  <p>${esc(siteConfig.name)}, ${esc(siteConfig.tagline)}. Based in Las Vegas, Nevada.</p>
  <p>Email: <a href="mailto:${esc(siteConfig.email)}">${esc(siteConfig.email)}</a></p>
  <p>GitHub: <a href="${siteConfig.social.github.url}">${esc(siteConfig.social.github.handle)}</a></p>
  <p>Worth reaching out about: cybersecurity competition and club setup, enterprise networking and home lab questions, youth coding instruction, and speaking to student groups. Questions with a general answer are better on <a href="${SITE_URL}/ask">the ask page</a>, where the answer can be published for the next person with the same one.</p>
  ${backLinks([["/ask", "Ask"], ["/resume", "Resume"], ["/faq", "FAQ"]])}
</main>`;

  const studyTimerContent = `
<main>
  <h1>Study timer</h1>
  <p>A focus timer for certification study, built around work intervals separated by short breaks and a longer break every few cycles. Work, short break, long break and cycle length are all adjustable.</p>
  <p>It runs entirely in the browser. Settings and session counts are kept in local storage on your own device, nothing is sent anywhere, and no account is needed. Closing the tab loses nothing; reopening it restores where you were.</p>
  ${backLinks([["/study", "Study guides"], ["/flashcards", "Flashcards"], ["/certifications", "Certifications"]])}
</main>`;

  const nclHubContent = `
<main>
  <h1>National Cyber League</h1>
  <p>What the National Cyber League is, how the scoring works, how to prepare for it, and a written guide to every challenge category. The competition runs capture the flag style challenges on the Cyber Skyline platform, scored on accuracy and completion rather than speed alone.</p>
  <section>
    <h2>Category guides</h2>
    <dl>${NCL_GUIDE_DATA.map(
      (guide: { slug: string; category: string; tagline: string }) =>
        `<dt><a href="${SITE_URL}/ncl/${guide.slug}">${esc(guide.category)}</a></dt><dd>${esc(guide.tagline)}</dd>`,
    ).join("\n    ")}</dl>
  </section>
  <section>
    <h2>Competition day checklist</h2>
    <ol>${li(DAY_CHECKLIST.map(esc))}</ol>
  </section>
  <section>
    <h2>Mistakes worth not repeating</h2>
    <ul>${li(MISTAKES.map(esc))}</ul>
  </section>
  ${backLinks([["/study", "Study guides"], ["/flashcards", "Flashcards"], ["/cyber-club", "Cyber Club"], ["/links", "Links"]])}
</main>`;

/*
  Both of these pages are mostly a WebGL canvas, which a crawler cannot see
  and a reader with WebGL disabled cannot either. The prose below is the
  page's actual argument rather than a summary of it, so what is indexed is
  worth indexing.
*/
/*
  Prose for the five simulator dashboards.

  Hand written rather than rendered, for the same reason the WebGL pages
  above are: these are charts and counters, so a React render would give a
  crawler a page of axis labels. Each says what the dashboard is, what it
  reads, and that the numbers are modelled rather than measured, which is
  the one thing a reader arriving cold most needs to be told.

  Every block opens at h1. Three pages once shipped starting at h2 because
  their hand-authored prose did, and check-heading-order exists because of
  it.
*/
const nocDashContent = `
  <h1>NOC Overview</h1>
  <p>The network operations view of the datacenter simulator. It watches the
  modelled floor the way a real NOC watches a real one: what is alarming right
  now, how many of those are critical, whether the site is holding its uptime
  target, and how quickly alerts are being answered.</p>
  <h2>What it shows</h2>
  <ul>
    <li>Alert volume over time, so a burst is visible as a burst rather than
    as a number that happens to be high.</li>
    <li>An uptime trend, which is the figure a service level agreement is
    written against.</li>
    <li>Active alerts, criticals, uptime and average response, as counters.</li>
  </ul>
  <p>Every figure is generated by the simulation on this site. Nothing here is
  telemetry from real hardware, and none of it describes a real outage.</p>
`;

const networkDashContent = `
  <h1>Network Operations</h1>
  <p>The fabric view of the datacenter simulator: what is connected to what,
  how much is moving across it, and whether any of it is close to a limit.</p>
  <h2>What it shows</h2>
  <ul>
    <li>Throughput in gigabits per second, as a trend rather than a snapshot,
    because a link at eighty percent all day and a link that spikes to eighty
    percent once are different problems.</li>
    <li>A latency heatline, which makes a slow path visible next to a busy
    one.</li>
    <li>Node and link counts, overall utilisation, and the number of edge
    servers.</li>
  </ul>
  <p>The topology and the traffic are both modelled. They are shaped to behave
  plausibly, not copied from a real network.</p>
`;

const floorDashContent = `
  <h1>Floor Operations</h1>
  <p>The physical view of the datacenter simulator. A floor is a thermal
  problem before it is a compute problem, and this is the page that says so:
  where the heat is, whether the air is going where it should, and how the
  racks are spread across the zones.</p>
  <h2>What it shows</h2>
  <ul>
    <li>Temperature distribution across the floor, so a hot aisle reads as a
    shape rather than as an average.</li>
    <li>Zone utilisation, which is what decides where the next rack can go.</li>
    <li>Total racks, average temperature, airflow balance and active zones.</li>
  </ul>
  <p>The thermal figures come from the simulation. They are modelled to be
  reasonable for the hardware drawn on the floor, not measured from it.</p>
`;

const incidentsDashContent = `
  <h1>Incident Command</h1>
  <p>The incident view of the datacenter simulator: what is open, how bad it
  is, and how long it is taking to close. An alert is a signal and an incident
  is work, and the two want different pages.</p>
  <h2>What it shows</h2>
  <ul>
    <li>Severity breakdown, because ten low incidents and one critical are not
    eleven of anything.</li>
    <li>A response time trend, against which a bad week is visible.</li>
    <li>Open incidents, criticals, runbooks available, and median time to
    repair.</li>
  </ul>
  <p>Every incident here is generated by the simulation. None of them
  happened, and none of the response times are anybody's real numbers.</p>
`;

const buildDashContent = `
  <h1>Build Command Center</h1>
  <p>The change view of the datacenter simulator. Racks get added, moved and
  filled, and each of those costs power and can leave the layout worse than it
  found it. This page tracks the changes rather than the steady state.</p>
  <h2>What it shows</h2>
  <ul>
    <li>A build activity timeline, so a burst of changes is visible against a
    quiet period.</li>
    <li>Power impact by hour, which is the constraint a build hits first.</li>
    <li>Active racks, build actions, total power impact and a layout health
    figure.</li>
  </ul>
  <p>The rack count and the power figures are the simulation's own. They
  describe the modelled floor on this site and nothing outside it.</p>
`;

const wiredRackContent = `
  <h1>The wired rack</h1>
  <p>Fourteen units of UniFi, patched the way somebody would actually patch it.
  The hardware is Ubiquiti's own geometry, the same models their store loads
  into its 3D viewer, so the panels are the panels and the ports are where the
  ports are. The build is mine: two PoE switches coming down to surge panels,
  fibre uplinks to the aggregation switch, storage taking copper straight to
  the nearest switch, and every power lead running down the side of the frame
  into the distribution unit.</p>
  <h2>What is in it</h2>
  <ul>
    <li>Dream Machine SE, the gateway, at the top of the rack.</li>
    <li>Pro Aggregation, which every other switch uplinks to on fibre.</li>
    <li>Two 24 port surge protection panels, where the building's cabling lands.</li>
    <li>Switch Pro Max 48 PoE and Switch Pro 24 PoE, the access layer.</li>
    <li>Enterprise Gateway, Network Video Recorder Pro and Network Attached Storage Pro.</li>
    <li>Power Distribution Pro at the bottom, which every power lead runs to.</li>
  </ul>
  <h2>Why it looks combed instead of tangled</h2>
  <p>The first version of this cabling let every lead find its own way from A
  to B, and the result was a bowl of spaghetti across the front of the rack. A
  dressed bundle is four moves and every lead makes the same four: out of the
  jack along the plug's axis, a turn down into a service loop, a run along the
  bottom of that loop to get under the far port, and back up into it. Because
  every lead turns at the same standoff and drops to the same belly, the
  vertical runs come out parallel. The only variation is how far out each one
  stands, and a long lead has to cross the ones underneath it, so it is
  layered further out.</p>
  <p>Power leads do none of that. They are thicker, they will not bend as
  tightly, and nobody dresses a C13 across the face of their switches, so they
  drop out of the inlet, run to whichever side of the frame is nearer, and
  travel vertically down to the outlet they land in.</p>
  <p>The 3D models are Ubiquiti's work and their copyright, used here to show
  their hardware. Ten of the eleven devices are theirs; the distribution unit
  is not, because Ubiquiti publish no model for it, so it is built by hand
  from their own dimensioned elevation.</p>
`;

const rackBuilderContent = `
  <h1>Build a rack</h1>
  <p>Seventy five rack mountable devices from six vendors, fifty of them in
  Ubiquiti's own published geometry, and an empty frame. Pick something and it lands in the highest free slot that
  fits it. A 2U will not go into a 1U gap, because a 2U does not go into a 1U
  gap. What you build is saved in your browser and can be shared as a link.</p>
  <h2>A rack is a list of occupied units, not a list of devices</h2>
  <p>That distinction is most of the code behind the page. Treat a rack as a
  list and a 2U dropped between two 1U devices either overlaps one of them or
  silently pushes it down, and both are wrong, because real hardware does
  neither. It either fits in the gap or it does not go in. So every placement
  asks whether a specific run of units is free, and refuses when it is not,
  which is why the frame buttons grey out when something in the build would
  hang below a shorter frame.</p>
  <h2>What a build weighs</h2>
  <p>The weight is on screen because this page cannot hide it. A drawn
  elevation costs a reader nothing whatever it contains, and this one costs
  them a download per distinct device. Bytes are counted once per file,
  because the browser caches it, and triangles once per placement, because
  two of the same switch are two of the same switch as far as the GPU is
  concerned. Reporting one figure for both would be wrong in one direction or
  the other.</p>
  <h2>Why nothing is patched</h2>
  <p>A vendor model is a closed box that does not know where its own jacks
  are. The wired rack manages leads only because its build is fixed and every
  port position was measured off a render by hand, which cannot be done for a
  rack assembled while somebody watches.</p>
  <p>The 3D models are Ubiquiti's work and their copyright, used here to show
  their hardware.</p>
`;

const teardownContent = `
  <h1>A PowerEdge, opened</h1>
  <p>This is a Dell PowerEdge R760 coming apart in the order a technician
  would take it apart, and the geometry is Dell's own. Their repair guides are
  built on a service model of the machine as thirty four named assemblies, so
  these are the real parts in their real positions, not a chassis drawn from a
  photograph. A 2U rather than a 1U on purpose: the GPUs, the four expansion
  risers, the RAID controller and the rear drive cage are the parts that do
  not fit in a 1U at all, and they are the ones worth watching come out.</p>
  <h2>The order of removal</h2>
  <ol>
    <li>Front bezel. Unlocks and pulls straight off. Nothing can be reached until it is gone.</li>
    <li>System cover, and the backplane cover behind it.</li>
    <li>Air shroud and rear drive shroud, which direct every cubic foot the fans move over the processors, then the drive carriers.</li>
    <li>Cooling fans, power supplies and the rear drive cage. The first two are hot swap.</li>
    <li>Both GPUs, all four expansion risers, and the PERC controller the front drives hang off.</li>
    <li>Processors and heatsinks, thirty two memory slots, the BOSS-N1 boot carrier, LOM, OCP and rear I/O.</li>
    <li>Drive backplane, internal USB, intrusion switch, control panels, side wall brackets, system battery and TPM.</li>
    <li>System board, last, because everything else is bolted to it or plugged into it.</li>
  </ol>
  <h2>Where the geometry came from</h2>
  <p>Dell publish WebXR repair guides for a handful of PowerEdge platforms,
  and behind each one is a glTF scene of the machine. It is not offered as a
  download and nothing links to it: the guide list is a POST only endpoint,
  the viewer is a lazily loaded iframe, and the scene name sits inside a
  hashed JavaScript bundle. What ships here is that scene with the Unity
  furniture removed, a camera, several lights and an alternate parts tree of
  37 duplicate assemblies that render inside the real components. That took
  55.9MB to 31.8MB, still over what a static host will serve as one file, and
  then the useful discovery: 94 percent of what was left was 77 textures
  against 1.9MB of actual geometry. Resized to 1024 and encoded webp, the
  whole machine is 4.2MB, smaller than the 1U it replaced.</p>
  <p>The 3D model is Dell's work and their copyright, used here to show their
  hardware. The teardown order, the travel directions and the notes are mine.</p>
`;

  /*
    Keyed by the same `dir` the STANDALONE list uses, so adding a page without
    a body here is caught by check-prerender-depth rather than shipping empty.
  */
  const STANDALONE_CONTENT: Record<string, string> = {
    archive: archiveContent,
    paths: pathsContent,
    now: nowContent,
    uses: usesContent,
    resume: resumeContent,
    timeline: timelineContent,
    "cyber-club": cyberClubContent,
    "cyber-club/kit": kitContent,
    "coding-camps": campsContent,
    colophon: colophonContent,
    links: linksContent,
    subscribe: subscribeContent,
    "study-timer": studyTimerContent,
    ask: askContent,
    certifications: certificationsContent,
    ncl: nclHubContent,
    flashcards: flashcardsContent,
    noc: nocDashContent,
    network: networkDashContent,
    floor: floorDashContent,
    incidents: incidentsDashContent,
    build: buildDashContent,
    "racks/wired": wiredRackContent,
    "racks/build": rackBuilderContent,
    teardown: teardownContent,
  };

  for (const page of STANDALONE) {
    const { dir, ...meta } = page;
    if (dir === "faq") {
      await writePage(dir, base, { ...meta, schema: faqSchema, rootContent: faqContent });
      continue;
    }
    await writePage(dir, base, { ...meta, rootContent: STANDALONE_CONTENT[dir] });
  }

  // ── projects ──
  await writePage("projects", base, {
    title: "Projects | Max Doubin",
    description:
      "Projects by Max Doubin in cybersecurity, enterprise networking, 3D datacenter simulation, and web development.",
    canonical: `${SITE_URL}/projects`,
    rootContent: projectsContent,
  });

  // ── contact ──
  await writePage("contact", base, {
    title: "Contact | Max Doubin",
    description:
      "Get in touch with Max Doubin, cybersecurity specialist and enterprise networking expert based in Las Vegas, Nevada.",
    canonical: `${SITE_URL}/contact`,
    rootContent: contactContent,
  });

  // ── National Cyber League category guides ──
  /*
    Derived from nclGuides.ts rather than listed here. The hardcoded copy of
    this list had seven entries while the data had nine, so two guides existed
    in the app and in no static document. A list that has to be edited twice
    gets edited once.
  */
  const NCL_GUIDES: Array<[string, string, string]> = NCL_GUIDE_DATA.map(
    (g: { slug: string; category: string; seoDescription: string }) =>
      [g.slug, g.category, g.seoDescription] as [string, string, string],
  );
  for (const [slug, name, description] of NCL_GUIDES) {
    const url = `${SITE_URL}/ncl/${slug}`;
    /*
      Give the guide a body a crawler can read.

      These pages were prerendering ten characters: the loading
      placeholder. Everything a reader sees is rendered from nclGuides.ts
      after hydration, so to Google they were empty pages in the sitemap,
      which is worse than not listing them. The data was already there; it
      just was not being written into the HTML.
    */
    const guide = NCL_GUIDE_DATA.find((g) => g.slug === slug);
    const guideContent = guide
      ? `
<main>
  <h1>${esc(guide.category)}</h1>
  <p>${esc(guide.tagline)}</p>
  <h2>What it tests</h2>
  <ul>
${guide.whatItTests.map((t) => `    <li>${esc(t)}</li>`).join("\n")}
  </ul>
  <h2>How to think about it</h2>
${guide.mentalModel.map((m) => `  <p>${esc(m)}</p>`).join("\n")}
  <h2>Tools</h2>
  <ul>
${guide.tools.map((t) => `    <li><strong>${esc(t.name)}</strong>: ${esc(t.use)}</li>`).join("\n")}
  </ul>
  <h2>Worked example</h2>
  <p>${esc(guide.walkthrough.scenario)}</p>
  <ol>
${guide.walkthrough.steps.map((st) => `    <li><strong>${esc(st.label)}</strong>: ${esc(st.detail)}</li>`).join("\n")}
  </ol>
  <p>Answer: ${esc(guide.walkthrough.answer)}</p>
  <h2>Common mistakes</h2>
  <ul>
${guide.mistakes.map((m) => `    <li>${esc(m)}</li>`).join("\n")}
  </ul>
  <h2>References</h2>
  <ul>
${guide.resources.map((r) => `    <li><a href="${r.url}">${esc(r.label)}</a>: ${esc(r.detail)}</li>`).join("\n")}
  </ul>
${
  /*
    The self-check, written into the static body as well as the JSON-LD.

    The quiz is a React component, so on the first HTML crawl it does not
    exist. Marking up a Quiz for questions that are nowhere in the document
    is exactly the mismatch Google treats as spam: the guidance for practice
    problems is that the marked-up content has to be on the page for the
    reader too. Rendering the questions here keeps the two in step, and it
    is the same trade the rest of this body already makes, since React
    replaces the whole block on mount and no reader ever sees it.
  */
  guide.quiz.length
    ? `  <h2>Check yourself</h2>
  <ol>
${guide.quiz
  .map(
    (q) => `    <li>
      <p>${esc(q.question)}</p>
      <ul>
${q.choices.map((c) => `        <li>${esc(c)}</li>`).join("\n")}
      </ul>
      <p>Answer: ${esc(q.choices[q.correctIndex])}. ${esc(q.explanation)}</p>
    </li>`,
  )
  .join("\n")}
  </ol>
`
    : ""
}  <p><a href="${SITE_URL}/ncl">All National Cyber League category guides</a></p>
</main>`
      : undefined;

    /*
      Quiz markup for the nine category guides.

      Each guide ships a real multiple-choice self-check with a written
      explanation, which is the one content shape Google has a dedicated
      education rich result for. Without it these pages compete as plain
      prose against every other write-up of the same nine categories.

      The explanation is attached only to the accepted answer. The data holds
      one explanation per question, not one per choice, so repeating it under
      each distractor would be inventing a rationale the author never wrote
      for that option.

      Guarded on quiz.length so a guide added later without a quiz emits no
      empty Quiz, which would be a rich result promising questions and
      carrying none.
    */
    const quizSchema =
      guide && guide.quiz.length
        ? `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Quiz",
  name: `${guide.category} self-check`,
  url,
  about: { "@type": "Thing", name: guide.category },
  educationalUse: "Practice",
  learningResourceType: "Practice problem",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
  hasPart: guide.quiz.map((q) => ({
    "@type": "Question",
    eduQuestionType: "Multiple choice",
    learningResourceType: "Practice problem",
    name: q.question,
    text: q.question,
    acceptedAnswer: {
      "@type": "Answer",
      position: q.correctIndex,
      text: q.choices[q.correctIndex],
      comment: { "@type": "Comment", text: q.explanation },
    },
    suggestedAnswer: q.choices
      .map((choice, position) => ({ choice, position }))
      .filter((c) => c.position !== q.correctIndex)
      .map((c) => ({ "@type": "Answer", position: c.position, text: c.choice })),
  })),
})}
</script>
`
        : "";

    await writePage(`ncl/${slug}`, base, {
      title: pageTitle(`${name} | NCL Guide`),
      description,
      canonical: url,
      rootContent: guideContent,
      schema: `${quizSchema}<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "National Cyber League", item: `${SITE_URL}/ncl` },
    { "@type": "ListItem", position: 3, name, item: url },
  ],
})}
</script>`,
    });
  }

  // ── the practise hub ──
  const practiseDescription =
    "Everything on this site you do rather than read: branching incident scenarios with many " +
    "endings, a simulated Linux host with a fault in it, packet captures with a real display " +
    "filter bar, spaced-repetition flashcards and exam objective sheets.";

  await writePage("practise", base, {
    title: "Practise | Max Doubin",
    description: practiseDescription,
    canonical: `${SITE_URL}/practise`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Practise",
  description: practiseDescription,
  url: `${SITE_URL}/practise`,
  numberOfItems: 12,
  itemListElement: [
    ["Incident scenarios", "/scenarios"],
    ["Hands-on labs", "/labs"],
    ["Packet captures", "/capture"],
    ["Flashcards", "/flashcards"],
    ["Exam objectives", "/study"],
    ["Browser tools", "/tools"],
    ["Glossary", "/glossary"],
    ["Why the transfer is slow", "/transfer"],
    ["Read the log", "/logs"],
    ["Ping works and the transfer hangs", "/mtu"],
    ["The first class that matches", "/permissions"],
    ["The queue is sorted wrong", "/patch"],
    ["Three retries, four layers", "/retry"],
    ["The frame that arrived untagged", "/vlan"],
    ["Four errors, none of which says the word time", "/clock"],
    ["No space left on device", "/space"],
    ["Something has to die", "/oom"],
    ["It started before the thing it needs", "/units"],
    ["It works from outside", "/nat"],
    ["The graph crossed the line", "/alerts"],
    ["Forty, and idle", "/load"],
    ["Thirty percent, and stalling", "/throttle"],
    ["The page that showed somebody else's name", "/cache"],
    ["Longest prefix wins", "/route"],
    ["You have backups, not restores", "/restore"],
  ].map(([name, path], index) => ({
    "@type": "ListItem",
    position: index + 1,
    name,
    url: `${SITE_URL}${path}`,
  })),
})}
</script>`,
    rootContent: `
<main>
  <h1>Practise</h1>
  <p>
    Reading about an incident and being in one are different skills, and only
    one of them is what a bad night asks for. These are the parts of this site
    that make you do something, grouped by the situation you are in rather
    than by subject, because the subject is not what anybody arrives knowing.
  </p>
${GROUPS.map((group) => `  <h2 id="${group}">${esc(GROUP_HEADING[group])}</h2>
  <p>${esc(GROUP_BLURB[group])}</p>
  <ul>
${PRACTISE_SURFACES.filter((surface) => surface.group === group)
  .map((surface) => `    <li><a href="${SITE_URL}${surface.href}">${esc(surface.title)}</a></li>`)
  .join("\n")}
  </ul>`).join("\n")}
  <p>
    Nothing here is scored and nothing needs an account. Progress is kept in
    your browser and nowhere else.
  </p>
  ${backLinks([["/blog", "Field Notes"], ["/study", "Study guides"], ["/ncl", "National Cyber League notes"]])}
</main>`,
  });

  // ── packet captures ──
  const capturesIndexDescription =
    "Read a packet capture in the browser, with a real Wireshark display filter bar. Find the " +
    "password sent in the clear, and the beacon that checks in every sixty seconds.";

  await writePage("capture", base, {
    title: "Packet Captures | Max Doubin",
    description: capturesIndexDescription,
    canonical: `${SITE_URL}/capture`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Packet capture exercises",
  description: capturesIndexDescription,
  url: `${SITE_URL}/capture`,
  numberOfItems: CAPTURES.length,
  itemListElement: CAPTURES.map((capture, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: capture.title,
    description: capture.tagline,
    url: `${SITE_URL}/capture/${capture.slug}`,
  })),
})}
</script>`,
    rootContent: `
<main>
  <h1>Packet captures</h1>
  <p>
    A packet list, a detail tree and a display filter bar that takes real
    Wireshark syntax. Type a filter, narrow a hundred packets to four, and
    answer the question.
  </p>
  <p>
    The filter bar supports equality and inequality, ordering, substring
    matching with contains, field existence, and boolean operators with
    brackets, on any field the packets carry. It refuses what it cannot do
    rather than quietly ignoring half an expression.
  </p>
  <ul>
${CAPTURES.map(
  (capture) =>
    `    <li><a href="${SITE_URL}/capture/${capture.slug}">${esc(capture.title)}</a> ` +
    `(${esc(capture.difficulty)}, ${capture.packets.length} packets): ${esc(capture.tagline)}</li>`,
).join("\n")}
  </ul>
  ${backLinks([["/labs", "Hands-on labs"], ["/scenarios", "Incident scenarios"], ["/tools", "Browser tools"]])}
</main>`,
  });

  for (const capture of CAPTURES) {
    const url = `${SITE_URL}/capture/${capture.slug}`;
    await writePage(`capture/${capture.slug}`, base, {
      title: pageTitle(`${capture.title} | Packet capture`),
      description: `${capture.tagline} A ${capture.difficulty} packet analysis exercise with ${capture.questions.length} questions.`,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: capture.title,
  description: capture.tagline,
  url,
  learningResourceType: "Exercise",
  educationalUse: "Practice",
  interactivityType: "active",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  educationalLevel: capture.difficulty,
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script><script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Captures", item: `${SITE_URL}/capture` },
    { "@type": "ListItem", position: 3, name: capture.title, item: url },
  ],
})}
</script>`,
      rootContent: `
<main>
  <h1>${esc(capture.title)}</h1>
  <p>${esc(capture.tagline)}</p>
${capture.brief.map((paragraph) => `  <p>${esc(paragraph)}</p>`).join("\n")}
  <h2>The questions</h2>
  <ol>
${capture.questions.map((question) => `    <li>${esc(question.prompt)}</li>`).join("\n")}
  </ol>
  <p>
    ${capture.packets.length} packets. The workbench opens above with a filter
    bar taking real Wireshark display filter syntax. Answers are not written
    into this page, because the exercise is finding them.
  </p>
  ${backLinks([["/capture", "All captures"], ["/labs", "Hands-on labs"], ["/tools", "Browser tools"]])}
</main>`,
    });
  }

  // ── hands-on labs ──
  /*
    The labs are a simulated shell, so the static body is the brief and the
    hints rather than anything you could type into it. Writing the solutions
    out would remove the whole exercise for anyone arriving from search.
  */
  const labsIndexDescription =
    "A simulated Linux host in the browser, with a fault in it. Read the interface, the routing " +
    "table, the sockets and the logs, and say what is wrong. Nothing here touches a real machine.";

  await writePage("labs", base, {
    title: "Hands-on Labs | Max Doubin",
    description: labsIndexDescription,
    canonical: `${SITE_URL}/labs`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Hands-on Linux and networking labs",
  description: labsIndexDescription,
  url: `${SITE_URL}/labs`,
  numberOfItems: LABS.length,
  itemListElement: LABS.map((lab, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: lab.title,
    description: lab.tagline,
    url: `${SITE_URL}/labs/${lab.slug}`,
  })),
})}
</script>`,
    rootContent: `
<main>
  <h1>Hands-on labs</h1>
  <p>
    A Linux host, simulated in the browser, with something wrong with it. Real
    command output, real permission bits, a real routing table, real logs.
  </p>
  <p>
    Most of these ask for a diagnosis rather than a repair, because that is
    the shape of nearly all troubleshooting: you are not asked to fix the
    router, you are asked to say which of six things is wrong before anyone
    lets you near it.
  </p>
  <ul>
${LABS.map(
  (lab) =>
    `    <li><a href="${SITE_URL}/labs/${lab.slug}">${esc(lab.title)}</a> ` +
    `(${esc(lab.difficulty)}): ${esc(lab.tagline)}</li>`,
).join("\n")}
  </ul>
  ${backLinks([["/scenarios", "Incident scenarios"], ["/tools", "Browser tools"], ["/study", "Study guides"]])}
</main>`,
  });

  for (const lab of LABS) {
    const url = `${SITE_URL}/labs/${lab.slug}`;
    await writePage(`labs/${lab.slug}`, base, {
      title: pageTitle(`${lab.title} | Lab`),
      description: `${lab.tagline} A hands-on ${lab.difficulty} lab in a simulated Linux shell.`,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: lab.title,
  description: lab.tagline,
  url,
  learningResourceType: "Exercise",
  educationalUse: "Practice",
  interactivityType: "active",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  educationalLevel: lab.difficulty,
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script><script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Labs", item: `${SITE_URL}/labs` },
    { "@type": "ListItem", position: 3, name: lab.title, item: url },
  ],
})}
</script>`,
      rootContent: `
<main>
  <h1>${esc(lab.title)}</h1>
  <p>${esc(lab.tagline)}</p>
  <h2>The brief</h2>
${lab.brief.map((paragraph) => `  <p>${esc(paragraph)}</p>`).join("\n")}
  <h2>How it works</h2>
  <p>
    The lab runs a simulated Linux host in your browser. Nothing reaches a
    real machine and nothing you type leaves the page. There are
    ${lab.hints.length} hints, opened one at a time, and the machine can be
    restarted at any point.
  </p>
${
  lab.reading?.length
    ? `  <h2>The written version</h2>\n  <ul>\n${lab.reading
        .map((link) => `    <li><a href="${SITE_URL}${link.href}">${esc(link.label)}</a></li>`)
        .join("\n")}\n  </ul>`
    : ""
}
  ${backLinks([["/labs", "All labs"], ["/scenarios", "Incident scenarios"], ["/tools", "Browser tools"]])}
</main>`,
    });
  }

  // ── protocol handshakes ──
  /*
    The steps and the breaks go into the static body in full. A page listing
    what a TCP handshake carries and what a lost SYN-ACK looks like is exactly
    what somebody searches for at two in the morning, and none of it is a
    puzzle to be spoiled.
  */
  const handshakeDescription =
    "TCP, TLS 1.3, DHCP and 802.1X drawn as conversations, with a control for breaking one step " +
    "and seeing where the exchange stops and what the symptom is.";

  await writePage("handshake", base, {
    title: "Protocol Handshakes | Max Doubin",
    description: handshakeDescription,
    canonical: `${SITE_URL}/handshake`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Protocol handshakes",
  description: handshakeDescription,
  url: `${SITE_URL}/handshake`,
  learningResourceType: "Reference",
  educationalUse: "Practice",
  interactivityType: "active",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  teaches: HANDSHAKES.map((handshake) => handshake.title),
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script>`,
    rootContent: `
<main>
  <h1>Handshakes</h1>
  <p>
    Four exchanges drawn as conversations, playable a step at a time, each with
    a control for breaking one step and watching where the sequence stops.
  </p>
  <p>
    The stopping point is the diagnosis. A SYN with no reply and a SYN answered
    by a reset are the same experience to a person and opposite facts about the
    firewall. Every break named here says where it stops, what you would
    actually see, and who can fix it.
  </p>
${HANDSHAKES.map(
  (handshake) => `  <h2>${esc(handshake.title)}</h2>
  <p>${esc(handshake.tagline)}</p>
${handshake.brief.map((paragraph) => `  <p>${esc(paragraph)}</p>`).join("\n")}
  <h3>The exchange</h3>
  <ol>
${handshake.steps
  .map(
    (step) =>
      `    <li><strong>${esc(step.label)}</strong>, ${esc(step.from)} to ${esc(step.to)}: ` +
      `${esc(step.detail)} Carries ${esc(step.carries.join(", "))}.</li>`,
  )
  .join("\n")}
  </ol>
  <h3>Where it goes wrong</h3>
  <ul>
${handshake.breaks
  .map(
    (item) =>
      `    <li><strong>${esc(item.label)}</strong>: stops at step ${item.stopsAt}. ` +
      `${esc(item.symptom)} Fixed by ${esc(item.owner)}. ${esc(item.explain[0])}</li>`,
  )
  .join("\n")}
  </ul>
${handshake.notes.map((note) => `  <p>${esc(note)}</p>`).join("\n")}`,
).join("\n")}
  ${backLinks([["/capture", "Packet captures"], ["/chain", "Certificate chains"], ["/practise", "All practise material"]])}
</main>`,
  });

  // ── today ──
  /*
    The static body cannot name today's items, because the build ran on some
    other day and a crawler would index a set that no longer exists. What it
    describes is the mechanism, which does not change.
  */
  const todayDescription =
    "One thing from every practise surface, chosen by the date and the same for everybody: an " +
    "incident to decide, a host to diagnose, a capture to read, a flag to find, a message to " +
    "judge, a chain to reorder, a name to resolve, a certificate to attribute, a block to divide " +
    "and a slow transfer to explain.";

  await writePage("today", base, {
    title: "Today | Max Doubin",
    description: todayDescription,
    canonical: `${SITE_URL}/today`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Today",
  description: todayDescription,
  url: `${SITE_URL}/today`,
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Today</h1>
  <p>
    One thing from each practise surface, chosen by the date. The same set for
    everybody, and different tomorrow.
  </p>
  <p>
    The selection is a rotation rather than a shuffle, so each surface walks
    through everything it has before repeating any of it. Nothing is stored and
    nothing is fetched: the date is the whole of the state, which is also why a
    link to this page still shows today's set when you open it twice.
  </p>
  <h2>What it draws from</h2>
  <ul>
    <li><a href="${SITE_URL}/scenarios">Incident scenarios</a>, an incident to decide.</li>
    <li><a href="${SITE_URL}/labs">Hands-on labs</a>, a host to diagnose at a prompt.</li>
    <li><a href="${SITE_URL}/capture">Packet captures</a>, a trace to read with display filters.</li>
    <li><a href="${SITE_URL}/challenges">Capture the flag</a>, an artefact with one exact answer.</li>
    <li><a href="${SITE_URL}/triage">Phishing triage</a>, a message to call and a signal to cite.</li>
    <li><a href="${SITE_URL}/firewall">Firewall exercises</a>, a chain with something wrong with it.</li>
    <li><a href="${SITE_URL}/resolve">DNS resolution</a>, a symptom to attribute from the trace.</li>
    <li><a href="${SITE_URL}/chain">Certificate chains</a>, a TLS error and whose problem it is.</li>
    <li><a href="${SITE_URL}/allocate">Address plans</a>, a block to divide between competing needs.</li>
    <li><a href="${SITE_URL}/transfer">Throughput</a>, a slow transfer and which ceiling is costing the time.</li>
    <li><a href="${SITE_URL}/logs">Read the log</a>, what happened and the line that proves it.</li>
  </ul>
  <p>
    It also shows how far you have got on each, read from what those pages
    already record in your own browser. Nothing about your progress leaves the
    machine you are on.
  </p>
  ${backLinks([["/practise", "The practise hub"], ["/scenarios", "Incident scenarios"], ["/labs", "Hands-on labs"]])}
</main>`,
  });

  // ── backups and restores ──
  /*
    The postures go into the static body in full: the configuration is the
    content, and a reader is meant to look at it and decide. Which copies
    survive stays out, because that is the exercise.
  */
  const restoreDescription =
    "Every organisation that lost data had backups. Six incidents, each with a backup posture " +
    "that would pass an audit, and between zero and one copy that turns out to be worth anything.";

  await writePage("restore", base, {
    title: "You Have Backups, Not Restores | Max Doubin",
    description: restoreDescription,
    canonical: `${SITE_URL}/restore`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "You have backups, not restores",
  description: restoreDescription,
  url: `${SITE_URL}/restore`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches: "Recovery point and recovery time objectives, failure domains behind the 3-2-1 rule, and why immutability rather than copy count decides a ransomware outcome",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>You have backups, not restores</h1>
  <p>
    Every organisation that lost data had backups. That is not a paradox and
    it is not carelessness: a backup is a job that reports success, and a
    restore is a thing nobody does until the worst day of the year. The gap
    between the two is where the losses live.
  </p>
  <h2>The three things this keeps showing</h2>
  <ul>
    <li>A copy is only a copy if the incident cannot reach it. The 3-2-1 rule
      counts copies, media and sites, and the number that matters is none of
      those: it is how many ways there are to lose all of them at once.</li>
    <li>Recovery point is the backup interval plus how long the problem went
      unnoticed. For silent corruption that second term is measured in weeks,
      and retention rather than frequency decides whether you recover.</li>
    <li>Recovery time is mostly not the transfer. It is finding what to
      restore, getting the media back, moving bytes at restore speed rather
      than backup speed, rebuilding what sat on top, and proving it is right.</li>
  </ul>
  <h2>The incidents</h2>
${RESTORES.map((item) => `  <article>
    <h3>${esc(item.name)}</h3>
    <p>${esc(item.brief)}</p>
    <p>${item.gigabytes.toLocaleString()} GB to restore, noticed after ${item.detectionHours} hours, ` +
    `${item.rebuildHours} hours of rebuild on top, across ${failureDomains(item.copies)} independent failure domains.</p>
    <ul>
${item.copies.map((c) => `      <li>${esc(c.name)}: ${esc(c.medium)}, every ${c.intervalHours} hours, kept ${c.retentionDays} days, ` +
      `${c.immutable ? "immutable" : "writable"}${c.sharesWith === "none" ? "" : `, shares the ${c.sharesWith}`}, ` +
      `${c.retrievalHours} hours to reach, restores at ${c.restoreMbps} MB/s${c.everRestored ? "" : ", never restored from"}</li>`).join("\n")}
    </ul>
  </article>`).join("\n")}
  <p>
    The arithmetic here is deliberately optimistic: it assumes you know what
    to restore, the media is where the inventory says, and nothing fails
    during the restore. A real recovery is longer than this, every time.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/transfer", "Why the transfer is slow"], ["/array", "Array calculator"]])}
</main>`,
  });

  // ── longest prefix wins ──
  /*
    The tables go into the static body in full, because they are the content.
    The answers stay out: which route wins is the exercise, and printing it
    beside each destination would put the answer key in a search result.
  */
  const routeDescription =
    "A firewall chain is ordered and the first rule that matches decides. A routing table is not " +
    "ordered at all: the longest prefix wins wherever it sits in the output. Same wall of " +
    "prefixes, opposite rule, and the habit you build reading one is wrong for the other.";

  await writePage("route", base, {
    title: "Longest Prefix Wins | Max Doubin",
    description: routeDescription,
    canonical: `${SITE_URL}/route`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Longest prefix wins",
  description: routeDescription,
  url: `${SITE_URL}/route`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches: "Longest prefix match, administrative distance as a tie-break, and why a routing table is not read like a firewall chain",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Longest prefix wins</h1>
  <p>
    A firewall chain is ordered and the first rule that matches decides. A
    routing table is not ordered at all: the longest prefix wins wherever it
    sits in the output. Reading one the way you read the other is the single
    most common way to get the wrong answer, and both are printed as the same
    wall of prefixes.
  </p>
  <p>
    Administrative distance is the second trap. It is a tie-break within one
    prefix length and nothing else. A static route at distance 1 does not beat
    an OSPF route at distance 110, and an OSPF /24 beats a static /16 every
    time.
  </p>
${ROUTE_TABLES.map((table) => `  <article>
    <h2>${esc(table.name)}</h2>
    <p>${esc(table.brief)}</p>
    <ul>
${table.routes.map((route) => `      <li>${prefixOf(route)} via ${esc(route.nextHop ?? (route.iface === "null0" ? "discard" : "on-link"))} on ${esc(route.iface)}, ${esc(route.protocol)}, distance ${route.distance}, metric ${route.metric}</li>`).join("\n")}
    </ul>
    <p>Destinations worth resolving against it: ${table.probes.map((probe) => esc(probe.destination)).join(", ")}.</p>
  </article>`).join("\n")}
  <p>
    One simplification: where two routes tie on everything, a real router
    installs both and hashes flows across them. This picks the first, and the
    one table here that reaches that case says so.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/firewall", "Firewall exercises, where first match does win"], ["/allocate", "Address plans"]])}
</main>`,
  });

  // ── path MTU ──
  const mtuDescription =
    `A default ping is ${PING_DEFAULT} bytes and crosses almost anything, so the fault that only ` +
    "breaks big packets survives every test somebody thinks to run. Walk a packet down six real " +
    "paths and see where it dies, and which firewall swallowed the message that would have explained it.";

  await writePage("mtu", base, {
    title: "Ping Works and the Transfer Hangs | Max Doubin",
    description: mtuDescription,
    canonical: `${SITE_URL}/mtu`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Ping works and the transfer hangs",
  description: mtuDescription,
  url: `${SITE_URL}/mtu`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches: "Path MTU discovery, IP fragmentation, and how blocking ICMP type 3 code 4 turns a clear error into a silent hang",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Ping works and the transfer hangs</h1>
  <p>
    A default ping is ${PING_DEFAULT} bytes on the wire. It crosses a path with
    a 1400 byte link in it without noticing, DNS is fine, SSH connects, and
    then the first large response stops dead and never comes back. Every test
    somebody thinks to run sends small packets.
  </p>
  <p>
    A router that cannot forward an oversized packet with Don't Fragment set
    must drop it and send back an ICMP type 3 code 4 saying what size it could
    have taken. When something in between drops that ICMP, the sender never
    hears it, keeps sending the same packet, and the connection hangs rather
    than fails. There is no error, and nothing logs anything.
  </p>
  <h2>The paths</h2>
${MTU_PATHS.map((path) => `  <article>
    <h3>${esc(path.name)}</h3>
    <p>Path MTU ${pathMtu(path)}, so a TCP stack should settle on an MSS of ${mssFor(pathMtu(path))}.${
      pingLies(path)
        ? " A default ping crosses this path and a full-size packet disappears without an error."
        : ""
    }</p>
    <ul>
${path.hops.map((hop) => `      <li>${esc(hop.name)}, MTU ${hop.mtu}${hop.blocksIcmp ? ", drops ICMP" : ""}${hop.note ? `. ${esc(hop.note)}` : ""}</li>`).join("\n")}
    </ul>
  </article>`).join("\n")}
  <h2>Finding it</h2>
  <p>
    Send the packet the application would send, with Don't Fragment set, and
    walk the size down until something arrives. On Linux that is
    <code>ping -M do -s 1472</code>, where the payload is 28 bytes short of the
    size on the wire. The fix is usually to let the ICMP through, which is the
    correct one and costs nothing, or to clamp the MSS on the tunnel
    interface, which fixes TCP and does nothing for UDP.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/blog/mtu-mismatch-troubleshooting", "The MTU bug that only breaks big transfers"], ["/capture", "Packet captures"]])}
</main>`,
  });

  // ── VLAN tagging ──
  /*
    Both configurations go into the static body in full, because they are the
    exercise: the whole difficulty is that each one is individually correct.
    The answer does not, for the same reason it does not on the logs page.
  */
  const silentMismatches = VLAN_PATHS.filter((path) => nativeMismatches(path).length > 0).length;
  const vlanDescription =
    "A trunk sends its native VLAN with nothing on it, so if the two ends name different natives, every " +
    "frame in one VLAN arrives in another and no switch reports an error. " +
    `${VLAN_PATHS.length} frames to follow across configurations that are each individually correct, ` +
    `${silentMismatches} of them across a link whose two ends silently disagree.`;

  await writePage("vlan", base, {
    title: "The Frame That Arrived Untagged | Max Doubin",
    description: vlanDescription,
    canonical: `${SITE_URL}/vlan`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "The frame that arrived untagged",
  description: vlanDescription,
  url: `${SITE_URL}/vlan`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "IEEE 802.1Q tagging: how access and trunk ports classify frames, why the native VLAN crosses a trunk untagged, what a native VLAN mismatch does, how allowed lists are enforced independently at each end, and the configuration that makes VLAN hopping possible",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>The frame that arrived untagged</h1>
  <p>
    A VLAN tag is four bytes that exist only on the wire between switches. On
    either side of that wire the frame belongs to a VLAN because of a decision
    a switch made, and the decision is made twice: once on the way in from one
    port's configuration, and once on the way out from another port's
    configuration at the other end.
  </p>
  <p>
    A trunk sends its native VLAN with nothing on it at all, which is the point
    of having one. So if the two ends name different natives, every frame in
    the first switch's native VLAN arrives on the second in the second's, two
    broadcast domains are joined, and nothing anywhere reports an error,
    because each end is doing exactly what it was told.
  </p>
  <h2>The rules, in the order a switch applies them</h2>
  <ol>
    <li>Arriving on an access port, the frame joins that port's VLAN. The port does not read the tag, which is the whole mechanism behind VLAN hopping.</li>
    <li>Arriving on a trunk with a tag, the frame joins the VLAN in the tag. Arriving with no tag, it joins the native VLAN.</li>
    <li>Leaving on a trunk, the switch adds a tag, unless the frame's VLAN is the native one, in which case it adds nothing.</li>
    <li>Leaving on an access port, the switch adds nothing, and the frame only leaves at all if its VLAN is that port's VLAN.</li>
  </ol>
  <h2>The frames</h2>
${VLAN_PATHS.map((path) => `  <article>
    <h3>${esc(path.name)}</h3>
    <p>${esc(path.brief)}</p>
    <p>On the wire from the host: ${esc(path.frame.label)}, ${onWire(path.frame.tags)}.</p>
    <ul>
${path.hops.map((hop) => `      <li>${esc(hop.device)}: ${esc(hop.ingress.name)} is ${hop.ingress.mode === "access" ? `an access port in VLAN ${accessVlanOf(hop.ingress)}` : `a trunk with native VLAN ${nativeVlanOf(hop.ingress)}${hop.ingress.allowed ? `, allowing ${hop.ingress.allowed.join(", ")}` : ""}`}; ${esc(hop.egress.name)} is ${hop.egress.mode === "access" ? `an access port in VLAN ${accessVlanOf(hop.egress)}` : `a trunk with native VLAN ${nativeVlanOf(hop.egress)}${hop.egress.allowed ? `, allowing ${hop.egress.allowed.join(", ")}` : ""}`}.</li>`).join("\n")}
    </ul>
    <p>${esc(path.question)}</p>
    <ol>
${path.options.map((option) => `      <li>${esc(option.claim)}</li>`).join("\n")}
    </ol>
    <p>
      ${(() => {
        const outcome = carry(path);
        const wire = outcome.steps.map((step) => `${esc(step.device)} put it in VLAN ${step.internal} by its ${step.decidedBy}`).join(", then ");
        return `${wire}. ${vlanAnswer(path) === "dropped" ? "The frame does not arrive." : `It arrives in VLAN ${vlanAnswer(path)}.`}`;
      })()}
      ${nativeMismatches(path).length > 0 ? "The two ends of a trunk here disagree about the native VLAN, and neither will tell you." : ""}
      It breaks the belief ${esc(path.breaks)}.
    </p>
  </article>`).join("\n")}
  <h2>The fix</h2>
  <p>
    Make the native VLAN a VLAN with no hosts in it. Then a mismatch moves
    traffic that does not exist, and a host has nothing to write a tag from.
    Dropping tagged frames on access ports is the other half, and checking
    both ends of every trunk rather than only the end you are logged into is
    the habit.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/firewall", "Firewall exercises"], ["/blog/vlan-segmentation-guide", "VLAN segmentation"]])}
</main>`,
  });

  // ── the shared cache ──
  /*
    The headers go in verbatim and the computed key goes in beside them,
    because the key is the finding and a static page that withholds it is a
    static page with nothing in it. Somebody searching for the exact string
    "Vary: Accept-Encoding" next to the word cookie is the reader this is for.
  */
  const cacheLeaking = CACHE_CASES.filter((item) => cacheLeakAt(item.exchanges) !== null).length;
  const cacheDescription =
    "A shared cache keys on the method, the URL, and exactly those request headers the response named " +
    "in Vary. Not the cookie unless Vary says Cookie, not the token unless Vary says Authorization. So a " +
    "user reloading a page and seeing another account's data is usually a response that said it could be " +
    `stored and did not name the header that made it personal. ${CACHE_CASES.length} sequences of requests, ` +
    `${cacheLeaking} of which serve one account's page to another.`;

  await writePage("cache", base, {
    title: "The Page That Showed Somebody Else's Name | Max Doubin",
    description: cacheDescription,
    canonical: `${SITE_URL}/cache`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "The page that showed somebody else's name",
  description: cacheDescription,
  url: `${SITE_URL}/cache`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "How a shared HTTP cache computes its key under RFC 9111: why a missing Vary header lets one account's page be served to another, why Cache-Control private is an instruction to a CDN and not to a browser, why s-maxage switches off the protection that keeps Authorization requests out of a shared cache, why a stored Set-Cookie is replayed to later visitors, and why Vary: Cookie keys on the whole cookie jar rather than on the session",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>The page that showed somebody else's name</h1>
  <p>
    A user reloads a dashboard and sees another account's data. Every instinct says session
    handling: a token mixed up, a thread local reused, a global that should not be. So that is
    where everybody looks, and it is all correct, because the application never ran. A shared
    cache answered from storage, and it answered correctly according to the only thing it was told
    to key on.
  </p>
  <p>
    A cache keys on the method, the URL, and exactly those request headers the response named in
    <code>Vary</code>. Nothing else. Not the cookie, unless Vary says Cookie. Not the
    <code>Authorization</code> header, unless Vary says Authorization. It does not know what a
    user is and it is not supposed to.
  </p>
  <p>
    So the fault is almost never in the cache. It is a response that said it could be stored, or
    did not say it could not, and did not name the header that made it personal. Both halves are
    omissions, which is why this gets to production: nothing is misconfigured, something is
    missing, and the page works perfectly for the first person to ask for it.
  </p>
  <h2>What a shared cache does differently from a browser</h2>
  <ul>
    <li><code>private</code> is a real instruction to a CDN and no instruction at all to the browser it is private to. It does not mean confidential; it means one thing, which is that a shared cache must not store this.</li>
    <li><code>s-maxage</code> exists only for shared caches and beats <code>max-age</code> when both are present.</li>
    <li>A request carrying <code>Authorization</code> must not be stored by a shared cache unless the response says <code>public</code>, <code>must-revalidate</code> or <code>s-maxage</code>. Not <code>max-age</code>, which is the one people reach for.</li>
    <li>A stored response includes its headers, so a <code>Set-Cookie</code> is replayed to whoever gets the hit.</li>
    <li><code>Vary: Cookie</code> keys on the whole Cookie header as one opaque string. There is no way in HTTP to vary on one cookie and ignore the rest.</li>
  </ul>
  <h2>The sequences</h2>
${CACHE_CASES.map((item) => {
  const steps = cacheReplay(item.exchanges);
  const at = cacheLeakAt(item.exchanges);
  return `  <article>
    <h3>${esc(item.name)}</h3>
    <p>${esc(item.brief)}</p>
    <pre>${item.exchanges
      .map((exchange, index) => {
        const step = steps[index];
        const headers = Object.entries(exchange.request.headers)
          .map(([name, value]) => `  ${esc(name)}: ${esc(value)}`)
          .join("\n");
        return `${esc(exchange.request.id)}  ${esc(exchange.request.who)}
${esc(exchange.request.method)} ${esc(exchange.request.path)}
${headers}
  <- ${exchange.response.status}
  Cache-Control: ${esc(exchange.response.cacheControl || "(none set)")}
  Vary: ${esc(exchange.response.vary ?? "(none set)")}${exchange.response.setCookie ? `\n  Set-Cookie: ${esc(exchange.response.setCookie)}` : ""}
  body: ${esc(exchange.response.body)}
  key: ${esc(step.key)}
  ${esc(step.outcome)}: ${esc(step.because)}`;
      })
      .join("\n\n")}</pre>
    <p>${esc(item.question)}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}</li>`).join("\n")}
    </ol>
    <p>
      ${at ? `${esc(at)} receives a body belonging to somebody else.` : "Nothing here receives somebody else's data."}
      ${cacheHits(item.exchanges)} of ${item.exchanges.length} requests were answered from storage.
      ${cacheVaryOn(item.exchanges[0].response).length > 0 ? `This response names ${cacheVaryOn(item.exchanges[0].response).map((name) => esc(name)).join(" and ")} in Vary.` : "This response names nothing in Vary."}
    </p>
    <p>${esc(item.why)}</p>
    <p>The fix: ${esc(item.fix)}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  <h2>The rule that would have prevented all five</h2>
  <p>
    <code>Cache-Control: private, no-store</code> on anything with a session in it, applied by the
    framework rather than route by route. Every one of these faults arrived because a default was
    permissive and a person had to remember. A route added next quarter will not remember.
  </p>
  <p>
    And in review, read what <code>Vary</code> names rather than that it exists. A Vary header is
    not a safety property. It is a list, and the question is whether the header that made the body
    personal is on it.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/blog/http-caching-headers-etags", "HTTP caching headers and ETags"], ["/blog/the-disk-was-not-full", "The disk was not full"]])}
</main>`,
  });

  // ── no space left on device ──
  /*
    Every figure in the static body is computed, including the terminal
    output, because the whole claim of the page is that the numbers are the
    diagnosis. A hand-typed df output here would be a fabrication of the one
    thing being taught.
  */
  const spaceCauses = new Set(SPACE_CASES.map((item) => spaceFailure(item.filesystem, item.write)));
  const spaceDescription =
    "One error message and six filesystems, of which two are not out of space at all and one is the " +
    "filesystem working exactly as designed. df reports blocks accounted to the filesystem, not what a " +
    "user may consume, not what a tree contains and not what is allocated to a file with no name, so the " +
    `diagnosis is a disagreement between two numbers. ${SPACE_CASES.length} cases, ${spaceCauses.size} distinct causes, ` +
    "each with a different fix.";

  await writePage("space", base, {
    title: "No Space Left on Device | Max Doubin",
    description: spaceDescription,
    canonical: `${SITE_URL}/space`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "No space left on device",
  description: spaceDescription,
  url: `${SITE_URL}/space`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "Diagnosing ENOSPC on Linux: why df and du disagree when a process holds a deleted file open, why a filesystem with space can refuse a new file when its inodes are exhausted, what the ext4 root reserve does to a full filesystem, why a quota reports EDQUOT and is invisible to df, and how data can fill a volume from under a mount point",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>No space left on device</h1>
  <p>
    ${SPACE_CASES.length} filesystems, one message, and ${spaceCauses.size} different things to do
    about it. Two of the ${SPACE_CASES.length} are not out of space at all, and one of them is the
    filesystem working exactly as it was designed to.
  </p>
  <p>
    The instinct is to look at <code>df</code>, and <code>df</code> is the tool most likely to
    mislead you here, because it answers a different question from the one you asked. It reports
    blocks accounted to the filesystem. It does not report what a given user may consume, or what
    a directory tree contains, or what is still allocated to a file with no name. So the diagnosis
    is never a number. It is a disagreement between two numbers.
  </p>
  <h2>The pairs, and what each one means</h2>
  <ul>
    <li><code>df</code> full and <code>du</code> agreeing with it: the data is there and the volume is too small.</li>
    <li><code>df</code> full and <code>du</code> much smaller: blocks held by a file with no name, or by a directory behind a mount. Both are unreachable and neither shows up in a tidy-up.</li>
    <li><code>df</code> not full and <code>df -i</code> full: out of inodes, with space to spare. Space and inodes are independent budgets and a new file needs both.</li>
    <li><code>df</code> full for a service and root writing fine: the reserved blocks, which exist so that a full filesystem can still be administered.</li>
    <li><code>df</code> fine and one user unable to write: a quota, which <code>df</code> knows nothing about and which reports EDQUOT rather than ENOSPC.</li>
  </ul>
  <h2>The filesystems</h2>
${SPACE_CASES.map((item) => {
  const fs = item.filesystem;
  const cause = spaceFailure(fs, item.write)!;
  const narrows = spaceCandidates(fs, item.write);
  return `  <article>
    <h3>${esc(item.name)}</h3>
    <p>${esc(item.brief)}</p>
    <pre>$ df ${esc(fs.mount)}
Filesystem  Size  Used  Avail  Use%  Mounted on
${esc(fs.mount.padEnd(11))} ${spaceHuman(fs.totalBlocks)}  ${spaceHuman(dfUsed(fs))}  ${spaceHuman(dfAvailable(fs))}  ${dfPercent(fs)}%  ${esc(fs.mount)}

$ df -i ${esc(fs.mount)}
Inodes: ${fs.usedInodes.toLocaleString()} of ${fs.totalInodes.toLocaleString()} used, ${inodePercent(fs)}%

$ du -sx ${esc(fs.mount)}
${spaceHuman(duTotal(fs))}\t${esc(fs.mount)}

$ sudo -u ${esc(item.write.user)} ${esc(item.write.what)}
${spaceErrno(cause)}: ${spaceErrno(cause) === "EDQUOT" ? "Disk quota exceeded" : "No space left on device"}</pre>
    <p>${esc(item.question)}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}</li>`).join("\n")}
    </ol>
    <p>
      It is ${esc(SPACE_CAUSE[cause])}, reported as ${spaceErrno(cause)}. The tell is that
      ${esc(spaceTell(fs, item.write, cause))}, and ${esc(item.write.user)} has
      ${spaceHuman(spaceAvailableTo(fs, item.write.user))} available here against the
      ${spaceHuman(dfAvailable(fs))} that df offers.
      ${narrows.causes.length > 1 ? `Two numbers do not settle this one: df and du narrow it to ${narrows.causes.map((c) => esc(SPACE_CAUSE[c])).join(" or ")}, with ${spaceHuman(spaceInvisible(fs))} accounted for and unreachable either way, and ${esc(narrows.separator)}.` : ""}
    </p>
    <p>${esc(item.why)}</p>
    <p>The fix: ${esc(item.fix)}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  <h2>The four commands, in order</h2>
  <ol>
    <li><code>df -h</code> and <code>df -i</code> together, always. The second one costs nothing and rules out the cause nobody thinks of.</li>
    <li><code>du -sx</code> on the mount point. The <code>-x</code> matters: without it du crosses into anything mounted below and counts the wrong filesystem.</li>
    <li><code>lsof +L1</code>, or <code>ls -l /proc/*/fd | grep deleted</code>. This is the one that explains a df and du gap most of the time.</li>
    <li><code>repquota -a</code>, if a single user is affected and nobody else is.</li>
  </ol>
  <p>
    And if df and du disagree and lsof finds nothing, bind mount the filesystem root somewhere
    else and walk underneath the mount points. Data written before a volume was mounted is still
    on the underlying filesystem, still spending its blocks, and unreachable by any path.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/blog/linux-disk-io-troubleshooting", "Linux disk IO troubleshooting"], ["/blog/filesystem-journal-explained", "Filesystem journals"]])}
</main>`,
  });

  // ── alerting rules ──
  /*
    The state at every evaluation goes into the static body as a row of
    letters, because that is the shape of the answer and a paragraph
    describing it is not. Somebody searching "prometheus alert not firing"
    lands here, and what they need is to see four pending evaluations, one
    inactive, and four more pending, on a metric that was over the line the
    whole time.
  */
  const alertsSilent = ALERT_CASES.filter((item) => alertFires(item.setup) === null).length;
  /*
    The flapping case's own numbers, from the model rather than typed. They
    were typed, as "twelve of fifteen evaluations", and the run is thirteen
    of sixteen. Nothing could have disagreed with the sentence, because the
    sentence was the only place the figure appeared.
  */
  const alertsFlap = ALERT_CASES.map((item) => alertRun(item.setup))
    .filter((entries) => !entries.some((entry) => entry.state === "firing"))
    .map((entries) => ({ over: entries.filter((entry) => entry.active).length, of: entries.length }))
    .sort((a, b) => b.over - a.over)[0] ?? { over: 0, of: 0 };
  const alertsDescription =
    "An alerting rule is a question asked at a fixed cadence, of whatever value the query engine " +
    "can find at that instant, and every surprise comes from one of those two words. A spike " +
    "shorter than the evaluation interval never happened. A for clause is cleared by one " +
    "evaluation that misses rather than paused. A query returns the newest sample within the " +
    `lookback period. ${ALERT_CASES.length} runs of one rule here, ${alertsSilent} of which never fire, ` +
    "with the state at every evaluation worked out from the samples.";

  await writePage("alerts", base, {
    title: "The Graph Crossed the Line and Nothing Fired | Max Doubin",
    description: alertsDescription,
    canonical: `${SITE_URL}/alerts`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "The graph crossed the line",
  description: alertsDescription,
  url: `${SITE_URL}/alerts`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "Prometheus alerting semantics: why a spike between evaluations never fires, why one inactive evaluation clears the for clause rather than pausing it, why a for shorter than the evaluation interval rounds up to it, what keep_firing_for does and what it does not, why an alert resolves when its target dies, why absent() is the only expression that notices, and why an exporter that sets its own timestamps keeps a rule firing for the whole lookback period after the data stops",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>The graph crossed the line and nothing fired</h1>
  <p>
    ${ALERT_CASES.length} runs of one alerting rule, and the question every time is what the alert
    does. ${alertsSilent} of them never fire at all, and in one of those the metric is over the
    threshold at ${alertsFlap.over} of ${alertsFlap.of} evaluations.
  </p>
  <p>
    An alerting rule is not a question asked of a graph. It is a question asked at a fixed cadence,
    of whatever value the query engine can find at that instant.
  </p>
  <h2>The four things that decide it</h2>
  <ul>
    <li><strong>The evaluation interval.</strong> A condition that was true between two
    evaluations was never true as far as the rule is concerned. Scrape resolution decides what the
    graph can show; the evaluation interval decides what the alert can see, and on most
    installations they are different numbers.</li>
    <li><strong>The for clause does not accumulate and does not pause.</strong> Prometheus checks
    the alert continues to be active during each evaluation, so one evaluation where it is not
    clears the start time. A for longer than the period of a flapping metric produces silence.</li>
    <li><strong>for rounds up to the evaluation interval.</strong> On a group evaluated every
    minute, <code>for: 30s</code> and <code>for: 60s</code> are the same alert.</li>
    <li><strong>An instant query has a lookback.</strong> The newest sample less than five minutes
    old, unless the series was marked stale, in which case nothing. Which of those two happens when
    a target dies depends on whether the exporter sets its own timestamps.</li>
  </ul>
  <h2>The runs</h2>
${ALERT_CASES.map((item) => {
  const setup = item.setup;
  const evaluations = alertRun(setup);
  const right = alertCorrect(item);
  const fires = alertFires(setup);
  const stale = alertStale(setup);
  const band = evaluations.map((entry) => entry.state[0]).join("");
  const axis = alertTicks(setup)
    .map((at) => (at % (setup.evaluationInterval * 5) === 0 ? "|" : " "))
    .join("");
  return `  <article>
    <h3>${esc(item.name)}</h3>
    <p>${esc(item.brief)}</p>
    <pre>scrape_interval: ${esc(alertClock(setup.scrapeInterval))}   evaluation_interval: ${esc(alertClock(setup.evaluationInterval))}   lookback: ${esc(alertClock(setup.lookback))}${setup.series.ownTimestamps ? "\nthe exporter puts its own timestamps on samples" : ""}

${esc(alertYaml(setup.rule))}

samples:     ${setup.series.samples.map((sample) => sample.value).join(" ")}
state:       ${esc(band)}
             ${esc(axis)}
             i inactive, p pending, f firing, one letter per evaluation over ${esc(alertClock(setup.window))}

${fires === null ? "never fires" : `fires at ${esc(alertClock(fires))}`}${stale !== null ? `\nthe series is marked stale at ${esc(alertClock(stale))}` : ""}</pre>
    <p>${esc(item.question)}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option === right ? " (this one)" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>The fix: ${esc(item.fix)}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  <h2>Reading it on a real Prometheus</h2>
  <ol>
    <li>The alert's own page, at <code>/alerts</code>, shows pending and firing with the time each
    one became active. An alert that is permanently pending and never firing is the flapping case,
    and it is invisible in a notification history because it never produced one.</li>
    <li><code>ALERTS{alertstate="pending"}</code> is itself a series, so you can graph how long a
    rule spends pending and see the clock being cleared.</li>
    <li>For a rule that should have fired, evaluate its expression as an instant query at the
    timestamp you care about rather than as a range, because the range is what the graph drew and
    the instant is what the rule asked.</li>
    <li><code>scrape_duration_seconds</code> and <code>up</code> next to the metric itself, to tell
    a value that changed from a target that stopped answering.</li>
  </ol>
  ${backLinks([["/practise", "All practise material"], ["/blog/the-alert-was-pending-all-day", "The alert was pending all day"], ["/blog/prometheus-server-monitoring", "Prometheus server monitoring"], ["/logs", "Read the log"]])}
</main>`,
  });

  // ── load average ──
  /*
    The counts go into the static body as a table, because the argument of
    the surface is that one number is a sum of two unlike things and a
    paragraph saying so is weaker than the two columns side by side.
    Somebody searching "load average high but cpu idle" lands here, and what
    they need is a row reading 0 runnable, 40 blocked, load 41.
  */
  const loadIdle = LOAD_CASES.filter((item) => loadBlame(item.setup) === "io").length;
  const loadWorst = [...LOAD_CASES].sort(
    (a, b) => loadPeak(b.setup, "one") - loadPeak(a.setup, "one"),
  )[0];
  const loadDescription =
    "The load average is a count of tasks and not a percentage of anything, so it has no ceiling " +
    "at 1.0 and none at the core count. It adds nr_uninterruptible to nr_running, so a host with " +
    "a mount that has stopped answering reads " +
    `${loadPeak(loadWorst.setup, "one").toFixed(0)} while the processors do nothing. And it is ` +
    "exponentially damped over one, five and fifteen minutes, so it reaches 63 percent of a " +
    `change after one time constant and is never reporting now. ${LOAD_CASES.length} readings ` +
    `here, ${loadIdle} of which are an idle machine, folded with the kernel's own fixed point.`;

  await writePage("load", base, {
    title: "The Load Average Is Forty and the CPU Is Idle | Max Doubin",
    description: loadDescription,
    canonical: `${SITE_URL}/load`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Forty, and idle",
  description: loadDescription,
  url: `${SITE_URL}/load`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "What the Linux load average actually counts: that nr_uninterruptible is added to nr_running so a blocked task weighs the same as a running one, that the figure is not normalised by the core count, that it is an exponentially damped moving average sampled every 5*HZ+1 ticks so it reaches only 63 percent of a step after one time constant, that a burst shorter than the sample period is never counted at all, and how to take the sum apart again with vmstat, /proc/loadavg and pressure stall information",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>The load average is forty and the CPU is idle</h1>
  <p>
    ${LOAD_CASES.length} readings of one number, and the question every time is what it says and
    what it means. ${loadIdle} of them are machines doing no work at all.
  </p>
  <p>
    Three things go wrong with this number and none of them is arithmetic. It is a count of tasks
    and not a percentage, so there is no ceiling at 1.0 and none at the core count either. It adds
    <code>nr_uninterruptible</code> to <code>nr_running</code> before folding, so a task blocked on
    a device that will never answer weighs exactly as much as a task burning a core. And it is an
    exponentially damped moving average sampled every ${loadFreq.toFixed(3)} seconds, which is
    5*HZ+1 ticks rather than 5*HZ, so the one minute figure has folded eleven samples at the one
    minute mark and not twelve.
  </p>
  <h2>What each machine was doing, and what it printed</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Machine</th><th>Cores</th><th>Runnable</th><th>Blocked</th><th>1 min peak</th><th>Per core</th><th>What it means</th></tr>
    </thead>
    <tbody>
${LOAD_CASES.map((item) => {
  const end = loadWindow(item.setup);
  const counts = loadCounts(item.setup, Math.max(0, end - 1));
  const busiest = [...item.setup.phases].sort(
    (a, b) => b.running + b.blocked - (a.running + a.blocked),
  )[0];
  return `      <tr><td>${esc(item.name)}</td><td>${item.setup.cores}</td>` +
    `<td>${busiest ? busiest.running : counts.running}</td>` +
    `<td>${busiest ? busiest.blocked : counts.blocked}</td>` +
    `<td>${loadPeak(item.setup, "one").toFixed(2)}</td>` +
    `<td>${loadPerCore(item.setup, end).toFixed(2)}</td>` +
    `<td>${esc(loadBlame(item.setup))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${LOAD_CASES.map((item) => {
  const end = loadWindow(item.setup);
  const right = loadCorrect(item);
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>$ cat /proc/loadavg
${esc(loadProc(item.setup, end))}</code></pre>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>What to read instead: ${esc(item.fix)}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  <h2>Reading it on a real machine</h2>
  <ol>
    <li><code>cat /proc/loadavg</code>. The fourth field is running/total, and a load of
    ${loadPeak(loadWorst.setup, "one").toFixed(0)} beside a running count of 2 is the whole
    diagnosis without opening anything else.</li>
    <li><code>vmstat 1</code> prints <code>r</code> and <code>b</code> as separate columns, which
    is the sum taken apart: runnable in one, uninterruptible in the other.</li>
    <li><code>ps -eo pid,state,wchan:32,cmd | awk '$2 == "D"'</code> names the tasks in
    uninterruptible sleep and the kernel function each is stuck in.</li>
    <li><code>/proc/pressure/cpu</code> measures the share of time runnable tasks spent waiting,
    which is the quantity people believe they are reading off the load average, and it is already
    normalised.</li>
    <li>Divide by <code>nproc</code> before comparing anything to anything. A threshold on the raw
    figure means something different on every machine it is copied to.</li>
  </ol>
  ${backLinks([["/practise", "All practise material"], ["/blog/forty-and-nothing-was-running", "Forty, and nothing was running"], ["/oom", "Something has to die"], ["/alerts", "The graph crossed the line"]])}
</main>`,
  });

  // ── cpu quota ──
  /*
    The period bars are the argument, and a static page cannot draw them, so
    the body carries the same information as a table: how far into each
    period the quota went and how long the group was stopped. Somebody
    searching "container throttled but cpu usage low" lands here, and the row
    they need reads 30 percent utilisation next to two throttled periods.
  */
  const thrStalled = THROTTLE_CASES.filter((item) => thrEver(item.setup)).length;
  const thrWorst = [...THROTTLE_CASES]
    .filter((item) => thrExhausts(item.setup) !== null)
    .sort((a, b) => (thrExhausts(a.setup) as number) - (thrExhausts(b.setup) as number))[0];
  const throttleDescription =
    "CFS bandwidth control is a quota per period rather than a rate. Quota is CPU time and a " +
    "period is wall clock time, and threads convert between them, so a container with four " +
    "runnable threads and one CPU of limit spends its whole quota in a quarter of the period and " +
    `is stopped for the rest. ${THROTTLE_CASES.length} cgroups here, ${thrStalled} of which are ` +
    "stopped by the quota, including one that reads 30 percent of its limit on every graph and is " +
    "still throttled.";

  await writePage("throttle", base, {
    title: "The Container Is at Thirty Percent and It Is Stalling | Max Doubin",
    description: throttleDescription,
    canonical: `${SITE_URL}/throttle`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Thirty percent, and stalling",
  description: throttleDescription,
  url: `${SITE_URL}/throttle`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "How CFS bandwidth control actually enforces a CPU limit: that quota is CPU time spent in parallel by every runnable thread, so the thread count decides how far into the period the quota lasts; that average utilisation over any window longer than the period cannot show throttling; that the period matters as much as the ratio; that threads beyond the host's core count do not drain quota faster; what cpu.max.burst changes; and why nr_throttled rather than utilisation is the metric to alert on",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>The container is at thirty percent and it is stalling</h1>
  <p>
    ${THROTTLE_CASES.length} containers under a CPU limit, and the question every time is when in
    the period the quota runs out. ${thrStalled} of them are stopped by it, one as early as
    ${esc(thrMs(thrExhausts(thrWorst.setup) as number))} into every 100.
  </p>
  <p>
    CFS bandwidth control is a quota per period, not a rate. Within each period a cgroup may use
    <code>quota</code> microseconds of CPU time, and once that is spent every thread in it stops
    until the next period. Quota is CPU time and a period is wall clock time, and threads convert
    between them: four runnable threads spend a full CPU's worth of quota in a quarter of the
    period. Which is why a container can read a third of its limit on every graph you have and
    still be stopped for most of every second.
  </p>
  <h2>What each one does</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Container</th><th>Limit</th><th>Threads</th><th>Cores</th><th>Quota gone at</th><th>Periods throttled</th><th>Utilisation</th></tr>
    </thead>
    <tbody>
${THROTTLE_CASES.map((item) => {
  const st = thrStatOf(item.setup);
  const at = thrExhausts(item.setup);
  return `      <tr><td>${esc(item.name)}</td><td>${thrLimit(item.setup)}</td>` +
    `<td>${item.setup.threads}</td><td>${item.setup.cores}</td>` +
    `<td>${at === null ? "never" : esc(thrMs(at))}</td>` +
    `<td>${st.nrThrottled} of ${st.nrPeriods}</td>` +
    `<td>${Math.round(st.utilisation * 100)}%</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${THROTTLE_CASES.map((item) => {
  const right = thrCorrect(item);
  const at = thrExhausts(item.setup);
  const done = thrFinishes(item.setup);
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>$ cat /sys/fs/cgroup/.../cpu.max
${esc(thrMax(item.setup))}
# ${item.setup.threads} runnable threads on ${item.setup.cores} cores, so ${thrRate(item.setup)} run at once

$ cat /sys/fs/cgroup/.../cpu.stat
${esc(thrStat(item.setup))}</code></pre>
    <p>The quota runs out ${at === null ? "at no point in any period" : esc(thrMs(at)) + " into a period"}, and the work ${done === null ? "never finishes: there is always more of it" : "is done at " + esc(thrMs(done))}.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>The fix: ${esc(item.fix)}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  <h2>Reading it on a real cluster</h2>
  <ol>
    <li><code>cat /sys/fs/cgroup/&lt;path&gt;/cpu.stat</code>. <code>nr_throttled</code> against
    <code>nr_periods</code> is the ratio that matters, and <code>throttled_usec</code> is the wall
    clock time the group spent stopped. Neither appears on a CPU utilisation graph.</li>
    <li>Compare the thread count against the limit. A runtime that sized its pool from the node
    rather than from the cgroup is the usual cause, so GOMAXPROCS, -XX:ActiveProcessorCount, and
    anything reading nproc directly.</li>
    <li>Compare the p99 against the period. Throttling puts a shoulder in the latency distribution
    at roughly the period length, which is 100ms unless somebody changed it.</li>
    <li><code>cpu.max.burst</code> for workloads whose average is well under the limit and whose
    load is spiky. In the kernel since 5.14.</li>
    <li>Do not reach for utilisation. Averaged over any window longer than the period it cannot
    show throttling at all, and the period is 100 milliseconds.</li>
  </ol>
  ${backLinks([["/practise", "All practise material"], ["/load", "Forty, and idle"], ["/oom", "Something has to die"]])}
</main>`,
  });

  // ── address translation ──
  /*
    Every packet header in the static body is traced rather than typed, and
    the rulesets are the nftables lines a reader is about to paste into their
    own router. Somebody searching "port forward works outside not inside"
    lands on this page, and what they need is the reply path drawn out, which
    is the half no port forwarding guide shows.
  */
  const natBroken = NAT_CASES.filter((item) => natTrace(item).outcome !== "connected").length;
  const natDescription =
    "A port forward rewrites the destination of the request and nothing rewrites the reply, " +
    "unless the reply happens to pass back through the box holding the connection tracking entry. " +
    `${NAT_CASES.length} port forwards here, ${natBroken} of which do not connect, and most of the rules are ` +
    "written exactly as the documentation says: the hairpin from inside the LAN, the server whose " +
    "default gateway points elsewhere, the filter rule written against the public address, and the " +
    "router whose own outside address is inside the ISP's carrier grade NAT.";

  await writePage("nat", base, {
    title: "The Port Forward Works From Outside | Max Doubin",
    description: natDescription,
    canonical: `${SITE_URL}/nat`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "It works from outside",
  description: natDescription,
  url: `${SITE_URL}/nat`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "Netfilter address translation: why dnat happens in prerouting and snat in postrouting, why a forward filter rule sees the translated destination and the original source, why a port forward that works from the internet fails from the LAN, what hairpin NAT costs you in the access log, why an asymmetric return path breaks a connection the request half of which arrived fine, how masquerade differs from snat on a multi homed router, and why a port forward behind carrier grade NAT can never work",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>It works from outside</h1>
  <p>
    ${NAT_CASES.length} port forwards and the paths their replies take. ${natBroken} of them do not
    connect, and most of the rules are written exactly as the documentation says to write them.
  </p>
  <p>
    The rule is stateful. The first packet of a flow is used to look up a matching rule, which sets
    up the binding for that flow; no rule lookup happens for the packets after it, in either
    direction. So the question is never whether the rule matches. It is where the reply goes, and
    whether it passes back through the box holding the binding.
  </p>
  <h2>Where the rewrites happen</h2>
  <pre>prerouting    dstnat, priority -100      the destination is rewritten
routing       the interface it leaves by, decided on the NEW destination
forward       filter, priority 0         the translated destination, the original source
postrouting   srcnat, priority +100      the source is rewritten</pre>
  <p>
    That table answers two questions people get wrong in opposite directions. A filter rule written
    against the public address never matches, because the destination was rewritten one hook
    earlier. A filter rule written against the translated source never matches either, because the
    source is rewritten one hook later.
  </p>
  <h2>The cases</h2>
${NAT_CASES.map((item) => {
  const exchange = natTrace(item);
  const right = natCorrect(item);
  const line = (step: { where: string; packet: { saddr: string; sport: number; daddr: string; dport: number }; note?: string }) =>
    `  ${esc(step.where.padEnd(26))} ${esc(step.packet.saddr)}:${step.packet.sport} -> ${esc(step.packet.daddr)}:${step.packet.dport}${step.note ? `   ${esc(step.note)}` : ""}`;
  return `  <article>
    <h3>${esc(item.name)}</h3>
    <p>${esc(item.brief)}</p>
    <pre>${esc(item.router.name)}
${item.router.nics.map((nic) => `  ${esc(nic.name.padEnd(6))} ${esc(nic.address.padEnd(15))} ${esc(nic.network)}${natIsPrivate(nic.address) ? "   (not routable from the internet)" : ""}`).join("\n")}
${item.router.upstream ? `  default via ${esc(item.router.upstream)}` : "  no default route"}

${item.hosts.map((host) => `  ${esc(host.name.padEnd(8))} ${esc(host.address.padEnd(15))} ${host.gateway ? `gw ${esc(host.gateway)}` : "on the internet"}`).join("\n")}

table ip nat {
${item.router.rules.map((rule) => `  chain ${esc(rule.chain)} { ${esc(rule.written)} }`).join("\n")}
}

request:
${exchange.request.map(line).join("\n")}${exchange.reply.length > 0 ? `\n\nreply, routed separately:\n${exchange.reply.map(line).join("\n")}` : ""}

outcome: ${esc(NAT_OUTCOME[exchange.outcome])}${exchange.seenBy ? `, the far end sees ${esc(exchange.seenBy)}` : ""}</pre>
    <p>${esc(item.question)}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option === right ? " (this one)" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>The fix: ${esc(item.fix)}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  <h2>Reading it on a real router</h2>
  <ol>
    <li><code>conntrack -L -d &lt;public address&gt;</code>. A connection with packets counted in one
    direction and zero in the other is an asymmetric return path, and that is the whole diagnosis.</li>
    <li><code>nft list ruleset</code> and read which chain each rule is in. A source rewrite in
    prerouting or a destination rewrite in postrouting is a rule that will never do what it says.</li>
    <li>On the server, <code>ip route get &lt;client address&gt;</code>. If the answer is not the
    router holding the binding, no rule on the router will help.</li>
    <li>Compare the address on the WAN interface against what an outside service reports. If the
    first is inside ${esc(NAT_CASES.some((item) => !natRoutable(item.router)) ? "100.64.0.0/10" : "a private range")},
    the forward is on a box the internet cannot address.</li>
  </ol>
  ${backLinks([["/practise", "All practise material"], ["/blog/nothing-translates-the-reply", "Nothing translates the reply"], ["/blog/netfilter-hook-order", "Netfilter hook order"]])}
</main>`,
  });

  // ── systemd unit ordering ──
  /*
    The unit files go into the static body verbatim, because they are the
    subject: somebody searching "systemd After= not working" is exactly the
    reader this page is for, and the four lines they are about to paste into
    a drop-in are the thing worth showing them. The transaction and the
    ordering are computed, so a change to the model cannot leave the prose
    describing a different outcome.
  */
  const unitFailing = UNIT_CASES.filter((item) => unitOutcome(item).failed.length > 0).length;
  const unitsDescription =
    "After= is ordering and Requires= is requirement, and neither implies the other. A failed " +
    "Requires= only stops a unit when After= is set on the failing unit as well, Requires= " +
    "without After= starts both at once, After= alone orders against a unit nothing pulls in, and " +
    `Type=simple calls a unit started before its binary has been executed. ${UNIT_CASES.length} sets of unit ` +
    `files, ${unitFailing} of them ending in a failure, each with the transaction systemd builds from them.`;

  await writePage("units", base, {
    title: "It Started Before the Thing It Needs | Max Doubin",
    description: unitsDescription,
    canonical: `${SITE_URL}/units`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "It started before the thing it needs",
  description: unitsDescription,
  url: `${SITE_URL}/units`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "systemd unit dependencies: why After= does not start the other unit, why a failed Requires= only blocks when After= is also set, why Requires= alone starts both units in parallel, what Requisite= does differently, how BindsTo= and PartOf= propagate a stop, why an ordering cycle is broken rather than refused, and why Type=simple reports success for a unit whose binary does not exist",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>It started before the thing it needs</h1>
  <p>
    ${UNIT_CASES.length} sets of systemd unit files and one <code>systemctl start</code>, and the
    question every time is what ends up running. ${unitFailing} of the ${UNIT_CASES.length} end in
    a failure, and in four of them every directive did exactly what it says.
  </p>
  <p>
    <code>After=</code> says when. <code>Requires=</code> says whether. Neither implies the other,
    and every combination of the two means something different.
  </p>
  <h2>The combinations, and what each one does</h2>
  <ul>
    <li><strong>After= alone.</strong> Ordering, and only if the other unit is in the same
    transaction. It does not pull anything in, so a unit with After= on a service nobody enabled
    starts happily without it.</li>
    <li><strong>Requires= alone.</strong> The other unit is pulled in and started at the same
    moment, because requirement dependencies do not influence order. And a failure does not stop
    this unit: systemd.unit(5) makes that conditional on After= being set on the failing unit
    too.</li>
    <li><strong>Requires= and After= together.</strong> Pulled in, ordered, and a failure stops
    this unit. This is the pair to write, every time.</li>
    <li><strong>Wants= and After=.</strong> Pulled in and ordered, and a failure is ignored. The
    recommended shape for anything optional, and the cost is that the optional thing failing looks
    like it working.</li>
    <li><strong>Requisite= and After=.</strong> Not pulled in. It must already be running or this
    unit fails immediately, which is the directive for "refuse rather than start it".</li>
    <li><strong>BindsTo= and After=.</strong> All of Requires=, plus this unit is stopped whenever
    the other stops, for any reason. What you want for anything holding a filesystem open.</li>
    <li><strong>PartOf=.</strong> Stop and restart propagation only, one way: stopping the listed
    unit stops this one, and stopping this one does nothing to the listed unit.</li>
  </ul>
  <h2>And then Type=</h2>
  <p>
    Ordering gets you as far as "started", and started is a claim about a process rather than about
    a service. What each type waits for:
  </p>
  <ul>
${(Object.entries(unitMeansStarted) as [string, string][])
  .map(([type, means]) => `    <li><code>Type=${esc(type)}</code>: ${esc(means)}.</li>`)
  .join("\n")}
  </ul>
  <p>
    <code>Type=simple</code> is the default, and it is the weakest of those: systemd considers the
    unit started immediately after the main process has been forked, before execve. So
    <code>systemctl start</code> reports success for a unit whose binary does not exist, and a
    dependent with both Requires= and After= starts against nothing.
  </p>
  <h2>The cases</h2>
${UNIT_CASES.map((item) => {
  const outcome = unitOutcome(item);
  const groups = unitLevels(outcome.transaction, outcome.edges);
  const right = unitCorrect(item);
  return `  <article>
    <h3>${esc(item.name)}</h3>
    <p>${esc(item.brief)}</p>
    <pre>${item.units
      .map((unit) => {
        const lines = [`# /etc/systemd/system/${unit.name}`, "[Unit]", `Description=${unit.description}`];
        for (const [name, value] of unitDirectives(unit)) lines.push(`${name}=${value}`);
        if (unit.name.endsWith(".service")) lines.push("", "[Service]", `Type=${unit.type}`);
        if (unit.alreadyActive) lines.push("", "# this unit is already running");
        return esc(lines.join("\n"));
      })
      .join("\n\n")}

$ systemctl start ${esc(item.start.join(" "))}${item.stop && item.stop.length > 0 ? `\n$ systemctl stop ${esc(item.stop.join(" "))}` : ""}

${groups ? `start order: ${groups.map((group) => group.join(" + ")).join(" -> ")}` : `ordering cycle: ${(outcome.cycle ?? []).join(" -> ")} -> ${(outcome.cycle ?? [])[0]}, one edge deleted by systemd`}
running afterwards: ${outcome.active.join(", ") || "nothing"}${outcome.failed.length > 0 ? `\nfailed: ${outcome.failed.map((f) => `${f.unit} (${f.why})`).join(", ")}` : ""}${outcome.notPulled.length > 0 ? `\nnot in the transaction: ${outcome.notPulled.join(", ")}` : ""}</pre>
    <p>${esc(item.question)}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option === right ? " (this one)" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>The fix: ${esc(item.fix)}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  <h2>Reading it on a real machine</h2>
  <ol>
    <li><code>systemctl list-dependencies --all &lt;unit&gt;</code> for what gets pulled in, and
    <code>systemctl list-dependencies --after &lt;unit&gt;</code> for what it is ordered behind.
    Two different questions and two different flags, which is the whole subject.</li>
    <li><code>systemctl show &lt;unit&gt; -p Requires -p Wants -p After -p Before -p BindsTo -p PartOf</code>
    to see the dependencies after drop-ins and default dependencies are merged in, which is rarely
    what the unit file alone says.</li>
    <li><code>systemd-analyze critical-chain &lt;unit&gt;</code> for the ordering that actually
    happened on this boot, with the time each step waited.</li>
    <li><code>journalctl -b | grep -i "ordering cycle"</code> on anything whose boot is
    intermittently wrong.</li>
  </ol>
  ${backLinks([["/practise", "All practise material"], ["/blog/systemd-units-that-behave", "systemd units that behave"], ["/blog/init-scripts-to-systemd-units", "From init scripts to systemd units"]])}
</main>`,
  });

  // ── the oom killer ──
  /*
    Every score in the static body is computed, including the arm that
    oom_score_adj contributes, because the arithmetic is the entire claim of
    the page. Writing the scores out by hand here would be the one
    fabrication that mattered: a reader arriving on a search for "why did the
    oom killer choose this process" is owed a number they can reproduce.
  */
  const oomCgroupKills = OOM_CASES.filter((item) => item.trigger.kind === "cgroup").length;
  const oomBiggestLives = OOM_CASES.filter(oomFattestSurvives).length;
  const oomDescription =
    "The out of memory killer does not kill the biggest process, or the process whose allocation " +
    "failed. It kills the highest of rss plus swap plus page tables plus oom_score_adj times a " +
    `thousandth of total memory, and ${OOM_CASES.length} machines here show what falls out of that: ` +
    `in ${oomBiggestLives} of them the largest process survives, ${oomCgroupKills} are cgroup kills that ` +
    "cannot see the real hog, and one has no killable task left at all.";

  await writePage("oom", base, {
    title: "Which Process Does the OOM Killer Kill? | Max Doubin",
    description: oomDescription,
    canonical: `${SITE_URL}/oom`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Which process does the OOM killer kill?",
  description: oomDescription,
  url: `${SITE_URL}/oom`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "How the Linux out of memory killer selects a victim: the oom_badness expression, why oom_score_adj is a proportion of total memory rather than a weighting, why -1000 means never rather than last, why swap and page tables count and top does not show them, why shared pages are charged in full to every process that maps them, how a cgroup OOM differs from a system OOM in both scope and normaliser, what memory.oom.group changes, and why a machine of unkillable tasks panics",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Something has to die</h1>
  <p>
    ${OOM_CASES.length} machines with nothing left to allocate, and one expression that decides
    what the kernel kills. In ${oomBiggestLives} of the ${OOM_CASES.length} the largest process
    survives.
  </p>
  <pre>badness = rss + swap + page tables + oom_score_adj &times; (total / 1000)</pre>
  <p>
    The kernel kills the highest. It is not weighted by uptime, or by which process asked for the
    memory that could not be found, or by how much of a shared mapping belongs to whom. Everything
    surprising about the killer falls out of that line, including the fact that a machine can run
    out of things it is allowed to kill.
  </p>
  <h2>What each term does to the answer</h2>
  <ul>
    <li><strong>oom_score_adj is a proportion, not a nudge.</strong> The kernel computes
    <code>adj &times; (totalpages / 1000)</code> in integer arithmetic, so an adj of 200 is a fifth
    of the machine. On a 16 GiB host that is ${oomHuman(oomAdjWorth(200, 16384))}, and on a 256 GiB
    host the same setting is ${oomHuman(oomAdjWorth(200, 262144))}.</li>
    <li><strong>-1000 means never, not last.</strong> The kernel tests for it before doing any
    arithmetic and skips the task. A machine where everything is set to -1000 has no candidate, and
    an OOM with no candidate is a panic rather than a kill.</li>
    <li><strong>Swap and page tables are terms.</strong> <code>top</code> shows neither by default.
    A process with a gigabyte resident and five in swap outranks one with four and a half resident.</li>
    <li><strong>Shared pages are counted in full, per process.</strong> A pool of forked workers
    each carrying the same shared segment all score the same and all score modestly, so the pool
    holding the machine down is rarely the thing killed.</li>
    <li><strong>A cgroup OOM is a different question.</strong> Only tasks in the cgroup are
    candidates, and the normaliser is the cgroup's limit rather than the machine's memory, which
    makes every adj inside it worth far less.</li>
  </ul>
  <h2>The machines</h2>
${OOM_CASES.map((item) => {
  const { total } = oomScope(item.machine, item.trigger);
  const dead = oomKilled(item.machine, item.trigger);
  const right = oomCorrect(item);
  const rows = oomScored(item.machine, item.trigger);
  return `  <article>
    <h3>${esc(item.name)}</h3>
    <p>${esc(item.brief)}</p>
    <pre>${item.trigger.kind === "cgroup" ? `cgroup OOM: ${esc(item.trigger.path)} at its memory.max` : "system OOM"}
scores are a share of ${oomHuman(total)}

   PID COMMAND            RES     SWAP      PTE   adj   badness
${item.machine.processes
  .map((task) => {
    const row = rows.find((entry) => entry.task.pid === task.pid);
    const score = row ? row.points : null;
    return `${String(task.pid).padStart(6)} ${esc(task.name).padEnd(15)} ${oomHuman(task.rss).padStart(8)} ${(task.swap > 0 ? oomHuman(task.swap) : "-").padStart(8)} ${oomHuman(task.pageTables).padStart(8)} ${(task.unkillable ? "kern" : String(task.oomScoreAdj)).padStart(5)}   ${row === undefined ? "out of scope" : score === null ? "not a candidate" : oomHuman(score)}`;
  })
  .join("\n")}

${dead.length === 0 ? "Out of memory and no killable processes... the kernel panics." : dead.length === 1 ? `Killed process ${dead[0].pid} (${esc(dead[0].name)})` : `Killed every task in the cgroup: ${dead.map((task) => task.pid).join(", ")}`}</pre>
    <p>${esc(item.question)}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option === right ? " (this one)" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>The fix: ${esc(item.fix)}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  <h2>Where to read it on a real machine</h2>
  <ol>
    <li><code>dmesg -T | grep -i -A20 "invoked oom-killer"</code>. Two lines matter and they are
    different processes: the one that invoked it and the one that was killed. The first is a
    symptom of the machine being full and tells you almost nothing about what filled it.</li>
    <li>The kernel prints its whole candidate table in that dump, with an oom_score_adj column.
    That table is the arithmetic above, already done for you.</li>
    <li><code>/proc/PID/status</code> for VmRSS, VmSwap and VmPTE, which are three of the four
    terms and none of which are in <code>top</code>'s default columns.</li>
    <li><code>/sys/fs/cgroup/&lt;path&gt;/memory.events</code> to tell a cgroup kill from a system
    one. If <code>oom_kill</code> there is climbing, the machine was never out of memory.</li>
  </ol>
  ${backLinks([["/practise", "All practise material"], ["/blog/minus-one-thousand-is-not-a-hint", "Minus one thousand is not a hint"], ["/blog/oom-killer-and-swap-sizing", "The OOM killer and swap sizing"]])}
</main>`,
  });

  // ── clock skew ──
  /*
    Every observation goes into the static body with its error message
    verbatim, because the messages are the subject: three of the four never
    mention time, and somebody searching one of those strings is exactly the
    reader this page is for. The answer goes in too, as a range rather than a
    number, which is what the evidence supports.
  */
  const clockObservations = CLOCK_CASES.reduce((sum, item) => sum + item.checks.length, 0);
  /* Derived, so the sentence quoting them cannot drift from the cases. */
  const clockTolerances = clockToleranceList(CLOCK_CASES);
  const clockSpread = clockToleranceSpread(CLOCK_CASES);
  const clockDescription =
    "A wrong clock reports itself under four unrelated names and three of them never mention time: a certificate " +
    "that is not yet valid, an authentication code that is invalid, a DNSSEC answer that is bogus, and log lines " +
    "in an order the events did not happen in. The tolerances range from 300 seconds down to none at all, so what broke " +
    `is itself a measurement. ${CLOCK_CASES.length} clocks, ${clockObservations} observations, worked backwards.`;

  /* A rule as a sentence, so the static body says what each check tolerates. */
  const ruleText = (check: (typeof CLOCK_CASES)[number]["checks"][number]): string =>
    check.rule.kind === "mutual"
      ? `compared against ${esc(check.rule.peer)}, which tolerates ${clockSpan(clockPassing(check.rule))} either way`
      : `a fixed window, passing only ${clockSpan(clockPassing(check.rule))}`;

  await writePage("clock", base, {
    title: "Four Errors, None of Which Says the Word Time | Max Doubin",
    description: clockDescription,
    canonical: `${SITE_URL}/clock`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Four errors, none of which says the word time",
  description: clockDescription,
  url: `${SITE_URL}/clock`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "Diagnosing clock skew from its symptoms: why TLS reports a certificate as not yet valid, why a TOTP code is rejected, why DNSSEC returns SERVFAIL with a bogus signature, and why correlated logs read in the wrong order, plus how the differing tolerances of Kerberos, one-time codes and certificate windows bound the offset from both sides",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Four errors, none of which says the word time</h1>
  <p>
    A wrong clock is the only fault I know of that reports itself under four
    unrelated names, and three of them send you somewhere else. TLS says the
    certificate is not yet valid, so you go and look at the certificate. An
    authenticator says the code is invalid, so you go and look at the seed.
    DNSSEC says the answer is bogus, so you go and look at the zone. Log
    correlation says nothing at all: the events are simply in the wrong
    order, and the conclusion you draw from reading them backwards is wrong
    in a way nothing will contradict.
  </p>
  <p>
    Only Kerberos is honest about it, and Kerberos is the one that usually
    still works, because five minutes is the widest tolerance in the stack.
  </p>
  <h2>Two things that make it harder than it sounds</h2>
  <p>
    The skew that matters is relative. Two hosts that are both ten minutes
    fast agree with each other perfectly, so everything between them works
    and everything either does against a third party fails. The machine you
    are logged into can look completely healthy.
  </p>
  <p>
    And the tolerances are not on one scale. The checks in these cases that
    tolerate anything allow ${clockTolerances.filter((value) => value > 0).join(" and ")}
    seconds; a certificate window and an RRSIG allow nothing at all, because
    their edges are hard. A factor of ${clockSpread} between the two graded
    ones, and then a cliff, and the cliff is the useful part: a check with no
    tolerance and a known timestamp measures rather than reassures.
  </p>
  <p>
    So the set of things that are broken is itself a measurement, and the
    question worth asking is not the arithmetic one. Given the skew, what
    breaks, is easy. Given what broke and what did not, how wrong is the
    clock, is what you actually have in front of you.
  </p>
  <h2>The clocks</h2>
${CLOCK_CASES.map((item) => {
  const span = clockNarrowed(item.checks);
  return `  <article>
    <h3>${esc(item.name)}</h3>
    <p>${esc(item.brief)}</p>
    <p>The host in question is ${esc(item.host)}.</p>
    <ul>
${item.checks
  .map(
    (check) =>
      `      <li>${esc(check.label)}, ${ruleText(check)}: it ${check.observed}. <q>${esc(check.message)}</q></li>`,
  )
  .join("\n")}
    </ul>
    <p>${esc(item.question)}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}</li>`).join("\n")}
    </ol>
    <p>
      The observations allow ${span ? clockSpan(span) : "no single range"}, and nothing narrower.
      ${esc(item.why)}
      It breaks the belief ${esc(item.breaks)}.
    </p>
  </article>`;
}).join("\n")}
  <h2>The fix, and the part of it people skip</h2>
  <p>
    Run NTP everywhere, from the same small set of servers, and monitor the
    offset rather than the daemon. A running chronyd that has never managed
    to step the clock is the exact failure this page is about, and
    <code>systemctl is-active</code> reports it as fine.
  </p>
  <p>
    The part people skip is monitoring the offset on the things that are not
    servers: the domain controllers are usually right and the appliance, the
    switch, the hypervisor host and the laptop that has been suspended for a
    week are usually not. Alert on the measurement, not on the process.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/blog/ntp-enterprise-networks", "NTP in enterprise networks"], ["/blog/how-totp-codes-actually-work", "How TOTP codes actually work"]])}
</main>`,
  });

  // ── retry amplification ──
  /*
    Every chain goes in with its policies, its fan-out per layer and its
    readings, derived here from the same model the page uses. The options go
    in too, because they are the exercise; the answer does not, for the same
    reason it does not on the logs page.
  */
  const worstFanOut = Math.max(...RETRY_CHAINS.map(amplification));
  const retryDescription =
    `Three attempts at each of four layers is ${worstFanOut} requests, and nobody wrote ${worstFanOut}. ` +
    `${RETRY_CHAINS.length} call paths to work out: what the dependency actually sees, who hangs up while ` +
    "somebody else is still working, and what the person who pressed the button waits.";

  await writePage("retry", base, {
    title: "Three Retries, Four Layers | Max Doubin",
    description: retryDescription,
    canonical: `${SITE_URL}/retry`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Three retries, four layers",
  description: retryDescription,
  url: `${SITE_URL}/retry`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "Retry amplification across a call path, timeout budgets and deadline propagation, orphaned work after a caller gives up, backoff without jitter, and why retrying a non-idempotent operation cannot be budgeted away",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Three retries, four layers</h1>
  <p>
    The browser retries a failed fetch. The edge retries an upstream error.
    The API client retries a reset connection. The driver retries a broken
    pipe. Three attempts each, which is the default in all four libraries and
    which four different people configured on four different days.
  </p>
  <p>
    They multiply. One person pressing a button once becomes ${worstFanOut}
    queries against the thing that was already having a bad day. The number is
    trivial to compute and almost never computed, because no single layer's
    configuration contains it and no dashboard shows all four policies at
    once.
  </p>
  <p>
    Two more failures come with it. When a caller's timeout is shorter than
    the time the layer below needs to exhaust its own retries, the caller
    hangs up and retries while the first request is still running, and nothing
    cancels the work it abandoned. And exponential backoff without jitter does
    not spread retries out, it synchronises them.
  </p>
  <h2>The call paths</h2>
${RETRY_CHAINS.map((chain) => `  <article>
    <h3>${esc(chain.name)}</h3>
    <p>${esc(chain.brief)}</p>
    <ul>
${chain.callers.map((caller, depth) => `      <li>${esc(caller.name)}: ${caller.attempts} ${caller.attempts === 1 ? "attempt" : "attempts"}, ${retryMs(caller.timeout)} timeout${caller.attempts > 1 ? `, ${retryMs(caller.backoff)} backoff${caller.factor > 1 ? ` times ${caller.factor}` : ""}, ${caller.jitter === 0 ? "no jitter" : `jitter ${Math.round(caller.jitter * 100)}%`}` : ""}${caller.idempotent ? "" : ", not safe to repeat"}. ${requestsAt(chain, depth + 1)} requests leave it.${caller.note ? ` ${esc(caller.note)}` : ""}</li>`).join("\n")}
      <li>${esc(chain.leaf.name)}: answers in ${retryMs(chain.leaf.latency)}${chain.leaf.note ? `. ${esc(chain.leaf.note)}` : ""}</li>
    </ul>
    <p>${esc(chain.question)}</p>
    <ol>
${chain.options.map((option) => `      <li>${esc(option.claim)}</li>`).join("\n")}
    </ol>
    <p>
      ${esc(chain.leaf.name)} sees ${amplification(chain)} requests, the user waits
      ${retryMs(retryElapsed(chain))},
      ${(() => { const t = truncatingCaller(chain); return t ? `${esc(t.name)} has a budget smaller than its callee's` : "no layer has a budget smaller than its callee's"; })()},
      and ${retryOrphaned(chain) === 0 ? "nothing is left running" : `${retryOrphaned(chain)} requests are left running`} once everybody has given up.
      It breaks the belief ${esc(chain.breaks)}.
    </p>
  </article>`).join("\n")}
  <h2>The fix</h2>
  <p>
    One budget divided downwards rather than four timeouts chosen upwards, so
    that every layer allows less time than its caller and the innermost
    failure surfaces first. Retry in exactly one place: the layer that knows
    whether the operation is safe to repeat and can see the whole deadline,
    which is almost never the driver at the bottom. Jitter every backoff. And
    for anything that is not safe to repeat, an idempotency key, because a
    timeout tells you that you stopped listening and nothing about whether the
    work happened.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/transfer", "Why the transfer is slow"], ["/blog/queueing-theory-for-operators", "Queueing theory for operators"]])}
</main>`,
  });

  // ── patch prioritisation ──
  /*
    The whole queue goes into the static body twice, once in each order, which
    is the argument the page makes visually. The decision points go in too,
    because they are the evidence; the tier each finding lands in is derived
    from the tree here exactly as it is in the page.
  */
  const patchInverted = invertedPairs(PATCH_FINDINGS);
  const patchDescription =
    "Every scanner sorts by CVSS base score, and the specification says the base score is not a risk score. " +
    `${PATCH_FINDINGS.length} advisories in one week, called with the published deployer decision tree: ` +
    `${patchInverted.inverted} of ${patchInverted.pairs} pairs come out in the other order, and the worst single ` +
    `disagreement moves a finding ${worstMove(PATCH_FINDINGS)} places.`;

  await writePage("patch", base, {
    title: "The Queue Is Sorted Wrong | Max Doubin",
    description: patchDescription,
    canonical: `${SITE_URL}/patch`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "The queue is sorted wrong",
  description: patchDescription,
  url: `${SITE_URL}/patch`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "Vulnerability response prioritisation: why a CVSS base score is not a risk score, and how exploitation, system exposure, automatability and human impact decide what you actually do about an advisory",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>The queue is sorted wrong</h1>
  <p>
    Every vulnerability management tool sorts by base score, because that is
    the only number that arrives with the advisory. So a 9.8 goes to the top, a
    6.5 goes near the bottom, and whoever works the queue starts at the top.
  </p>
  <p>
    The scoring specification says plainly that the base score describes
    intrinsic characteristics and is meant to be adjusted by environmental
    metrics that almost nobody fills in. It cannot know whether the affected
    component is reachable from where an attacker is, whether the feature is
    enabled in your build, whether anybody is exploiting it, or what the
    machine does. All four change the answer.
  </p>
  <h2>The advisories</h2>
${PATCH_FINDINGS.map((finding) => `  <article>
    <h3>${esc(finding.product)}, ${esc(finding.id)}</h3>
    <p>${esc(finding.summary)} Published as ${esc(finding.severity)}, base score ${finding.cvss.toFixed(1)}.</p>
    <ul>
${finding.estate.map((note) => `      <li>${esc(note)}</li>`).join("\n")}
    </ul>
    <p>
      Exploitation ${esc(finding.points.exploitation)}, system exposure ${esc(finding.points.exposure)},
      automatable ${esc(finding.points.automatable)}, human impact ${esc(finding.points.impact)}, so
      ${esc(PRIORITY_LABEL[priorityFor(finding.points)].toLowerCase())}.
    </p>
  </article>`).join("\n")}
  <h2>The same week, sorted by base score</h2>
  <ol>
${byScore(PATCH_FINDINGS).map((finding) => `    <li>${esc(finding.product)}, ${esc(finding.id)}, ${finding.cvss.toFixed(1)}</li>`).join("\n")}
  </ol>
  <h2>The same week, sorted by what to do about it</h2>
  <ol>
${byPriority(PATCH_FINDINGS).map((finding) => `    <li>${esc(finding.product)}, ${esc(finding.id)}, ${esc(PRIORITY_LABEL[priorityFor(finding.points)].toLowerCase())}</li>`).join("\n")}
  </ol>
  <p>
    ${patchInverted.inverted} of the ${patchInverted.pairs} pairs are ordered
    differently by the two, and the worst single disagreement moves a finding
    ${worstMove(PATCH_FINDINGS)} places. The advisories are constructed, which
    is why they are numbered ADV rather than CVE. The scoring system, the four
    decision points and the tree are real.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/scenarios/no-patch-until-tuesday", "No Patch Until Tuesday"], ["/firewall", "Firewall exercises"]])}
</main>`,
  });

  // ── file permissions ──
  /*
    The tree and the four claims go into the static body in full: they are the
    exercise, and a crawler that sees only the heading sees an empty page. The
    answers are not here, for the same reason they are not in the logs.
  */
  const permissionsDescription =
    "Every other permission system you have met adds rights up. Unix mode bits pick exactly one of " +
    `owner, group and other and ignore the other two. ${PERMISSION_CASES.length} accesses to call: a file you own and cannot ` +
    "write, a file you cannot read and can delete, a home directory at 711 that is not private, and the one thing root cannot do.";

  await writePage("permissions", base, {
    title: "The First Class That Matches | Max Doubin",
    description: permissionsDescription,
    canonical: `${SITE_URL}/permissions`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "The first class that matches",
  description: permissionsDescription,
  url: `${SITE_URL}/permissions`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "POSIX file mode bits: that the kernel selects one class rather than combining them, that deleting is a directory permission, that traversal needs execute on every parent, and what the setgid and sticky bits actually do",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>The first class that matches</h1>
  <p>
    Roles, groups in a directory service, IAM policies, the access control
    lists bolted on beside these very bits: in all of them rights accumulate,
    and being in one more group can only help. So the model arrives fully
    formed and wrong, because the nine bits pick exactly one of the three sets
    and ignore the other two entirely.
  </p>
  <p>
    Own the file and you get the owner bits. Not the owner bits plus the group
    bits. If they say you cannot write it then you cannot write it, no matter
    that the group can, no matter that the whole world can, and no matter that
    you are in the group as well. Two more things behave differently from how
    they read: deleting a file is write on the directory holding it rather
    than any permission on the file, and reaching a file at all needs the
    execute bit on every directory above it.
  </p>
  <h2>The accesses</h2>
${PERMISSION_CASES.map((item) => `  <article>
    <h3>${esc(item.title)}</h3>
    <p>${esc(item.brief)}</p>
    <p><code>${esc(item.actor.user)}: ${esc(item.command)}</code>, with groups ${esc(item.actor.groups.join(", "))}.</p>
    <ul>
${item.path.map((node) => `      <li><code>${lsLine(node)}</code> ${esc(node.owner)} ${esc(node.group)} ${modeOctal(node.mode)} ${esc(node.name)}${node.note ? `. ${esc(node.note)}` : ""}</li>`).join("\n")}
    </ul>
    <p>Does it work?</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}</li>`).join("\n")}
    </ol>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`).join("\n")}
  <h2>The rule, in the order the kernel applies it</h2>
  <ol>
    <li>Walk the path from the top. Every directory above the target needs the execute bit, which here means search rather than run.</li>
    <li>At each node pick the class: owner if you own it, else group if you are in its group, else other. One of the three, never a union.</li>
    <li>Apply what the operation needs. Read, write and execute land on the target. Creating and deleting land on the directory and require nothing at all of the target.</li>
    <li>If the directory is sticky and this is a removal, the file has to be yours or the directory has to be.</li>
  </ol>
  <p>
    Root skips steps two and three by the kernel declining to check, with one
    exception: running a file still needs an execute bit to exist somewhere in
    the nine, because there the question is whether the file is a program
    rather than whether you are allowed.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/firewall", "Firewall exercises, the same first-match rule on packets"], ["/tools/chmod-calculator", "Permissions calculator"]])}
</main>`,
  });

  // ── read the log ──
  /*
    The logs go into the static body in full, because they are the content
    and a crawler that cannot see them sees an empty exercise. The answers
    and the deciding lines stay out: printing them would put the answer key
    in a search result.
  */
  const logsDescription =
    "A thousand failed passwords are a bot that got nowhere. The line that matters is the quiet " +
    `one four hundred rows down. ${LOGS.length} logs, each with one conclusion to reach and one ` +
    "line that proves it.";

  await writePage("logs", base, {
    title: "Read the Log | Max Doubin",
    description: logsDescription,
    canonical: `${SITE_URL}/logs`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Read the log",
  description: logsDescription,
  url: `${SITE_URL}/logs`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches: "Reading system, authentication, mail and firewall logs, and citing the evidence for a conclusion",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Read the log</h1>
  <p>
    A thousand failed passwords are a bot that got nowhere. The line that
    matters is the quiet one four hundred rows further down, and it is usually
    a success rather than a failure. Reading logs badly means reading the
    loudest thing and stopping.
  </p>
  <p>
    So each of these asks for two things: what happened, and which single line
    settles it. They are marked separately, because an explanation you cannot
    point at is a guess that happened to be right.
  </p>
${LOGS.map((item) => `  <article>
    <h2>${esc(item.title)}</h2>
    <p>${esc(item.brief)}</p>
    <pre>${item.lines.map((line) => esc(renderLine(item, line))).join("\n")}</pre>
  </article>`).join("\n")}
  <p>
    Every line above is rendered to real syslog format and parsed back at
    build time, so a line no daemon would emit fails the build rather than
    teaching you to recognise something you will never see.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/capture", "Packet captures"], ["/labs", "Hands-on labs"]])}
</main>`,
  });

  // ── why the transfer is slow ──
  /*
    The static body carries every complaint and the numbers behind it, but
    not the answers: the exercise is deciding which ceiling is binding, and
    printing "window" beside each one would hand a crawler the answer key and
    put it in a search result.
  */
  const transferDescription =
    "A gigabit link across an ocean with a default 64KiB window carries about six megabits. " +
    "Model the three ceilings a single TCP stream sits under, work out which one is binding on " +
    `${TRANSFERS.length} real complaints, and see which expensive upgrade would have done nothing.`;

  await writePage("transfer", base, {
    title: "Why the Transfer Is Slow | Max Doubin",
    description: transferDescription,
    canonical: `${SITE_URL}/transfer`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Why the transfer is slow",
  description: transferDescription,
  url: `${SITE_URL}/transfer`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches: "Bandwidth-delay product, TCP receive window sizing, and the effect of packet loss on single-stream throughput",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Why the transfer is slow</h1>
  <p>
    A gigabit link across an ocean with a default 64KiB window carries about
    six megabits. Not because anything is broken: a single stream can only
    have so much unacknowledged data in flight, and dividing that by the round
    trip is the whole of it. Neither number is on the invoice.
  </p>
  <p>
    Three ceilings sit over a stream and the lowest one wins. The link rate
    itself, the receive window divided by the round trip, and the Mathis bound
    on a lossy path, which falls with the square root of the loss rate and has
    no line rate in it at all. A fourth answer is not a ceiling: a transfer
    small enough to finish while the window is still opening is paying round
    trips, and a faster line does nothing for it.
  </p>
  <h2>The complaints</h2>
${TRANSFERS.map((item) => {
  const result = analyse(item.link);
  return `  <article>
    <h3>${esc(item.title)}</h3>
    <p>${esc(item.complaint)}</p>
    <p>${rate(item.link.bandwidth)} link, ${item.link.rtt} ms round trip, ${size(item.link.window)} window, ` +
    `${item.link.loss === 0 ? "no loss" : `${(item.link.loss * 100).toFixed(4)} per cent loss`}, moving ${size(item.bytes)}. ` +
    `Filling this path needs ${size(result.bdp)} in flight.</p>
  </article>`;
}).join("\n")}
  <p>
    The loss ceiling is the Mathis bound, an approximation of a Reno-shaped
    sawtooth rather than a law. The shape is the part worth keeping: a
    hundredfold reduction in loss buys a tenfold increase in speed, and no
    amount of bandwidth buys any.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/glossary", "Glossary"], ["/capture", "Packet captures"]])}
</main>`,
  });

  // ── glossary ──
  /*
    The whole glossary goes into the static body, not a summary of it. A
    definition a crawler cannot read is a definition that only exists for
    people who already arrived, and the terms are the reason anyone would
    find this page at all.
  */
  const glossaryDescription =
    `${TERMS.length} terms from networking, security, systems and storage, each one saying what ` +
    "the thing is and what people reliably get wrong about it. A VLAN is not a security " +
    "boundary. A URE figure is a warranty bound, not a measured rate.";

  await writePage("glossary", base, {
    title: "Glossary | Max Doubin",
    description: glossaryDescription,
    canonical: `${SITE_URL}/glossary`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  name: "Glossary",
  description: glossaryDescription,
  url: `${SITE_URL}/glossary`,
  hasDefinedTerm: TERMS.map((term) => ({
    "@type": "DefinedTerm",
    name: term.term,
    description: term.definition,
    inDefinedTermSet: `${SITE_URL}/glossary`,
    url: `${SITE_URL}/glossary#${slugFor(term)}`,
  })),
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Glossary</h1>
  <p>
    Every glossary will tell you that VLAN stands for virtual LAN. Almost none
    of them will tell you that a VLAN is not a security boundary, which is the
    sentence that changes what somebody builds. The expansion is the small
    print here.
  </p>
  <p>
    ${TERMS.filter((term) => term.confusion).length} of the ${TERMS.length} entries close with what
    people get wrong. Nothing here is defined that the site does not use, and a term the writing
    leans on and this page has not defined fails the build, so the glossary cannot fall behind the
    articles.
  </p>
${TERMS.map((term) => `  <article id="${slugFor(term)}">
    <h2>${esc(term.term)}${term.expansion ? ` (${esc(term.expansion)})` : ""}</h2>
    <p>${esc(FIELD_LABEL[term.field])}</p>
    <p>${esc(term.definition)}</p>
${term.confusion ? `    <p>What people get wrong: ${esc(term.confusion)}</p>` : ""}
  </article>`).join("\n")}
  ${backLinks([["/practise", "The practise hub"], ["/blog", "Field Notes"], ["/study", "Study guides"]])}
</main>`,
  });

  // ── array calculator ──
  const arrayDescription =
    "Usable capacity, guaranteed fault tolerance, rebuild time and the unrecoverable read error " +
    "arithmetic behind RAID 5 is dead, with the specification figure and an observed one side by side.";

  await writePage("array", base, {
    title: "RAID and RAIDZ Array Calculator | Max Doubin",
    description: arrayDescription,
    canonical: `${SITE_URL}/array`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Array calculator",
  description: arrayDescription,
  url: `${SITE_URL}/array`,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any browser",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script>`,
    rootContent: `
<main>
  <h1>Array calculator</h1>
  <p>
    Usable capacity, the fault tolerance you can actually rely on, how long a
    rebuild takes, and the unrecoverable read error calculation that the phrase
    RAID 5 is dead comes from.
  </p>
  <p>
    That calculation is shown twice, on purpose. Once with the manufacturer's
    figure, which is a warranty bound rather than a measurement, and once with
    a rate two orders of magnitude better, which is a conservative reading of
    what field studies find. The conclusion moves a very long way between them.
  </p>
  <h2>What it works out</h2>
  <ul>
    <li>Usable capacity in decimal TB and in the TiB an operating system
      reports, which is where the missing nine per cent goes.</li>
    <li>Guaranteed simultaneous failures survived. For striped mirrors that is
      one, not half the disks: the second failure landing on the partner of the
      first is the case you plan around.</li>
    <li>Rebuild time, from the bytes that must be read. A parity rebuild reads
      every surviving member in full, so the cost grows with the array rather
      than with the failed disk.</li>
    <li>The probability of an unrecoverable read error during that rebuild, at
      the specification rate and at an observed one.</li>
    <li>What a URE during a rebuild actually costs, which differs by level and
      by implementation and is not always the array.</li>
  </ul>
  <h2>Configurations worth comparing</h2>
  <ul>
${ARRAY_CONFIGS.map((config) => `    <li>${esc(config.label)}: ${esc(config.notes[0])}</li>`).join("\n")}
  </ul>
  <h2>What it cannot compute</h2>
  <p>
    None of this is a backup. Every level protects against a disk failing and
    against nothing else. The failure that is not modelled is correlated
    failure: disks bought together, run at the same temperature for the same
    years, do not fail independently, and a rebuild puts every survivor under
    sustained full read load at exactly the moment you need them to behave.
  </p>
  ${backLinks([["/tools/rack-budget", "Rack power and cooling budget"], ["/racks", "The rack library"], ["/tools", "All browser tools"]])}
</main>`,
  });

  // ── address plans ──
  /*
    The requirements and the block go into the static body, because "divide a
    /22 between these five VLANs" is a question people search for with the
    numbers in it. The solutions do not, for the same reason the labs withhold
    theirs.
  */
  const allocateIndexDescription =
    "Six blocks to divide between competing requirements, with a map drawn to scale. Overlaps, " +
    "unaligned networks, summary routes and growth, marked on behaviour rather than on matching " +
    "one answer.";

  await writePage("allocate", base, {
    title: "Address Plan Exercises | Max Doubin",
    description: allocateIndexDescription,
    canonical: `${SITE_URL}/allocate`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "IPv4 address plan exercises",
  description: allocateIndexDescription,
  url: `${SITE_URL}/allocate`,
  numberOfItems: PLANS.length,
  itemListElement: PLANS.map((plan, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: plan.title,
    description: plan.tagline,
    url: `${SITE_URL}/allocate/${plan.slug}`,
  })),
})}
</script>`,
    rootContent: `
<main>
  <h1>Address plans</h1>
  <p>
    One block, several things that need space, and constraints that make it a
    puzzle rather than a division. Type a CIDR against each requirement and a
    map of the block fills in as you go.
  </p>
  <p>
    The map is the part a spreadsheet cannot do. An address plan written as a
    column of CIDRs hides both of the mistakes that matter: an overlap looks
    like two different numbers, and a gap you cannot use looks like nothing at
    all. Drawn to scale, both are immediate.
  </p>
  <ul>
${PLANS.map(
  (plan) =>
    `    <li><a href="${SITE_URL}/allocate/${plan.slug}">${esc(plan.title)}</a> ` +
    `(${esc(plan.difficulty)}, ${esc(plan.block)}): ${esc(plan.tagline)}</li>`,
).join("\n")}
  </ul>
  ${backLinks([["/practise", "All practise material"], ["/firewall", "Firewall exercises"], ["/tools/vlsm-practice", "The subnetting drill"]])}
</main>`,
  });

  for (const plan of PLANS) {
    const url = `${SITE_URL}/allocate/${plan.slug}`;
    await writePage(`allocate/${plan.slug}`, base, {
      title: pageTitle(`${plan.title} | Address plan`),
      description: `${plan.tagline} A ${plan.difficulty} IPv4 address plan exercise on ${plan.block}.`,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: plan.title,
  description: plan.tagline,
  url,
  learningResourceType: "Exercise",
  educationalUse: "Practice",
  interactivityType: "active",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  educationalLevel: plan.difficulty,
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script><script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Address plans", item: `${SITE_URL}/allocate` },
    { "@type": "ListItem", position: 3, name: plan.title, item: url },
  ],
})}
</script>`,
      rootContent: `
<main>
  <h1>${esc(plan.title)}</h1>
  <p>${esc(plan.tagline)}</p>
  <h2>The brief</h2>
${plan.brief.map((paragraph) => `  <p>${esc(paragraph)}</p>`).join("\n")}
  <h2>The block</h2>
  <p>${esc(plan.block)}</p>
  <h2>What needs space</h2>
  <ul>
${plan.requirements
  .map(
    (requirement) =>
      `    <li>${esc(requirement.label)}: ${requirement.hosts} hosts` +
      `${requirement.within ? `, inside ${esc(requirement.within)}` : ""}` +
      `${requirement.note ? `. ${esc(requirement.note)}` : ""}</li>`,
  )
  .join("\n")}
  </ul>
  <p>
    The exercise is marked by behaviour rather than by matching one answer, so
    any plan that meets every requirement without overlapping is right. The
    interactive page draws the block to scale as you fill it and there are
    ${plan.hints.length} hints.
  </p>
  ${backLinks([["/allocate", "All address plans"], ["/firewall", "Firewall exercises"], ["/labs", "Hands-on labs"]])}
</main>`,
    });
  }

  // ── certificate chain validation ──
  const chainDescription =
    "Nine servers presenting nine chains, validated check by check. A missing intermediate, an " +
    "expired intermediate, a wildcard that does not cover the bare domain, and a root a device " +
    "is too old to have all look the same from a browser.";

  await writePage("chain", base, {
    title: "Certificate Chain Validation | Max Doubin",
    description: chainDescription,
    canonical: `${SITE_URL}/chain`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Certificate chain validation",
  description: chainDescription,
  url: `${SITE_URL}/chain`,
  learningResourceType: "Exercise",
  educationalUse: "Practice",
  interactivityType: "active",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  teaches: [
    "Telling a missing intermediate from an expired one",
    "Why a wildcard does not cover the bare domain",
    "Which party can fix a given TLS error",
  ],
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script>`,
    rootContent: `
<main>
  <h1>Certificate chain validation</h1>
  <p>
    Nine servers presenting nine chains, validated check by check against a
    named trust store at a named moment.
  </p>
  <p>
    A browser reduces all of this to one interstitial and about five error
    codes, and openssl gives you a verify code and a chain dump. Neither
    answers the question anyone actually has, which is not whether it is broken
    but which of us fixes it. A missing intermediate is the server operator's.
    An expired root is the client's, and no amount of reissuing helps. A
    wildcard that does not cover the bare domain was wrong before it was
    signed.
  </p>
  <h2>The cases</h2>
  <ul>
${CHAIN_CASES.map(
  (item) => `    <li>${esc(item.symptom)} (${esc(item.hostname)}, ${esc(item.store.name)})</li>`,
).join("\n")}
  </ul>
  <h2>Some rules that surprise people</h2>
  <ul>
    <li>A wildcard covers exactly one label. <code>*.example.com</code> matches
      <code>www.example.com</code>, and matches neither <code>example.com</code>
      nor <code>a.b.example.com</code>.</li>
    <li>A root's own signature is never verified by anything. It is trusted
      because it is in the store, so a weak algorithm on a self-signed root is
      not the finding a scanner thinks it is.</li>
    <li>An expired intermediate produces the same browser error as an expired
      leaf, which is why renewing the certificate does not help.</li>
    <li>A chain that stops early is reported by several tools as a self-signed
      certificate, and there is no self-signed certificate involved.</li>
    <li>A certificate that is not valid yet is almost always a wrong clock, and
      the tell is that every site fails at once rather than one.</li>
  </ul>
  ${backLinks([["/practise", "All practise material"], ["/resolve", "DNS resolution"], ["/labs", "Hands-on labs"]])}
</main>`,
  });

  // ── DNS resolution walkthrough ──
  /*
    One page. The symptoms go into the static body with the name each one
    turns on, because "why does one subdomain not resolve when nothing was
    changed" is a search someone makes at a bad hour. The answers do not.
  */
  const resolveDescription =
    "Watch an iterative resolver walk from the root, and tell a lame delegation from a missing " +
    "glue record from an alias that points at nothing. Eight symptoms with the trace that " +
    "explains each one.";

  await writePage("resolve", base, {
    title: "DNS Resolution Walkthrough | Max Doubin",
    description: resolveDescription,
    canonical: `${SITE_URL}/resolve`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "DNS resolution walkthrough",
  description: resolveDescription,
  url: `${SITE_URL}/resolve`,
  learningResourceType: "Exercise",
  educationalUse: "Practice",
  interactivityType: "active",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  teaches: [
    "Reading an iterative resolution from the root",
    "Telling a lame delegation from a missing glue record",
    "The difference between NXDOMAIN and NODATA",
  ],
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script>`,
    rootContent: `
<main>
  <h1>DNS resolution walkthrough</h1>
  <p>
    A small simulated internet with nine zones and several things wrong with
    it. Ask for any name and watch an iterative resolver walk down from the
    root: every query, which server took it, and what came back.
  </p>
  <p>
    From a client nearly every DNS fault produces the same sentence. A lame
    delegation, a missing glue record, a nameserver whose own name has no
    address, and an alias pointing at a zone that was never created are four
    different problems, four different people to talk to, and one symptom.
  </p>
  <h2>The failure modes</h2>
  <ul>
    <li><strong>Lame delegation</strong>: the parent points at a server that
      answers and disclaims the zone. From a client it looks like a firewall.
      The fix is at the parent, and nobody inside the child zone can make it.</li>
    <li><strong>No glue</strong>: the nameservers are inside the zone they
      serve, and the parent sends no address records for them, so finding them
      needs the servers being looked for. The child's zone file is correct and
      unreachable.</li>
    <li><strong>A delegation to nothing</strong>: the nameserver named in the
      delegation has no address record anywhere, so no query is ever sent.</li>
    <li><strong>NXDOMAIN against NODATA</strong>: one says the name does not
      exist, across every type. The other says it exists and has no record of
      the type asked for, which is the normal answer to an AAAA query for a
      host without IPv6.</li>
    <li><strong>An alias to nowhere</strong>: the CNAME resolves, its target
      does not, and the error names a host the reporter never typed.</li>
    <li><strong>An alias loop</strong>: two CNAMEs point at each other. Each
      zone is individually valid and the resolution never terminates.</li>
  </ul>
  <h2>The symptoms</h2>
  <ul>
${DNS_CASES.map(
  (item) => `    <li>${esc(item.symptom)} (look up ${esc(item.name)} ${esc(item.type)})</li>`,
).join("\n")}
  </ul>
  <p>
    Every name is under a reserved suffix and every address is in a
    documentation range, so nothing here reaches anything real.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/capture", "Packet captures"], ["/labs", "Hands-on labs"]])}
</main>`,
  });

  // ── firewall exercises ──
  /*
    Index plus one page per exercise. The starting chain goes into the static
    body because a broken iptables ruleset with an explanation of what is wrong
    with it is exactly the thing people search for at two in the morning. The
    solution does not, for the same reason the labs withhold theirs.
  */
  const firewallIndexDescription =
    "Eight iptables chains with something wrong with them, and a trace that shows every rule a " +
    "packet was tested against and the first field that ruled each one out.";

  await writePage("firewall", base, {
    title: "Firewall Exercises | Max Doubin",
    description: firewallIndexDescription,
    canonical: `${SITE_URL}/firewall`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "iptables firewall exercises",
  description: firewallIndexDescription,
  url: `${SITE_URL}/firewall`,
  numberOfItems: FIREWALL.length,
  itemListElement: FIREWALL.map((exercise, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: exercise.title,
    description: exercise.tagline,
    url: `${SITE_URL}/firewall/${exercise.slug}`,
  })),
})}
</script>`,
    rootContent: `
<main>
  <h1>Firewall exercises</h1>
  <p>
    Eight iptables chains with something wrong with them. Edit the rules and a
    checklist of packets marks itself as you type.
  </p>
  <p>
    The part worth having is the trace: every rule a packet was tested against,
    in order, with the first field that ruled each one out and the rule that
    finally decided it. Counters tell you a rule fired. They never tell you
    which rule stole the packet you cared about, which is the actual question
    nearly every firewall problem turns out to be.
  </p>
  <ul>
${FIREWALL.map(
  (exercise) =>
    `    <li><a href="${SITE_URL}/firewall/${exercise.slug}">${esc(exercise.title)}</a> ` +
    `(${esc(exercise.difficulty)}): ${esc(exercise.tagline)}</li>`,
).join("\n")}
  </ul>
  ${backLinks([["/practise", "All practise material"], ["/capture", "Packet captures"], ["/labs", "Hands-on labs"]])}
</main>`,
  });

  for (const exercise of FIREWALL) {
    const url = `${SITE_URL}/firewall/${exercise.slug}`;
    await writePage(`firewall/${exercise.slug}`, base, {
      title: pageTitle(`${exercise.title} | Firewall`),
      description: `${exercise.tagline} A ${exercise.difficulty} iptables exercise with a rule-by-rule match trace.`,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: exercise.title,
  description: exercise.tagline,
  url,
  learningResourceType: "Exercise",
  educationalUse: "Practice",
  interactivityType: "active",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  educationalLevel: exercise.difficulty,
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script><script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Firewall", item: `${SITE_URL}/firewall` },
    { "@type": "ListItem", position: 3, name: exercise.title, item: url },
  ],
})}
</script>`,
      rootContent: `
<main>
  <h1>${esc(exercise.title)}</h1>
  <p>${esc(exercise.tagline)}</p>
  <h2>The brief</h2>
${exercise.brief.map((paragraph) => `  <p>${esc(paragraph)}</p>`).join("\n")}
  <h2>The chain as you find it</h2>
  <pre>${esc(exercise.start)}</pre>
  <h2>What has to be true when you are done</h2>
  <ul>
${exercise.expectations
  .map((expectation) => `    <li>${esc(expectation.label)}: ${esc(expectation.expect)}</li>`)
  .join("\n")}
  </ul>
  <p>
    The exercise is marked by behaviour rather than by shape, so any chain that
    produces those verdicts is correct. The interactive page traces any of
    these packets rule by rule and there are ${exercise.hints.length} hints.
  </p>
  ${backLinks([["/firewall", "All firewall exercises"], ["/labs", "Hands-on labs"], ["/capture", "Packet captures"]])}
</main>`,
    });
  }

  // ── phishing triage inbox ──
  /*
    One page, and the static body is the inbox as a list plus what each message
    turns on. The bodies and headers are interactive and stay that way; what a
    crawler gets is the shape of the exercise and the vocabulary, which is the
    part anyone is actually searching for.
  */
  const triagePhish = TRIAGE_MESSAGES.filter((m) => m.verdict === "phish").length;
  const triageDescription =
    `Fourteen messages with their real headers, ${triagePhish} of them hostile. Call each one, then ` +
    "say which signal settles it. Five are genuine mail wearing the things people are taught to fear.";

  await writePage("triage", base, {
    title: "Phishing Triage Inbox | Max Doubin",
    description: triageDescription,
    canonical: `${SITE_URL}/triage`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Phishing triage inbox",
  description: triageDescription,
  url: `${SITE_URL}/triage`,
  learningResourceType: "Exercise",
  educationalUse: "Practice",
  interactivityType: "active",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  teaches: [
    "Reading SPF, DKIM and DMARC results",
    "Telling a lookalike domain from a real one",
    "Distinguishing a hard signal from a red herring",
  ],
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script>`,
    rootContent: `
<main>
  <h1>Phishing triage</h1>
  <p>
    One morning of mail for a school district technician. ${TRIAGE_MESSAGES.length}
    messages, ${triagePhish} of them hostile, every header the real thing. Call
    each one, then say which signal settles it.
  </p>
  <p>
    ${TRIAGE_MESSAGES.length - triagePhish} are genuine, and they are the reason
    this is worth doing. They arrive wearing the things people are taught to
    fear: a mismatched envelope sender, a Reply-To somewhere else, a shortened
    link, a request to change bank details, a broken DKIM signature. Reporting
    one of those costs an afternoon and a little of the credibility the next
    real report will need.
  </p>
  <h2>What settles a message, and what does not</h2>
  <p>
    The hard signals are the ones that decide it on their own: an
    authentication failure the domain's own DMARC policy stands behind, a
    display name asserting a sender the address does not support, a
    registrable domain imitating a brand, a link whose text names one host and
    whose target is another, and an attachment whose type is the delivery
    mechanism.
  </p>
  <p>
    The rest look alarming and prove nothing. An envelope sender that differs
    from the From address is how nearly all bulk mail works. A Reply-To
    pointing elsewhere is how every ticketing system works. Suppliers do
    change banks, real work is often urgent, and SPF and DKIM break on
    forwarding and mailing lists every day in mail nobody forged.
  </p>
  <h2>The inbox</h2>
  <ul>
${TRIAGE_MESSAGES.map(
  (message) =>
    `    <li>${esc(message.subject)} &mdash; from ${esc(message.displayName)} ` +
    `&lt;${esc(message.fromAddress)}&gt;</li>`,
).join("\n")}
  </ul>
  <p>
    Every address and host in this inbox is invented, and the ones that imitate
    a brand sit under reserved names that resolve to nothing.
  </p>
  ${backLinks([["/practise", "All practise material"], ["/challenges", "Capture the flag"], ["/labs", "Hands-on labs"]])}
</main>`,
  });

  // ── capture the flag challenges ──
  /*
    The artefacts are printed into the static body deliberately: a hex dump
    and a summarised auth.log are exactly the sort of thing someone searches
    for, and a crawler that can read them is a crawler that can rank them.
    What never goes in is the flag, and the walkthrough with it, because the
    static page has no button to hide them behind.
  */
  const challengesIndexDescription =
    "Small capture-the-flag puzzles with the artefact printed in the page: a log to count, a " +
    "header to decode, a file whose extension lies. Every answer is exact and every method is " +
    "written out.";

  await writePage("challenges", base, {
    title: "Capture the Flag Challenges | Max Doubin",
    description: challengesIndexDescription,
    canonical: `${SITE_URL}/challenges`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Capture the flag challenges",
  description: challengesIndexDescription,
  url: `${SITE_URL}/challenges`,
  numberOfItems: CHALLENGES.length,
  itemListElement: CHALLENGES.map((challenge, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: challenge.title,
    description: challenge.tagline,
    url: `${SITE_URL}/challenges/${challenge.slug}`,
  })),
})}
</script>`,
    rootContent: `
<main>
  <h1>Challenges</h1>
  <p>
    An artefact and a question. The log, the hex dump, the scan output and the
    digests are all printed in full, because the exercise is reading them, not
    downloading them. Every answer is one exact string.
  </p>
  <p>
    The flag is checked against a SHA-256 held in the page, which means
    ctrl-F will not find it and a determined reader with the developer tools
    open absolutely will. There is no score to protect, and the full method
    sits behind one button on every challenge.
  </p>
  <ul>
${CHALLENGES.map(
  (challenge) =>
    `    <li><a href="${SITE_URL}/challenges/${challenge.slug}">${esc(challenge.title)}</a> ` +
    `(${esc(challenge.category)}, ${esc(challenge.difficulty)}): ${esc(challenge.tagline)}</li>`,
).join("\n")}
  </ul>
  ${backLinks([["/labs", "Hands-on labs"], ["/capture", "Packet captures"], ["/ncl", "National Cyber League notes"]])}
</main>`,
  });

  for (const challenge of CHALLENGES) {
    const url = `${SITE_URL}/challenges/${challenge.slug}`;
    await writePage(`challenges/${challenge.slug}`, base, {
      title: pageTitle(`${challenge.title} | Challenge`),
      description: `${challenge.tagline} A ${challenge.difficulty} ${challenge.category.toLowerCase()} challenge with the artefact printed in the page.`,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: challenge.title,
  description: challenge.tagline,
  url,
  learningResourceType: "Exercise",
  educationalUse: "Practice",
  interactivityType: "active",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  educationalLevel: challenge.difficulty,
  about: challenge.category,
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script><script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Challenges", item: `${SITE_URL}/challenges` },
    { "@type": "ListItem", position: 3, name: challenge.title, item: url },
  ],
})}
</script>`,
      rootContent: `
<main>
  <h1>${esc(challenge.title)}</h1>
  <p>${esc(challenge.tagline)}</p>
  <p>${esc(challenge.category)}, ${esc(challenge.difficulty)}. The answer takes the shape ${esc(challenge.flagShape)}.</p>
  <h2>The brief</h2>
${challenge.brief.map((paragraph) => `  <p>${esc(paragraph)}</p>`).join("\n")}
  <h2>What you are given</h2>
${challenge.artefacts
  .map(
    (artefact) =>
      `${artefact.title ? `  <h3>${esc(artefact.title)}</h3>\n` : ""}` +
      `  <pre>${artefact.lines.map((line) => esc(line)).join("\n")}</pre>`,
  )
  .join("\n")}
  <h2>Hints</h2>
  <p>
    There are ${challenge.hints.length} hints, opened one at a time on the
    interactive page, and the full method is one button away whenever you
    decide you would rather learn it than find it.
  </p>
${
  challenge.reading?.length
    ? `  <h2>The written version</h2>\n  <ul>\n${challenge.reading
        .map((link) => `    <li><a href="${SITE_URL}${link.href}">${esc(link.label)}</a></li>`)
        .join("\n")}\n  </ul>`
    : ""
}
  ${backLinks([["/challenges", "All challenges"], ["/labs", "Hands-on labs"], ["/capture", "Packet captures"]])}
</main>`,
    });
  }

  // ── branching incident scenarios ──
  /*
    The index and one page per scenario.

    The scenes are the whole point and they are interactive, so none of them
    are written into the static body: what a crawler gets is the brief, the
    role, the shape of the thing, and the reading it points at. That is the
    honest static version of an interactive page. Writing the scenes out
    would also spoil every branch for a reader arriving from search, and
    listing the ending titles would spoil the endings, so the static page
    counts the endings by grade instead of naming them.
  */
  const scenarioIndexDescription =
    "Branching cyber incident scenarios: ransomware at two in the morning, a server that will not come back, " +
    "an insider with a resignation letter. Multiple choice, many endings, and every ending says what separated " +
    "it from the best one.";

  await writePage("scenarios", base, {
    title: "Incident Scenarios | Max Doubin",
    description: scenarioIndexDescription,
    canonical: `${SITE_URL}/scenarios`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Branching incident scenarios",
  description: scenarioIndexDescription,
  url: `${SITE_URL}/scenarios`,
  numberOfItems: SCENARIOS.length,
  itemListElement: SCENARIOS.map((scenario, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: scenario.title,
    description: scenario.tagline,
    url: `${SITE_URL}/scenarios/${scenario.slug}`,
  })),
})}
</script>`,
    rootContent: `
<main>
  <h1>Incident scenarios</h1>
  <p>
    The expensive mistakes in an incident are made in the first fifteen
    minutes, by someone tired, with incomplete information, under pressure to
    do something visible. These are those fifteen minutes, made repeatable.
  </p>
  <p>
    Every ending says what separated it from the best available outcome, and
    how rare it is: rarity is the share of all routes through the scenario
    that finish there, counted from the graph rather than guessed.
  </p>
  <ul>
${SCENARIOS.map(
  (scenario) =>
    `    <li><a href="${SITE_URL}/scenarios/${scenario.slug}">${esc(scenario.title)}</a> ` +
    `(${esc(DIFFICULTY_LABEL[scenario.difficulty])}, ${esc(scenario.category)}): ` +
    `${esc(scenario.tagline)}</li>`,
).join("\n")}
  </ul>
  ${backLinks([["/labs", "Hands-on labs"], ["/study", "Study guides"], ["/ncl", "National Cyber League notes"]])}
</main>`,
  });

  for (const scenario of SCENARIOS) {
    const url = `${SITE_URL}/scenarios/${scenario.slug}`;
    const byGrade = new Map<string, number>();
    for (const ending of scenario.endings) {
      byGrade.set(ending.grade, (byGrade.get(ending.grade) ?? 0) + 1);
    }
    const gradeSummary = [...byGrade.entries()]
      .map(([grade, count]) => `${count} ${esc(GRADE_LABEL[grade as keyof typeof GRADE_LABEL].toLowerCase())}`)
      .join(", ");

    await writePage(`scenarios/${scenario.slug}`, base, {
      title: pageTitle(`${scenario.title} | Incident scenario`),
      description: `${scenario.tagline} A branching ${DIFFICULTY_LABEL[scenario.difficulty].toLowerCase()} incident scenario with ${scenario.endings.length} endings and ${pathCount(scenario).toLocaleString("en-GB")} routes.`,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: scenario.title,
  description: scenario.tagline,
  url,
  learningResourceType: "Simulation",
  educationalUse: "Practice",
  interactivityType: "active",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  educationalLevel: DIFFICULTY_LABEL[scenario.difficulty],
  about: { "@type": "Thing", name: scenario.category },
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script><script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Scenarios", item: `${SITE_URL}/scenarios` },
    { "@type": "ListItem", position: 3, name: scenario.title, item: url },
  ],
})}
</script>`,
      rootContent: `
<main>
  <h1>${esc(scenario.title)}</h1>
  <p>${esc(scenario.tagline)}</p>
  <p><strong>${esc(DIFFICULTY_LABEL[scenario.difficulty])}</strong>. ${esc(DIFFICULTY_BLURB[scenario.difficulty])}</p>
  <h2>Your role</h2>
  <p>${esc(scenario.role)}</p>
  <h2>The brief</h2>
  <p><em>${esc(scenario.clockStart)}</em></p>
${scenario.brief.map((paragraph) => `  <p>${esc(paragraph)}</p>`).join("\n")}
  <h2>How it works</h2>
  <p>
    ${scenario.scenes.length} scenes, ${scenario.endings.length} endings
    (${gradeSummary}), and
    ${pathCount(scenario).toLocaleString("en-GB")} distinct routes from the
    first decision to the last. Every ending says what separated it from the
    best available outcome, and how rare it is. Nothing is scored and nothing
    is timed in real seconds: any decision can be taken again differently.
  </p>
${
  scenario.reading?.length
    ? `  <h2>The written version</h2>\n  <ul>\n${scenario.reading
        .map((link) => `    <li><a href="${SITE_URL}${link.href}">${esc(link.label)}</a></li>`)
        .join("\n")}\n  </ul>`
    : ""
}
  ${backLinks([["/scenarios", "All scenarios"], ["/study", "Study guides"], ["/blog", "Field Notes"]])}
</main>`,
    });
  }

  // ── tools ──
  /*
    One string, used as both the meta description and the ItemList's own
    description, so the two cannot drift into saying different things about
    the same page.
  */
  const toolsIndexDescription =
    "Free browser-based tools for networking and security study: subnetting, packet headers, cron, regex, encoding, and classical ciphers.";

  await writePage("tools", base, {
    title: "Tools | Max Doubin",
    description: toolsIndexDescription,
    canonical: `${SITE_URL}/tools`,
    /*
      The index as a list of the seventeen tools it links to.

      This page carried only a BreadcrumbList, which describes what is above
      it and says nothing about what is below. An ItemList is the markup that
      makes a hub legible as a hub: it names its children and their order, so
      the set can surface together instead of one tool at a time, and so a
      crawler learns the relationship without having to infer it from anchor
      tags. Ordered as TOOLS is ordered, which is the order the page renders.
    */
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Browser tools for networking and security",
  description: toolsIndexDescription,
  url: `${SITE_URL}/tools`,
  numberOfItems: TOOLS.length,
  itemListElement: TOOLS.map((t, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: t.name,
    description: t.blurb,
    url: `${SITE_URL}/tools/${t.slug}`,
  })),
})}
</script>`,
    rootContent: `
<main>
  <h1>Tools</h1>
  <ul>
${TOOLS.map(
  (t) =>
    `    <li><a href="${SITE_URL}/tools/${t.slug}">${esc(t.name)}</a> <span>${esc(t.blurb)}</span></li>`,
).join("\n")}
  </ul>
</main>`,
  });

  for (const tool of TOOLS) {
    const url = `${SITE_URL}/tools/${tool.slug}`;
    await writePage(`tools/${tool.slug}`, base, {
      title: pageTitle(tool.name),
      description: tool.blurb,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: tool.name,
  description: tool.blurb,
  url,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  /*
    A zero-price Offer is a claim about money and nothing else. Google reads
    isAccessibleForFree as the separate claim that the thing is usable
    without a paywall, a login or a trial, which is what is actually true
    here: every tool is client-side JavaScript that runs on load.
  */
  isAccessibleForFree: true,
  /*
    featureList is the registry's own keywords for the tool, verbatim. They
    are the subjects it handles (a subnet calculator's cidr, netmask, ipv4,
    wildcard), which is the closest thing to a feature list this data holds.
    Writing prose features here instead would mean inventing capabilities
    nobody has verified the tool has.
  */
  featureList: tool.keywords.length ? tool.keywords : undefined,
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
    { "@type": "ListItem", position: 3, name: tool.name, item: url },
  ],
})}
</script>`,
      rootContent: `
<main>
  <nav><a href="${SITE_URL}/">Home</a> / <a href="${SITE_URL}/tools">Tools</a></nav>
  <h1>${esc(tool.name)}</h1>
  <p>${esc(tool.blurb)}</p>
  <p>Runs in your browser. Nothing is uploaded.</p>
  ${
    // The same paragraphs ToolShell renders. Without them the pages aimed at
    // the highest-traffic queries on this site were the emptiest ones a
    // crawler could fetch: a heading and a one-line blurb.
    (TOOL_NOTES[tool.slug] ?? []).length
      ? `<section>
    <h2>Notes</h2>
    ${(TOOL_NOTES[tool.slug] ?? [])
      .map(
        (para: Array<string | { code: string } | { em: string }>) =>
          `<p>${para
            .map((span) => {
              if (typeof span === "string") return esc(span);
              if ("code" in span) return `<code>${esc(span.code)}</code>`;
              return `<em>${esc(span.em)}</em>`;
            })
            .join("")}</p>`,
      )
      .join("\n    ")}
  </section>`
      : ""
  }
  <nav><a href="${SITE_URL}/tools">All tools</a> · <a href="${SITE_URL}/study">Study guides</a> · <a href="${SITE_URL}/blog">Field Notes</a></nav>
</main>`,
    });
  }

  // ── topic hubs ──
  /*
    One page per subject, with real editorial copy and the full post list
    rendered into the static HTML. These exist so a crawler has a route
    into the archive by subject as well as by date, and so a reader can
    land on "networking" rather than on post 214 of 236.

    Only tags in lib/tagPages get a page. A tag with two posts stays a
    filter on the index: a page for it would be thin, would compete with
    the index, and would add nothing.
  */
  for (const topic of TAG_PAGES) {
    const tagged = posts.filter((p) => p.tags.includes(topic.tag));
    if (tagged.length === 0) continue;
    const url = `${SITE_URL}/topics/${topic.tag}`;
    const list = tagged
      .map(
        (p) =>
          `      <li><a href="${SITE_URL}/blog/${p.slug}">${esc(p.title)}</a> ` +
          `<time datetime="${p.date}">${p.date}</time> <span>${esc(p.excerpt)}</span></li>`,
      )
      .join("\n");
    await writePage(`topics/${topic.tag}`, base, {
      title: pageTitle(topic.title),
      description: topic.description,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: topic.title,
  description: topic.description,
  url,
  isPartOf: { "@type": "Blog", "@id": `${SITE_URL}/#blog` },
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: tagged.length,
    itemListElement: tagged.slice(0, 25).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/blog/${p.slug}`,
      name: p.title,
    })),
  },
})}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Topics", item: `${SITE_URL}/topics` },
    { "@type": "ListItem", position: 3, name: topic.title, item: url },
  ],
})}
</script>`,
      rootContent: `
<main>
  <nav><a href="${SITE_URL}/">Home</a> / <a href="${SITE_URL}/topics">Topics</a></nav>
  <article>
    <h1>${esc(topic.title)}</h1>
    <p>${esc(topic.intro)}</p>
    <p>${tagged.length} posts.</p>
    <ul>
${list}
    </ul>
  </article>
</main>`,
    });
  }

  // ── topics index ──
  await writePage("topics", base, {
    title: "Topics | Max Doubin",
    description:
      "Browse writing on networking, servers, security, Linux, storage, AI infrastructure and more, organised by subject rather than by date.",
    canonical: `${SITE_URL}/topics`,
    rootContent: `
<main>
  <h1>Topics</h1>
  <ul>
${TAG_PAGES.map(
  (t) =>
    `    <li><a href="${SITE_URL}/topics/${t.tag}">${esc(t.title)}</a> <span>${esc(t.description)}</span></li>`,
).join("\n")}
  </ul>
</main>`,
  });

  // ── the simulator ──
  // /game used to be served as the bare app shell, which meant a crawler read
  // it as a duplicate of the home page: same title, same description, and a
  // canonical pointing at "/". It is the most distinctive thing on this site
  // and it was invisible. The canvas cannot be prerendered, but what the
  // simulator actually models can be, and that is what a search is for.
  await writePage("game", base, {
    title: pageTitle("Hyperscale, a data center simulator"),
    description:
      "A browser data center simulator with real power and cooling maths: 3.412142 BTU per hour per watt, and a PUE that rises with rack count. Build 1 to 500 racks.",
    canonical: `${SITE_URL}/game`,
    rootContent: `
<main>
  <h1>Hyperscale, a data center simulator</h1>
  <p>
    A data center you build in a browser. Place racks, fill them with real
    hardware, and watch the power and thermal budget respond. It runs on the
    same equipment table published as an
    <a href="${SITE_URL}/data">open dataset</a>, and on the same physics as
    the <a href="${SITE_URL}/tools/rack-budget">rack budget tool</a>.
  </p>
  <h2>What it actually models</h2>
  <ul>
    <li>Heat load derived from IT load at 3.412142 BTU per hour per watt, which is a definition rather than an estimate.</li>
    <li>Cooling capacity in tons, at 3516.85 watts per ton.</li>
    <li>Facility PUE that rises with rack count, so efficiency is something you design for rather than a constant.</li>
    <li>CRAH capacity, in-room losses, and a design ceiling on IT load, so a floor plan can run out of cooling before it runs out of space.</li>
    <li>Rack units, port counts and indicative cost per device, so a build has a budget and a cable plan, not just a shape.</li>
  </ul>
  <h2>What it is not</h2>
  <p>
    It is a teaching model, not a design tool. The numbers behind it are
    representative figures for a class of hardware, not vendor specifications
    and not measurements taken from a real facility. The
    <a href="${SITE_URL}/data">dataset page</a> says exactly where each figure
    comes from.
  </p>
  <p>
    It needs WebGL. If your browser or machine cannot run it, the
    <a href="${SITE_URL}/tools/rack-budget">rack budget tool</a> does the same
    power and cooling arithmetic with no 3D at all, and the
    <a href="${SITE_URL}/blog">Field Notes archive</a> covers the underlying
    infrastructure in writing.
  </p>
</main>`,
  })

  /*
    Open datasets. Two of them now, and the counts come from the same arrays
    the build publishes rather than being typed in: the old copy said 28
    devices in three places and would have gone quietly wrong the first time
    one was added.

    The DataCatalog is prerendered rather than left to hydration because a
    dataset that only exists after JS runs is a dataset a crawler has to work
    to find, and being findable is the entire reason for publishing these.
  */
  const catalogCount = staticEquipmentCatalog.length;
  const rackDeviceCount = RACKS.reduce((n, r) => n + r.devices.length, 0);
  const rackSourcedCount = RACKS.reduce((n, r) => n + r.devices.filter((d) => d.url).length, 0);
  const dataCreator = { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" };
  const download = (file: string, format: string) => ({
    "@type": "DataDownload",
    encodingFormat: format,
    contentUrl: `${SITE_URL}/data/${file}`,
  });

  await writePage("data", base, {
    title: "Open rack hardware datasets | Max Doubin",
    description:
      `Two CC BY 4.0 datasets as JSON and CSV: ${catalogCount} rack-mount devices with power draw, heat output, rack units and port count, ` +
      `and ${rackDeviceCount} devices across ${RACKS.length} rack elevations with the vendor figures and datasheet pages behind them.`,
    canonical: `${SITE_URL}/data`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "DataCatalog",
  name: "Max Doubin open rack data",
  description: `Two openly licensed datasets: modelling figures for ${catalogCount} rack-mount devices, and ${rackDeviceCount} devices across ${RACKS.length} rack elevations with their vendor published figures.`,
  url: `${SITE_URL}/data`,
  license: "https://creativecommons.org/licenses/by/4.0/",
  creator: dataCreator,
  dataset: [
    {
      "@type": "Dataset",
      name: "Rack hardware power and thermal catalog",
      description: `Modelling figures for ${catalogCount} rack-mount devices: power draw in watts, derived heat output in BTU per hour, rack units, port count and indicative cost. Representative values for a class of hardware, not vendor specifications and not measurements.`,
      license: "https://creativecommons.org/licenses/by/4.0/",
      creator: dataCreator,
      distribution: [
        download("equipment-catalog.json", "application/json"),
        download("equipment-catalog.csv", "text/csv"),
      ],
    },
    {
      "@type": "Dataset",
      name: "Rack library elevations",
      description: `${rackDeviceCount} devices across ${RACKS.length} rack elevations with vendor, model, rack units, position and published draw. Vendor published figures, cited per device, with a null draw wherever the vendor publishes a supply rating rather than a consumption figure.`,
      license: "https://creativecommons.org/licenses/by/4.0/",
      creator: dataCreator,
      distribution: [
        download("rack-library.json", "application/json"),
        download("rack-library.csv", "text/csv"),
      ],
    },
  ],
})}
</script>`,
    rootContent: `
<main>
  <h1>Rack hardware datasets</h1>
  <p>Two openly licensed datasets, CC BY 4.0, and they are honest about different things.</p>
  <h2>Rack hardware power and thermal catalog</h2>
  <p>${catalogCount} rack-mount devices with power draw, heat output, rack units, port count and indicative cost. It is the table the datacenter simulator on this site runs on.</p>
  <p>These are modelling figures, not vendor specifications and not measurements. powerDraw is representative for the class of hardware named. heatOutput is derived as watts multiplied by 3.412142. price is order of magnitude. Do not cite them as manufacturer data.</p>
  <ul>
    <li><a href="${SITE_URL}/data/equipment-catalog.json">equipment-catalog.json</a></li>
    <li><a href="${SITE_URL}/data/equipment-catalog.csv">equipment-catalog.csv</a></li>
  </ul>
  <h2>Rack library elevations</h2>
  <p>${rackDeviceCount} devices across ${RACKS.length} rack elevations, with vendor, model, rack units, position in the frame and published draw. ${rackSourcedCount} of them carry the datasheet page their figures came from.</p>
  <p>These are the vendors' own published figures rather than modelling ones. watts is null wherever a vendor publishes a power supply rating or a PoE budget instead of the device's own consumption, which is most of the enterprise hardware here: a 715W supply is not a 715W switch. Port link state and drive bay occupancy on the rack pages are illustrative and are not in the file.</p>
  <ul>
    <li><a href="${SITE_URL}/data/rack-library.json">rack-library.json</a></li>
    <li><a href="${SITE_URL}/data/rack-library.csv">rack-library.csv</a></li>
  </ul>
  ${backLinks([["/racks", "Rack library"], ["/tools/rack-budget", "Rack budget tool"], ["/game", "Build simulator"]])}
</main>`,
  });

  // ── certification study index and one page per exam domain ──
  // These answer high-intent objective queries, so they have to exist as
  // static HTML rather than only after hydration.
  await writePage("study", base, {
    title: "Certification study by exam objective | Max Doubin",
    description:
      "Security+ SY0-701, Network+ N10-009 and CCNA 200-301 exam domains mapped to the posts and free tools on this site that cover each one.",
    canonical: `${SITE_URL}/study`,
    rootContent: `
<main>
  <h1>Study by exam objective</h1>
${EXAMS.map(
  (e) =>
    `  <section>\n    <h2>${esc(e.name)} (${esc(e.code)})</h2>\n    <p>${esc(e.intro)}</p>\n    <ul>\n` +
    e.domains
      .map(
        (d) =>
          `      <li><a href="${SITE_URL}/study/${e.slug}/${d.slug}">${esc(d.name)}</a>` +
          `${d.weight === null ? "" : ` <span>${d.weight}% of exam</span>`}` +
          ` <span>${esc(d.summary)}</span></li>`,
      )
      .join("\n") +
    `\n    </ul>\n    <p><a href="${e.officialUrl}">Official ${esc(e.code)} objectives</a></p>\n  </section>`,
).join("\n")}
</main>`,
  });

  for (const exam of EXAMS) {
    /*
      The name of the standard these pages are written against.

      Built from the exam's own name and code rather than concatenating
      exam.vendor, which is already inside two of the three names and would
      print "CompTIA CompTIA Security+".
    */
    const framework = `${exam.name} ${exam.code} exam objectives`;

    /*
      The exam level itself. /study/ccna/ip-connectivity resolved while
      /study/ccna returned a 404, so trimming a URL, which is ordinary
      navigation and something crawlers do, walked into a dead end on a path
      this site publishes.
    */
    await writePage(`study/${exam.slug}`, base, {
      title: pageTitle(`${exam.name} ${exam.code} objectives`),
      description: `Every ${exam.name} ${exam.code} exam domain, its published weighting, and what each one actually asks of you.`,
      canonical: `${SITE_URL}/study/${exam.slug}`,
      /*
        LearningResource for the exam as a whole.

        These twenty pages exist to answer objective queries, and a page that
        says nothing about what it teaches is indistinguishable from the
        content farms answering the same query. teaches lists the exam's own
        domain names, and educationalAlignment points at the vendor document
        those names were read from, so the claim is checkable rather than
        asserted: targetUrl is the published objectives page, which every one
        of these pages already links in its body.
      */
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: `${exam.name} ${exam.code} exam objectives`,
  description: exam.intro,
  url: `${SITE_URL}/study/${exam.slug}`,
  learningResourceType: "Study guide",
  educationalUse: "Exam preparation",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  teaches: exam.domains.map((d: { name: string }) => d.name),
  educationalAlignment: {
    "@type": "AlignmentObject",
    alignmentType: "teaches",
    educationalFramework: framework,
    targetName: `${exam.name} ${exam.code}`,
    targetUrl: exam.officialUrl,
  },
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script>`,
      rootContent: `
<main>
  <nav><a href="${SITE_URL}/">Home</a> / <a href="${SITE_URL}/study">Study</a></nav>
  <h1>${esc(exam.name)} ${esc(exam.code)}</h1>
  <p>${esc(exam.intro)}</p>
  <p>${esc(exam.status)}</p>
  <h2>Exam domains</h2>
  <dl>${exam.domains
    .map(
      (d: { slug: string; name: string; weight: number | null; summary: string }) =>
        `<dt><a href="${SITE_URL}/study/${exam.slug}/${d.slug}">${esc(d.name)}</a>${
          d.weight === null ? "" : ` (${d.weight}% of the exam)`
        }</dt><dd>${esc(d.summary)}</dd>`,
    )
    .join("\n    ")}</dl>
  <p><a href="${exam.officialUrl}">Official ${esc(exam.code)} objectives</a>. Weightings follow the published objectives; the vendor revises them, so treat their document as the source of truth.</p>
  <nav><a href="${SITE_URL}/study">All exams</a> · <a href="${SITE_URL}/certifications">Certifications</a> · <a href="${SITE_URL}/flashcards">Flashcards</a></nav>
</main>`,
    });

    /*
      The revision sheet. Everything the exam's domain pages hold, on one
      page, because a sheet is a thing to carry away from a screen. The
      prerendered version is the same content flat, which is also what a
      crawler wants: one URL that answers "what is on this exam" without
      following five links.
    */
    const sheetDomains = exam.domains.map(
      (domain: { slug: string; name: string; weight: number | null; summary: string; keywords: string[] }) => ({
        domain,
        matched: posts.filter((post) => {
          const title = post.title.toLowerCase();
          const tags = post.tags.map((t) => t.toLowerCase());
          return domain.keywords.some(
            (k) => title.includes(k.toLowerCase()) || tags.includes(k.toLowerCase()),
          );
        }),
      }),
    );
    const sheetPostCount = new Set(
      sheetDomains.flatMap((d) => d.matched.map((p: { slug: string }) => p.slug)),
    ).size;

    await writePage(`study/${exam.slug}/sheet`, base, {
      title: pageTitle(`${exam.name} ${exam.code} revision sheet`),
      description: `Every ${exam.name} ${exam.code} domain on one printable page, with its published weighting and the ${sheetPostCount} articles and free tools on this site that cover it.`,
      canonical: `${SITE_URL}/study/${exam.slug}/sheet`,
      rootContent: `
<main>
  <nav><a href="${SITE_URL}/">Home</a> / <a href="${SITE_URL}/study">Study</a> / <a href="${SITE_URL}/study/${exam.slug}">${esc(exam.code)}</a></nav>
  <h1>${esc(exam.name)} ${esc(exam.code)} revision sheet</h1>
  <p>Every domain on one page, made to print. Weightings are ${esc(exam.vendor)}'s published figures, and objectives change between exam versions, so check them against <a href="${exam.officialUrl}">the official objectives</a> before you rely on them.</p>
  ${sheetDomains
    .map(
      ({ domain, matched }) => `<section>
    <h2>${esc(domain.name)}${domain.weight === null ? "" : ` (${domain.weight}% of the exam)`}</h2>
    <p>${esc(domain.summary)}</p>
    ${
      matched.length === 0
        ? "<p>Nothing in the archive covers this one yet.</p>"
        : `<h3>Read</h3>
    <ul>${matched
      .map(
        (post: { slug: string; title: string }) =>
          `<li><a href="${SITE_URL}/blog/${post.slug}">${esc(post.title)}</a></li>`,
      )
      .join("\n      ")}</ul>`
    }
  </section>`,
    )
    .join("\n  ")}
  <nav><a href="${SITE_URL}/study/${exam.slug}">${esc(exam.code)} domains</a> · <a href="${SITE_URL}/study">All exams</a></nav>
</main>`,
    });

    for (const domain of exam.domains) {
      const matched = posts.filter((post) => {
        const title = post.title.toLowerCase();
        const tags = post.tags.map((t) => t.toLowerCase());
        return domain.keywords.some(
          (k) => title.includes(k.toLowerCase()) || tags.includes(k.toLowerCase()),
        );
      });
      await writePage(`study/${exam.slug}/${domain.slug}`, base, {
        title: pageTitle(`${domain.name} | ${exam.name} ${exam.code}`),
        description: `${domain.name} for ${exam.name} ${exam.code}: ${matched.length} articles and free tools mapped to this exam objective.`,
        canonical: `${SITE_URL}/study/${exam.slug}/${domain.slug}`,
        /*
          The same LearningResource one level down, scoped to the single
          objective this page covers. teaches is the vendor's own name for
          the domain, which is the competency the page claims to build, and
          the alignment target is that same name inside the framework the
          exam publishes. No weighting appears anywhere in this block:
          schema.org has no property for "22 percent of the exam", and Cisco
          publishes no weightings at all, so six of these pages have nothing
          to put there even if it did.
        */
        schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: `${domain.name}, ${exam.name} ${exam.code}`,
  description: domain.summary,
  url: `${SITE_URL}/study/${exam.slug}/${domain.slug}`,
  learningResourceType: "Study guide",
  educationalUse: "Exam preparation",
  isAccessibleForFree: true,
  inLanguage: "en-US",
  teaches: domain.name,
  educationalAlignment: {
    "@type": "AlignmentObject",
    alignmentType: "teaches",
    educationalFramework: framework,
    targetName: domain.name,
    targetUrl: exam.officialUrl,
  },
  isPartOf: {
    "@type": "LearningResource",
    name: framework,
    url: `${SITE_URL}/study/${exam.slug}`,
  },
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script>`,
        rootContent: `
<main>
  <nav><a href="${SITE_URL}/study">All exam domains</a></nav>
  <h1>${esc(domain.name)}</h1>
  <p>${esc(exam.name)} ${esc(exam.code)}${domain.weight === null ? "" : `, ${domain.weight}% of the exam`}</p>
  <p>${esc(domain.summary)}</p>
  <h2>Posts covering this domain</h2>
  <ul>
${matched
  .map(
    (post) =>
      `    <li><a href="${SITE_URL}/blog/${post.slug}">${esc(post.title)}</a> <span>${esc(post.excerpt)}</span></li>`,
  )
  .join("\n")}
  </ul>
  <p><a href="${exam.officialUrl}">Official ${esc(exam.code)} objectives</a></p>
</main>`,
      });
    }
  }

  // ── roadmap ──
  await writePage("roadmap", base, {
    title: "Roadmap | Max Doubin",
    description:
      "What is planned, in progress, done and blocked on maxdoubin.com, tracked in public across 100 improvements.",
    canonical: `${SITE_URL}/roadmap`,
    rootContent: roadmapContent,
  });

  // ── rack library ──
  /*
    Both the gallery and every rack page are prerendered from RACKS, so a
    crawler gets the whole hardware inventory as text. These pages are the
    most obviously "app-like" thing on the site and would otherwise ship an
    empty shell, which is exactly the failure the depth gate exists to catch.
  */
  const rackListContent = `
<main>
  <h1>Rack library</h1>
  <p>Annotated rack elevations drawn from vendor datasheets. Every port count, rack unit and wattage below is the vendor's published figure, and where a vendor publishes no consumption figure the page says so rather than guessing.</p>
  <dl>${RACKS.map((r) => {
    const p = publishedWatts(r);
    const power = p.total > 0
      ? `${p.total}W published${p.unpublished > 0 ? `, ${p.unpublished} devices publish none` : ""}`
      : "no device publishes a consumption figure";
    return `<dt><a href="${SITE_URL}/racks/${r.slug}">${esc(r.name)}</a></dt><dd>${esc(r.blurb)} ${r.height}U frame, ${unitsUsed(r)}U mounted across ${r.devices.length} devices, ${esc(power)}.</dd>`;
  }).join("\n    ")}</dl>
  ${backLinks([["/tools/rack-budget", "Rack budget tool"], ["/data", "Open hardware dataset"], ["/game", "Build simulator"]])}
</main>`;

  await writePage("racks", base, {
    title: "Rack Library | Max Doubin",
    description:
      "Annotated rack elevations for Ubiquiti, Cisco, Juniper, MikroTik, HPE, Synology and homelab builds. Every port count and wattage from the vendor datasheet.",
    canonical: `${SITE_URL}/racks`,
    rootContent: rackListContent,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Rack library",
  description: "Annotated rack elevations built from vendor datasheets.",
  url: `${SITE_URL}/racks`,
  numberOfItems: RACKS.length,
  itemListElement: RACKS.map((r, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: r.name,
    description: r.blurb,
    url: `${SITE_URL}/racks/${r.slug}`,
  })),
}, null, 2)}
</script>`,
  });

  for (const rack of RACKS) {
    const url = `${SITE_URL}/racks/${rack.slug}`;
    const p = publishedWatts(rack);
    const body = `
<main>
  <h1>${esc(rack.name)}</h1>
  <p>${esc(rack.blurb)}</p>
  <p>${rack.height}U frame, ${unitsUsed(rack)}U mounted across ${rack.devices.length} devices. ${
      p.total > 0
        ? `${p.total}W of published draw${p.unpublished > 0 ? `, with ${p.unpublished} devices for which the vendor publishes no figure` : ""}.`
        : "No device in this rack publishes a consumption figure; the vendors publish power supply ratings instead."
    }</p>
  <section>
    <h2>Devices, top to bottom</h2>
    ${rack.devices.map((d) => {
      const ports = portSummary(d)
        .map((x) => `${x.total} ${KIND_LABELS[x.kind] ?? x.kind}`)
        .join(", ");
      const bits = [
        `${d.u}U`,
        typeof d.watts === "number" ? `${d.watts}W published maximum` : "no published consumption figure",
        ports || (d.bays ? `${d.bays.count} drive bays, ${d.bays.occupied} fitted` : "passive"),
      ];
      return `<article>
      <h3>${esc(d.vendor === "Generic" ? d.model : `${d.vendor} ${d.model}`)}</h3>
      <p>${esc(d.role)}</p>
      <p>${esc(bits.join(". "))}.</p>
    </article>`;
    }).join("\n    ")}
  </section>
  <section>
    <h2>Sources</h2>
    <ul>${rack.sources.map((src) => `<li><a href="${src.url}">${esc(src.label)}</a></li>`).join("")}</ul>
  </section>
  ${backLinks([["/racks", "All racks"], ["/tools/rack-budget", "Rack budget tool"], ["/data", "Open hardware dataset"]])}
</main>`;

    await writePage(`racks/${rack.slug}`, base, {
      title: `${rack.name} rack | Max Doubin`,
      description: `An annotated ${rack.name} rack elevation: ${rack.devices.length} devices across ${rack.height} rack units, every port count and published wattage sourced from the vendor datasheet.`,
      canonical: url,
      rootContent: body,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: `${rack.name} rack elevation`,
  description: rack.blurb,
  url,
  itemListOrder: "https://schema.org/ItemListOrderDescending",
  numberOfItems: rack.devices.length,
  itemListElement: rack.devices.map((d, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: d.vendor === "Generic" ? d.model : `${d.vendor} ${d.model}`,
    item: {
      "@type": "Product",
      name: d.vendor === "Generic" ? d.model : `${d.vendor} ${d.model}`,
      description: d.role,
      ...(d.vendor === "Generic" ? {} : { brand: { "@type": "Brand", name: d.vendor } }),
      ...(d.url ? { url: d.url } : {}),
    },
  })),
}, null, 2)}
</script>`,
    });
  }

  /*
    The hardware catalogue. Two hundred and fifty two vendor models with
    their measured dimensions, and until this page existed the only ones a
    crawler could see were the ones that mount in a rack. The list is
    read from the same JSON the page fetches, so the prerendered text cannot
    drift from what a reader gets.
  */
  const catalogueRaw = await readFile(path.join(DIST, "data", "ubiquiti-catalogue.json"), "utf8");
  const catalogue = JSON.parse(catalogueRaw) as {
    credit: string;
    devices: {
      slug: string;
      name: string;
      sku: string;
      short: string;
      group: string;
      mount: string;
      sizeM: [number, number, number];
      triangles: number;
      store: string;
    }[];
  };
  const byGroup = new Map<string, typeof catalogue.devices>();
  for (const d of catalogue.devices) {
    const bucket = byGroup.get(d.group);
    if (bucket) bucket.push(d);
    else byGroup.set(d.group, [d]);
  }
  const gearContent = `
<main>
  <h1>Hardware catalogue</h1>
  <p>Every UniFi model this site can draw, ${catalogue.devices.length} of them, with the dimensions read out of each model's own bounding box rather than copied off a datasheet. ${catalogue.devices.filter((d) => d.mount === "rack").length} mount in a nineteen inch frame; the rest go on a wall, a ceiling or a desk.</p>
  ${[...byGroup.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(
      ([group, items]) => `<section>
  <h2>${esc(group)}</h2>
  <dl>${items
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => {
      const [x, y, z] = d.sizeM;
      const size = `${Math.round(x * 1000)} by ${Math.round(z * 1000)} by ${Math.round(y * 1000)} mm`;
      return `<dt>${esc(d.name)} (${esc(d.sku)})</dt><dd>${esc(d.short)} Mounts ${esc(d.mount)}. ${size}, ${d.triangles.toLocaleString()} triangles.</dd>`;
    })
    .join("\n    ")}</dl>
</section>`,
    )
    .join("\n  ")}
  <p>${esc(catalogue.credit)}</p>
  ${backLinks([["/racks", "Rack library"], ["/racks/build", "Rack builder"], ["/data", "Open hardware dataset"]])}
</main>`;

  await writePage("gear", base, {
    title: "Hardware Catalogue | Max Doubin",
    description:
      "Every UniFi model on this site, measured: switches, access points, cameras, gateways and door hardware, with real dimensions and triangle counts taken from the geometry itself.",
    canonical: `${SITE_URL}/gear`,
    rootContent: gearContent,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Hardware catalogue",
  description: "Vendor hardware models with measured dimensions.",
  url: `${SITE_URL}/gear`,
  numberOfItems: catalogue.devices.length,
}, null, 2)}
</script>`,
  });


  // ── sitemap ──
  // Generated here rather than hand-maintained. The checked-in sitemap had
  // gone stale, listing 105 URLs with a lastmod months behind the newest
  // post, so anything published since was invisible to crawlers.
  await writeSitemap(posts);
  await writeFeed(posts);

  // Home page last: everything above uses `base` as its template, so giving
  // it a body any earlier would put the home page's content on all of them.
  //
  // data-boot is set by hand because this is the one page that does not go
  // through buildPageHtml, and it is the page the entrance was designed for.
  await writeFile(
    path.join(DIST, "index.html"),
    injectRootContent(base, homeContent).replace(/<html([^>]*)>/, '<html$1 data-boot="1">'),
    "utf-8",
  );
  console.log("index.html: home page body written");

  // Served with a real 404 by Cloudflare Pages for anything that matches
  // neither a prerendered file nor a rewrite in _redirects.
  await writeNotFoundPage(base);
  console.log("404.html: written");

  console.log("Prerender complete.");
}

/**
 * Emit sitemap.xml covering every route and every published post.
 *
 * lastmod comes from each post's own date, so a crawler can tell what
 * actually changed instead of re-reading the whole archive.
 */
async function writeSitemap(
  posts: Array<{ slug: string; date: string; updated?: string; tags: string[]; draft?: boolean }>,
) {
  const live = posts.filter((p) => !p.draft);
  const newest = live.reduce((a, p) => (p.date > a ? p.date : a), "1970-01-01");
  const today = newest;

  const urls: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }> = [
    { loc: `${SITE_URL}/`, lastmod: today, changefreq: "weekly", priority: "1.0" },
    { loc: `${SITE_URL}/blog`, lastmod: today, changefreq: "daily", priority: "0.9" },
    { loc: `${SITE_URL}/projects`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/contact`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/game`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/study`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/data`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/topics`, lastmod: today, changefreq: "weekly", priority: "0.8" },
    { loc: `${SITE_URL}/archive`, lastmod: today, changefreq: "weekly", priority: "0.8" },
    { loc: `${SITE_URL}/paths`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/tools`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/racks/wired`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/racks/build`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/teardown`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/ncl`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/scenarios`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/labs`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/challenges`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/triage`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/firewall`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/resolve`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/chain`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/allocate`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/array`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/today`, lastmod: today, changefreq: "daily", priority: "0.9" },
    { loc: `${SITE_URL}/glossary`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/transfer`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/logs`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/mtu`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/permissions`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/patch`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/retry`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/vlan`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/clock`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/space`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/cache`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/oom`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/units`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/nat`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/alerts`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/load`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/throttle`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/route`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/restore`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/handshake`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/capture`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/practise`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/faq`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/resume`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/now`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/uses`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/timeline`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/cyber-club`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/cyber-club/kit`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/coding-camps`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/certifications`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/links`, lastmod: today, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/colophon`, lastmod: today, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/subscribe`, lastmod: today, changefreq: "monthly", priority: "0.5" },
      { loc: `${SITE_URL}/ask`, lastmod: today, changefreq: "monthly", priority: "0.4" },
    { loc: `${SITE_URL}/study-timer`, lastmod: today, changefreq: "monthly", priority: "0.4" },
    { loc: `${SITE_URL}/roadmap`, lastmod: today, changefreq: "weekly", priority: "0.4" },
  ];

  urls.push({ loc: `${SITE_URL}/racks`, lastmod: today, changefreq: "monthly", priority: "0.8" });
  for (const rack of RACKS) {
    urls.push({ loc: `${SITE_URL}/racks/${rack.slug}`, lastmod: today, changefreq: "monthly", priority: "0.7" });
  }
  urls.push({ loc: `${SITE_URL}/gear`, lastmod: today, changefreq: "monthly", priority: "0.6" });


  // Tools and the competition guides. /flashcards is deliberately absent:
  // it is noindex, and a sitemap should never advertise a page that tells
  // crawlers to go away.
  for (const tool of TOOLS) {
    urls.push({
      loc: `${SITE_URL}/tools/${tool.slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const exam of EXAMS) {
    urls.push({
      loc: `${SITE_URL}/study/${exam.slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
    // The revision sheet is the whole exam on one page, so it answers "what
    // is on this exam" in one fetch. Same priority as the exam page it
    // summarises.
    urls.push({
      loc: `${SITE_URL}/study/${exam.slug}/sheet`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const slug of NCL_GUIDE_DATA.map((g: { slug: string }) => g.slug)) {
    urls.push({
      loc: `${SITE_URL}/ncl/${slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const capture of CAPTURES) {
    urls.push({
      loc: `${SITE_URL}/capture/${capture.slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const lab of LABS) {
    urls.push({
      loc: `${SITE_URL}/labs/${lab.slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const challenge of CHALLENGES) {
    urls.push({
      loc: `${SITE_URL}/challenges/${challenge.slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const exercise of FIREWALL) {
    urls.push({
      loc: `${SITE_URL}/firewall/${exercise.slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const plan of PLANS) {
    urls.push({
      loc: `${SITE_URL}/allocate/${plan.slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const scenario of SCENARIOS) {
    urls.push({
      loc: `${SITE_URL}/scenarios/${scenario.slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  // Topic hubs. Only those that actually have posts, so the sitemap never
  // advertises a page the prerenderer skipped.
  for (const topic of TAG_PAGES) {
    const newestTagged = live
      .filter((p) => p.tags.includes(topic.tag))
      .reduce((a, p) => (p.date > a ? p.date : a), "");
    if (!newestTagged) continue;
    urls.push({
      loc: `${SITE_URL}/topics/${topic.tag}`,
      lastmod: newestTagged,
      changefreq: "weekly",
      priority: "0.7",
    });
  }
  for (const exam of EXAMS) {
    for (const domain of exam.domains) {
      urls.push({
        loc: `${SITE_URL}/study/${exam.slug}/${domain.slug}`,
        lastmod: today,
        changefreq: "monthly",
        priority: "0.7",
      });
    }
  }
  for (const post of live) {
    urls.push({
      loc: `${SITE_URL}/blog/${post.slug}`,
      // A rewritten article is new information, and lastmod is the only way
      // to tell a crawler that. 45 posts here went from a 300 word stub to a
      // sourced 1500 word article while still reporting their original
      // publication date, which gave Google no reason to come back and look.
      lastmod: post.updated ?? post.date,
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n` +
          `    <loc>${u.loc}</loc>\n` +
          `    <lastmod>${u.lastmod}</lastmod>\n` +
          `    <changefreq>${u.changefreq}</changefreq>\n` +
          `    <priority>${u.priority}</priority>\n` +
          `  </url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;

  await writeFile(path.join(DIST, "sitemap.xml"), xml, "utf8");
  console.log(`sitemap.xml: ${urls.length} urls`);
}

main().catch((err) => {
  console.error("Prerender failed:", err);
  process.exit(1);
});

/**
 * Emit an RSS 2.0 feed of the most recent posts.
 *
 * A daily archive with no feed is only reachable by people who think to
 * revisit. Readers, aggregators and several crawlers all consume this.
 */
async function writeFeed(
  posts: Array<{ slug: string; title: string; date: string; excerpt: string; draft?: boolean }>,
) {
  // Newest first. The source array is in insertion order, not date order,
  // so slicing it directly published a feed headed by an arbitrary post.
  const live = posts
    .filter((p) => !p.draft)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 50);
  const rfc822 = (iso: string) => new Date(`${iso}T12:00:00Z`).toUTCString();
  const items = live
    .map(
      (p) =>
        `    <item>\n` +
        `      <title>${esc(p.title)}</title>\n` +
        `      <link>${SITE_URL}/blog/${p.slug}</link>\n` +
        `      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}</guid>\n` +
        `      <pubDate>${rfc822(p.date)}</pubDate>\n` +
        `      <description>${esc(p.excerpt)}</description>\n` +
        `    </item>`,
    )
    .join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>Max Doubin</title>\n` +
    `    <link>${SITE_URL}/blog</link>\n` +
    `    <description>Writing on cybersecurity, enterprise networking, and systems infrastructure.</description>\n` +
    `    <language>en-us</language>\n` +
    `    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />\n` +
    (live[0] ? `    <lastBuildDate>${rfc822(live[0].date)}</lastBuildDate>\n` : "") +
    `${items}\n` +
    `  </channel>\n` +
    `</rss>\n`;

  await writeFile(path.join(DIST, "feed.xml"), xml, "utf8");
  console.log(`feed.xml: ${live.length} items`);
}
