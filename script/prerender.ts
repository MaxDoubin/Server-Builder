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
import { CASES as FREE_CASES, asFree as freeCmd, asMeminfo as freeMeminfo, available as freeAvailable, correctOption as freeCorrect, estimate as freeEstimate, fits as freeFits, human as freeHuman, overstatedBy as freeOverstated, pageCache as freeCache, used as freeUsed } from "../client/src/lib/free/index";
import { CASES as INOTIFY_CASES, asSysctl as inoSysctl, correctOption as inoCorrect, culprit as inoCulprit, errnoMessage as inoMessage, errnoName as inoErrno, eventsLost as inoLost, fits as inoFits, human as inoHuman, instancesFree as inoInstFree, watchesFree as inoFree, watchesWanted as inoWanted } from "../client/src/lib/inotify/index";
import { CASES as UMASK_CASES, asLetters as umLetters, asUmask as umLines, correctOption as umCorrect, created as umCreated, executable as umExec, gid as umGid, masked as umMasked, mode as umMode, modeText as umText, removed as umRemoved, special as umSpecial } from "../client/src/lib/umask/index";
import { CASES as APPEND_CASES, asAppend as apLines, asBytes as apBytes, asHow as apHow, correctOption as apCorrect, honorsOffset as apOffset, lost as apLost, safe as apSafe, size as apSize, survived as apSurvived, written as apWritten } from "../client/src/lib/append/index";
import { CASES as MAPPED_CASES, asKind as mpKind, asMapped as mpLines, asOutcome as mpSignal, backed as mpBacked, correctOption as mpCorrect, covers as mpCovers, lastSafe as mpLastSafe, outcome as mpOutcome, persists as mpPersists, reads as mpReads, resized as mpResized } from "../client/src/lib/mapped/index";
import { CASES as SPARSE_CASES, allocatedKib as spAlloc, apparentKib as spApparent, asOp as spOp, asSize as spSize, asSparse as spLines, asTool as spTool, copiedKib as spCopied, correctOption as spCorrect, fits as spFits, stillSparse as spSparse } from "../client/src/lib/sparse/index";
import { CASES as PSS_CASES, alive as pssAlive, asMib as pssMib, asPss as pssLines, correctOption as pssCorrect, grew as pssGrew, mib as pssKibMib, pagesMib as pssPagesMib, physicalPages as pssFrames, pssChildKib, pssParentKib, pssSumKib, rssChildPages as pssRssChild, rssParentPages as pssRssParent, rssSumPages as pssRssSum } from "../client/src/lib/pss/index";
import { CASES as EXIT_CASES, ambiguous as exAmbiguous, asExit as exLines, asHex as exHex, cored as exCored, correctOption as exCorrect, exitStatus as exStatus, pipeStatus as exPipe, rawStatus as exRaw, reported as exReported, signalName as exSignal, theOtherReading as exOther } from "../client/src/lib/exit/index";
import { CASES as SIGNALS_CASES, accepted as sgAccepted, asSignals as sgLines, correctOption as sgCorrect, delivered as sgDelivered, dequeueOrder as sgDequeue, handlerOrder as sgHandlers, lost as sgLost, nameOf as sgName, queueDepth as sgDepth, queues as sgQueues, refused as sgRefused } from "../client/src/lib/signals/index";
import { CASES as LOCKS_CASES, asLocks as lkLines, bothShared as lkShared, callOf as lkCall, correctOption as lkCorrect, granted as lkGranted, humanRange as lkRange, identity as lkWho, lostBecause as lkLost, overlaps as lkOverlaps, ownerOf as lkOwner, sameOwner as lkSame, stillHeld as lkHeld, why as lkWhy, world as lkWorld } from "../client/src/lib/locks/index";
import { CASES as PIPEBUF_CASES, PIPE_BUF as PB_BUF, alignsWithCapacity as pbAligns, asSetup as pbSetup, atRisk as pbRisk, because as pbBecause, correctOption as pbCorrect, granted as pbGranted, guaranteed as pbGuaranteed, refused as pbRefused, tears as pbTearsAt, tearsHere as pbTears, uniform as pbUniform } from "../client/src/lib/pipebuf/index";
import { CASES as ELOOP_CASES, MAX_TRAVERSALS as EL_MAX, asWalk as elWalk, correctOption as elCorrect, demanded as elAsked, followsFinal as elFollows, headroom as elLeft, reason as elReason, result as elResult, spent as elSpent, succeeds as elOk } from "../client/src/lib/eloop/index";
import { CASES as ARGMAX_CASES, MAX_ARG_STRLEN as AM_CAP, POINTER as AM_PTR, asLimits as amLimits, budget as amBudget, correctOption as amCorrect, costPerArg as amPerArg, envCost as amEnv, fits as amFits, headroom as amSpare, humanBytes as amBytes, maxArgs as amMax, pointerShare as amShare, programCost as amProg, refusedBy as amRefused, textBytes as amText, totalCost as amTotal } from "../client/src/lib/argmax/index";
import { CASES as NAGLE_CASES, applying as ngApplying, asSocket as ngSocket, bytesBeforeRead as ngBytes, correctOption as ngCorrect, humanUs as ngUs, requestsPerSecond as ngRps, roundTripUs as ngUsTrip, slowdown as ngSlow, stalls as ngStalls, stallsPerRequest as ngTimers, totalMs as ngTotal } from "../client/src/lib/nagle/index";
import { CASES as ATIME_CASES, asStat as atStat, atimeAgeAfterRead as atAfter, blockedBy as atBlocked, correctOption as atCorrect, ctimeRule as atCtime, dayRule as atDay, humanAge as atAge, inodesDirtied as atDirtied, mtimeRule as atMtime, reason as atReason, rulesFiring as atFiring, selectedByCleanup as atSelected, updates as atUpdates } from "../client/src/lib/atime/index";
import { CASES as OVERCOMMIT_CASES, asSysctl as ocSysctl, commitLimitKb as ocLimit, committedPercentOfLimit as ocPctLimit, committedPercentOfRam as ocPctRam, correctOption as ocCorrect, headroomKb as ocHeadroom, human as ocHuman, limitPercentOfRam as ocLimitPct, modeName as ocMode, oomPossible as ocOom, refuses as ocRefuses, refusesWithMemoryFree as ocWasteful } from "../client/src/lib/overcommit/index";
import { CASES as TIMEWAIT_CASES, TIME_WAIT_SECONDS as TW_LEN, asSysctl as twSysctl, closerState as twState, correctOption as twCorrect, ephemeralPorts as twPorts, exhausts as twExhausts, human as twHuman, overflowsBuckets as twOverflows, reuseHelps as twReuse, stateSeconds as twSeconds, sustainableRate as twRate, tupleCapacity as twTuples } from "../client/src/lib/timewait/index";
import { CASES as RCVBUF_CASES, asSysctl as rcSysctl, autotuning as rcAuto, backfired as rcBackfired, band as rcBand, ceilingBytes as rcCeiling, correctOption as rcCorrect, highMarkBytes as rcHigh, highMarkIfBytes as rcHighBytes, human as rcHuman, reportedBytes as rcReported } from "../client/src/lib/rcvbuf/index";
import { CASES as FDS_CASES, asLimits as fdLimits, binding as fdBinding, correctOption as fdCorrect, count as fdCount, effectiveHard as fdHard, effectiveSoft as fdSoft, frozen as fdFrozen, outcome as fdOutcome } from "../client/src/lib/fds/index";
import { CASES as WRITEBACK_CASES, asMiB as wbMiB, asSysctl as wbSysctl, backgroundThresholdBytes as wbBackground, correctOption as wbCorrect, dirtyableBytes as wbDirtyable, hardThresholdBytes as wbHard, human as wbHuman, isThrottled as wbThrottled, liveKnob as wbLive, maxAgeSeconds as wbAge, settledDirtyBytes as wbSettled } from "../client/src/lib/writeback/index";
import { CASES as CONNTRACK_CASES, asCounters as ctCounters, asSysctl as ctSysctl, buckets as ctBuckets, correctOption as ctCorrect, count as ctCount, earlyDropHelps as ctEarly, entriesHeld as ctHeld, human as ctHuman, maxEntries as ctMax, maxFactor as ctFactor, overflows as ctOverflows, timeoutSeconds as ctTimeout } from "../client/src/lib/conntrack/index";
import { CASES as RETRANS_CASES, asSysctl as retransSysctl, asTrace as retransTrace, budgetSeconds as retransBudget, correctOption as retransCorrect, countMatchesSysctl as retransMatches, ending as retransEnding, human as retransHuman, retransmissions as retransCount } from "../client/src/lib/retrans/index";
import { CASES as MAXSTARTUPS_CASES, asConfig as maxConfig, asLog as maxLog, certainty as maxCertainty, correctOption as maxCorrect, dropPercent as maxDrop, inFlight as maxInFlight, safeBegin as maxSafeBegin } from "../client/src/lib/maxstartups/index";
import { CASES as SHM_CASES, asInvocation as shmInvocation, asSymptom as shmSymptom, chargedMiB as shmCharged, correctOption as shmCorrect, demandMiB as shmDemand, diesAtUnit as shmDies, failure as shmFailure, fits as shmFits, human as shmHuman, needsShmMiB as shmNeeds, shmKnob } from "../client/src/lib/shm/index";
import { CASES as NEIGH_CASES, asCounts as neighCounts, asDmesg as neighDmesg, asSysctl as neighSysctl, canReclaim as neighCanReclaim, correctOption as neighCorrect, entries as neighEntries, headroom as neighHeadroom, overflows as neighOverflows, state as neighState, tableId as neighTableId, thresh3Needed as neighNeeded } from "../client/src/lib/neigh/index";
import { CASES as STARTLIMIT_CASES, asJournal as startlimitJournal, asStatus as startlimitStatus, asUnit as startlimitUnit, correctOption as startlimitCorrect, cycleMs as startlimitCycle, ending as startlimitEnding, givesUpAtMs as startlimitGivesUp, human as startlimitHuman, rateLimited as startlimitStopped, safeRestartSecMs as startlimitSafe, startsBeforeFailing as startlimitStarts } from "../client/src/lib/startlimit/index";
import { CASES as KEEPALIVE_CASES, asMiddlebox as keepaliveMiddlebox, asSs as keepaliveSs, asSysctl as keepaliveSysctl, correctOption as keepaliveCorrect, firstProbe as keepaliveFirstProbe, forgottenAt as keepaliveForgotten, noticedAt as keepaliveNoticed, outcome as keepaliveOutcome, ssTimer as keepaliveTimer, survives as keepaliveSurvives } from "../client/src/lib/keepalive/index";
import { CASES as BACKLOG_CASES, accepted as backlogAccepted, asNstat as backlogNstat, asSs as backlogSs, asSysctl as backlogSysctl, correctOption as backlogCorrect, effectiveCap as backlogCap, fate as backlogFate, humanMs as backlogHuman, overflowed as backlogOverflowed, peakDepth as backlogPeak, queueCapacity as backlogQueueCap } from "../client/src/lib/backlog/index";
import { CASES as LEASES_CASES, asLease as leasesFile, asTimeline as leasesTimeline, clientsLost as leasesLost, concurrentLeases as leasesConcurrent, correctOption as leasesCorrect, exhaustsAfter as leasesDry, fractionLosing as leasesShare, human as leasesHuman, isInfinite as leasesInfinite, poolUnderPressure as leasesPressure, timers as leasesTimers } from "../client/src/lib/leases/index";
import { CASES as NDOTS_CASES, asResolvConf as ndotsConf, asTrace as ndotsTrace, attempts as ndotsAttempts, correctOption as ndotsCorrect, nxdomains as ndotsWasted, order as ndotsOrder, queries as ndotsQueries, wentToWildcard as ndotsWildcard } from "../client/src/lib/ndots/index";
import { CASES as LIMIT_CASES, SOURCE_LABEL as limSource, asProcLimits as limProc, correctOption as limCorrect, effective as limEffective, failsWith as limFails, highestFd as limHighest, limit as limNum, succeeds as limOk } from "../client/src/lib/limits/index";
import { CASES as PORT_CASES, TIME_WAIT_SECONDS as portTw, asSysctl as portSysctl, count as portCount, exhausts as portExhausts, heldBy as portHeldBy, loads as portLoads, maxRate as portMaxRate, portsHeld, rangeSize as portRangeSize, correctOption as portCorrect } from "../client/src/lib/ports/index";
import { CASES as THROTTLE_CASES, asCpuMax as thrMax, asCpuStat as thrStat, everThrottled as thrEver, exhaustsAt as thrExhausts, finishesAt as thrFinishes, limitCpus as thrLimit, ms as thrMs, rate as thrRate, run as thrRun, stat as thrStatOf, correctOption as thrCorrect } from "../client/src/lib/throttle/index";
import { CASES as LOAD_CASES, LOAD_FREQ as loadFreq, blame as loadBlame, clock as loadClock, correctOption as loadCorrect, countsAt as loadCounts, peak as loadPeak, perCore as loadPerCore, procLine as loadProc, readAt as loadReadAt, run as loadRun, windowOf as loadWindow } from "../client/src/lib/load/index";
import { CASES as ALERT_CASES, asYaml as alertYaml, clock as alertClock, correctOption as alertCorrect, evaluationTimes as alertTicks, firesAt as alertFires, run as alertRun, staleFrom as alertStale } from "../client/src/lib/alerts/index";
import { CASES as NAT_CASES, OUTCOME_LABEL as NAT_OUTCOME, correctOption as natCorrect, isPrivate as natIsPrivate, trace as natTrace, wanRoutable as natRoutable } from "../client/src/lib/nat/index";
import { CASES as UNIT_CASES, correctOption as unitCorrect, directivesOf as unitDirectives, levels as unitLevels, meansStarted as unitMeansStarted, outcomeOf as unitOutcome } from "../client/src/lib/units/index";
import { CASES as OOM_CASES, adjWorth as oomAdjWorth, fattestSurvives as oomFattestSurvives, human as oomHuman, killed as oomKilled, correctOption as oomCorrect, scope as oomScope, scored as oomScored } from "../client/src/lib/oom/index";
import { CASES as SPACE_CASES, CAUSE_LABEL as SPACE_CAUSE, availableTo as spaceAvailableTo, candidates as spaceCandidates, dfAvailable, dfPercent, dfUsed, duTotal, errnoFor as spaceErrno, failure as spaceFailure, human as spaceHuman, inodePercent, invisible as spaceInvisible, reserved as spaceReserved, tell as spaceTell } from "../client/src/lib/space/index";
import { TABLES as ROUTE_TABLES, lookup as routeLookup, prefixOf } from "../client/src/lib/route/index";
import { SCENARIOS as RESTORES, domains as failureDomains } from "../client/src/lib/restore/index";
import { GROUPS, GROUP_BLURB, GROUP_HEADING, PRACTICE_SURFACES } from "../client/src/lib/practiceSurfaces";

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

  Three entries in the vendor catalog arrived with a null description and
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

  Painting it in the site's own colors is the honest fix. Hiding it would
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
  // archive they summarize. Tags without a hub still go to the index.
  const tagLinks = post.tags
    .map((t) => {
      const href = getTagPage(t) ? `${SITE_URL}/topics/${t}` : `${SITE_URL}/blog`;
      return `<a href="${href}">${esc(t)}</a>`;
    })
    .join(" ");

  /*
    Onward links in the static HTML.

    The React page renders neighbors and related posts, but a crawler that
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
  <h2>Practice, in the browser</h2>
  <p>
    ${PRACTICE_SURFACES.filter((surface) => surface.group !== "ground").length} places to
    practice, none of which need anything installed, none of which reach a
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
    <li><a href="${SITE_URL}/ports">Out of ports</a>, ten hosts against one ephemeral range and which connection fails first.</li>
    <li><a href="${SITE_URL}/limits">Too many open files</a>, five mechanisms that set a descriptor limit and which one was in scope.</li>
    <li><a href="${SITE_URL}/free">Two hundred megabytes free</a>, what MemAvailable computes and what the free column is not.</li>
    <li><a href="${SITE_URL}/ndots">Ten queries for one name</a>, how many DNS queries one hostname costs and why.</li>
    <li><a href="${SITE_URL}/leases">Forty minutes dark</a>, how many clients a DHCP outage costs and how large a pool has to be.</li>
    <li><a href="${SITE_URL}/backlog">Idle, and the connections time out</a>, what listen() installed as the accept queue and what a full one does.</li>
    <li><a href="${SITE_URL}/keepalive">Six minutes of silence</a>, which timer forgets an idle connection first and what the next write gets.</li>
    <li><a href="${SITE_URL}/startlimit">The service gave up</a>, why systemd stopped restarting a unit and why the slower crash never stops.</li>
    <li><a href="${SITE_URL}/neigh">Neighbor table overflow</a>, how many entries a flat segment needs and why IPv6 needs twice as many.</li>
    <li><a href="${SITE_URL}/shm">Bus error</a>, why a container with gigabytes free dies on a 64 MiB filesystem.</li>
    <li><a href="${SITE_URL}/maxstartups">Connection refused</a>, why sshd turns you away on a host that is doing nothing.</li>
    <li><a href="${SITE_URL}/retrans">Fifteen, and there were four</a>, why tcp_retries2 is a length of time and not a count.</li>
    <li><a href="${SITE_URL}/inotify">No space left</a>, why a file watcher says the disk is full when it is not.</li>
    <li><a href="${SITE_URL}/atime">The read that wrote</a>, when reading a file writes an inode and when it does not.</li>
    <li><a href="${SITE_URL}/nagle">Eight bytes, forty four milliseconds</a>, why two small writes cost a local round trip forty four milliseconds.</li>
    <li><a href="${SITE_URL}/argmax">Argument list too long</a>, why a command line under ARG_MAX is refused anyway.</li>
    <li><a href="${SITE_URL}/eloop">There is no loop</a>, why a path with no cycle in it reports too many levels of symbolic links.</li>
    <li><a href="${SITE_URL}/pipebuf">Two writers, one line</a>, why a log line comes out with another log line inside it.</li>
    <li><a href="${SITE_URL}/locks">Three locks, one file</a>, why two programs can both hold the lock on one file.</li>
    <li><a href="${SITE_URL}/signals">A thousand sent, one arrived</a>, why a standard signal sent a thousand times runs the handler once.</li>
    <li><a href="${SITE_URL}/exit">One byte, two kinds of news</a>, why an exit of 137 and a kill by SIGKILL are the same number.</li>
    <li><a href="${SITE_URL}/umask">A ceiling, not a request</a>, why the mode your program passes to open is a maximum.</li>
    <li><a href="${SITE_URL}/pss">Four processes, one copy</a>, why adding up a column of RSS gives memory that does not exist.</li>
    <li><a href="${SITE_URL}/sparse">A gigabyte in one block</a>, why ls and du disagree about a file and which copy makes it real.</li>
    <li><a href="${SITE_URL}/append">Two writers, one offset</a>, why four processes can hand a log more bytes than it ends up holding.</li>
    <li><a href="${SITE_URL}/mapped">Three boundaries, three outcomes</a>, where a mapping ends, where the file behind it ends, and which signal you get past each.</li>
    <li><a href="${SITE_URL}/overcommit">Half a machine</a>, why CommitLimit is half your memory and strict mode refuses with RAM free.</li>
    <li><a href="${SITE_URL}/timewait">Still a minute</a>, why lowering tcp_fin_timeout does nothing to TIME_WAIT.</li>
    <li><a href="${SITE_URL}/rcvbuf">Tuned smaller</a>, why setting a socket buffer can cap it below where it would have gone.</li>
    <li><a href="${SITE_URL}/fds">Too many open files</a>, which of the four descriptor limits is the smallest.</li>
    <li><a href="${SITE_URL}/writeback">Not written down</a>, which dirty page threshold runs and what it is a percentage of.</li>
    <li><a href="${SITE_URL}/conntrack">Table full</a>, why the kernel says so when it could not evict anything.</li>
    <li><a href="${SITE_URL}/cache">The page that showed somebody else's name</a>, what a shared cache keys on and what it does not.</li>
    <li><a href="${SITE_URL}/route">Longest prefix wins</a>, why a routing table is not read like a firewall chain.</li>
    <li><a href="${SITE_URL}/array">Array calculator</a>, capacity, rebuild time and the URE arithmetic behind them.</li>
    <li><a href="${SITE_URL}/transfer">Why the transfer is slow</a>, the three ceilings over a single TCP stream.</li>
    <li><a href="${SITE_URL}/restore">You have backups, not restores</a>, which copies survive the incident.</li>
    <li><a href="${SITE_URL}/practice">The practice hub</a>, all of it with what each one is for.</li>
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
        "A fourteen unit UniFi rack in real 3D, built from Ubiquiti's own product models and fully patched: two PoE switches down to surge panels, fiber uplinks to the aggregation switch, and every power lead landing in the distribution unit.",
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
        "The simulator's network operations dashboard: alert volume, uptime stability, and response cadence over the modeled datacenter floor.",
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
        "The simulator's network dashboard: topology overview, throughput trends, and link health across the modeled datacenter.",
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
        "The simulator's floor dashboard: thermal zones, airflow balance, and how racks are distributed across the modeled datacenter floor.",
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
        "The simulator's incident dashboard: severity distribution, response speed, and tracking of open incidents on the modeled floor.",
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
  reads, and that the numbers are modeled rather than measured, which is
  the one thing a reader arriving cold most needs to be told.

  Every block opens at h1. Three pages once shipped starting at h2 because
  their hand-authored prose did, and check-heading-order exists because of
  it.
*/
const nocDashContent = `
  <h1>NOC Overview</h1>
  <p>The network operations view of the datacenter simulator. It watches the
  modeled floor the way a real NOC watches a real one: what is alarming right
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
  <p>The topology and the traffic are both modeled. They are shaped to behave
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
  <p>The thermal figures come from the simulation. They are modeled to be
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
  describe the modeled floor on this site and nothing outside it.</p>
`;

const wiredRackContent = `
  <h1>The wired rack</h1>
  <p>Fourteen units of UniFi, patched the way somebody would actually patch it.
  The hardware is Ubiquiti's own geometry, the same models their store loads
  into its 3D viewer, so the panels are the panels and the ports are where the
  ports are. The build is mine: two PoE switches coming down to surge panels,
  fiber uplinks to the aggregation switch, storage taking copper straight to
  the nearest switch, and every power lead running down the side of the frame
  into the distribution unit.</p>
  <h2>What is in it</h2>
  <ul>
    <li>Dream Machine SE, the gateway, at the top of the rack.</li>
    <li>Pro Aggregation, which every other switch uplinks to on fiber.</li>
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
  which is why the frame buttons gray out when something in the build would
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

  // ── the practice hub ──
  const practiceDescription =
    "Everything on this site you do rather than read: branching incident scenarios with many " +
    "endings, a simulated Linux host with a fault in it, packet captures with a real display " +
    "filter bar, spaced-repetition flashcards and exam objective sheets.";

  await writePage("practice", base, {
    title: "Practice | Max Doubin",
    description: practiceDescription,
    canonical: `${SITE_URL}/practice`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Practice",
  description: practiceDescription,
  url: `${SITE_URL}/practice`,
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
    ["Out of ports", "/ports"],
    ["Too many open files", "/limits"],
    ["Two hundred megabytes free", "/free"],
    ["Ten queries for one name", "/ndots"],
    ["Forty minutes dark", "/leases"],
    ["Idle, and the connections time out", "/backlog"],
    ["Six minutes of silence", "/keepalive"],
    ["The service gave up", "/startlimit"],
    ["Neighbor table overflow", "/neigh"],
    ["Bus error", "/shm"],
    ["Connection refused", "/maxstartups"],
    ["Fifteen, and there were four", "/retrans"],
    ["No space left", "/inotify"],
    ["The read that wrote", "/atime"],
    ["Eight bytes, forty four milliseconds", "/nagle"],
    ["Argument list too long", "/argmax"],
    ["There is no loop", "/eloop"],
    ["Two writers, one line", "/pipebuf"],
    ["Three locks, one file", "/locks"],
    ["A thousand sent, one arrived", "/signals"],
    ["One byte, two kinds of news", "/exit"],
    ["A ceiling, not a request", "/umask"],
    ["Four processes, one copy", "/pss"],
    ["A gigabyte in one block", "/sparse"],
    ["Two writers, one offset", "/append"],
    ["Three boundaries, three outcomes", "/mapped"],
    ["Half a machine", "/overcommit"],
    ["Still a minute", "/timewait"],
    ["Tuned smaller", "/rcvbuf"],
    ["Too many open files", "/fds"],
    ["Not written down", "/writeback"],
    ["Table full", "/conntrack"],
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
  <h1>Practice</h1>
  <p>
    Reading about an incident and being in one are different skills, and only
    one of them is what a bad night asks for. These are the parts of this site
    that make you do something, grouped by the situation you are in rather
    than by subject, because the subject is not what anybody arrives knowing.
  </p>
${GROUPS.map((group) => `  <h2 id="${group}">${esc(GROUP_HEADING[group])}</h2>
  <p>${esc(GROUP_BLURB[group])}</p>
  <ul>
${PRACTICE_SURFACES.filter((surface) => surface.group === group)
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
  ${backLinks([["/capture", "Packet captures"], ["/chain", "Certificate chains"], ["/practice", "All practice material"]])}
</main>`,
  });

  // ── today ──
  /*
    The static body cannot name today's items, because the build ran on some
    other day and a crawler would index a set that no longer exists. What it
    describes is the mechanism, which does not change.
  */
  const todayDescription =
    "One thing from every practice surface, chosen by the date and the same for everybody: an " +
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
    One thing from each practice surface, chosen by the date. The same set for
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
  ${backLinks([["/practice", "The practice hub"], ["/scenarios", "Incident scenarios"], ["/labs", "Hands-on labs"]])}
</main>`,
  });

  // ── backups and restores ──
  /*
    The postures go into the static body in full: the configuration is the
    content, and a reader is meant to look at it and decide. Which copies
    survive stays out, because that is the exercise.
  */
  const restoreDescription =
    "Every organization that lost data had backups. Six incidents, each with a backup posture " +
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
    Every organization that lost data had backups. That is not a paradox and
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
  ${backLinks([["/practice", "All practice material"], ["/transfer", "Why the transfer is slow"], ["/array", "Array calculator"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/firewall", "Firewall exercises, where first match does win"], ["/allocate", "Address plans"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/blog/mtu-mismatch-troubleshooting", "The MTU bug that only breaks big transfers"], ["/capture", "Packet captures"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/firewall", "Firewall exercises"], ["/blog/vlan-segmentation-guide", "VLAN segmentation"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/blog/http-caching-headers-etags", "HTTP caching headers and ETags"], ["/blog/the-disk-was-not-full", "The disk was not full"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/blog/linux-disk-io-troubleshooting", "Linux disk IO troubleshooting"], ["/blog/filesystem-journal-explained", "Filesystem journals"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/blog/the-alert-was-pending-all-day", "The alert was pending all day"], ["/blog/prometheus-server-monitoring", "Prometheus server monitoring"], ["/logs", "Read the log"]])}
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
    "What the Linux load average actually counts: that nr_uninterruptible is added to nr_running so a blocked task weighs the same as a running one, that the figure is not normalized by the core count, that it is an exponentially damped moving average sampled every 5*HZ+1 ticks so it reaches only 63 percent of a step after one time constant, that a burst shorter than the sample period is never counted at all, and how to take the sum apart again with vmstat, /proc/loadavg and pressure stall information",
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
  ${backLinks([["/practice", "All practice material"], ["/blog/forty-and-nothing-was-running", "Forty, and nothing was running"], ["/oom", "Something has to die"], ["/alerts", "The graph crossed the line"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/blog/stopped-not-slow", "Stopped, not slow"], ["/load", "Forty, and idle"], ["/oom", "Something has to die"]])}
</main>`,
  });

  // ── ephemeral ports ──
  /*
    The per-destination split is the argument, so the static body carries it
    as a table with one row per destination rather than a total. Somebody
    searching "cannot assign requested address" lands here and the row they
    need shows one destination over its range while the host's total is
    larger than the range and irrelevant.
  */
  const portsFailing = PORT_CASES.filter((item) => portExhausts(item.setup)).length;
  const portsDefaultCeiling = Math.floor(28232 / portTw);
  const portsDescription =
    "A socket is identified by (saddr, sport, daddr, dport), so the ephemeral port range is not a " +
    "pool shared between destinations: each one gets the whole range. TIME_WAIT is " +
    `${portTw} seconds, a compile time constant with no sysctl behind it, so a client closing its ` +
    `own connections tops out at ${portsDefaultCeiling} a second to one destination on the default ` +
    `range. ${PORT_CASES.length} hosts here, ${portsFailing} of which run out, and tcp_fin_timeout ` +
    "changes none of them because it controls FIN_WAIT2.";

  await writePage("ports", base, {
    title: "It Ran Out of Ports and There Are Sixty Thousand of Them | Max Doubin",
    description: portsDescription,
    canonical: `${SITE_URL}/ports`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Out of ports",
  description: portsDescription,
  url: `${SITE_URL}/ports`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "Why ephemeral port exhaustion is per destination rather than per host, because the kernel's socket lookup is on the four tuple; that TIME_WAIT is TCP_TIMEWAIT_LEN, a compile time 60 seconds with no sysctl, so the ceiling is the range divided by sixty; that tcp_fin_timeout controls FIN_WAIT2 and changes nothing here; that a server holding TIME_WAIT on its listening port consumes none of its own range; what tcp_tw_reuse does and does not cover; and why a connection pool removes the mechanism rather than reducing the number",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>It ran out of ports and there are sixty thousand of them</h1>
  <p>
    ${PORT_CASES.length} hosts against one ephemeral port range, and the question every time is
    whether it runs out and which connection fails. ${portsFailing} of them do run out, one of them
    at two hundred connections a second.
  </p>
  <p>
    Three things decide this and the one everybody reaches for is not among them. A socket is
    identified by <code>(saddr, sport, daddr, dport)</code>, so the same local port is free for a
    different destination and the range is not a pool being shared out. TIME_WAIT is ${portTw}
    seconds, a compile time constant in <code>include/net/tcp.h</code> with no sysctl behind it, so
    the occupancy is simply the rate times sixty. And <code>tcp_fin_timeout</code> is a different
    state, FIN_WAIT2, which defaults to the same sixty and is exactly why the two get confused.
  </p>
  <h2>What each host is doing</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Destination</th><th>Rate</th><th>Ports held</th><th>Range</th><th>Over?</th></tr>
    </thead>
    <tbody>
${PORT_CASES.flatMap((item) =>
  portLoads(item.setup).map(
    (load, index) =>
      `      <tr><td>${index === 0 ? esc(item.name) : ""}</td>` +
      `<td>${esc(load.destination.label)}</td>` +
      `<td>${load.destination.rate}/s</td>` +
      `<td>${esc(portCount(load.held))}</td>` +
      `<td>${esc(portCount(load.available))}</td>` +
      `<td>${load.exhausted ? "yes" : "no"}</td></tr>`,
  ),
).join("\n")}
    </tbody>
  </table>
  </div>
${PORT_CASES.map((item) => {
  const right = portCorrect(item);
  const ceiling = portMaxRate(item.setup);
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>$ sysctl net.ipv4.ip_local_port_range net.ipv4.tcp_tw_reuse net.ipv4.tcp_fin_timeout
${esc(portSysctl(item.setup))}
# ${esc(portCount(portRangeSize(item.setup)))} ports, closed by the ${esc(portHeldBy(item.setup))}

$ ss -tan state time-wait | wc -l
${portsHeld(item.setup)}</code></pre>
    <p>The ceiling to one destination here is ${esc(portCount(ceiling))}${ceiling === Infinity ? "" : " connections a second"}.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>The fix: ${esc(item.fix)}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  <h2>Reading it on a real host</h2>
  <ol>
    <li><code>ss -tan state time-wait | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn</code>.
    The split by destination, which is the only view that means anything. A large total across many
    destinations is normal and a moderate total against one is the failure.</li>
    <li><code>sysctl net.ipv4.ip_local_port_range</code>, then divide by ${portTw}. That is the
    ceiling per destination, and on the default range it is ${portsDefaultCeiling} connections a
    second, which is much lower than the size of the range suggests.</li>
    <li>Work out which end closes. Whoever sends the first FIN holds TIME_WAIT, and a server
    holding it on its listening port is consuming none of its own ephemeral range.</li>
    <li><code>dmesg</code> and the application's own errors, for <code>EADDRNOTAVAIL</code>, which
    is what a client sees when the range is full and reads as "cannot assign requested address".</li>
    <li>Do not reach for <code>tcp_fin_timeout</code>. It is FIN_WAIT2, TIME_WAIT has no sysctl, and
    the two default to the same number, which is the whole reason for the confusion.</li>
  </ol>
  ${backLinks([["/practice", "All practice material"], ["/blog/it-ran-out-at-four-hundred-and-seventy", "It ran out at four hundred and seventy"], ["/nat", "It works from outside"], ["/transfer", "Why the transfer is slow"]])}
</main>`,
  });

  // ── descriptor limits ──
  /*
    The five mechanisms go into the static body as a column each, because the
    argument is that they are separate rather than ranked and a paragraph
    saying so is weaker than a row where four of them are populated and one
    of them is the answer. Somebody searching "ulimit not applied to systemd
    service" lands here.
  */
  const limFailing = LIMIT_CASES.filter((item) => !limOk(item.setup)).length;
  const limitsDescription =
    "Five mechanisms can set a file descriptor limit and they are not a hierarchy. " +
    "/etc/security/limits.conf is read by pam_limits, so it applies to a login session and never " +
    "to a unit systemd started at boot, however correct the file is. DefaultLimitNOFILE applies " +
    "to units and to nothing else. fs.nr_open clamps any hard limit and fs.file-max is a " +
    `different limit with a different errno. ${LIMIT_CASES.length} processes here, ${limFailing} ` +
    "of which fail, and the soft limit is only what the process starts with: it may raise itself " +
    "to its hard limit at any time without privilege.";

  await writePage("limits", base, {
    title: "Too Many Open Files, and the Limit You Set Is Not the One That Applied | Max Doubin",
    description: limitsDescription,
    canonical: `${SITE_URL}/limits`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Too many open files",
  description: limitsDescription,
  url: `${SITE_URL}/limits`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "Which of five mechanisms actually sets a process's RLIMIT_NOFILE: that limits.conf is a PAM module and never applies to a systemd unit, that DefaultLimitNOFILE never applies to a login, that a unit's LimitNOFILE replaces both halves of the default, that fs.nr_open clamps any hard limit so infinity is not unlimited, that a process may raise its own soft limit to its hard limit without privilege, that RLIMIT_NOFILE is one greater than the highest descriptor number, and that EMFILE and ENFILE are different limits with different files behind them",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Too many open files, and the limit you set is not the one that applied</h1>
  <p>
    ${LIMIT_CASES.length} processes and five places a descriptor limit can come from.
    ${limFailing} of them fail, and in one the setting is correct, was applied, and is not in the
    path at all.
  </p>
  <p>
    These five are not a hierarchy. <code>/etc/security/limits.conf</code> is read by pam_limits,
    which runs when somebody authenticates, so it applies to a login session and never to a unit
    systemd started at boot. <code>DefaultLimitNOFILE</code> applies to units and to nothing else.
    <code>fs.nr_open</code> is a ceiling on any hard limit, so <code>LimitNOFILE=infinity</code> is
    not unlimited. And <code>fs.file-max</code> is a machine wide total with its own errno.
  </p>
  <h2>What applied, and what each process got</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Process</th><th>Started by</th><th>Soft</th><th>Hard</th><th>Set by</th><th>Wants</th><th>Result</th></tr>
    </thead>
    <tbody>
${LIMIT_CASES.map((item) => {
  const e = limEffective(item.setup);
  return `      <tr><td>${esc(item.name)}</td><td>${esc(item.setup.origin)}</td>` +
    `<td>${esc(limNum(e.soft))}</td><td>${esc(limNum(e.hard))}</td>` +
    `<td>${esc(e.source)}</td><td>${esc(limNum(item.setup.wants))}</td>` +
    `<td>${limOk(item.setup) ? "succeeds" : esc(String(limFails(item.setup)))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${LIMIT_CASES.map((item) => {
  const right = limCorrect(item);
  const e = limEffective(item.setup);
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code># started by ${esc(item.setup.origin)}, wanting ${esc(limNum(item.setup.wants))} descriptors
${esc(limProc(item.setup))}</code></pre>
    <p>Set by ${esc(limSource[e.source])}. The highest descriptor it can hold is ${esc(limNum(limHighest(item.setup)))}.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>The fix: ${esc(item.fix)}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  <h2>Reading it on a real host</h2>
  <ol>
    <li><code>cat /proc/$(systemctl show -p MainPID --value thing.service)/limits</code>. The
    limits of the process that is actually failing, which is the only reading that settles this. A
    shell tells you about shells.</li>
    <li><code>systemctl show -p LimitNOFILE -p LimitNOFILESoft thing.service</code> for what
    systemd thinks it set, which is a different question from what the process has now.</li>
    <li>Both errnos, separately. <code>/proc/sys/fs/file-nr</code>'s first field is descriptors
    allocated machine wide: near <code>fs.file-max</code> means ENFILE and no per process limit
    will help.</li>
    <li><code>prlimit --pid PID --nofile</code> reads and, with a value, changes the limits of a
    running process without restarting it.</li>
    <li>Remember that the soft limit is a starting point. A daemon that raises itself is already
    at its hard limit and the soft value in the unit never mattered.</li>
  </ol>
  ${backLinks([["/practice", "All practice material"], ["/blog/the-file-was-right-and-nobody-read-it", "The file was right and nobody read it"], ["/ports", "Out of ports"], ["/units", "It started before the thing it needs"]])}
</main>`,
  });

  // ── the memory estimate ──
  /*
    The three parts of the estimate go into the static body as a table,
    because the argument is that MemAvailable is arithmetic nobody has looked
    at. Somebody searching "linux no free memory but plenty available" lands
    here and the row they need shows 240Mi free next to 29.1Gi available on
    the same machine.
  */
  const freeMisleading = FREE_CASES.filter(
    (item) => freeAvailable(item.setup) > item.setup.free * 10,
  ).length;
  const freeOverstating = FREE_CASES.filter((item) => freeOverstated(item.setup) > 0).length;
  const freeDescription =
    "An operating system that leaves memory unused is wasting it, so on any server that has been " +
    "up a week the free column is small by design. MemAvailable is the estimate that answers the " +
    "question: free less the reserves, plus the page cache less what has to stay, plus the " +
    "reclaimable slab less the same, where the subtraction is min(half of it, the low watermark) " +
    "and which arm wins changes with the size of the machine. " +
    `${FREE_CASES.length} machines here, ${freeMisleading} where available is more than ten times ` +
    `free, and ${freeOverstating} where the estimate itself overstates because tmpfs is counted as ` +
    "reclaimable page cache and there is no swap.";

  await writePage("free", base, {
    title: "Two Hundred Megabytes Free, and the Machine Is Fine | Max Doubin",
    description: freeDescription,
    canonical: `${SITE_URL}/free`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Two hundred megabytes free",
  description: freeDescription,
  url: `${SITE_URL}/free`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "What MemAvailable actually computes in si_mem_available: free less totalreserve, plus page cache less min(half of it, the low watermark), plus reclaimable slab less the same; why the remembered rule that half the cache is available is the small-machine arm of that min; why the used column is a residue that moves when the cache moves; why tmpfs counted as page cache makes the estimate overstate on a host with no swap; why Dirty is counted even though it has to be written first; and why a collapsed page cache rather than a small free column is what real memory pressure looks like",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Two hundred megabytes free, and the machine is fine</h1>
  <p>
    ${FREE_CASES.length} machines and one line of /proc/meminfo. On ${freeMisleading} of them
    MemAvailable is more than ten times MemFree, and on ${freeOverstating} the estimate itself
    overstates.
  </p>
  <p>
    An operating system that leaves memory unused is wasting it, so the page cache grows until
    something needs the space back and the free column goes to nearly nothing. MemAvailable is the
    estimate that answers the question people are actually asking, and it is three additions and
    two subtractions: free less the reserves, plus the page cache less what has to stay, plus the
    reclaimable slab less the same. The subtraction is
    <code>min(half of it, the low watermark)</code>, and which arm wins changes with the size of
    the machine, which is why the remembered rule that half the cache is available is right on a
    laptop and wrong on a server.
  </p>
  <h2>What each machine says, and what it means</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Machine</th><th>Total</th><th>Free</th><th>Cache</th><th>Used</th><th>Available</th><th>Held back by</th></tr>
    </thead>
    <tbody>
${FREE_CASES.map((item) => {
  const e = freeEstimate(item.setup);
  return `      <tr><td>${esc(item.name)}</td><td>${esc(freeHuman(item.setup.total))}</td>` +
    `<td>${esc(freeHuman(item.setup.free))}</td><td>${esc(freeHuman(freeCache(item.setup)))}</td>` +
    `<td>${esc(freeHuman(freeUsed(item.setup)))}</td><td>${esc(freeHuman(freeAvailable(item.setup)))}</td>` +
    `<td>${esc(e.cacheHeldBy)}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${FREE_CASES.map((item) => {
  const right = freeCorrect(item);
  const over = freeOverstated(item.setup);
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>$ free -h
${esc(freeCmd(item.setup))}

${esc(freeMeminfo(item.setup))}</code></pre>
    <p>MemAvailable is ${freeAvailable(item.setup)} kB${over > 0 ? `, of which about ${esc(freeHuman(over))} is tmpfs that nothing can reclaim on a host with no swap` : ""}.${item.setup.wants > 0 ? ` An allocation of ${esc(freeHuman(item.setup.wants))} ${freeFits(item.setup) ? "fits" : "does not fit"}.` : ""}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  <h2>Reading it on a real machine</h2>
  <ol>
    <li><code>grep -E 'MemFree|MemAvailable|Shmem|Dirty' /proc/meminfo</code>. Available is the
    number to alert on and free is the one that was always going to be small.</li>
    <li>Watch the page cache size over hours, not the free column. A cache that is shrinking is the
    early warning; a small free column is the normal state of a healthy server.</li>
    <li>Subtract <code>Shmem</code> on any host with a large tmpfs and no swap. Those pages are
    counted as reclaimable page cache and nothing can reclaim them.</li>
    <li><code>Dirty</code> and <code>Writeback</code> next to it when latency matters. MemAvailable
    counts a dirty page because it will become available, and it becomes available at the speed of
    the disk under it.</li>
    <li><code>/proc/pressure/memory</code> for control decisions. It measures time actually spent
    stalled rather than predicting whether reclaim might cost something.</li>
  </ol>
  ${backLinks([["/practice", "All practice material"], ["/blog/the-free-column-was-always-going-to-be-zero", "The free column was always going to be zero"], ["/oom", "Something has to die"], ["/load", "Forty, and idle"]])}
</main>`,
  });

  // ── the search list ──
  /*
    The walk goes into the static body one name per row, because the
    argument is that a lookup everybody thinks of as one query is a list
    nobody has seen. Somebody searching "kubernetes dns nxdomain ndots" lands
    here and the first row shows api.stripe.com costing ten queries under
    ndots:5, eight of them for names that do not exist.
  */
  const ndotsWasting = NDOTS_CASES.filter((item) => ndotsWasted(item.setup) > 0).length;
  const ndotsWrong = NDOTS_CASES.filter((item) => ndotsWildcard(item.setup)).length;
  const ndotsMost = Math.max(...NDOTS_CASES.map((item) => ndotsQueries(item.setup)));
  const ndotsDescription =
    "A program asks for one hostname and the stub resolver counts the dots in it against ndots. " +
    "Fewer dots than ndots means every search domain is tried first and the name as written last; " +
    "at least ndots means the name as written goes first; a trailing dot means the search list is " +
    "never consulted. Each attempt is two queries, A and AAAA. In a Kubernetes pod with ndots:5 and " +
    "four search domains, a two-dot name costs ten queries and eight are NXDOMAIN. " +
    `${NDOTS_CASES.length} names here, ${ndotsWasting} that cost wasted queries, up to ${ndotsMost} for one ` +
    `lookup, and ${ndotsWrong} where a wildcard record in a search domain answers with the wrong address.`;

  await writePage("ndots", base, {
    title: "Ten Queries for One Name, Eight of Them for Nothing | Max Doubin",
    description: ndotsDescription,
    canonical: `${SITE_URL}/ndots`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Ten queries for one name",
  description: ndotsDescription,
  url: `${SITE_URL}/ndots`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "How the glibc stub resolver applies the resolv.conf search list: the ndots threshold on the dots in a name, search-first versus absolute-first order, why a trailing dot skips the list, why every attempt is an A and an AAAA query, why Kubernetes sets ndots:5 and what that costs for external names, the six-domain cap in glibc before 2.26, and why a wildcard record inside a search domain returns the wrong address without any error",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Ten queries for one name</h1>
  <p>
    ${NDOTS_CASES.length} names and the two lines of resolv.conf that decide how each is looked up.
    ${ndotsWasting} of them cost queries for names that do not exist, one costs ${ndotsMost} for a
    single lookup, and ${ndotsWrong} gets the wrong address back with no error anywhere.
  </p>
  <p>
    resolv.conf(5): "Resolver queries having fewer than ndots dots (default is 1) in them will be
    attempted using each component of the search path in turn until a match is found." A name with
    at least ndots dots is tried as written first. A name ending in a dot is fully qualified and the
    search list is never consulted. Every attempt is two queries, A and AAAA, because getaddrinfo
    asks for both. Kubernetes writes <code>ndots:5</code> so that every name a cluster hands out is
    tried under the search list first, and the same setting makes every external name walk the
    whole list before it is tried as written.
  </p>
  <h2>What each name costs</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Name</th><th>ndots</th><th>Search domains</th><th>Order</th><th>Queries</th><th>NXDOMAIN</th><th>Answered by</th></tr>
    </thead>
    <tbody>
${NDOTS_CASES.map((item) => {
  const last = ndotsAttempts(item.setup).at(-1);
  const answered = last && last.outcome !== "nxdomain" ? `${last.fqdn}${last.outcome === "wildcard" ? " (wildcard)" : ""}` : "nothing";
  return `      <tr><td>${esc(item.setup.name)}</td><td>${item.setup.ndots}</td><td>${item.setup.search.length}</td>` +
    `<td>${esc(ndotsOrder(item.setup))}</td><td>${ndotsQueries(item.setup)}</td><td>${ndotsWasted(item.setup)}</td>` +
    `<td>${esc(answered)}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${NDOTS_CASES.map((item) => {
  const right = ndotsCorrect(item);
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>$ cat /etc/resolv.conf
${esc(ndotsConf(item.setup))}

$ getent hosts ${esc(item.setup.name)}
${esc(ndotsTrace(item.setup))}</code></pre>
    <p>The resolver went ${esc(ndotsOrder(item.setup))}: ${ndotsAttempts(item.setup).length} name${ndotsAttempts(item.setup).length === 1 ? "" : "s"}, ${ndotsQueries(item.setup)} queries, ${ndotsWasted(item.setup)} of them NXDOMAIN.${ndotsWildcard(item.setup) ? " The answer came from a wildcard and the real name was never asked for." : ""}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
</main>`,
  });

  // ── shared memory ──
  /*
    The static body leads with the three numbers side by side, because the
    search that brings people here is "bus error docker" and the thing they
    need is the comparison: the host's memory, the container's limit, and a
    64 MiB filesystem that appears in no dashboard.
  */
  const shmFailing = SHM_CASES.filter((item) => !shmFits(item.setup)).length;
  const shmDefaults = SHM_CASES.filter((item) => item.setup.shmMiB === 64).length;
  const shmDescription =
    "Docker mounts /dev/shm as a tmpfs in every container, and the documentation is plain about " +
    "the size: if you omit --shm-size entirely, the system uses 64m. On a host the same path is " +
    "half of physical memory, so the same binary has five hundred times more shared memory " +
    "outside a container than inside one. And a tmpfs that cannot back a page does not return an " +
    "error: the mmap succeeds and the process takes SIGBUS at the page fault, which prints as " +
    "Bus error with nothing in dmesg, while an ordinary write to the same full filesystem gets " +
    `ENOSPC like anything else. ${SHM_CASES.length} containers here, ${shmFailing} that do not fit and ` +
    `${shmDefaults} sitting at the 64 MiB default.`;

  await writePage("shm", base, {
    title: "Bus Error, in a Container With Gigabytes to Spare | Max Doubin",
    description: shmDescription,
    canonical: `${SITE_URL}/shm`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Bus error",
  description: shmDescription,
  url: `${SITE_URL}/shm`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "Why a container with free memory dies of shared memory exhaustion: that Docker's /dev/shm defaults to 64 MiB while a host's defaults to half of RAM, that mmap on a tmpfs succeeds and defers the failure to a page fault that raises SIGBUS rather than returning ENOSPC, that the same full filesystem returns an ordinary error to write() so the obvious test does not reproduce the crash, that tmpfs pages are charged to the container's memory cgroup so raising the mount without raising the limit trades a Bus error for an OOM kill, that a large tmpfs costs nothing until written to, that shm_size is a per service key in compose, and that Kubernetes has no shm-size field at all and needs an emptyDir with medium Memory",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Bus error</h1>
  <p>
    ${SHM_CASES.length} containers that use shared memory, and one question each.
    ${shmFailing} of them ask for more than /dev/shm holds, and ${shmDefaults} are sitting at the
    64 MiB that the runtime mounts when nothing says otherwise.
  </p>
  <p>
    The Docker documentation states the default in one sentence: "If you omit the size entirely,
    the system uses <code>64m</code>." Outside a container the same path defaults to half of
    physical memory, a factor of five hundred on a 64 GiB host, decided by the runtime rather than
    by the kernel or by anything the application can see. And the failure does not arrive as an
    error. Measured on an 8 MiB tmpfs with a 32 MiB mapping: the <code>mmap</code> succeeds, and
    the process dies after touching exactly 8388608 bytes. A signal, not an errno, so code that
    checks every return value has checked three calls that all succeeded. An ordinary
    <code>write</code> to the same full filesystem gets ENOSPC, which is why the obvious test comes
    back clean.
  </p>
  <h2>What each container asks for</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Platform</th><th>/dev/shm</th><th>Per unit</th><th>Units</th><th>Demand</th><th>Memory limit</th><th>Dies at</th><th>Ending</th></tr>
    </thead>
    <tbody>
${SHM_CASES.map((item) => {
  const s = item.setup;
  const died = shmDies(s);
  return `      <tr><td>${esc(s.platform)}</td><td>${esc(shmHuman(s.shmMiB))}</td>` +
    `<td>${s.perUnitMiB} MiB</td><td>${s.units} ${esc(s.unit)}${s.units === 1 ? "" : "s"}</td>` +
    `<td>${esc(shmHuman(shmDemand(s)))}</td>` +
    `<td>${s.memoryLimitMiB === null ? "none" : esc(shmHuman(s.memoryLimitMiB))}</td>` +
    `<td>${died === null ? "nothing" : `${esc(s.unit)} ${died}`}</td><td>${esc(shmFailure(s))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${SHM_CASES.map((item) => {
  const right = shmCorrect(item);
  const s = item.setup;
  const knob = shmKnob(s.platform);
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(shmInvocation(s))}

${esc(shmSymptom(s))}</code></pre>
    <p>${shmDemand(s)} MiB wanted against ${esc(shmHuman(s.shmMiB))} of /dev/shm${
      s.memoryLimitMiB !== null ? `, and ${shmCharged(s)} MiB charged against a limit of ${s.memoryLimitMiB} MiB` : ""
    }. Sized for this peak it wants ${esc(shmHuman(shmNeeds(s)))}${knob === null ? ", and this platform has no shm-size field to set it in" : `, set with ${esc(knob)}`}.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/bus-error-with-sixty-four-gigabytes-free", "Bus error, with sixty four gigabytes free"], ["/throttle", "Thirty percent, and stalling"], ["/oom", "Something has to die"]])}
</main>`,
  });

  // ── inotify limits ──
  /*
    The static body carries the limits table, because the search that brings
    people here is "ENOSPC" next to a df that shows the disk is fine, and what
    they need is the two budgets with the held portion spelled out for a host
    shaped like theirs.
  */
  const inoBroken = INOTIFY_CASES.filter((item) => !inoFits(item.setup)).length;
  const inoDescription =
    "A file watcher that runs out of fs.inotify.max_user_watches fails with ENOSPC, which strerror " +
    "prints as \"No space left on device\", measured here with 19.7 GiB free. One that runs out of " +
    "fs.inotify.max_user_instances fails with EMFILE, \"Too many open files\", measured with " +
    "RLIMIT_NOFILE at 20000 and a handful of descriptors open. Neither message contains the word " +
    "inotify and neither resource is short. Both limits are charged to the real UID across every " +
    "process, so the program that reports the error is usually not the one that spent the budget. " +
    `${INOTIFY_CASES.length} watchers here, ${inoBroken} of them failing.`;

  await writePage("inotify", base, {
    title: "No Space Left on Device, With Nineteen Gigabytes Free | Max Doubin",
    description: inoDescription,
    canonical: `${SITE_URL}/inotify`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "No space left",
  description: inoDescription,
  url: `${SITE_URL}/inotify`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "How the inotify limits fail and why their error messages point at the wrong resource: that exhausting fs.inotify.max_user_watches makes inotify_add_watch return ENOSPC, printed as \"No space left on device\" on a filesystem with gigabytes free; that exhausting fs.inotify.max_user_instances makes inotify_init return EMFILE, printed as \"Too many open files\" with almost no descriptors open and RLIMIT_NOFILE untouched; that both limits are charged to the real UID across every process that user runs, so a watcher asking for a few hundred watches can fail on a limit of a hundred and thirty thousand because other processes already hold it; that inotify_init runs before inotify_add_watch, so when both budgets are short the instance limit reports and raising the watch limit changes nothing; that a watch covers one directory rather than a tree, so a recursive watch costs one per directory; that watches are deduplicated per instance against the inode, so a second add inside one instance is free while a second instance watching the same directory pays in full; and that overflowing fs.inotify.max_queued_events drops events silently, leaving a single IN_Q_OVERFLOW marker with wd -1 while every read returns success",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>No space left</h1>
  <p>
    ${INOTIFY_CASES.length} hosts, one file watcher each. ${inoBroken} of them fail, and on none of them is the
    resource named in the error message the one that ran out.
  </p>
  <p>
    Here are the three limits on one host, with their scope, which is the part that catches people:
  </p>
  <pre><code>fs.inotify.max_user_watches    130082    per real UID, across every process
fs.inotify.max_user_instances     128    per real UID, across every process
fs.inotify.max_queued_events    16384    per instance</code></pre>
  <p>
    Exhaust the first and <code>inotify_add_watch</code> returns ENOSPC, which prints as
    <em>No space left on device</em>. Measured on that host at the moment of the failure: 19.7 GiB
    free. Nothing about the disk is involved, and df, du and /proc/meminfo all look healthy.
  </p>
  <p>
    Exhaust the second and <code>inotify_init</code> returns EMFILE, <em>Too many open files</em>,
    with RLIMIT_NOFILE at 20000 and a handful of descriptors actually open. Instances are created
    before watches are added, so when both budgets are short this is the error that arrives, and
    raising the watch limit in response changes nothing at all.
  </p>
  <p>
    The scope is the other half of it. With the watch limit lowered to 200 for the experiment, a
    fresh instance managed 19 watches, because 181 were already held by an unrelated process under
    the same user. 181 plus 19 is 200. The program that gets the error is whichever one asked last.
  </p>
  <p>
    What a watch costs follows from the same rules. A watch is one directory, not one tree, so a
    recursive watch on a project costs one per directory in it. Within one instance the kernel keys
    the watch on the inode, so asking twice is free:
  </p>
  <pre><code>same instance, same directory twice     wd 1, then wd 1 again
same instance, same inode, other path   wd 1
a second instance, same directory       wd 1 of its own
watches charged to the user by those    2</code></pre>
  <p>
    Two programs watching the same tree each pay in full. That is how a machine runs out: an editor,
    a bundler, a test runner and a file syncer all watching the same node_modules.
  </p>
  <p>
    And the failure that is not an error. With the queue lowered to 64 and 256 files created before
    it was read, 65 events came back, 192 were gone, and the only sign was one IN_Q_OVERFLOW marker
    with <code>wd</code> set to -1. Every read returned success. A reader that does not check for
    that marker sees a short burst and no indication that three quarters of it was dropped.
  </p>
  <h2>What each host allows, and what the watcher gets</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Dirs</th><th>Instances</th><th>Watches wanted</th><th>Watches free</th><th>Instances free</th><th>Result</th><th>Message</th><th>What ran out</th><th>Events lost</th></tr>
    </thead>
    <tbody>
${INOTIFY_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${esc(inoHuman(s.directories))}</td><td>${s.instances}</td>` +
    `<td>${esc(inoHuman(inoWanted(s)))}</td><td>${esc(inoHuman(inoFree(s)))}</td><td>${esc(inoHuman(inoInstFree(s)))}</td>` +
    `<td>${esc(inoErrno(s))}</td><td>${esc(inoMessage(s))}</td><td>${esc(inoCulprit(s))}</td>` +
    `<td>${esc(inoHuman(inoLost(s)))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${INOTIFY_CASES.map((item) => {
  const right = inoCorrect(item);
  const s = item.setup;
  const sysctl = inoSysctl(s).map((line) => `${line.name.padEnd(30)} ${line.value.padStart(22)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(sysctl)}

# this watcher: ${s.directories} directories across ${s.instances} instance${s.instances === 1 ? "" : "s"}</code></pre>
    <p>It wants ${esc(inoHuman(inoWanted(s)))} watches against ${esc(inoHuman(inoFree(s)))} free and ${s.instances} instance${s.instances === 1 ? "" : "s"} against ${esc(inoHuman(inoInstFree(s)))}. ${inoFits(s) ? "Everything fits." : `The call fails with ${esc(inoErrno(s))}, printed as "${esc(inoMessage(s))}", and what ran out is ${esc(inoCulprit(s))}.`} ${inoLost(s) > 0 ? `A burst of ${esc(inoHuman(s.eventsBurst))} events loses ${esc(inoHuman(inoLost(s)))} of them without an error.` : ""}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/no-space-left-on-device-with-nineteen-gigabytes-free", "No space left on device, with nineteen gigabytes free"], ["/fds", "Too many open files"], ["/space", "No space left on device"]])}
</main>`,
  });

  // ── access times ──
  /*
    The static body carries the three rules in the kernel's order, because the
    two searches that bring people here are "does reading a file write to
    disk" and "why is my atime not updating", and each of them is answered by
    one line of that list plus the four things that stop the update outright.
  */
  const atWriting = ATIME_CASES.filter((item) => atUpdates(item.setup)).length;
  const atDescription =
    "On a relatime mount, which is the default on Linux since 2009, reading a file updates its " +
    "access time only when mtime or ctime is at least as new as the stored atime, or when that " +
    "atime is a day old or more. So most reads write nothing and one read a day per file writes " +
    "an inode: reading 1059 files here dirtied 1059 inodes, and reading the same 1059 again " +
    "dirtied none. An access time frozen by noatime does not read as missing, it reads as old, " +
    `and a cleanup job that selects on age agrees. ${ATIME_CASES.length} filesystems here, ` +
    `${atWriting} where the read writes.`;

  await writePage("atime", base, {
    title: "The Read That Wrote: When atime Costs You an Inode | Max Doubin",
    description: atDescription,
    canonical: `${SITE_URL}/atime`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "The read that wrote",
  description: atDescription,
  url: `${SITE_URL}/atime`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "When reading a file on Linux writes to the disk and when it does not: that relatime, the default mount option since 2009, updates atime on a read only if mtime is at least as new as the stored atime, or ctime is at least as new as it, or that atime is twenty four hours old or more; that the second test subsumes the first, because ctime is never older than mtime on a real inode, so a chmod alone arms the next read to write; that the day is fixed in the kernel rather than tunable; that four things stop the update regardless, the per-inode A flag that chattr sets, noatime on the mount, nodiratime for directories only, and a read-only mount, where the decision is made and then refused when touch_atime asks for write access; that directories have access times too and a listing is a read; that a read-only pass over a tree therefore writes one inode per file per day and nothing at all on a second pass the same day; and that an access time frozen by noatime does not read as missing but as old, so a cleanup rule of \"not accessed in 30 days\" selects a file being read two hundred times a minute",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>The read that wrote</h1>
  <p>
    ${ATIME_CASES.length} filesystems, one read each. On ${atWriting} of them the read writes an inode, and the
    question each time is which of three tests is true, or what stops the update before anyone gets
    to ask.
  </p>
  <p>
    Since 2009 the default mount option has been <code>relatime</code>, and it updates the access
    time on a read only when one of these holds. The kernel checks them in this order:
  </p>
  <pre><code>mtime is at least as new as atime      the file changed since it was last read
ctime is at least as new as atime      the inode changed since it was last read
the stored atime is a day old or more  once a day, whatever else is true</code></pre>
  <p>
    The middle one swallows the first. Nothing moves mtime without also moving ctime, and
    <code>utimes</code>, which sets mtime to whatever you like, sets ctime to now, so ctime is never
    older than mtime on a real inode. Measured: a chmod, which moves ctime alone, made the next read
    write, with mtime left 25 hours old.
  </p>
  <p>
    The day rule, isolated on a file nothing had touched: <code>/usr/lib/file/magic.mgc</code>, atime
    494.23 hours old, mtime 21671.60 hours old, so the first two tests both said no. One read moved
    atime 494 hours forward. A second read, seconds later, moved nothing. Same file, same reader; the
    only thing that differed was how old the stored atime was.
  </p>
  <p>
    What that costs a workload that only reads: 1059 files under <code>/usr/share/doc</code>, none of
    them read that day, dirtied 1059 inodes. The same 1059, read again, dirtied none. Directories are
    charged the same way and separately, one per listing: the subdirectories of <code>/usr/src</code>,
    <code>/var/cache</code> and <code>/usr/libexec</code> moved 1, 8 and 6 access times on a single
    pass, while the 33 under <code>/usr/lib/x86_64-linux-gnu</code>, listed once already that hour,
    moved none.
  </p>
  <p>
    Four things stop the update whatever the three tests say:
  </p>
  <pre><code>the A flag on the inode     chattr +A, and lsattr prints it
noatime on the mount        nothing under it records a read
nodiratime on the mount     directories only; files still record
a read-only mount           the decision is made, then refused</code></pre>
  <p>
    That last one is worth stating plainly. On <code>/opt/claude-code/bin/claude</code>, an ext4
    image mounted <code>ro,relatime</code>, atime equalled mtime and ctime was 29 hours newer, so all
    three tests said update. Reading it moved nothing. <code>atime_needs_update</code> says yes and
    then <code>touch_atime</code> asks the mount for write access and is told no.
  </p>
  <p>
    And the reason any of this matters outside a profiler. An access time frozen by noatime does not
    read as missing. It reads as old. A file with the per-inode flag set, backdated 40 days and then
    read 200 times in a row, still reported an access time 40.0 days old, and a cleanup rule of "not
    accessed in 30 days" selects it while it is being read 200 times a minute.
  </p>
  <h2>What each filesystem does with one read</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Mount</th><th>Read</th><th>mtime rule</th><th>ctime rule</th><th>day rule</th><th>Blocked by</th><th>Writes</th><th>atime after</th><th>Inodes a pass dirties</th></tr>
    </thead>
    <tbody>
${ATIME_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${esc(`${s.readOnly ? "ro" : "rw"},${s.mountOption}`)}</td><td>${esc(s.target)}</td>` +
    `<td>${atMtime(s) ? "yes" : "no"}</td><td>${atCtime(s) ? "yes" : "no"}</td><td>${atDay(s) ? "yes" : "no"}</td>` +
    `<td>${esc(atBlocked(s) === "" ? "nothing" : atBlocked(s))}</td><td>${atUpdates(s) ? `yes, ${esc(atReason(s))}` : "no"}</td>` +
    `<td>${esc(atAge(atAfter(s)))}</td><td>${atDirtied(s)}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${ATIME_CASES.map((item) => {
  const right = atCorrect(item);
  const s = item.setup;
  const stat = atStat(s).map((line) => `${line.name.padEnd(16)} ${line.value.padStart(22)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(stat)}

# a pass over this tree reads ${s.filesInPass} files, ${s.filesFreshInPass} of them already read today</code></pre>
    <p>Of relatime's three tests, ${atFiring(s)} ${atFiring(s) === 1 ? "is" : "are"} true here. ${atBlocked(s) === "" ? `Nothing blocks the update, so the read ${atUpdates(s) ? `writes, by the ${esc(atReason(s))} rule` : "writes nothing"}.` : `The update is blocked by ${esc(atBlocked(s))}, so the read writes nothing.`} Afterwards the stored access time is ${esc(atAge(atAfter(s)))}, which a rule of "not accessed in ${s.cleanupDays} days" ${atSelected(s) ? "selects" : "leaves alone"}.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-read-that-wrote-a-thousand-inodes", "The read that wrote a thousand inodes"], ["/free", "Two hundred megabytes free"], ["/space", "No space left on device"]])}
</main>`,
  });

  // ── Nagle and the delayed acknowledgement ──
  /*
    The static body carries the four fixes and which one does nothing,
    because the search that brings people here is a flat 40 ms floor on a
    local call, and the thing they need is the list of changes with the
    popular wrong one crossed off.
  */
  const ngStalling = NAGLE_CASES.filter((item) => ngStalls(item.setup)).length;
  const ngDescription =
    "Splitting one eight byte write into two took a loopback round trip from 0.05 ms to 44.48 ms, " +
    "measured. Nagle will not send a segment smaller than one MSS while anything is " +
    "unacknowledged, so the second write is held; the receiver will not acknowledge straight away, " +
    "because an acknowledgement on its own carries nothing; and the two of them deadlock until a " +
    "timer fires. Both ends are behaving correctly. TCP_NODELAY on the end that reads, which is the " +
    `first thing people try, changed nothing: 44.05 ms. ${NAGLE_CASES.length} connections here, ` +
    `${ngStalling} of them stalling.`;

  await writePage("nagle", base, {
    title: "Eight Bytes, Forty Four Milliseconds: Nagle and the Delayed ACK | Max Doubin",
    description: ngDescription,
    canonical: `${SITE_URL}/nagle`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Eight bytes, forty four milliseconds",
  description: ngDescription,
  url: `${SITE_URL}/nagle`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why an application that writes a small header and then a small body before reading the reply hits a fixed latency floor of tens of milliseconds even over loopback: that Nagle's algorithm holds any segment smaller than one MSS while there is unacknowledged data outstanding, so the first write leaves and the second waits; that the receiver has only part of a request, cannot answer, and delays its acknowledgement because an acknowledgement on its own carries no data; that both ends are therefore behaving correctly and the pair deadlocks until the delayed acknowledgement timer fires, measured at 40.89 to 49.89 ms with a median of 44.03 on one host rather than the 40 ms everybody quotes; that the cost is one timer per round trip however many writes follow the first, because they all join the same held segment, measured at 44.35, 44.15 and 44.02 ms for two, three and eight writes; that TCP_NODELAY on the socket that is reading does nothing, because the option governs that socket's own sends, measured at 44.05 ms with it set; that TCP_NODELAY on the sender, TCP_QUICKACK on the receiver, or simply handing the socket everything in one call each remove it; and that the damage is the ratio between the timer and the link, so the bug is worst exactly where the network is fastest",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Eight bytes, forty four milliseconds</h1>
  <p>
    ${NAGLE_CASES.length} connections, one round trip each. ${ngStalling} of them wait on a timer, and on none of
    them is anything wrong with the network, the server, or the amount of data.
  </p>
  <p>
    Here is the whole of it, measured over loopback with a client and a server in one process. Each
    figure is the median of at least thirty round trips:
  </p>
  <pre><code>one write of 8 bytes, then read       0.05 ms    stalled  0/40
two writes of 4 bytes, then read     44.48 ms    stalled 39/40
the same two writes, TCP_NODELAY      0.05 ms    stalled  0/40
the same 8 bytes in one write         0.05 ms    stalled  0/40</code></pre>
  <p>
    The same eight bytes, to the same process, over no network at all, nine hundred times slower
    because the application called <code>send</code> twice instead of once.
  </p>
  <p>
    Nagle's algorithm will not send a segment smaller than one MSS while there is unacknowledged
    data outstanding. The first write has nothing outstanding and leaves at once. The second is
    small, and now something is outstanding, so the sender holds it. Meanwhile the receiver has half
    a request, cannot answer it, and delays its acknowledgement, because an acknowledgement on its
    own carries nothing and there may be data along shortly to carry it. Each side is correct. The
    pair is deadlocked.
  </p>
  <h2>One timer, not one per write</h2>
  <p>
    This is the part people get wrong when they estimate what it costs. Every write after the first
    is appended to the same held segment, so the price is one timer however many there are:
  </p>
  <pre><code>two writes     44.35 ms
three writes   44.15 ms
eight writes   44.02 ms</code></pre>
  <h2>Which changes work, and the one that does not</h2>
  <pre><code>TCP_NODELAY on the SENDER              0.05 ms    stalled  0/30
TCP_QUICKACK on the receiver           0.05 ms    stalled  0/30
one write instead of two               0.05 ms    stalled  0/30
TCP_NODELAY on the RECEIVER           44.05 ms    stalled 29/30</code></pre>
  <p>
    The last line is the one worth keeping. <code>TCP_NODELAY</code> is per socket and governs that
    socket's own sends, so setting it on the end that is reading does nothing about the end that is
    holding data, and it is the first thing almost everybody tries. If the sender is a binary you
    cannot change, <code>TCP_QUICKACK</code> on your own socket breaks the other half of the
    deadlock, and it has to be set again before every read because Linux clears it on its own.
  </p>
  <h2>Worst where the network is fastest</h2>
  <p>
    The timer is a fixed forty four milliseconds and the link is not, so the damage is the ratio
    between them. On loopback that is 881 times. Thirty milliseconds away it is 2 times, which is
    slow but not obviously broken. That is why this survives testing against a remote service and
    only bites once something moves next door.
  </p>
  <h2>What the timer actually is</h2>
  <p>
    Everybody writes forty milliseconds. Over fifty nine stalls on this host the timer ran 40.89 ms
    at its shortest, 44.03 ms at the median and 49.89 ms at its longest.
  </p>
  <h2>What each connection does</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Connection</th><th>Writes</th><th>Bytes</th><th>Sender NODELAY</th><th>Receiver NODELAY</th><th>Receiver QUICKACK</th><th>Timers</th><th>Round trip</th><th>Per second</th><th>Slower by</th></tr>
    </thead>
    <tbody>
${NAGLE_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${esc(s.writes.join(" + "))}</td><td>${ngBytes(s)}</td>` +
    `<td>${s.nodelaySender ? "on" : "off"}</td><td>${s.nodelayReceiver ? "on" : "off"}</td><td>${s.quickackReceiver ? "on" : "off"}</td>` +
    `<td>${ngTimers(s)}</td><td>${esc(ngUs(ngUsTrip(s)))}</td><td>${ngRps(s)}</td><td>${ngSlow(s)}x</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${NAGLE_CASES.map((item) => {
  const right = ngCorrect(item);
  const s = item.setup;
  const sock = ngSocket(s).map((line) => `${line.name.padEnd(24)} ${line.value.padStart(18)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(sock)}

# the delayed acknowledgement on this host: ${s.delayedAckMs} ms</code></pre>
    <p>${ngStalls(s) ? `This round trip waits one timer: ${esc(ngUs(s.baseUs))} of work and ${s.delayedAckMs} ms of nothing, so ${esc(ngUs(ngUsTrip(s)))} in total, ${ngSlow(s)} times what the link can do and ${ngRps(s)} round trips a second against ${ngRps(ngApplying(s, "one-write"))} unheld.` : `This round trip waits no timer: ${esc(ngUs(ngUsTrip(s)))}, which is the link on its own.`} Over ${s.requests} of them that is ${ngTotal(s)} ms against ${ngTotal(ngApplying(s, "one-write"))} ms.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/eight-bytes-forty-four-milliseconds", "Eight bytes, forty four milliseconds"], ["/rcvbuf", "Tuned smaller"], ["/transfer", "Why the transfer is slow"]])}
</main>`,
  });

  // ── the exec argument budget ──
  /*
    The static body carries the formula and the per-string cap, because the
    search that brings people here is "argument list too long" next to a byte
    count that looks like it should fit, and what answers it is the nine bytes
    an argument costs beyond its length.
  */
  const amRefusedCount = ARGMAX_CASES.filter((item) => !amFits(item.setup)).length;
  const amDescription =
    "getconf ARG_MAX reports two megabytes and it is not a constant: it is a quarter of " +
    "RLIMIT_STACK, and lowering the stack lowers it. Every string in argv and envp costs eight " +
    "bytes of pointer and a terminator on top of its own bytes, so a two megabyte budget carries " +
    "about four hundred kilobytes of short filenames. The environment is charged to the same " +
    "budget, and the program path is charged twice. A single string of 32 pages or more is " +
    `refused whatever the total. ${ARGMAX_CASES.length} command lines here, ${amRefusedCount} refused, ` +
    "against twenty three measurements on one host.";

  await writePage("argmax", base, {
    title: "Argument List Too Long, and the Limit Is Not ARG_MAX | Max Doubin",
    description: amDescription,
    canonical: `${SITE_URL}/argmax`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Argument list too long",
  description: amDescription,
  url: `${SITE_URL}/argmax`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why execve returns E2BIG on a command line whose bytes are well inside ARG_MAX: that getconf ARG_MAX reports a quarter of RLIMIT_STACK rather than a constant, so raising or lowering the stack limit moves it, measured across four stack limits; that every string in argv and in envp costs eight bytes of pointer and a NUL terminator on top of its own length, so a forty byte path costs forty nine and a two megabyte budget carries only about four hundred kilobytes of short filenames; that the environment is copied onto the same new stack and charged to the same budget, so a build runner exporting a megabyte of variables halves the command line for everything it runs and env -i really does help; that the program path is charged twice, once as the filename execve copies in its own right and once as argv[0]; that a single string of 131072 bytes or more is refused on its own whatever the total, bisected to the byte; and how to size batches from the cost of an argument rather than from the length of the text",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Argument list too long</h1>
  <p>
    ${ARGMAX_CASES.length} command lines, one exec each. ${amRefusedCount} of them are refused, and on none of them is the
    number people check the number that matters.
  </p>
  <p>
    Start with what the system reports. On the host these were measured on:
  </p>
  <pre><code>getconf ARG_MAX      2097152
RLIMIT_STACK soft    8388608   (8 MiB)
page size            4096</code></pre>
  <p>
    The first is the second divided by four. <code>getconf</code> is not printing a constant, it is
    printing a quarter of your stack limit, and it follows the limit: 2 MiB of stack fitted 7181
    arguments of 64 bytes, 4 MiB fitted 14363, 8 MiB fitted 28727 and 16 MiB fitted 57455.
  </p>
  <h2>An argument costs more than it is long</h2>
  <p>
    Every string costs its own bytes, a NUL, and eight bytes of pointer in the array. On short
    arguments the pointer is most of the cost:
  </p>
  <pre><code>argument size    arguments that fit    bytes of actual text
            1               208840                  417680
            8               122847                 1105623
           64                28608                 1859520
         1024                 2021                 2069504</code></pre>
  <p>
    So a limit advertised as two megabytes carries four hundred kilobytes of short filenames. That
    is the difference between "my list is only 600 KB, it should fit" and the error you get.
  </p>
  <h2>The environment comes out of the same budget</h2>
  <pre><code>env strings    env vars    64 byte arguments that fit
         28           2                         28727
     500074          11                         21876
    1000144          21                         15024</code></pre>
  <p>
    argv and envp are copied onto the same new stack and charged against the same number, which is
    why <code>env -i</code> really does let a command line through that failed a moment earlier, and
    why an identical script fails in a build runner and works on a laptop.
  </p>
  <h2>One string can fail on its own</h2>
  <pre><code>longest single argument that execs    131071 bytes
32 pages                              131072 bytes</code></pre>
  <p>
    That is MAX_ARG_STRLEN. It is not tunable, it applies to environment variables too, and it is
    checked whatever the total is: a single 500 KB variable made every exec fail regardless of how
    short the command line was.
  </p>
  <h2>And the program path is charged twice</h2>
  <p>
    This one is not in any documentation I could find. execve copies <code>bprm->filename</code>
    onto the new stack in its own right, and then copies the caller's argv, which begins with the
    same path. Both copies are charged. It turned up as a discrepancy: a formula without it fit
    nineteen measurements and missed four by exactly one argument, and the size of the miss tracked
    the length of argv[0]. Holding the argument count fixed and lengthening argv[0] a byte at a time
    put the wall at 175 bytes, where the vector lands on the budget exactly.
  </p>
  <h2>The formula</h2>
  <pre><code>budget = RLIMIT_STACK / 4
cost   = sum over argv and envp of (8 + length + 1)
         plus the program path and its NUL, a second time
E2BIG when cost > budget, or when any one string is 131072 or longer</code></pre>
  <p>
    Twenty three measurements reproduce exactly, each leaving less than one more argument of room.
  </p>
  <h2>What each command line does</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Stack</th><th>Budget</th><th>Arguments</th><th>Each costs</th><th>Environment</th><th>Total</th><th>Result</th><th>Fit at this length</th><th>Text that carries</th></tr>
    </thead>
    <tbody>
${ARGMAX_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${esc(amBytes(s.stackBytes))}</td><td>${amBudget(s)}</td>` +
    `<td>${s.argCount} x ${s.argBytes} B</td><td>${amPerArg(s)} B</td><td>${amEnv(s)} B</td><td>${amTotal(s)}</td>` +
    `<td>${amFits(s) ? "execs" : "E2BIG"}</td><td>${amMax(s)}</td><td>${esc(amBytes(amText(s)))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${ARGMAX_CASES.map((item) => {
  const right = amCorrect(item);
  const s = item.setup;
  const limits = amLimits(s).map((line) => `${line.name.padEnd(23)} ${line.value.padStart(16)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(limits)}</code></pre>
    <p>The vector costs ${amTotal(s)} bytes against a budget of ${amBudget(s)}, of which ${amEnv(s)} is the environment and ${amProg(s)} is the program path charged twice. ${amFits(s) ? `It execs, with ${amSpare(s)} bytes to spare.` : `It is E2BIG, refused by ${esc(amRefused(s))}.`} At ${s.argBytes} bytes an argument the budget holds ${amMax(s)} of them, carrying ${esc(amBytes(amText(s)))} of text, and ${amShare(s)} percent of each argument is the ${AM_PTR} byte pointer. The per-string cap is ${AM_CAP} and the longest string here is ${s.longestStringBytes}.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/argument-list-too-long-and-the-limit-is-not-arg-max", "Argument list too long, and the limit is not ARG_MAX"], ["/inotify", "No space left"], ["/limits", "Too many open files"]])}
</main>`,
  });

  // ── the symlink traversal budget ──
  /*
    The static body leads with "there is no loop", because the search that
    brings people here is the error next to a path they have already checked
    by hand for cycles, and the answer is that the kernel never looked.
  */
  const elRefused = ELOOP_CASES.filter((item) => !elOk(item.setup)).length;
  const elDescription =
    "ELOOP, too many levels of symbolic links, is one budget of forty traversals for the whole " +
    "path resolution rather than per chain or per component: measured at three separate splits " +
    "across three symlinked components, every one flipping between exactly 40 and 41. There is no " +
    "cycle detection at all, so a two link cycle and a forty one link straight chain return the " +
    "identical error, and O_NOFOLLOW returns it too. readlink and lstat still work past the wall " +
    `because they do not follow the last component. ${ELOOP_CASES.length} paths here, ${elRefused} refused.`;

  await writePage("eloop", base, {
    title: "Too Many Levels of Symbolic Links, With No Loop | Max Doubin",
    description: elDescription,
    canonical: `${SITE_URL}/eloop`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "There is no loop",
  description: elDescription,
  url: `${SITE_URL}/eloop`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why a path containing no cycle reports ELOOP, too many levels of symbolic links: that the kernel allows forty symlink traversals for the whole path resolution rather than per chain or per component, so three symlinked components of fourteen, fourteen and thirteen fail while fourteen, thirteen and thirteen succeed, and a deployment that is shallow everywhere can still cross the line; that Linux performs no cycle detection in path resolution at all, so a two link cycle is caught by the same counter as a long chain and is indistinguishable from it in the error; that the walk stops the moment the counter is spent rather than finishing the chain, so a path asking for forty four traversals performs forty one; that O_NOFOLLOW reports the same errno for a third reason entirely, refusing a final component that is a symlink; and that readlink and lstat work past the wall because they do not follow the final component, while still paying for every symlink in the directories leading to it",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>There is no loop</h1>
  <p>
    ${ELOOP_CASES.length} paths, one resolution each. ${elRefused} of them fail, and not one of them contains a cycle
    except the one that is a cycle on purpose.
  </p>
  <p>
    <em>Too many levels of symbolic links</em> is errno 40, and the limit is forty traversals. The
    two forties are unrelated and remembering one gets you the other.
  </p>
  <h2>One budget, for the whole path</h2>
  <p>
    This is the part that decides how to think about it. The forty is not per chain and not per
    component: it is a counter for the entire resolution, and every symlinked component draws on it.
    Measured across three symlinked components, at three different splits, each flipping between
    exactly 40 and 41:
  </p>
  <pre><code>13 + 13 + 13 = 39   opens
14 + 13 + 13 = 40   opens
14 + 14 + 13 = 41   ELOOP
20 + 10 + 10 = 40   opens
20 + 11 + 10 = 41   ELOOP
38 +  1 +  1 = 40   opens
38 +  2 +  1 = 41   ELOOP</code></pre>
  <p>
    So a release path that walks a symlinked mount point, a symlinked data directory inside it and
    the usual current pointer can be nowhere near forty in any one place and still be over it.
  </p>
  <h2>There is no cycle detection</h2>
  <pre><code>cycA -&gt; cycB -&gt; cycA        errno 40, ELOOP
a chain of 41, no cycle     errno 40, ELOOP</code></pre>
  <p>
    The kernel does not notice it is going round. It counts, and the count runs out, and a cycle is
    caught for exactly the same reason a long chain is. The name of the error is about the shape it
    was written for, not the thing that was checked, so ELOOP on a path you are sure has no loop in
    it is the ordinary case rather than a contradiction.
  </p>
  <h2>O_NOFOLLOW returns it too</h2>
  <pre><code>one link, plain open                opens
the same link with O_NOFOLLOW       errno 40, ELOOP</code></pre>
  <p>
    One errno, three situations: the budget ran out, the walk went round, or you asked not to
    follow and it was a link. So ELOOP in a log says nothing about depth on its own.
  </p>
  <h2>What still works past the wall</h2>
  <p>
    At a chain of 45:
  </p>
  <pre><code>open()       ELOOP
stat()       ELOOP
readlink()   returns the next link
lstat()      reports a symlink</code></pre>
  <p>
    readlink and lstat are about the link rather than what it points at, so they stop at the final
    component instead of following it. They still resolve every symlink in the directories leading
    up to it, which is the part that gets missed when lstat is reached for as a workaround: the
    exemption is one component wide.
  </p>
  <h2>What each path does</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Call</th><th>Follows the last</th><th>Leading</th><th>Last component</th><th>Asked for</th><th>Performed</th><th>Left</th><th>Result</th><th>Because</th></tr>
    </thead>
    <tbody>
${ELOOP_CASES.map((item) => {
  const s = item.setup;
  const asked = elAsked(s);
  return `      <tr><td>${esc(s.host)}</td><td>${esc(s.call)}${s.noFollow ? ", O_NOFOLLOW" : ""}</td><td>${elFollows(s) ? "yes" : "no"}</td>` +
    `<td>${s.leadingHops}</td><td>${s.cyclicFinal ? `${s.finalHops}, a cycle` : String(s.finalHops)}</td>` +
    `<td>${asked === Number.POSITIVE_INFINITY ? "unbounded" : asked}</td><td>${elSpent(s)}</td><td>${elLeft(s)}</td>` +
    `<td>${elOk(s) ? "resolves" : "ELOOP"}</td><td>${esc(elReason(s))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${ELOOP_CASES.map((item) => {
  const right = elCorrect(item);
  const s = item.setup;
  const lines = elWalk(s).map((line) => `${line.name.padEnd(21)} ${line.value.padStart(18)}  # ${line.unit}`).join("\n");
  const asked = elAsked(s);
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(lines)}</code></pre>
    <p>${esc(elResult(s))}. The path asks for ${asked === Number.POSITIVE_INFINITY ? "an unbounded number of traversals, which is what a cycle is" : `${asked} traversals`} and the walk performs ${elSpent(s)} of a budget of ${EL_MAX}, leaving ${elLeft(s)}. ${elOk(s) ? "" : `The reason is ${esc(elReason(s))}.`}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/eloop-does-not-mean-there-is-a-loop", "ELOOP does not mean there is a loop"], ["/argmax", "Argument list too long"], ["/permissions", "Permission denied"]])}
</main>`,
  });

  // ── the atomic write size ──
  /*
    The static body leads with the number, because the search that brings
    people here is a log line with another log line inside it and the thing
    they need is 4096 and what it does and does not cover.
  */
  const pbTorn = PIPEBUF_CASES.filter((item) => pbTears(item.setup)).length;
  const pbDescription =
    "A write of PIPE_BUF bytes or fewer, which is 4096 on Linux, is never interleaved with another " +
    "writer's, and that held here even beside writers three and fifty times the size tearing " +
    "themselves apart. Above it there is no guarantee and what happens depends on the company: " +
    "four writers at 8192 on a 65536 byte pipe tore nothing because 8192 divides the capacity, and " +
    "adding one 5000 byte writer made all four of them tear without a line of their code changing. " +
    `${PIPEBUF_CASES.length} pipes here, ${pbTorn} where the writer in question can be torn.`;

  await writePage("pipebuf", base, {
    title: "Two Writers, One Line: PIPE_BUF and Interleaved Writes | Max Doubin",
    description: pbDescription,
    canonical: `${SITE_URL}/pipebuf`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Two writers, one line",
  description: pbDescription,
  url: `${SITE_URL}/pipebuf`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why a log line comes out with another log line inside it when several processes write to one pipe: that a write of PIPE_BUF bytes or fewer, 4096 on Linux, is never interleaved with another and that this holds regardless of what else is on the pipe, measured with 512 and 4096 byte writers beside 20000 byte ones that were tearing constantly; that above PIPE_BUF there is no guarantee at all, so 4097 bytes is not marginally worse than 4096 but categorically different; that records which divide the pipe capacity exactly happen not to tear, because the pipe never fills part way through one, and that this is arithmetic rather than a promise and is destroyed by a single writer using any other size; that F_SETPIPE_SZ rounds a request up to a power of two and refuses anything over fs.pipe-max-size with EPERM, so the capacity your alignment depends on may not be the one you asked for; and that a regular file opened O_APPEND did not interleave at any size measured, because Linux holds the inode lock for a buffered write, which is why redirecting to a file behaves where piping through tee does not",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Two writers, one line</h1>
  <p>
    ${PIPEBUF_CASES.length} pipes, one writer in question each. On ${pbTorn} of them that writer's records can come out
    with somebody else's bytes in the middle.
  </p>
  <p>
    The number is <strong>${PB_BUF}</strong>. A write of PIPE_BUF bytes or fewer is never interleaved with
    another writer's, and that is a guarantee rather than an observation. Measured, with four
    writers on one pipe sending 200 records each:
  </p>
  <pre><code>three at 4096 with one at 5000    the 4096 writers: 200 of 200 whole, every run
two at 4096 with two at 20000     the 4096 writers: 200 of 200 whole, every run
one at 512 with three at 20000    the 512 writer:   200 of 200 whole, every run</code></pre>
  <p>
    The large writers in those runs were losing records constantly. It made no difference to the
    small ones. The guarantee is per write, not per pipe.
  </p>
  <h2>Above it there is nothing gradual</h2>
  <pre><code>size 4096    0, 0, 0 torn        divides 65536
size 4097    84, 81, 76
size 5000    103, 78, 72
size 8192    0, 0, 0 torn        divides 65536
size 8193    125, 125, 139
size 12288   146, 136, 132
size 16384   0, 0, 0 torn        divides 65536
size 20000   354, 311, 354
size 32768   0, 0, 0 torn        divides 65536</code></pre>
  <p>
    One byte over the limit is not one byte worse. And look at the pattern in the clean rows: every
    size that divides the 65536 capacity exactly tore nothing, three runs out of three. A writer is
    only interrupted part way through a record if the pipe fills part way through one, and if the
    capacity is a whole number of records it never does.
  </p>
  <h2>That safety survives nothing</h2>
  <pre><code>four writers at 8192                 0, 0, 0 torn
three at 8192 and one at 5000        the 8192 writers lost 6, 6 and 14</code></pre>
  <p>
    Not a line of the 8192 writers' code changed. The thing keeping them whole was that the pipe
    always filled on a record boundary, and one writer with a different size means it no longer
    does. This is the shape of the real bug: it works in testing, it works in staging, and it breaks
    the week somebody adds a second logger.
  </p>
  <h2>And the capacity may not be the one you asked for</h2>
  <pre><code>asked      granted
    1         4096
 4097         8192
40000        65536
65537       131072
1048576    1048576
2097152    refused, EPERM</code></pre>
  <p>
    F_SETPIPE_SZ rounds up to a power of two and refuses anything over fs.pipe-max-size. Since the
    capacity is what your record sizes have to divide into, an operator who asks for one number and
    gets another has changed the alignment without knowing it.
  </p>
  <h2>A file is not a pipe</h2>
  <p>
    On a regular file opened O_APPEND, nothing tore at any size measured, including 200000 byte
    records beside 512 byte ones: every writer, 200 of 200 whole. Linux holds the inode lock for the
    length of a buffered write. That is a measurement of this kernel and this filesystem rather than
    a promise, and it is not true over NFS, but it is the difference between
  </p>
  <pre><code>myapp &gt;&gt; app.log            one file, and it held here
myapp 2&gt;&amp;1 | tee app.log    a pipe, and above 4096 it does not</code></pre>
  <h2>What each pipe does</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Target</th><th>Capacity</th><th>Writers</th><th>In question</th><th>Under PIPE_BUF</th><th>All one size</th><th>Divides</th><th>Torn</th><th>At risk</th></tr>
    </thead>
    <tbody>
${PIPEBUF_CASES.map((item) => {
  const s = item.setup;
  const mine = s.writers[s.underTest];
  return `      <tr><td>${esc(s.host)}</td><td>${esc(s.target)}</td><td>${s.target === "pipe" ? s.capacity : "n/a"}</td>` +
    `<td>${esc(s.writers.join(", "))}</td><td>${mine}</td><td>${pbGuaranteed(mine) ? "yes" : "no"}</td>` +
    `<td>${pbUniform(s) ? "yes" : "no"}</td><td>${s.target === "pipe" ? (pbAligns(s) ? "yes" : "no") : "n/a"}</td>` +
    `<td>${pbTears(s) ? "can be torn" : "whole"}</td><td>${pbRisk(s)} of ${s.writers.length}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${PIPEBUF_CASES.map((item) => {
  const right = pbCorrect(item);
  const s = item.setup;
  const lines = pbSetup(s).map((line) => `${line.name.padEnd(21)} ${line.value.padStart(20)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(lines)}</code></pre>
    <p>${pbTears(s) ? "This writer's records can be torn" : "This writer's records come out whole"}, because ${esc(pbBecause(s))}. ${s.target === "pipe" ? `${pbRisk(s)} of the ${s.writers.length} writers on this pipe are at risk${s.writers.map((size, i) => pbTearsAt(s, i) ? `${i}` : null).filter(Boolean).length ? ` (writer${pbRisk(s) === 1 ? " " : "s "}${s.writers.map((_, i) => pbTearsAt(s, i) ? i : null).filter((v) => v !== null).join(", ")})` : ""}.` : "Nothing on a file tore at any size measured here."} ${pbRefused(s.requested) ? `The resize to ${s.requested} was refused with EPERM and the pipe stayed at ${s.capacity}.` : s.requested !== pbGranted(s.requested) ? `A request for ${s.requested} was rounded up to ${pbGranted(s.requested)}.` : ""}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-log-line-with-another-log-line-inside-it", "The log line with another log line inside it"], ["/writeback", "Not written down"], ["/nagle", "Eight bytes, forty four milliseconds"]])}
</main>`,
  });

  // ── umask ──
  /*
    The static body carries the grid, because the search that brings people
    here is the same program producing a different mode on two hosts, and the
    answer is a table of mode against umask. The second table is the one that
    surprises: the three bits the mask cannot reach at all.
  */
  const umNarrowed = UMASK_CASES.filter((item) => umMasked(item.setup)).length;
  const umDescription =
    "The mode a program passes to open() is a maximum the umask lowers and nothing raises, so a " +
    "program asking for 0600 produces 0600 under every umask measured and one asking for 0666 " +
    "produces 0644, 0664 or 0600 depending on the host. A umask is nine bits and a mode is twelve, " +
    "so 6777 under a umask of 0777 leaves a setuid setgid file with no ordinary permissions at all. " +
    `${UMASK_CASES.length} creations here, ${umNarrowed} the mask narrows.`;

  await writePage("umask", base, {
    title: "A Ceiling, Not A Request: umask And File Modes | Max Doubin",
    description: umDescription,
    canonical: `${SITE_URL}/umask`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "A ceiling, not a request",
  description: umDescription,
  url: `${SITE_URL}/umask`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why the same program writes a differently permissioned file on two hosts: that the mode argument to open() and mkdir() is a ceiling and the umask is mode AND NOT umask, measured across thirty six combinations for files and six for directories with no exceptions; that a umask can only ever clear, so a program that asks for 0600 is 0600 under every umask while one that asks for 0666 is at the mercy of the environment; that a umask is nine bits and a mode is twelve, so the setuid, setgid and sticky bits pass through untouched and a umask of 0777 leaves 6000 behind; that chmod does not consult the umask at all, so a script that chmods after writing undoes whatever the umask was for; that a setgid parent directory changes the group of what is created and leaves the mode to the umask; and that a directory inherits the setgid bit itself while a file does not",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>A ceiling, not a request</h1>
  <p>
    ${UMASK_CASES.length} files and directories, one question each. On ${umNarrowed} of them the umask takes something away that
    the program asked for, and on the rest it does nothing at all.
  </p>
  <h2>The arithmetic is mode and not umask</h2>
  <pre><code>asked  0000  0022  0002  0077  0027  0777
 0666  0666  0644  0664  0600  0640  0000
 0777  0777  0755  0775  0700  0750  0000
 0600  0600  0600  0600  0600  0600  0000
 0644  0644  0644  0644  0600  0640  0000
 0755  0755  0755  0755  0700  0750  0000
 0640  0640  0640  0640  0600  0640  0000</code></pre>
  <p>
    mkdir behaves identically. Look at the 0600 row: a program that asks for exactly what it needs
    is the same on every host, and one that asks for 0666 is not. The mask subtracts and can never
    add, so there is no umask anywhere that widens a mode.
  </p>
  <h2>A umask is nine bits and a mode is twelve</h2>
  <pre><code>asked  0000  0022  0002  0077  0027  0777
 6777  6777  6755  6775  6700  6750  6000</code></pre>
  <p>
    A umask of 0777, which removes every ordinary permission there is, leaves a setuid setgid file
    behind. The mask covers owner, group and other and nothing above them, so it is not a defense
    against those bits and never was.
  </p>
  <h2>And chmod does not consult it</h2>
  <pre><code>umask 0077, open with 0666   ->  0600
then chmod 0666              ->  0666</code></pre>
  <p>
    The mask applies when a file is created and never again, which is why a deploy script that
    chmods after writing quietly undoes the hardening it was deployed alongside.
  </p>
  <h2>A setgid parent moves the group, not the mode</h2>
  <pre><code>parent plain  0777 gid 1    file inside 0644 gid 0    dir inside 0755 gid 0
parent setgid 2777 gid 1    file inside 0644 gid 1    dir inside 2755 gid 1</code></pre>
  <p>
    Measured with the process in group 0. The mode is 0644 either way, so the umask did the same
    work: what moved is the group. And a directory inherits the setgid bit itself, which is how the
    arrangement survives further down the tree, where a file does not.
  </p>
  <h2>What each creation does</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Kind</th><th>Asked</th><th>umask</th><th>Removed</th><th>Created</th><th>Final</th><th>Group</th><th>Executable</th><th>Special bits</th></tr>
    </thead>
    <tbody>
${UMASK_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${esc(s.kind)}</td><td>${umText(s.asked)}</td><td>${umText(s.um)}</td>` +
    `<td>${umRemoved(s) === 0 ? "nothing" : umText(umRemoved(s))}</td><td>${umText(umCreated(s))}</td>` +
    `<td>${umText(umMode(s))}</td><td>${umGid(s)}</td><td>${umExec(s) ? "yes" : "no"}</td>` +
    `<td>${umSpecial(s) ? "yes" : "no"}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${UMASK_CASES.map((item) => {
  const right = umCorrect(item);
  const s = item.setup;
  const lines = umLines(s).map((line) => `${line.name.padEnd(18)} ${line.value.padStart(26)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(lines)}</code></pre>
    <p>It is created ${umText(umCreated(s))}, which is ${esc(umLetters(umCreated(s)))}${s.thenChmod > 0 ? `, and ends up ${umText(umMode(s))} after the chmod` : ""}, owned by group ${umGid(s)}. ${umMasked(s) ? `The umask removed ${esc(umLetters(umRemoved(s)))}.` : "The umask removed nothing, because none of the bits it clears were asked for."} ${umSpecial(s) ? "It carries a bit no umask can reach." : ""} ${s.kind === "directory" && s.parentSetgid ? "The setgid bit was inherited from the parent rather than asked for." : ""}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/a-ceiling-and-not-a-request", "A ceiling and not a request"], ["/permissions", "The bits that decide"], ["/locks", "Three locks, one file"]])}
</main>`,
  });

  // ── proportional set size ──
  /*
    The static body carries the two columns, because the search that brings
    people here is a dashboard adding up RSS and reporting more memory than the
    machine has. The answer is a table of the same processes measured twice, and
    the second table is the one that surprises: a child of a shared mapping with
    an RSS of zero for a region it maps in full.
  */
  const pssGrown = PSS_CASES.filter((item) => pssGrew(item.setup)).length;
  const pssDescription =
    "Four processes sharing one 64 MiB private anonymous mapping report 64 MiB of RSS each, and ps " +
    "adds the column up to 258.2 MiB for 64 MiB of memory, because a page shared four ways is in " +
    "four of those rows at full price. PSS is the same measurement with each page divided by the " +
    "number of processes that map it, and the same four add up to 64.3 MiB. " +
    `${PSS_CASES.length} forks here, ${pssGrown} of which cost a page frame.`;

  await writePage("pss", base, {
    title: "Four Processes, One Copy: RSS, PSS And fork | Max Doubin",
    description: pssDescription,
    canonical: `${SITE_URL}/pss`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Four processes, one copy",
  description: pssDescription,
  url: `${SITE_URL}/pss`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why adding up a column of RSS reports more memory than a machine has: that RSS counts a shared page in full for every process that maps it, so four processes sharing 64 MiB report 256 MiB between them, while PSS divides each page by the number of processes holding it and adds up to the frames that exist; that a read after fork costs nothing at all because fork already put the page in the child's page table, while a write to a private page costs one frame per writing child; that Linux does not copy the page tables of a shared anonymous mapping on fork, so a child's RSS there records what it has touched rather than what it can reach; that which pages the children write moves the charge between processes without changing the total; and that killing one of four sharers raises the survivors' PSS with nothing allocated and nothing freed",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Four processes, one copy</h1>
  <p>
    ${PSS_CASES.length} mappings, one question each. On ${pssGrown} of them something that happened after the fork cost the
    machine a page frame, and on the rest nothing did.
  </p>
  <h2>The same four processes, measured twice</h2>
  <pre><code>  PID    RSS    PSS COMMAND
 3295  66948  16492 hold
 3297  65828  16435 hold
 3298  65828  16435 hold
 3299  65828  16435 hold

sum of RSS   264432 kB   258.2 MiB
sum of PSS    65794 kB    64.3 MiB</code></pre>
  <p>
    One 64 MiB private anonymous mapping, touched in full by the parent and then forked three ways.
    RSS is not wrong about any one of those rows: each of those processes really can reach 64 MiB
    of resident pages. It is wrong the moment you add two of them together, because the same page
    frame is in both at full price. PSS is the same measurement with each page divided by the
    number of processes that map it, which is the only reason it exists.
  </p>
  <h2>A read costs nothing and a write costs a page</h2>
  <pre><code>what each child did          RSS each   PSS each   anonymous pages
nothing                         65536      16384             65536
read 16 MiB                     65536      16384             65536
wrote 16 MiB                    65536      28672            114688</code></pre>
  <p>
    Reading changed nothing, because fork had already put those pages in the child's page table and
    there was nothing left to fault. Writing copied them, once per child, and the 48 MiB that
    appeared is the only new memory in the exercise. RSS reports 64 MiB in all three rows and
    cannot tell them apart.
  </p>
  <h2>A shared mapping forks differently</h2>
  <pre><code>children touched nothing     parent 65536 /  65536    child     0 /    0
children read 16 MiB each    parent 65536 /  53248    child 16384 / 4096</code></pre>
  <p>
    A child that touched nothing has an RSS of zero for a region it maps in full. Linux does not
    copy the page tables of a shared anonymous mapping on fork, because a fault can fill them in
    correctly later, so a child's RSS here records what it has touched since rather than what it
    can reach.
  </p>
  <h2>Killing a process raises everybody else's</h2>
  <pre><code>before   16384 kB each, four processes
after    21845 kB each, three processes</code></pre>
  <p>
    Nothing was allocated and nothing was freed. The divisor changed. A graph of one process's PSS
    during a rolling restart steps up as the old workers exit, and nothing leaked.
  </p>
  <h2>What each fork costs</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Mapping</th><th>Flags</th><th>Processes</th><th>Parent RSS</th><th>Child RSS</th><th>Parent PSS</th><th>Child PSS</th><th>RSS summed</th><th>PSS summed</th><th>Frames</th></tr>
    </thead>
    <tbody>
${PSS_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${pssMib(pssPagesMib(s.pages))}</td><td>${s.kind === "private" ? "MAP_PRIVATE" : "MAP_SHARED"}</td>` +
    `<td>${1 + pssAlive(s)}</td><td>${pssMib(pssPagesMib(pssRssParent(s)))}</td><td>${pssMib(pssPagesMib(pssRssChild(s)))}</td>` +
    `<td>${pssMib(pssKibMib(pssParentKib(s)))}</td><td>${pssMib(pssKibMib(pssChildKib(s)))}</td>` +
    `<td>${pssMib(pssPagesMib(pssRssSum(s)))}</td><td>${pssMib(pssKibMib(pssSumKib(s)))}</td><td>${pssMib(pssPagesMib(pssFrames(s)))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${PSS_CASES.map((item) => {
  const right = pssCorrect(item);
  const s = item.setup;
  const lines = pssLines(s).map((line) => `${line.name.padEnd(18)} ${line.value.padStart(29)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(lines)}</code></pre>
    <p>The RSS column adds up to ${pssMib(pssPagesMib(pssRssSum(s)))}, the PSS column to ${pssMib(pssKibMib(pssSumKib(s)))}, and ${pssMib(pssPagesMib(pssFrames(s)))} of page frames exist. ${pssGrew(s) ? `The ${pssMib(pssPagesMib(pssFrames(s)) - pssPagesMib(s.pages))} above the mapping is what the writes copied.` : "Nothing that happened after the fork cost a single frame."}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-sum-of-rss-is-not-an-amount-of-memory", "The sum of RSS is not an amount of memory"], ["/free", "Two hundred megabytes free"], ["/overcommit", "Half a machine"]])}
</main>`,
  });

  // ── sparse files ──
  /*
    The static body carries the tool table, because the search that brings
    people here is a backup that filled a disk the original fitted on, and the
    answer is which of six tools preserves a hole. The second table is the one
    that surprises: dd conv=sparse gives the holes back at its own block size.
  */
  const spHoled = SPARSE_CASES.filter((item) => spSparse(item.setup)).length;
  const spDescription =
    "A file can be a gigabyte long and occupy four kilobytes, because a hole is a range nobody " +
    "wrote: ls reports the length and du reports the blocks, and on a preallocated image those " +
    "differ by a factor of a quarter of a million. cp and tar -S preserve that; cp --sparse=never, " +
    "cat, plain tar and plain dd turn four kilobytes into a gigabyte. " +
    `${SPARSE_CASES.length} files here, ${spHoled} of which still have holes after the copy.`;

  await writePage("sparse", base, {
    title: "A Gigabyte In One Block: Sparse Files, du And ls | Max Doubin",
    description: spDescription,
    canonical: `${SITE_URL}/sparse`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "A gigabyte in one block",
  description: spDescription,
  url: `${SITE_URL}/sparse`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why ls and du report different sizes for the same file and why a backup of it can fill a disk the original fitted on: that the apparent size is the offset of the last byte written plus one while du counts the blocks the filesystem allocated, and a range nobody wrote is a hole that costs nothing and reads as zeros; that allocation is in whole blocks so one byte at offset 4096 costs a block and four more bytes in a block already allocated cost nothing; that writing zeros allocates exactly as much as writing anything else, because a hole is made by not writing rather than by writing nothing; that cp and tar -S preserve holes while cp --sparse=never, cat, plain tar and plain dd write every one of them out; that dd conv=sparse gives holes back only at its own buffer size; that cp --sparse=always can make a dense file sparse by reading it; and that punching a hole frees only the blocks entirely inside the range and never changes the length",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>A gigabyte in one block</h1>
  <p>
    ${SPARSE_CASES.length} files, one question each. On ${spHoled} of them there are still holes in the file when the copy is
    finished, and on the rest there are not.
  </p>
  <h2>Two numbers, and they answer different questions</h2>
  <pre><code>$ ls -l data
-rw-r--r-- 1 root root 1073741824 Sep 20 13:07 data
$ du -k data
4	data</code></pre>
  <p>
    A gigabyte long and four kilobytes on disk. Both are right. ls reports the offset of the last
    byte written plus one; du reports the blocks the filesystem handed out. A database that
    preallocates its file by seeking to the end and writing one byte produces exactly this.
  </p>
  <h2>What costs a block is touching it</h2>
  <pre><code>what was written              apparent size    du
1 byte at offset 0                        1    4K
1 byte at offset 4095                  4096    4K
1 byte at offset 4096                  4097    4K
1 byte at 0 and 1 at 4096              4097    8K</code></pre>
  <p>
    Rows two and three cost the same for a file twice as long. Row four costs twice as much for one
    more byte, because that byte is the first in a second block. Count blocks touched, not bytes.
  </p>
  <h2>Zeros written are zeros stored</h2>
  <pre><code>10 MiB from /dev/zero      du 10240K
fallocate -l 10M           du 10240K</code></pre>
  <p>
    A hole is made by not writing, not by writing nothing. The filesystem does not read the buffer
    you handed it, so a provisioning script that reserves space with zeros gets exactly what it
    asked for and pays for all of it.
  </p>
  <h2>Which tool keeps the hole</h2>
  <pre><code>cp                            4K
cp --sparse=never       1048580K
cat src &gt; dst           1048580K
tar cf then tar xf      1048580K
tar cSf then tar xf           4K
dd conv=sparse bs=1M       1024K</code></pre>
  <p>
    A read of a hole is a successful read that yields zeros, and a tool that does not go looking
    for holes cannot tell those zeros from any others. tar is the one that catches people, because
    taking an archive is what the runbook says.
  </p>
  <h2>dd gives holes back one buffer at a time</h2>
  <pre><code>bs=4096        4K
bs=65536      64K
bs=1M       1024K
bs=8M       8192K</code></pre>
  <p>
    conv=sparse skips a buffer that is entirely zero, so the narrowest hole it can make is one
    buffer wide, and the buffer is dd's rather than the filesystem's.
  </p>
  <h2>What each file costs</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Apparent</th><th>du</th><th>Copied with</th><th>du after</th><th>Still sparse</th><th>Fits</th></tr>
    </thead>
    <tbody>
${SPARSE_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${spSize(spApparent(s))}</td><td>${spSize(spAlloc(s))}</td>` +
    `<td>${esc(spTool(s.copiedWith, s.ddBytes))}</td><td>${spSize(spCopied(s))}</td>` +
    `<td>${spSparse(s) ? "yes" : "no"}</td><td>${spFits(s) ? "yes" : "no"}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${SPARSE_CASES.map((item) => {
  const right = spCorrect(item);
  const s = item.setup;
  const lines = spLines(s).map((line) => `${line.name.padEnd(20)} ${line.value.padStart(34)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(lines)}</code></pre>
    <p>Made by ${esc(s.ops.map(spOp).join(", "))}. It is ${spSize(spApparent(s))} long and holds ${spSize(spAlloc(s))}. ${s.copiedWith === "none" ? "Nothing copied it." : `After ${esc(spTool(s.copiedWith, s.ddBytes))} the copy holds ${spSize(spCopied(s))}, and it ${spFits(s) ? "fits" : "does not fit"} in the ${spSize(s.freeKib)} free.`}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-copy-filled-the-disk-the-original-never-touched", "The copy filled the disk the original never touched"], ["/space", "No space left on device"], ["/pss", "Four processes, one copy"]])}
</main>`,
  });

  // ── concurrent appenders ──
  /*
    The static body carries the four arrangements, because the search that
    brings people here is a log with lines missing and no error anywhere, and
    the answer is which of four ways of opening the file you used. The second
    table is the one that surprises: pwrite losing its offset under O_APPEND.
  */
  const apLosing = APPEND_CASES.filter((item) => !apSafe(item.setup)).length;
  const apDescription =
    "Four processes hand a log 51200 bytes and the file comes out 12800 long, which is one " +
    "writer's worth, with every write returning the full count and no error anywhere. A file " +
    "offset belongs to an open file description, so two open() calls on one path make two offsets " +
    "that know nothing about each other, and O_APPEND is the only thing that makes the seek and " +
    `the write one operation. ${APPEND_CASES.length} logs here, ${apLosing} of which lose writes.`;

  await writePage("append", base, {
    title: "Two Writers, One Offset: O_APPEND And Lost Writes | Max Doubin",
    description: apDescription,
    canonical: `${SITE_URL}/append`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Two writers, one offset",
  description: apDescription,
  url: `${SITE_URL}/append`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why a log can be missing most of what was written to it with no error anywhere: that a file offset belongs to an open file description rather than to a file or a process, so two open() calls on one path give two offsets that each walk from zero and overwrite each other, leaving a file exactly one writer's worth long however many writers there were; that fork and dup share one description and therefore one offset, so inheriting a descriptor is safe where opening the same path is not; that O_APPEND is not a seek to the end followed by a write but one operation under the inode lock; that pwrite at non-overlapping offsets is the other way to be safe and is only safe because of the arithmetic; and that on Linux pwrite on a descriptor opened O_APPEND discards its offset argument and appends anyway",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Two writers, one offset</h1>
  <p>
    ${APPEND_CASES.length} logs, one question each. On ${apLosing} of them some of what the writers handed to write() is not in
    the file, and nothing anywhere reported an error.
  </p>
  <h2>Four writers, 51200 bytes, and four different files</h2>
  <pre><code>how the file was opened                      bytes written   file is
each writer opens it with O_APPEND                   51200     51200
each writer opens it without O_APPEND                51200     12800
the parent opens it once and forks                   51200     51200
each writer pwrites at its own tiled offset          51200     51200</code></pre>
  <p>
    The second row is three quarters of the log gone. 12800 is 200 times 64: exactly one writer's
    worth. Each writer walked its own offset from zero and wrote over the others, and the file
    ended up as long as the furthest any single one of them reached.
  </p>
  <h2>The figure does not depend on the writer count</h2>
  <pre><code>eight writers, 50 records of 4096, no flag    204800  of 1638400</code></pre>
  <p>
    Again one writer's worth. Adding writers adds loss and leaves the file the same size, which is
    what makes this hard to notice from the file alone.
  </p>
  <h2>Where the offset lives</h2>
  <p>
    An offset belongs to an open file description, which is what one <code>open()</code> call
    creates. Two calls on the same path make two descriptions and two offsets. <code>fork</code>
    and <code>dup</code> do not: they hand out another descriptor onto the one description, so the
    offset is shared and every write advances it for everybody. That is the whole difference
    between rows two and three, and the code differs only in which side of the fork the open sits.
  </p>
  <h2>O_APPEND is not a seek and a write</h2>
  <p>
    It is one operation the kernel performs under the inode lock, which is why it survives writers
    that have never heard of each other. Asking for the same thing in two steps is row two.
  </p>
  <h2>And it discards the offset pwrite names</h2>
  <pre><code>plain fd,     pwrite "XX" at 0    size 10   0123456789 becomes XX23456789
O_APPEND fd,  pwrite "XX" at 0    size 12   0123456789XX
O_APPEND fd,  lseek 0 then write  size 12   0123456789YY</code></pre>
  <p>
    pwrite exists to write at an offset without touching the file offset, and pwrite(2) says POSIX
    requires O_APPEND to have no effect on where it writes. On Linux it appends regardless. A
    program that opens with O_APPEND and then pwrites is not doing what it reads as doing.
  </p>
  <h2>What each set of writers left behind</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Writers</th><th>Each</th><th>Opened</th><th>Written</th><th>File</th><th>Lost</th><th>Records kept</th></tr>
    </thead>
    <tbody>
${APPEND_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${s.writers}</td><td>${s.records} of ${s.bytes}</td>` +
    `<td>${esc(apHow(s.how))}</td><td>${apWritten(s)}</td><td>${apSize(s)}</td>` +
    `<td>${apLost(s)}</td><td>${apSurvived(s)} of ${s.writers * s.records}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${APPEND_CASES.map((item) => {
  const right = apCorrect(item);
  const s = item.setup;
  const lines = apLines(s).map((line) => `${line.name.padEnd(18)} ${line.value.padStart(44)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(lines)}</code></pre>
    <p>${s.writers} writers handed over ${apWritten(s)} bytes, which is ${apBytes(apWritten(s))}, and the file is ${apSize(s)}. ${apSafe(s) ? "Nothing was lost." : `${apLost(s)} bytes are not in it, and nothing reported an error.`} ${apOffset(s) ? "The offset each pwrite names is the offset it gets." : ""}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-log-that-lost-three-quarters-of-itself", "The log that lost three quarters of itself"], ["/pipebuf", "Two writers, one line"], ["/locks", "Three locks, one file"]])}
</main>`,
  });

  // ── what a mapping covers ──
  /*
    The static body carries the two boundaries as a table of addresses, because
    the search that brings people here is a process that died with SIGBUS on a
    mapped file and an argument about whether the file was too short or the
    mapping was. The answer is which of the two edges the address was past, and
    the third row, the store that is thrown away, is the one nothing reports.
  */
  const mpFaulting = MAPPED_CASES.filter((item) => mpOutcome(item.setup) !== "ok").length;
  const mpDescription =
    "A 100 byte file mapped with a length of 8192 reads byte 4095 without a signal and takes " +
    "SIGBUS at byte 4096, measured, because a mapping is checked against the file's last page and " +
    "not against the file. A 16 KiB file mapped with a length of 100 takes SIGSEGV at byte 4096 " +
    "instead, because that edge is the mapping's own and the file has nothing to do with it. And a " +
    "store between the end of the file and the end of its last page completes, reports nothing, " +
    `and is thrown away. ${MAPPED_CASES.length} accesses here, ${mpFaulting} of which fault.`;

  await writePage("mapped", base, {
    title: "Three Boundaries, Three Outcomes: mmap, SIGBUS And SIGSEGV | Max Doubin",
    description: mpDescription,
    canonical: `${SITE_URL}/mapped`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Three boundaries, three outcomes",
  description: mpDescription,
  url: `${SITE_URL}/mapped`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why a process can die with SIGBUS on a file it mapped successfully: that mmap rounds the length it is given up to a whole page and never checks it against the file, so the error surfaces as a signal at the first touch rather than as a return value; that there are two separate edges, the end of the mapping and the end of the file's last page, and that passing the first gives SIGSEGV while passing the second gives SIGBUS; that the stretch between the end of the file and the end of the page the file stops in is real zeroed memory, so reads there return zero and stores there complete, report nothing and are discarded; that resizing a file under a live mapping moves the second edge in both directions with no call by the mapping process; and that MAP_PRIVATE is no protection against a truncation, because ftruncate unmaps the range from every mapping of the inode including copy on write pages the process has already written to",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Three boundaries, three outcomes</h1>
  <p>
    ${MAPPED_CASES.length} accesses through a mapping, one question each. ${mpFaulting} of them kill the process, and which
    signal does it is decided by which of two edges the address is past.
  </p>
  <h2>A 100 byte file mapped with a length of 8192</h2>
  <pre><code>byte      what happens
  99      reads the last byte of the file
 100      reads zero, past the end of the file
4095      reads zero, last byte of the file's page
4096      SIGBUS</code></pre>
  <p>
    The signal is at 4096 and not at 100. What the kernel can hand you is a page, so the last page
    of the file exists in full however little of the file is in it. Everything from the end of the
    file to the end of that page is memory it zeroed, and there is nothing to distinguish it from
    data that happens to be zero.
  </p>
  <h2>The same byte, the other signal</h2>
  <pre><code>a 16384 byte file, mmap called with a length of 100
  99      reads the byte in the file
4095      reads zero, the length rounded up to a page
4096      SIGSEGV</code></pre>
  <p>
    Here the file is long enough and it does not help, because the question at byte 4096 is not
    whether the file has a page there but whether the process has a mapping there. SIGBUS is a
    mapping longer than its file. SIGSEGV is an access longer than its mapping. This was measured
    inside an eight page <code>PROT_NONE</code> reservation, because without one a neighboring
    mapping took the address and the first attempt reported the access as fine.
  </p>
  <h2>The store that is thrown away</h2>
  <pre><code>write 'A' at offset 50 and 'Z' at offset 200 of a 100 byte file, then msync

  read offset 50 through the descriptor     A
  file size                                 100
  grow the file to 4096, read offset 200    zero</code></pre>
  <p>
    Both stores completed and neither raised a signal. The first is in the file because offset 50
    is inside it. The second is not, because a store through a mapping never makes a file longer,
    and growing the file afterwards does not recover it. Nothing in the program can tell the two
    apart.
  </p>
  <h2>Resizing the file under a live mapping</h2>
  <pre><code>grow 100 to 4106       byte 4096 becomes readable
shrink 4106 to 100     byte 4096 is SIGBUS again
MAP_PRIVATE, store to page 1 first, then shrink    still SIGBUS</code></pre>
  <p>
    The mapping process makes no call in any of these; the edge moves because a mapping refers to
    the file rather than to a copy of it. The last row is the one worth keeping: the process owned
    a copy on write copy of that page, and <code>ftruncate</code> unmapped the range from every
    mapping of the inode anyway. MAP_PRIVATE insulates the file from your stores, not your process
    from the file.
  </p>
  <h2>Every access here</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>File</th><th>Length</th><th>Flags</th><th>Now</th><th>Mapped</th><th>Backed</th><th>Access</th><th>Outcome</th></tr>
    </thead>
    <tbody>
${MAPPED_CASES.map((item) => {
  const s2 = item.setup;
  return `      <tr><td>${esc(s2.host)}</td><td>${s2.fileBytes}</td><td>${s2.mappedBytes}</td>` +
    `<td>${esc(mpKind(s2.kind))}</td><td>${s2.resizedTo}${mpResized(s2) ? " (resized)" : ""}</td>` +
    `<td>${mpCovers(s2)}</td><td>${mpBacked(s2)}</td>` +
    `<td>${s2.writing ? "store" : "read"} at ${s2.at}</td><td>${esc(mpSignal(mpOutcome(s2)))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${MAPPED_CASES.map((item) => {
  const right = mpCorrect(item);
  const s2 = item.setup;
  const lines = mpLines(s2).map((line) => `${line.name.padEnd(18)} ${line.value.padStart(24)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(lines)}</code></pre>
    <p>The mapping covers ${mpCovers(s2)} bytes and the file backs ${mpBacked(s2)} of them, so the last byte with no signal is ${mpLastSafe(s2)} and the ${s2.writing ? "store" : "read"} at ${s2.at} gives ${esc(mpSignal(mpOutcome(s2)))}. ${mpOutcome(s2) === "ok" ? (s2.writing ? (mpPersists(s2) ? "The byte is in the file afterwards." : "The byte is thrown away, and nothing reports it.") : `It reads ${esc(mpReads(s2))}.`) : "Nothing comes back."}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/sparse", "A gigabyte in one block"], ["/pss", "Four processes, one copy"], ["/cache", "The page that showed somebody else's name"]])}
</main>`,
  });

  // ── exit status ──
  /*
    The static body carries the two halves of the status word, because the
    search that brings people here is a job that reported 137 and an argument
    about whether it was killed. The answer is that the shell cannot say and the
    parent can, and the table of raw statuses is what settles it.
  */
  const exTwoWays = EXIT_CASES.filter((item) => exAmbiguous(item.setup)).length;
  const exDescription =
    "An exit code is truncated to one byte, so exit(256) gives a status of 0 and reads as success, " +
    "measured, along with 512 and 768. A death by signal lands in the low seven bits of the wait " +
    "status where no exit code reaches, so waitpid can always tell an exit of 137 from a kill by " +
    "SIGKILL, while $? reports both as 137 because it has one byte for two kinds of news. " +
    `${EXIT_CASES.length} endings here, ${exTwoWays} whose status reads two ways.`;

  await writePage("exit", base, {
    title: "One Byte, Two Kinds Of News: Exit Status | Max Doubin",
    description: exDescription,
    canonical: `${SITE_URL}/exit`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "One byte, two kinds of news",
  description: exDescription,
  url: `${SITE_URL}/exit`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why a job that reported 137 may or may not have been killed: that an exit code is truncated to one unsigned byte with no warning at either end, so exit(256), exit(512) and exit(768) all produce a status of 0 and exit(-1) produces 255; that the kernel puts an exit code in the high byte of the wait status and a terminating signal in the low seven bits, so the two can never be confused and WIFEXITED is simply a test that the low bits are empty; that the shell has one byte for both and reports a death as 128 plus the signal number, which makes every status from 129 to 192 mean either an exit with that code or a death by that signal; that the core dump flag is bit 0x80 of the low byte and follows RLIMIT_CORE rather than the signal, so the same SIGSEGV gives 0x000b or 0x008b; that 126 and 127 are the shell's own conventions and the kernel produces neither; and that a pipeline reports only its last command, so a process killed by the out of memory killer inside one reports success",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>One byte, two kinds of news</h1>
  <p>
    ${EXIT_CASES.length} endings, one question each. On ${exTwoWays} of them the status could be read two different ways and
    nothing in it says which.
  </p>
  <h2>An exit code is truncated to a byte</h2>
  <pre><code>_exit(0)      raw 0x0000   $? = 0
_exit(1)      raw 0x0100   $? = 1
_exit(42)     raw 0x2a00   $? = 42
_exit(255)    raw 0xff00   $? = 255
_exit(256)    raw 0x0000   $? = 0
_exit(300)    raw 0x2c00   $? = 44
_exit(512)    raw 0x0000   $? = 0
_exit(768)    raw 0x0000   $? = 0
_exit(1000)   raw 0xe800   $? = 232
_exit(-1)     raw 0xff00   $? = 255</code></pre>
  <p>
    The status is the code and 0xff. A validator returning its error count reports success on the
    run that found exactly 256 problems, and neither end sees an error: exit() does not return and
    the parent reads a perfectly clean WIFEXITED.
  </p>
  <h2>A death goes in the other half of the word</h2>
  <pre><code>killed by SIGINT    2   raw 0x0002   $? = 130
killed by SIGKILL   9   raw 0x0009   $? = 137
killed by SIGSEGV  11   raw 0x000b   $? = 139
killed by SIGTERM  15   raw 0x000f   $? = 143
killed by SIGRTMIN 34   raw 0x0022   $? = 162
killed by SIGRTMAX 64   raw 0x0040   $? = 192</code></pre>
  <p>
    An exit code sits in the high byte and a signal in the low seven bits, so they cannot collide.
    WIFEXITED is nothing more than a test that the low bits are zero.
  </p>
  <h2>And then the shell flattens both into one byte</h2>
  <pre><code>( exit 137 )              $? = 137    raw 0x8900
sh -c 'kill -9 $$'        $? = 137    raw 0x0009</code></pre>
  <p>
    The same number for two entirely different events. Every value from 129 to 192 is both an exit
    code and a death by the signal 128 below it, which is exactly the range a program reaches by
    returning a negative number or by adding to 128 on purpose. A parent calling waitpid is never
    confused; a shell script has nothing to go on.
  </p>
  <h2>The core flag follows the limit, not the signal</h2>
  <pre><code>RLIMIT_CORE 0        SIGSEGV 0x000b   SIGQUIT 0x0003   SIGABRT 0x0006
RLIMIT_CORE raised   SIGSEGV 0x008b   SIGQUIT 0x0083   SIGABRT 0x0086</code></pre>
  <p>
    Bit 0x80 of the low byte. $? is 139, 131 and 134 in all six cases, so a script cannot tell
    whether there is a core file waiting for it.
  </p>
  <h2>A pipeline reports its last command and nothing else</h2>
  <pre><code>false | true                 $? = 0    PIPESTATUS 1 0
( exit 42 ) | ( exit 7 )     $? = 7    PIPESTATUS 42 7
killed by SIGKILL | true     $? = 0    PIPESTATUS 137 0</code></pre>
  <p>
    The last row is the expensive one: a process killed by the out of memory killer, inside a
    pipeline, reports success. Also worth knowing that 127 for a missing command and 126 for one
    that is not executable are bash's own inventions, and the kernel produces neither.
  </p>
  <h2>What each ending does</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Ending</th><th>Raw status</th><th>WIFEXITED</th><th>WEXITSTATUS</th><th>Core</th><th>Own status</th><th>$? after</th><th>Reads two ways</th></tr>
    </thead>
    <tbody>
${EXIT_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td>` +
    `<td>${s.ending === "exited" ? `exit(${s.code})` : `killed by ${esc(exSignal(s.sig))}`}</td>` +
    `<td>${exHex(exRaw(s))}</td><td>${s.ending === "exited" ? 1 : 0}</td>` +
    `<td>${s.ending === "exited" ? exStatus(s) : "n/a"}</td><td>${s.ending === "signaled" ? (exCored(s) ? "yes" : "no") : "n/a"}</td>` +
    `<td>${exPipe(s)[s.place === "first in a pipeline" ? 0 : exPipe(s).length - 1]}</td>` +
    `<td>${exReported(s)}</td><td>${exAmbiguous(s) ? "yes" : "no"}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${EXIT_CASES.map((item) => {
  const right = exCorrect(item);
  const s = item.setup;
  const lines = exLines(s).map((line) => `${line.name.padEnd(24)} ${line.value.padStart(22)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(lines)}</code></pre>
    <p>The raw status is ${exHex(exRaw(s))} and $? holds ${exReported(s)}. ${exAmbiguous(s) ? `That number would equally be ${esc(exOther(s))}, and nothing in it says which.` : "No signal produces that number, so it can only be read one way."} ${s.place === "alone" ? "" : `PIPESTATUS reads ${exPipe(s).join(" ")}.`} ${s.ending === "signaled" ? `A core was ${exCored(s) ? "written" : "not written, because the limit refused"}.` : ""}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/one-byte-and-two-kinds-of-news", "One byte and two kinds of news"], ["/signals", "A thousand sent, one arrived"], ["/oom", "The one that got picked"]])}
</main>`,
  });

  // ── signal delivery ──
  /*
    The static body carries both tables, because the search that brings people
    here is a handler that ran once when it should have run forty times, and
    the answer is which side of SIGRTMIN the number is on. The second table is
    the one that corrects the usual advice: changing the sending call does
    nothing.
  */
  const sgLossy = SIGNALS_CASES.filter((item) => sgLost(item.setup) > 0).length;
  const sgDescription =
    "A signal below SIGRTMIN does not queue: its pending state is one bit, so 1000 sends of SIGUSR1 " +
    "while the receiver had it blocked produced exactly one handler call, measured, with no error at " +
    "the sender and nothing the receiver can inspect. A realtime signal queued all 1000. Which of the " +
    "two happens is decided by the signal number and not by whether you called kill or sigqueue. " +
    `${SIGNALS_CASES.length} bursts here, ${sgLossy} where sends produce nothing.`;

  await writePage("signals", base, {
    title: "A Thousand Sent, One Arrived: Signal Queueing | Max Doubin",
    description: sgDescription,
    canonical: `${SITE_URL}/signals`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "A thousand sent, one arrived",
  description: sgDescription,
  url: `${SITE_URL}/signals`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why a handler runs once when the signal was sent forty times: that a standard signal, meaning anything below SIGRTMIN which is 34 on Linux, has a pending state of one bit, so sending it again while it is already pending does nothing and the extra sends are lost with no error at the sender and nothing at the receiver; that realtime signals at or above SIGRTMIN do queue, measured at 1000 sends and 1000 deliveries; that which of the two happens is decided by the signal number rather than by the sending call, so sigqueue on SIGUSR1 still coalesces and plain kill on SIGRTMIN still queues; that what the call does decide is whether the sender is told, since kill returns success for signals it is about to drop where sigqueue returns EAGAIN, both delivering the same number; that the queue holds RLIMIT_SIGPENDING minus one and that the limit is per real user rather than per process; and that the kernel dequeues the lowest pending number first while the handlers for several signals delivered at once run in the reverse order, highest first, without nesting",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>A thousand sent, one arrived</h1>
  <p>
    ${SIGNALS_CASES.length} bursts, one question each. On ${sgLossy} of them some of the sends produce nothing at all, and
    on most of those nobody is in a position to notice.
  </p>
  <h2>A standard signal does not queue</h2>
  <p>
    Blocking the signal, sending it N times, then unblocking, with the handler calls counted in C:
  </p>
  <pre><code>SIGUSR1   sent    1   delivered 1
SIGUSR1   sent    2   delivered 1
SIGUSR1   sent    5   delivered 1
SIGUSR1   sent  100   delivered 1
SIGUSR1   sent 1000   delivered 1</code></pre>
  <p>
    SIGHUP gave the same five rows. The pending state for a standard signal is a bit in a mask, and
    setting a bit that is already set does nothing. The 999 that went nowhere produced no error at
    the sender, no counter anywhere, and nothing the receiver can inspect.
  </p>
  <h2>A realtime signal does</h2>
  <pre><code>SIGRTMIN  sent    1   delivered    1
SIGRTMIN  sent    2   delivered    2
SIGRTMIN  sent    5   delivered    5
SIGRTMIN  sent  100   delivered  100
SIGRTMIN  sent 1000   delivered 1000</code></pre>
  <h2>And the sending call has nothing to do with it</h2>
  <pre><code>SIGUSR1  via kill      1000 sent, 1 delivered
SIGUSR1  via sigqueue  1000 sent, 1 delivered
SIGRTMIN via kill      1000 sent, 1000 delivered
SIGRTMIN via sigqueue  1000 sent, 1000 delivered</code></pre>
  <p>
    sigqueue on a standard signal still coalesces. kill on a realtime signal still queues. Reaching
    for sigqueue does not buy a queue; reaching for a number at or above SIGRTMIN does.
  </p>
  <h2>What the call decides is whether you are told</h2>
  <pre><code>five SIGRTMIN, at various RLIMIT_SIGPENDING

limit   via        accepted   delivered
    1   kill              5           1
    1   sigqueue          0           0    EAGAIN
    2   kill              5           1
    2   sigqueue          1           1    EAGAIN
    3   kill              5           2
    3   sigqueue          2           2    EAGAIN
    4   kill              5           3
    4   sigqueue          3           3    EAGAIN</code></pre>
  <p>
    The delivered column is the same either way. kill returns 0 for the ones it is about to drop.
    The queue itself holds one less than the limit: 1, 2, 4, 8, 16 and 32 took 0, 1, 3, 7, 15 and 31,
    and the default 64313 took 64312. That limit is per real user, shared by every process they own.
  </p>
  <h2>Two orders, and they are opposites</h2>
  <pre><code>queued SIGRTMIN+5, SIGUSR2, SIGRTMIN, SIGUSR1, SIGRTMIN+2

  dequeued with sigtimedwait   10, 12, 34, 36, 39
  handlers ran                 39, 36, 34, 12, 10</code></pre>
  <p>
    The kernel dequeues the lowest pending number first and builds a signal frame for each one
    before returning to user space. Each frame's saved context is the previous handler's entry, so
    the last frame built is the first to run and they unwind downward. The handlers do not nest: over
    five runs and four different sets the depth counter never left 1.
  </p>
  <h2>What each burst does</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Signal</th><th>Queues</th><th>Sent</th><th>Via</th><th>Limit</th><th>Queue holds</th><th>Delivered</th><th>Lost</th><th>EAGAIN</th></tr>
    </thead>
    <tbody>
${SIGNALS_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${esc(sgName(s.sig))} (${s.sig})</td><td>${sgQueues(s.sig) ? "yes" : "no"}</td>` +
    `<td>${s.sends}</td><td>${esc(s.via)}</td><td>${s.pendingLimit}</td>` +
    `<td>${sgQueues(s.sig) ? sgDepth(s.pendingLimit) : "n/a"}</td><td>${sgDelivered(s)}</td>` +
    `<td>${sgLost(s)}</td><td>${sgRefused(s)}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${SIGNALS_CASES.map((item) => {
  const right = sgCorrect(item);
  const s = item.setup;
  const lines = sgLines(s).map((line) => `${line.name.padEnd(19)} ${line.value.padStart(20)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(lines)}</code></pre>
    <p>The handler runs ${sgDelivered(s)} time${sgDelivered(s) === 1 ? "" : "s"} for ${s.sends} ${esc(s.via)} call${s.sends === 1 ? "" : "s"}. ${sgLost(s) === 0 ? "Nothing is lost." : `${sgLost(s)} of them produce nothing, and ${sgRefused(s) === 0 ? "every call returned success, so nobody was told" : `${sgRefused(s)} of the calls came back EAGAIN`}.`} ${sgQueues(s.sig) ? `${esc(sgName(s.sig))} is at or above SIGRTMIN, and the queue holds ${sgDepth(s.pendingLimit)}.` : `${esc(sgName(s.sig))} is below SIGRTMIN, so its pending state is one bit.`} ${s.alsoQueued.length ? `With ${esc(s.alsoQueued.map(sgName).join(", "))} pending alongside it, sigtimedwait takes them ${sgDequeue(s).join(", ")} and the handlers run ${sgHandlers(s).join(", ")}.` : ""} ${sgAccepted(s) === s.sends ? "" : `Only ${sgAccepted(s)} of the calls returned success.`}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/a-thousand-signals-and-one-handler-call", "A thousand signals and one handler call"], ["/backlog", "The server is idle and the connections are timing out"], ["/locks", "Three locks, one file"]])}
</main>`,
  });

  // ── file locking ──
  /*
    The static body carries both matrices, because the search that brings
    people here is two programs writing a file that was supposed to be locked,
    and the answer is a table: which of the three interfaces sees which. The
    second matrix is the same nine cells asked inside one process, where
    exactly one of them moves, and that one moving cell is the surface.
  */
  const lkBoth = LOCKS_CASES.filter((item) => lkGranted(item.setup)).length;
  const lkDescription =
    "flock and fcntl keep separate lock lists and do not see each other, so two programs guarding one " +
    "file, one written against each, both take the lock and both believe they have it alone. Of the " +
    "three interfaces only fcntl belongs to the process rather than to the open file description, " +
    "which is why a second descriptor in your own process is handed the lock, why a forked child is " +
    "refused it, and why closing any unrelated descriptor to the file throws it away. " +
    `${LOCKS_CASES.length} files here, ${lkBoth} where the second party gets in.`;

  await writePage("locks", base, {
    title: "Three Locks, One File: fcntl, flock and F_OFD_SETLK | Max Doubin",
    description: lkDescription,
    canonical: `${SITE_URL}/locks`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Three locks, one file",
  description: lkDescription,
  url: `${SITE_URL}/locks`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why two programs can both hold the lock on one file and neither is told: that Linux keeps two lock lists, one shared by fcntl record locks and F_OFD_SETLK open file description locks and one used by flock alone, so a flock holder never conflicts with an fcntl request in either direction, measured across all nine combinations of the three interfaces; that an fcntl lock is owned by the process while flock and open file description locks are owned by the open file description, and that every other difference between them follows from that one fact; that a second descriptor in the holder's own process is therefore granted an fcntl lock the process already holds, so fcntl provides no mutual exclusion inside one program; that closing any descriptor to the file releases all of that process's fcntl locks on it, including ones taken through an entirely different descriptor, so a library reading one line can silently unlock your file; that a forked child cannot take an fcntl lock on the descriptor it inherited but can both take and release a flock or an open file description lock, because it shares the description rather than the process; and that fcntl and F_OFD_SETLK lock byte ranges while flock is always the whole file",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Three locks, one file</h1>
  <p>
    ${LOCKS_CASES.length} files, one lock each. On ${lkBoth} of them the second party gets the lock, and on several of
    those it should not have.
  </p>
  <h2>There are two lists, not one</h2>
  <p>
    A second process asking for a file the holder has already locked, both exclusive, both the whole
    file:
  </p>
  <pre><code>holder used    fcntl asks    flock asks    OFD asks
fcntl             blocked       GRANTED     blocked
flock             GRANTED       blocked     GRANTED
OFD               blocked       GRANTED     blocked</code></pre>
  <p>
    flock keeps its own list. fcntl and F_OFD_SETLK share the other one. Nothing consults across
    them, so a collector guarding <code>/var/run/collect.lock</code> with flock and a second copy of
    the same job guarding it with fcntl will both hold it, forever, without one error between them.
  </p>
  <h2>A lock belongs either to the process or to the descriptor</h2>
  <p>
    The same nine cells, except the second party is a second descriptor in the holder's own process:
  </p>
  <pre><code>holder used    fcntl asks    flock asks    OFD asks
fcntl             GRANTED       GRANTED     blocked
flock             GRANTED       blocked     GRANTED
OFD               blocked       GRANTED     blocked</code></pre>
  <p>
    One cell moved, and it is fcntl against fcntl. An fcntl lock is owned by the process, so the
    process asking again is the owner asking again and is handed it. Two components of one program,
    each taking the lock carefully before it writes, both get it and neither is told.
  </p>
  <h2>The close that has nothing to do with you</h2>
  <pre><code>lock fd a, then open fd b to the same file, then close fd b
  fcntl    the lock is gone, an outsider took it
  flock    still held
  OFD      still held</code></pre>
  <p>
    Closing any descriptor to a file drops every fcntl lock that process holds on it, however it was
    taken. A metrics library opening the path to read one line is enough. This is specified behavior
    and there is no way to opt out of it, which is what open file description locks were added for.
  </p>
  <h2>And fork cuts both ways</h2>
  <pre><code>the forked child, using the descriptor it inherited
  takes the same lock     fcntl blocked    flock GRANTED    OFD GRANTED
  calls the unlock        fcntl no effect  flock RELEASED   OFD RELEASED</code></pre>
  <p>
    So fcntl refuses to let your own worker touch the file it was forked to write, and flock lets a
    helper you forgot you forked release the lock that keeps a second daemon from starting. Both are
    correct, and they surprise people in opposite directions.
  </p>
  <h2>What each file does</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Holder</th><th>Belongs to</th><th>Asker</th><th>Who is asking</th><th>Same list</th><th>Still held</th><th>Second party</th></tr>
    </thead>
    <tbody>
${LOCKS_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${esc(lkCall(s.held, s.holderExclusive))}</td><td>${esc(lkOwner(s.held))}</td>` +
    `<td>${esc(lkCall(s.asking, s.askerExclusive))}</td><td>${esc(s.asker)}</td>` +
    `<td>${lkWorld(s.asking) === lkWorld(s.held) ? "yes" : "no"}</td><td>${lkHeld(s) ? "yes" : "no"}</td>` +
    `<td>${lkGranted(s) ? "gets the lock" : "waits"}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${LOCKS_CASES.map((item) => {
  const right = lkCorrect(item);
  const s = item.setup;
  const lines = lkLines(s).map((line) => `${line.name.padEnd(17)} ${line.value.padStart(34)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(lines)}</code></pre>
    <p>The second party ${lkGranted(s) ? "gets the lock" : "waits"}, because ${esc(lkWhy(s))}. ${lkHeld(s) ? `The holder still has its lock, which belongs to ${esc(lkWho(s.held, "the holder"))}.` : `The holder has nothing left: ${esc(lkLost(s))}.`} ${s.held === "flock" || s.asking === "flock" ? "flock is always the whole file." : `The ranges are ${esc(lkRange(s.holderStart, s.holderLength))} against ${esc(lkRange(s.askerStart, s.askerLength))}, which ${lkOverlaps(s) ? "overlap" : "do not overlap"}.`} ${lkShared(s) ? "Both are shared." : ""} ${lkSame(s) ? "Both belong to the same owner." : ""}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-lock-that-two-programs-both-held", "The lock that two programs both held"], ["/pipebuf", "Two writers, one line"], ["/permissions", "The bits that decide"]])}
</main>`,
  });

  // ── overcommit accounting ──
  /*
    The static body carries the limit table, because the search that brings
    people here is malloc failing on a machine with memory free, and what they
    need is CommitLimit beside MemTotal for a host shaped like theirs. The
    columns put the wall next to the hardware, which is the comparison the
    whole surface turns on.
  */
  const ocWaste = OVERCOMMIT_CASES.filter((item) => ocWasteful(item.setup)).length;
  const ocDescription =
    "vm.overcommit_ratio defaults to 50 and applies to RAM alone, with swap added whole, so a " +
    "machine with no swap has a CommitLimit of half its memory. In the default heuristic mode " +
    "nothing reads that number and Committed_AS passes it without comment. Set " +
    "vm.overcommit_memory to 2 to stop the out of memory killer and the same number becomes a " +
    "wall: on the host measured here it refuses a 5 GiB allocation with 13.92 GiB free, because " +
    "the comparison is reservations against the limit and free memory is not in it. " +
    `${OVERCOMMIT_CASES.length} machines here, ${ocWaste} refused with the memory sitting there.`;

  await writePage("overcommit", base, {
    title: "CommitLimit Is Half the Memory, and It Is Not a Memory Limit | Max Doubin",
    description: ocDescription,
    canonical: `${SITE_URL}/overcommit`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Half a machine",
  description: ocDescription,
  url: `${SITE_URL}/overcommit`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "How Linux overcommit accounting decides whether an allocation is refused: that CommitLimit is SwapTotal plus vm.overcommit_ratio percent of RAM alone, so the default of 50 with no swap makes the limit half the machine; that vm_commit_limit computes this in pages, flooring the page count before multiplying, so a formula written in kilobytes is two or three kilobytes high; that vm.overcommit_kbytes replaces the ratio rather than adding to it; that mode 0, the default heuristic, never reads the running total and lets Committed_AS sit above CommitLimit indefinitely; that mode 1 refuses nothing and is what a database or cache wants because forking reserves an address space that is never written; that mode 2 compares reservations against the limit and will refuse an allocation while MemAvailable is several times its size; that Committed_AS counts reservations rather than pages touched and is not comparable to MemAvailable; and that strict mode does not retire the out of memory killer, least of all with a ratio above 100, where the limit exceeds RAM plus swap",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Half a machine</h1>
  <p>
    ${OVERCOMMIT_CASES.length} machines, one allocation each. On ${ocWaste} of them the allocation is refused while the
    memory it asked for is sitting there unused.
  </p>
  <p>
    Here is /proc/meminfo on a 15.72 GiB host with no swap, untuned:
  </p>
  <pre><code>MemTotal      16481980 kB
SwapTotal            0 kB
CommitLimit    8240988 kB
Committed_AS   4006572 kB</code></pre>
  <p>
    CommitLimit is half the machine. Not because anything is wrong, but because the formula is
    swap plus <code>vm.overcommit_ratio</code> percent of RAM, the ratio defaults to 50, and there
    is no swap to add. Walking the ratio on that host:
  </p>
  <pre><code>ratio  25 -&gt;  4120492 kB      ratio 100 -&gt; 16481980 kB
ratio  50 -&gt;  8240988 kB      ratio 150 -&gt; 24722968 kB
ratio  80 -&gt; 13185584 kB</code></pre>
  <p>
    Two things to notice. The last figure is larger than the machine, which tells you this is an
    accounting policy and not a capacity. And the arithmetic is done in pages: 16481980 kB is
    4120495 pages, half of that floors to 2060247, and 2060247 pages is 8240988 kB. Write the
    formula in kilobytes and you get 8240990, which is close enough to look like rounding noise
    and wrong in every case that matters.
  </p>
  <p>
    In the default mode none of this does anything. Mode 0 is a heuristic that judges one request
    at a time; it never reads the running total, so Committed_AS can sit above CommitLimit for
    weeks on a healthy host. That is why the limit is usually first noticed by a dashboard.
  </p>
  <p>
    Set <code>vm.overcommit_memory</code> to 2 and the same number becomes a wall. On the host
    above that leaves 4.04 GiB of headroom, so a worker asking for 5 GiB does not start, while
    MemAvailable reads 13.92 GiB. Nothing is broken. Strict accounting compares reservations
    against the limit, and free memory is not one of the terms.
  </p>
  <p>
    It does not retire the out of memory killer either. Committed_AS counts reservations rather
    than pages touched, page cache and shared pages are not in it, and a ratio above 100 hands out
    more than exists. Mode 2 changes when an allocation is refused. It does not change what happens
    when the pages are finally written to.
  </p>
  <h2>What each machine allows, and what it does with the request</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Mode</th><th>Ratio</th><th>Swap</th><th>CommitLimit</th><th>% of RAM</th><th>Committed_AS</th><th>Headroom</th><th>Asks</th><th>Refused</th><th>RAM free</th></tr>
    </thead>
    <tbody>
${OVERCOMMIT_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${s.mode} ${esc(ocMode(s))}</td><td>${s.ratio}</td>` +
    `<td>${esc(ocHuman(s.swapKb))}</td><td>${esc(ocHuman(ocLimit(s)))}</td><td>${ocLimitPct(s)}%</td>` +
    `<td>${esc(ocHuman(s.committedKb))}</td><td>${esc(ocHuman(ocHeadroom(s)))}</td><td>${esc(ocHuman(s.wantKb))}</td>` +
    `<td>${ocRefuses(s) ? "yes" : "no"}</td><td>${esc(ocHuman(s.availableKb))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${OVERCOMMIT_CASES.map((item) => {
  const right = ocCorrect(item);
  const s = item.setup;
  const sysctl = ocSysctl(s).map((line) => `${line.name.padEnd(22)} ${line.value.padStart(10)}  # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(sysctl)}

# the next allocation asks for ${s.wantKb} kB, ${esc(ocHuman(s.wantKb))}</code></pre>
    <p>CommitLimit is ${esc(ocHuman(ocLimit(s)))}, ${ocLimitPct(s)} percent of RAM. Committed_AS is ${ocPctLimit(s)} percent of that limit and ${ocPctRam(s)} percent of the machine. The request is ${ocRefuses(s) ? "refused" : "allowed"}${ocWasteful(s) ? `, with ${esc(ocHuman(s.availableKb))} available` : ""}. The killer ${ocOom(s) ? "can still run: the limit is above RAM plus swap" : "is not made possible by this accounting alone"}.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/commitlimit-is-half-the-memory-and-it-is-not-a-memory-limit", "CommitLimit is half the memory, and it is not a memory limit"], ["/oom", "Something has to die"], ["/throttle", "Thirty percent, and stalling"]])}
</main>`,
  });

  // ── TIME_WAIT ──
  /*
    The static body carries the state table, because the search that brings
    people here is a TIME_WAIT count that did not move after the usual sysctl,
    and what they need is the two timers side by side with the knob's value on
    one of them. The columns put who closed beside what that costs.
  */
  const twStuck = TIMEWAIT_CASES.filter((item) => twExhausts(item.setup)).length;
  const twDescription =
    "Lowering net.ipv4.tcp_fin_timeout does nothing to TIME_WAIT. Measured on one host: with the " +
    "knob at 5, a socket held TIME_WAIT for 60.2 seconds, because TIME_WAIT runs for " +
    "TCP_TIMEWAIT_LEN, sixty seconds compiled into the kernel. The knob governs FIN_WAIT2, the " +
    "state before it, which the same host reaped after 5.3 seconds at 5 and 20.9 at 20. " +
    "TIME_WAIT lands on whichever end called close() first, so a server holding them is a server " +
    "hanging up first, and the real ceiling on a client is ephemeral ports times destinations " +
    `divided by sixty. ${TIMEWAIT_CASES.length} hosts here, ${twStuck} that outrun the tuple space.`;

  await writePage("timewait", base, {
    title: "The TIME_WAIT Knob Everybody Turns Governs a Different State | Max Doubin",
    description: twDescription,
    canonical: `${SITE_URL}/timewait`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Still a minute",
  description: twDescription,
  url: `${SITE_URL}/timewait`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "How TIME_WAIT actually behaves on Linux and why the usual advice misses it: that net.ipv4.tcp_fin_timeout governs FIN_WAIT2 rather than TIME_WAIT, measured at 5.3 and 20.9 seconds for settings of 5 and 20 while TIME_WAIT held 60.2 seconds throughout; that TIME_WAIT's length is TCP_TIMEWAIT_LEN in include/net/tcp.h and no sysctl reaches it; that the end which calls close() first is the end that waits, so a web server closing its own keepalives is the one accumulating them while the client sits in CLOSE_WAIT; that the ceiling on outbound connections is the four tuple count, ephemeral ports times distinct destinations divided by the sixty second hold, which is 470 a second to a single destination on a stock range; that tcp_tw_reuse only serves the side making connections and needs tcp_timestamps to be on; that tcp_tw_recycle was removed in 4.12 for breaking clients behind NAT; and that tcp_max_tw_buckets caps how many sockets wait rather than how long, destroying the excess and logging an overflow",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Still a minute</h1>
  <p>
    ${TIMEWAIT_CASES.length} hosts, one connection each. On ${twStuck} of them the workload outruns the tuple space,
    which is the limit that actually bites, and on none of them does the knob everybody turns help.
  </p>
  <p>
    The advice is always to lower <code>net.ipv4.tcp_fin_timeout</code>. Here is that experiment on
    one host, watching <code>/proc/net/tcp</code>:
  </p>
  <pre><code>tcp_fin_timeout 5    TIME_WAIT held           60.2s
tcp_fin_timeout 5    FIN_WAIT2 reaped after    5.3s
tcp_fin_timeout 20   FIN_WAIT2 reaped after   20.9s</code></pre>
  <p>
    The knob does exactly what its name says. It is a FIN timeout, and it governs FIN_WAIT2, the
    state a socket sits in after it has closed and while it waits for the peer's FIN. TIME_WAIT is
    not waiting for a FIN. It is waiting out the maximum segment lifetime, twice over, and its
    length is <code>TCP_TIMEWAIT_LEN</code> in <code>include/net/tcp.h</code>, sixty seconds fixed
    when the kernel was compiled. Nothing in <code>/proc/sys</code> reaches it.
  </p>
  <p>
    The second surprise is who waits. Watching both ends of a connection where the client closed
    first:
  </p>
  <pre><code>client   FIN_WAIT1 -&gt; FIN_WAIT2 -&gt; TIME_WAIT
server   CLOSE_WAIT</code></pre>
  <p>
    TIME_WAIT belongs to whoever sends the first FIN. A server drowning in it is a server that
    closes its own connections, which is what happens when its keepalive timeout is shorter than
    the client's. Moving the first FIN moves the TIME_WAIT with it, and that is a configuration
    change rather than a sysctl.
  </p>
  <p>
    The third is that the ceiling is arithmetic. With <code>ip_local_port_range</code> at
    <code>32768 60999</code> there are 28,232 ephemeral ports, and each one is held for sixty
    seconds, so a client sustains 470 new connections a second to any one destination address and
    port. A second destination doubles it, because what has to be unique is the whole four tuple.
    Widening the range to the full sixteen bits buys about twice this and no more.
  </p>
  <p>
    <code>tcp_tw_reuse</code> lets a new outbound connection take over a TIME_WAIT slot, so it
    helps the side dialing out and does nothing for a server, and it needs
    <code>tcp_timestamps</code> to tell an old segment from a new one. <code>tcp_tw_recycle</code>,
    which is still in every old tuning guide, was removed in 4.12 because it dropped connections
    from clients behind NAT. And <code>tcp_max_tw_buckets</code> caps how many sockets wait, never
    how long: past it the kernel destroys the excess and logs
    <code>TCP: time wait bucket table overflow</code>, which is the protocol's safety window being
    skipped rather than a tuning success.
  </p>
  <h2>What each host is doing, and what it costs</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Closed first</th><th>State</th><th>Lasts</th><th>fin_timeout</th><th>Ports</th><th>Destinations</th><th>Ceiling/s</th><th>Attempted/s</th><th>Out of tuples</th><th>Buckets</th></tr>
    </thead>
    <tbody>
${TIMEWAIT_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${esc(s.closedFirst)}</td><td>${esc(twState(s))}</td>` +
    `<td>${twSeconds(s)}s</td><td>${s.finTimeout}</td><td>${esc(twHuman(twPorts(s)))}</td>` +
    `<td>${s.destinations}</td><td>${esc(twHuman(twRate(s)))}</td><td>${esc(twHuman(s.attemptsPerSecond))}</td>` +
    `<td>${twExhausts(s) ? "yes" : "no"}</td><td>${twOverflows(s) ? "overflowing" : "ok"}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${TIMEWAIT_CASES.map((item) => {
  const right = twCorrect(item);
  const s = item.setup;
  const sysctl = twSysctl(s).map((line) => `${line.name.padEnd(30)} ${line.value.padEnd(14)} # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(sysctl)}

# the ${s.closedFirst} called close() first${s.peerFinSeen ? " and the peer's FIN has arrived" : ", and the peer has not answered"}</code></pre>
    <p>The ${esc(s.closedFirst)} is in ${esc(twState(s))} for ${twSeconds(s)} seconds. ${esc(twHuman(twPorts(s)))} ports across ${s.destinations} destination${s.destinations === 1 ? "" : "s"} is ${esc(twHuman(twTuples(s)))} four tuples, which over ${TW_LEN} seconds sustains ${esc(twHuman(twRate(s)))} connections a second against the ${esc(twHuman(s.attemptsPerSecond))} attempted. tcp_tw_reuse ${twReuse(s) ? "relieves this workload" : "does nothing here"}.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-time-wait-knob-everybody-turns-governs-a-different-state", "The TIME_WAIT knob everybody turns governs a different state"], ["/retrans", "Fifteen, and there were four"], ["/conntrack", "Table full"]])}
</main>`,
  });

  // ── the socket receive buffer ──
  /*
    The static body carries the ceilings table, because the search that brings
    people here is a transfer that got slower after somebody tuned it, and
    what they need is the two ceilings side by side for a host shaped like
    theirs. The columns put tcp_rmem's maximum beside twice rmem_max, which is
    the comparison the whole surface turns on.
  */
  const rcShrunk = RCVBUF_CASES.filter((item) => rcBackfired(item.setup)).length;
  const rcDescription =
    "net.ipv4.tcp_mem is in pages and the tcp_rmem beside it is in bytes, with nothing in either " +
    "name to say so. A socket's default reads back undoubled and a value passed to setsockopt " +
    "reads back doubled, because sock_setsockopt stores twice what you give it. Asking for more " +
    "than net.core.rmem_max is clamped with no error. And setting SO_RCVBUF turns autotuning off " +
    "for the life of the socket, so where autotuning may reach tcp_rmem's maximum, a tuned socket " +
    "is capped at twice net.core.rmem_max: on a stock host that is four times smaller than leaving " +
    `it alone. ${RCVBUF_CASES.length} hosts here, ${rcShrunk} where the tuning is what capped it.`;

  await writePage("rcvbuf", base, {
    title: "The Socket Buffer You Tuned Is Smaller Than the One You Did Not | Max Doubin",
    description: rcDescription,
    canonical: `${SITE_URL}/rcvbuf`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Tuned smaller",
  description: rcDescription,
  url: `${SITE_URL}/rcvbuf`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "How Linux sizes a TCP receive buffer and why tuning it usually makes it smaller: that net.ipv4.tcp_mem is counted in pages while tcp_rmem and tcp_wmem next to it are in bytes, so the same three numbers are four thousand times apart depending on which you assume; that a socket nobody has set reports tcp_rmem's default undoubled while a value passed to setsockopt reports back doubled, because sock_setsockopt stores twice the request for sk_buff overhead; that a request over net.core.rmem_max is clamped silently and setsockopt still returns success; that setting SO_RCVBUF disables autotuning permanently for that socket; that autotuning's ceiling is tcp_rmem's third value while a pinned buffer's ceiling is twice net.core.rmem_max, two different sysctls commonly left at different values; and that tcp_mem's three marks are three behaviors, with the kernel not accounting below the first, shrinking buffers past the second and refusing allocations past the third",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Tuned smaller</h1>
  <p>
    ${RCVBUF_CASES.length} hosts, one socket each. On ${rcShrunk} of them the setting somebody added is the thing
    capping the buffer.
  </p>
  <p>
    Four things make socket buffer tuning wrong more often than not, and all four were measured on
    one host. First, the units do not match:
  </p>
  <pre><code>net.ipv4.tcp_mem    191742  255659  383484    # PAGES
net.ipv4.tcp_rmem     4096  131072 33554432    # bytes
net.core.rmem_max            4194304           # bytes</code></pre>
  <p>
    383484 pages is 1.46 GiB, which is 9.3 percent of a 16 GiB machine and is a number somebody
    chose. Read as bytes it is 0.4 MiB, or 0.0023 percent, which is not. The arithmetic is the tell.
    /proc/net/sockstat's mem column is in pages as well.
  </p>
  <p>
    Second, the doubling is on the assignment and not on the field:
  </p>
  <pre><code>fresh socket  SO_RCVBUF 131072, tcp_rmem default 131072   ratio 1.0
setting that  131072 reads back            262144         ratio 2.0</code></pre>
  <p>
    So reading the value before and after a change shows a doubling that looks like the kernel
    rounding up to the default, and is not.
  </p>
  <p>
    Third, it is clamped in silence. Asking for 16 MiB against an rmem_max of 4 MiB returned success
    and gave 8 MiB, which is twice the sysctl. A program that checks the return value and not the
    value learns nothing.
  </p>
  <p>
    And fourth, the one that costs throughput: setting SO_RCVBUF turns autotuning off for the life
    of the socket, and autotuning is allowed to go further than you are. Autotuning may reach
    tcp_rmem's maximum of 32 MiB. A pinned buffer is capped at twice rmem_max, which is 8 MiB. The
    socket somebody tuned tops out four times smaller than the one nobody touched.
  </p>
  <h2>What each host allows, and which ceiling applies</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>tcp_mem high</th><th>tcp_rmem max</th><th>rmem_max</th><th>Asks</th><th>Reports</th><th>Autotuning</th><th>Ceiling</th><th>Tuned smaller</th><th>Band</th></tr>
    </thead>
    <tbody>
${RCVBUF_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${esc(rcHuman(rcHigh(s)))}</td><td>${esc(rcHuman(s.tcpRmem[2]))}</td>` +
    `<td>${esc(rcHuman(s.rmemMax))}</td><td>${s.asks === null ? "never" : esc(rcHuman(s.asks))}</td>` +
    `<td>${esc(rcHuman(rcReported(s)))}</td><td>${rcAuto(s) ? "on" : "off"}</td>` +
    `<td>${esc(rcHuman(rcCeiling(s)))}</td><td>${rcBackfired(s) ? "yes" : "no"}</td><td>${esc(rcBand(s))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${RCVBUF_CASES.map((item) => {
  const right = rcCorrect(item);
  const s = item.setup;
  const sysctl = rcSysctl(s).map((line) => `${line.name.padEnd(20)} ${line.value.padEnd(26)} # ${line.unit}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(sysctl)}

# the program ${s.asks === null ? "never calls setsockopt" : `calls setsockopt(SO_RCVBUF, ${s.asks})`}</code></pre>
    <p>getsockopt reports ${esc(rcHuman(rcReported(s)))}, autotuning is ${rcAuto(s) ? "on" : "off"}, and the ceiling is ${esc(rcHuman(rcCeiling(s)))}. tcp_mem's high mark is ${esc(rcHuman(rcHigh(s)))} read as pages and ${esc(rcHuman(rcHighBytes(s)))} read as bytes.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-socket-buffer-you-tuned-is-smaller-than-the-one-you-did-not", "The socket buffer you tuned is smaller than the one you did not"], ["/transfer", "Why the transfer is slow"], ["/fds", "Too many open files"]])}
</main>`,
  });

  // ── the descriptor limits ──
  /*
    The static body carries the limits table, because the search that brings
    people here is EMFILE with a ulimit that already looks generous, and what
    they need is the four numbers side by side for a host shaped like theirs.
    The columns put them in the order the kernel checks them, which is the
    order the diagnosis goes in.
  */
  const fdFrozenCount = FDS_CASES.filter((item) => fdFrozen(item.setup)).length;
  const fdDescription =
    "Four limits cap an open file and they are checked in different places with different " +
    "permissions: the RLIMIT_NOFILE soft limit in alloc_fd, the hard limit as the ceiling the " +
    "process may raise the soft one to, fs.nr_open as the ceiling on any hard limit, and " +
    "fs.file-max across the whole machine. Raising a hard limit needs CAP_SYS_RESOURCE, which " +
    "uid 0 does not imply, so a container running as root can be unable to move its own limit. " +
    "A request over fs.nr_open is refused rather than reduced, and because every setrlimit call " +
    "restates the hard limit, lowering fs.nr_open freezes every process already above it in both " +
    `directions. ${FDS_CASES.length} processes here, ${fdFrozenCount} of them frozen outright.`;

  await writePage("fds", base, {
    title: "Too Many Open Files, and Which of the Four Limits It Was | Max Doubin",
    description: fdDescription,
    canonical: `${SITE_URL}/fds`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Too many open files",
  description: fdDescription,
  url: `${SITE_URL}/fds`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Which of the four open file limits is the binding one and why the others are not: that the RLIMIT_NOFILE soft limit is what alloc_fd checks and the hard limit is only the ceiling a process may raise it to, so a generous hard limit beside a small soft one is the normal shape of this failure; that any process may raise its soft limit to its hard limit with no privilege at all; that raising the hard limit needs CAP_SYS_RESOURCE rather than uid 0, which containers commonly drop while keeping every other capability; that fs.nr_open caps every hard limit including a privileged one and refuses rather than reduces a request over it; that because setrlimit carries both values, lowering fs.nr_open freezes every process already holding more, including calls that would only lower a limit; that lowering a hard limit is a one way door inherited across exec; and that EMFILE names the per process limit while ENFILE names fs.file-max, which on a normal machine is never close",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Too many open files</h1>
  <p>
    ${FDS_CASES.length} processes, one question each. ${fdFrozenCount} of them cannot move their limits at all,
    and on most of the rest the number somebody raised was not the one that was stopping them.
  </p>
  <p>
    Four limits, in the order the kernel checks them:
  </p>
  <pre><code>RLIMIT_NOFILE soft   what this process may open now      (alloc_fd)
RLIMIT_NOFILE hard   what it may raise the soft limit to
fs.nr_open           what ANY process may raise its hard limit to
fs.file-max          open files across the whole machine  (__alloc_file)</code></pre>
  <p>
    And above them a capability. Raising a hard limit needs <code>CAP_SYS_RESOURCE</code>, and uid 0
    does not imply it. The container these measurements were taken on runs as root with forty of the
    forty one capabilities:
  </p>
  <pre><code>Uid:    0  0  0  0
CapEff: 000001fffeffffff</code></pre>
  <p>
    The single zero is bit 24, <code>CAP_SYS_RESOURCE</code>. That process can write sysctls, create
    network namespaces and load nftables rules, and it cannot raise its own hard limit by one:
    <code>setrlimit(NOFILE, (20000, 1048577))</code> came back with not allowed to raise maximum
    limit, and the pair stayed at 20000. Note refused, not reduced. From <code>kernel/sys.c</code>
    the fs.nr_open test returns EPERM, and it runs before the capability test and consults no
    credentials, so it binds a privileged process too.
  </p>
  <p>
    Because every <code>setrlimit</code> call carries both values, a call that only means to lower
    the soft limit still restates the hard one. Measured, holding a hard limit of 20000 with
    fs.nr_open lowered to 4096: a call setting soft to 5000 was refused, naming the limit it was
    not trying to change. Lowering fs.nr_open system wide freezes every process already above it,
    in both directions, and nothing reports it.
  </p>
  <p>
    The machine wide number is almost never the one you hit. With the soft limit at 200, the two
    hundredth open gave EMFILE and the highest descriptor handed out was 199, while
    <code>fs.file-nr</code> read 563 of 1,645,588, which is 0.034 percent. Its middle column,
    documented as the number of free file handles, read 0 before, 0 at the peak and 0 after.
  </p>
  <h2>What each process is allowed, and what stops it</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>fs.file-max</th><th>fs.nr_open</th><th>Soft</th><th>Hard</th><th>CAP_SYS_RESOURCE</th><th>Wants</th><th>Ends at soft</th><th>Frozen</th><th>Result</th><th>Binding</th></tr>
    </thead>
    <tbody>
${FDS_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${fdCount(s.fileMax)}</td><td>${fdCount(s.nrOpen)}</td>` +
    `<td>${fdCount(s.soft)}</td><td>${fdCount(s.hard)}</td><td>${s.sysResource ? "held" : "not held"}</td>` +
    `<td>${fdCount(s.needFds)}</td><td>${fdCount(fdSoft(s))}</td><td>${fdFrozen(s) ? "yes" : "no"}</td>` +
    `<td>${fdOutcome(s).toUpperCase()}</td><td>${esc(fdBinding(s))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${FDS_CASES.map((item) => {
  const right = fdCorrect(item);
  const s = item.setup;
  const limits = fdLimits(s).map((line) => `${line.name.padEnd(22)} ${line.value.padStart(9)}   # ${line.note}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(limits)}

# the workload needs ${fdCount(s.needFds)} descriptors, and the machine already holds ${fdCount(s.systemOpen)}</code></pre>
    <p>It ends with a soft limit of ${fdCount(fdSoft(s))} against a hard limit of ${fdCount(fdHard(s))}, and opening gives ${fdOutcome(s).toUpperCase()}. The binding number is ${esc(fdBinding(s))}.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/too-many-open-files-and-which-of-the-four-limits-it-was", "Too many open files, and which of the four limits it was"], ["/writeback", "Not written down"], ["/ports", "Out of ports"]])}
</main>`,
  });

  // ── the dirty page thresholds ──
  /*
    The static body carries the threshold table, because the search that
    brings people here is a write stall or a sysctl nobody can account for,
    and what they need is the byte figure for a host shaped like theirs. The
    columns put installed memory beside dirtyable beside the two thresholds,
    which is the comparison that shows the ratio is not of the first one.
  */
  const wbStalls = WRITEBACK_CASES.filter((item) => wbThrottled(item.setup)).length;
  const wbDescription =
    "vm.dirty_ratio is not a percentage of installed memory. global_dirtyable_memory() sums free " +
    "pages and the file backed LRU, so every anonymous page in the machine is outside the base " +
    "the ratio is taken against, and the same sysctl means a different number of bytes on a busy " +
    "host than an idle one. It is also not where the queue settles: that is " +
    "dirty_background_ratio, where the flushers are woken, and a writer only reaches dirty_ratio " +
    "by outrunning its device. And under the background threshold nothing is in a hurry at all, " +
    "so a closed file can sit in volatile memory for dirty_expire_centisecs plus one flusher " +
    `wake, measured at 35 seconds on the defaults. ${WRITEBACK_CASES.length} hosts here, ${wbStalls} that stall.`;

  await writePage("writeback", base, {
    title: "The Page Cache Is a Buffer and You Tuned the Wrong End | Max Doubin",
    description: wbDescription,
    canonical: `${SITE_URL}/writeback`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Not written down",
  description: wbDescription,
  url: `${SITE_URL}/writeback`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "How Linux decides when a buffered write leaves memory: that vm.dirty_ratio and vm.dirty_background_ratio are percentages of dirtyable memory, which is free pages plus the file backed LRU and excludes anonymous memory, so the same setting means different byte counts on two machines with identical RAM; that the queue settles at the background threshold rather than at dirty_ratio, because the writer only reaches dirty_ratio by outrunning its device; that raising dirty_ratio on a saturated device buys a longer run between stalls at the cost of more unwritten data; that dirty_expire_centisecs and dirty_writeback_centisecs together let a closed file sit in volatile memory for 35 seconds on the defaults; and that the ratio and bytes forms of each knob are mutually exclusive, last write wins, and the loser reads back as zero",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Not written down</h1>
  <p>
    ${WRITEBACK_CASES.length} hosts, one question each. ${wbStalls} of them stall the writer, and on the rest the
    ceiling everybody tunes is never reached at all.
  </p>
  <p>
    The percentage is not of installed memory. From mm/page-writeback.c:
  </p>
  <pre><code>x = global_zone_page_state(NR_FREE_PAGES);
x -= min(x, totalreserve_pages);

x += global_node_page_state(NR_INACTIVE_FILE);
x += global_node_page_state(NR_ACTIVE_FILE);</code></pre>
  <p>
    Free pages plus the file backed LRU. Anonymous memory is absent from that sum, correctly, because
    a page of heap has nowhere to be written back to. So the base shrinks exactly when a process
    starts using memory, and two machines with identical RAM and identical sysctls have thresholds
    that are nothing like each other.
  </p>
  <p>
    Measured. With dirty_background_ratio at 1 and dirty_ratio at 2, writing 2.5 GiB and sampling
    /proc/meminfo every 20ms, the ceiling was 147 MiB against 14.90 GiB of dirtyable memory. Holding
    9 GiB of anonymous memory took dirtyable to 5.85 GiB and the ceiling to 57 MiB. Both fell by the
    same factor of 0.39, while the share of installed memory moved from 0.91 to 0.35 percent. If the
    ratio were of RAM the ceiling would not have moved.
  </p>
  <p>
    Both of those runs had dirty_ratio at 2 and settled at 1, which is the background number.
    dirty_ratio is where the writer itself is made to wait, and a device that keeps up means nothing
    ever gets there. And below the background threshold nothing is in a hurry: 64 MiB written to an
    idle disk stayed at 64 MiB of Dirty for thirty seconds without a byte moving, and reached zero at
    thirty five, which is dirty_expire_centisecs plus one flusher wake.
  </p>
  <h2>What each host holds, and where its thresholds fall</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Installed</th><th>Anonymous</th><th>Dirtyable</th><th>Live knob</th><th>Flushers wake</th><th>Writer waits</th><th>Write</th><th>Device</th><th>Settles at</th><th>Stalls</th></tr>
    </thead>
    <tbody>
${WRITEBACK_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${s.ramGiB} GiB</td><td>${s.anonGiB} GiB</td>` +
    `<td>${esc(wbHuman(wbDirtyable(s)))}</td><td>${esc(wbLive("hard", s))}</td>` +
    `<td>${esc(wbHuman(wbBackground(s)))}</td><td>${esc(wbHuman(wbHard(s)))}</td>` +
    `<td>${s.writeMiBps} MiB/s</td><td>${s.deviceMiBps} MiB/s</td>` +
    `<td>${esc(wbHuman(wbSettled(s)))}</td><td>${wbThrottled(s) ? "yes" : "no"}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${WRITEBACK_CASES.map((item) => {
  const right = wbCorrect(item);
  const s = item.setup;
  const sysctl = wbSysctl(s).map((line) => `${line.name.padEnd(30)} ${line.value}${line.live ? "" : "   # zeroed: the other form is live"}`).join("\n");
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(sysctl)}

# ${s.ramGiB} GiB installed, ${s.anonGiB} GiB anonymous, ${esc(wbHuman(wbDirtyable(s)))} dirtyable
# writing ${s.writeMiBps} MiB/s at a device that retires ${s.deviceMiBps} MiB/s</code></pre>
    <p>Flushers wake at ${esc(wbHuman(wbBackground(s)))}, the writer waits at ${esc(wbHuman(wbHard(s)))}, and it settles at ${esc(wbHuman(wbSettled(s)))} (${wbMiB(wbSettled(s))} MiB). An unhurried page waits ${wbAge(s)} seconds.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-page-cache-is-a-buffer-and-you-tuned-the-wrong-end", "The page cache is a buffer and you tuned the wrong end"], ["/free", "Something has to give"], ["/shm", "Bus error"]])}
</main>`,
  });

  // ── the conntrack table ──
  /*
    The static body carries the sizing table, because the search that brings
    people here is the dmesg line and what they need next is the limit for a
    host shaped like theirs. The columns put memory beside buckets beside max,
    which is the comparison that shows the factor is one and not eight.
  */
  const ctOver = CONNTRACK_CASES.filter((item) => ctOverflows(item.setup)).length;
  const ctStuck = CONNTRACK_CASES.filter((item) => ctOverflows(item.setup) && !ctEarly(item.setup)).length;
  const ctDescription =
    "nf_conntrack: table full, dropping packet does not mean the table reached its limit. " +
    "early_drop runs first and the message is printed only when it returns false, and " +
    "early_drop_list skips any entry with IPS_ASSURED set, which is every connection that has " +
    "carried traffic both ways. So a table of scans can be evicted and a table of working " +
    "connections cannot. The limit itself is nf_conntrack_max = max_factor * " +
    "nf_conntrack_htable_size, and max_factor is 8 only when somebody set the hash size by hand: " +
    "the auto-sizing branch sets it to 1, so an ordinary host has a limit equal to its bucket " +
    `count rather than four or eight times it. ${CONNTRACK_CASES.length} hosts here, ${ctOver} that overflow and ` +
    `${ctStuck} where the kernel can do nothing about it.`;

  await writePage("conntrack", base, {
    title: "The Table Is Full and the Kernel Cannot Shrink It | Max Doubin",
    description: ctDescription,
    canonical: `${SITE_URL}/conntrack`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Table full",
  description: ctDescription,
  url: `${SITE_URL}/conntrack`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why a conntrack table fills and what the kernel can do about it: that nf_conntrack_max is max_factor times the hash size and max_factor is 1 on every host that did not have the size forced, so the widely quoted four or eight to one ratio is wrong; that the bucket count steps at one and four gibibytes rather than scaling with memory; that early_drop runs before the table full message and skips any entry marked assured, so a table of established connections cannot be shrunk while a table of half open scans can; that assured is set on two way UDP as well as TCP; and that nf_conntrack_tcp_timeout_established is 432000 seconds, so a connection that dies without a FIN holds its slot for five days",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Table full</h1>
  <p>
    ${CONNTRACK_CASES.length} hosts, one question each. ${ctOver} of them overflow, and on ${ctStuck} the
    kernel cannot make room however hard it tries.
  </p>
  <p>
    The message names its own cause, which is why it is usually misread. From
    net/netfilter/nf_conntrack_core.c, the line is printed only when
    <code>early_drop</code> has already run and come back empty:
  </p>
  <pre><code>if (unlikely(ct_count &gt; nf_conntrack_max)) {
        if (!early_drop(net, hash)) {
                ...
                net_warn_ratelimited("nf_conntrack: table full, dropping packet\n");</code></pre>
  <p>
    And what early_drop is allowed to take is one bit. <code>early_drop_list</code> skips any entry
    with <code>IPS_ASSURED</code> set, and a flow becomes assured once it has carried traffic in
    both directions. So the eviction path clears out scans and abandoned handshakes and can do
    nothing at all about a table of working connections. Measured, with the limit lowered to 20 and
    the table filled with established connections: 296 drops against zero evictions.
  </p>
  <p>
    The limit itself is <code>nf_conntrack_max = max_factor * nf_conntrack_htable_size</code>, and
    <code>max_factor</code> is initialised to 8 but set to 1 on the last line of the branch that
    sizes the table from memory. It is 8 only where somebody set the hash size by hand. The host
    these numbers were taken on has 15 GiB, and reports nf_conntrack_max 262144 against
    nf_conntrack_buckets 262144: one to one, not the four or eight that every tuning guide quotes.
  </p>
  <h2>What each host allows, and what it holds</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>Memory</th><th>Hash size</th><th>Buckets</th><th>max_factor</th><th>nf_conntrack_max</th><th>Flows</th><th>Entry lifetime</th><th>Held</th><th>Overflows</th><th>early_drop helps</th></tr>
    </thead>
    <tbody>
${CONNTRACK_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.host)}</td><td>${s.ramGiB} GiB</td>` +
    `<td>${s.forcedBuckets === null ? "auto" : "forced"}</td><td>${ctCount(ctBuckets(s))}</td>` +
    `<td>${ctFactor(s)}</td><td>${ctCount(ctMax(s))}</td>` +
    `<td>${s.flowsPerSecond}/s ${esc(s.flow)}</td><td>${esc(ctHuman(ctTimeout(s)))}</td>` +
    `<td>${ctCount(ctHeld(s))}</td><td>${ctOverflows(s) ? "yes" : "no"}</td>` +
    `<td>${ctEarly(s) ? "yes" : "no"}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${CONNTRACK_CASES.map((item) => {
  const right = ctCorrect(item);
  const s = item.setup;
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(ctSysctl(s))}

${esc(ctCounters(s))}</code></pre>
    <p>${ctCount(ctHeld(s))} entries held against a limit of ${ctCount(ctMax(s))}, and early_drop ${ctEarly(s) ? "can" : "cannot"} take them.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-table-was-full-and-the-kernel-could-not-shrink-it", "The table was full and the kernel could not shrink it"], ["/neigh", "Neighbor table overflow"], ["/ports", "Out of ports"]])}
</main>`,
  });

  // ── the retransmission budget ──
  /*
    The static body carries the budget table, because the search that brings
    people here is a socket that hung for a quarter of an hour and what they
    need is the number for their own tcp_retries2. The table puts the sysctl
    beside the seconds and beside the count, which is the comparison the whole
    surface turns on.
  */
  const retransDiverging = RETRANS_CASES.filter((item) => !retransMatches(item.setup)).length;
  const retransDescription =
    "tcp(7) calls tcp_retries2 the maximum number of times a TCP packet is retransmitted before " +
    "giving up, default 15, and the kernel never counts a retransmission. retransmits_timed_out " +
    "turns the number into a length of time with tcp_model_timeout and compares the elapsed clock " +
    "against it, and it builds that model from TCP_RTO_MIN rather than from the connection's own " +
    "retransmit timeout. The threshold is ilog2 of 120 seconds over 200 milliseconds, which is 9, " +
    "so the default budget is 1023 times 200ms plus six intervals of two minutes: 924.6 seconds, " +
    "the same on every Linux host whatever the path. The number of attempts that fit inside it is " +
    `different on every path. ${RETRANS_CASES.length} connections here, ${retransDiverging} where the count that goes ` +
    "out is not the number in the sysctl.";

  await writePage("retrans", base, {
    title: "The Connection Gave Up After Fifteen Retransmissions, and There Were Four | Max Doubin",
    description: retransDescription,
    canonical: `${SITE_URL}/retrans`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Fifteen, and there were four",
  description: retransDescription,
  url: `${SITE_URL}/retrans`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why a TCP socket waits a quarter of an hour after the far end dies: that tcp_retries2 is documented as a count and implemented as a time budget, that retransmits_timed_out models that budget from TCP_RTO_MIN rather than the connection's own RTO so it is 924.6 seconds on every host, that the number of retransmissions that actually go out is one more than the sysctl on a fast path and fewer on a slow one, that the budget is exponential in the sysctl below a threshold of nine and linear at two minutes a step above it, and that TCP_USER_TIMEOUT is the only setting in the mechanism whose value is the deadline rather than an input to a model",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Fifteen, and there were four</h1>
  <p>
    ${RETRANS_CASES.length} connections into a hole, and one question each.
    ${retransDiverging} of them retransmit a different number of times than the sysctl names, and
    the one that agrees agrees by coincidence of its round trip time.
  </p>
  <p>
    The manual page is plain, and wrong in a way that matters:
    "<em>tcp_retries2</em>: The maximum number of times a TCP packet is retransmitted in
    established state before giving up. The default value is 15, which corresponds to a duration of
    approximately between 13 to 30 minutes, depending on the retransmission timeout."
    The kernel does not count retransmissions. <code>retransmits_timed_out</code> converts the
    number into a length of time and compares the elapsed wall clock against it, and the model it
    builds runs on <code>TCP_RTO_MIN</code>, not on this connection's retransmit timeout. The
    duration does not depend on the retransmission timeout at all: it is 924.6 seconds, everywhere.
  </p>
  <p>
    Measured rather than derived, on a kernel whose <code>/proc/net/snmp</code> reports
    <code>RtoMin 200</code> and <code>RtoMax 120000</code>: with <code>tcp_retries2</code> at 5 and
    the peer black holed, a socket returned ETIMEDOUT after 13.25 seconds having retransmitted 6
    segments; at 6, after 26.39 seconds having retransmitted 7. The model says 12.6 seconds and 6,
    and 25.4 seconds and 7. One more retransmission than the sysctl names, both times.
  </p>
  <h2>What each connection is given</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Peer</th><th>tcp_retries2</th><th>Path RTO</th><th>TCP_USER_TIMEOUT</th><th>Budget</th><th>Retransmissions</th><th>Matches the sysctl</th><th>Ending</th></tr>
    </thead>
    <tbody>
${RETRANS_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(s.peer)}</td><td>${s.retries2}</td><td>${esc(retransHuman(s.rtoMs))}</td>` +
    `<td>${s.userTimeoutMs === 0 ? "unset" : esc(retransHuman(s.userTimeoutMs))}</td>` +
    `<td>${retransBudget(s)}s</td><td>${retransCount(s)}</td>` +
    `<td>${retransMatches(s) ? "yes" : "no"}</td><td>${esc(retransEnding(s))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${RETRANS_CASES.map((item) => {
  const right = retransCorrect(item);
  const s = item.setup;
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(retransSysctl(s))}

${esc(retransTrace(s))}</code></pre>
    <p>A budget of ${retransBudget(s)} seconds, ${retransCount(s)} retransmissions inside it, against the ${s.retries2} in the sysctl.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/tcp-retries2-is-not-a-count", "tcp_retries2 is not a count"], ["/keepalive", "Six minutes of silence"], ["/backlog", "Idle, and the connections time out"]])}
</main>`,
  });

  // ── the SSH startup ramp ──
  /*
    The static body carries the three numbers, the occupancy arithmetic per
    daemon and the ramp's shape, because the search that brings people here is
    a connection that failed once and worked on the retry, and what they need
    next is the count for a daemon shaped like theirs. The table puts the
    arrival rate beside the settled occupancy, which is the step everybody
    skips.
  */
  const maxRefusing = MAXSTARTUPS_CASES.filter((item) => maxCertainty(item.setup) !== "accepted").length;
  const maxCertain = MAXSTARTUPS_CASES.filter((item) => maxCertainty(item.setup) === "dropped").length;
  const maxDescription =
    "MaxStartups counts connections that have not finished authenticating, not sessions and not " +
    "load, and sshd_config(5) gives its default as 10:30:100: random early drop, starting at ten " +
    "concurrent unauthenticated connections with a thirty percent chance and reaching certainty " +
    "at a hundred. So the eleventh connection is a coin toss, the same command run again works, " +
    "and nothing about the machine changed. A slot is held until authentication succeeds or " +
    "LoginGraceTime expires, which defaults to 120 seconds, so ten connections a minute that " +
    `never authenticate is twenty slots standing. ${MAXSTARTUPS_CASES.length} daemons here, ${maxRefusing} refusing ` +
    `something and ${maxCertain} refusing everything.`;

  await writePage("maxstartups", base, {
    title: "The Connection Was Refused and the Daemon Was Not Busy | Max Doubin",
    description: maxDescription,
    canonical: `${SITE_URL}/maxstartups`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Connection refused",
  description: maxDescription,
  url: `${SITE_URL}/maxstartups`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "Why sshd refuses connections on an idle host: that MaxStartups counts concurrent unauthenticated connections rather than sessions or load, that its default 10:30:100 is a random early drop so the same command can fail and then succeed, that the middle number is the probability at the bottom of the ramp and not along it, that every step of should_drop_connection is integer arithmetic so the ramp is a staircase rather than the line its own comment describes, that raising the third number lowers the odds but only the first number can make them zero, that a slot is held until authentication succeeds or LoginGraceTime expires so arrival rate times holding time is the occupancy, that LoginGraceTime 0 means a connection that never authenticates never gives its slot back, and that drop_connection rate limits its own logging so a daemon dropping steadily goes quiet",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Connection refused</h1>
  <p>
    ${MAXSTARTUPS_CASES.length} SSH daemons, each with an arrival pattern and one question.
    ${maxRefusing} of them are refusing something and ${maxCertain} are refusing everything, and
    not one of them is short of processor, memory or bandwidth.
  </p>
  <p>
    The manual page gives the default in one line: "Alternatively, random early drop can be
    enabled by specifying the three colon separated values start:rate:full (e.g. 10:30:60). The
    default is 10:30:100." What it does not say is that every step of the calculation behind it is
    integer arithmetic, so the rise the source comment calls linear is a staircase. On the default
    setting ten standing and eleven standing both give thirty percent, and the probability holds
    flat for about one and a third connections at a time all the way up.
  </p>
  <p>
    The other half is what fills the slots. A connection holds one from the moment it is accepted
    until it authenticates or <code>LoginGraceTime</code> expires, which defaults to 120 seconds.
    Arrival rate times holding time is the occupancy, and nothing else is. Ten connections a
    minute that never authenticate is twenty slots standing, which is twice the default start
    value, from a rate of traffic no graph would show.
  </p>
  <h2>What each daemon is holding</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Host</th><th>MaxStartups</th><th>Grace</th><th>Arriving</th><th>Never finishing</th><th>Standing</th><th>Chance of refusal</th><th>Safe start value</th></tr>
    </thead>
    <tbody>
${MAXSTARTUPS_CASES.map((item) => {
  const s = item.setup;
  const standing = maxInFlight(s);
  const safe = maxSafeBegin(s);
  return `      <tr><td>${esc(s.host)}</td><td>${s.begin}:${s.rate}:${s.full}</td>` +
    `<td>${s.graceSeconds === 0 ? "none" : `${s.graceSeconds}s`}</td>` +
    `<td>${s.arrivalsPerMinute}/min at ${s.authSeconds}s</td><td>${s.stuckPerMinute}/min</td>` +
    `<td>${standing === null ? "climbs without bound" : standing}</td>` +
    `<td>${maxDrop(s)}%</td><td>${safe === null ? "none helps" : safe}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${MAXSTARTUPS_CASES.map((item) => {
  const right = maxCorrect(item);
  const s = item.setup;
  const standing = maxInFlight(s);
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(maxConfig(s))}

${esc(maxLog(s))}</code></pre>
    <p>${standing === null
      ? "The count never settles, because nothing reclaims a slot from a connection that does not authenticate."
      : `${standing} connections stand unauthenticated once the arrivals settle, which puts the chance of a refusal at ${maxDrop(s)} percent.`}</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-connection-refused-by-a-daemon-doing-nothing", "The connection refused by a daemon doing nothing"], ["/backlog", "Idle, and the connections time out"], ["/keepalive", "Six minutes of silence"]])}
</main>`,
  });

  // ── the neighbor table ──
  /*
    The static body carries the sysctl block and the entry arithmetic per
    segment, because the search that brings people here is the dmesg line, and
    what they need next is the count for a segment shaped like theirs. The
    table also makes the IPv4 and IPv6 columns sit next to each other, which
    is the comparison the whole surface turns on.
  */
  const neighOverflowing = NEIGH_CASES.filter((item) => neighOverflows(item.setup)).length;
  const neighForced = NEIGH_CASES.filter((item) => neighState(item.setup) === "forced-collection").length;
  const neighDescription =
    "The ARP cache is not unbounded. net/ipv4/arp.c ships gc_thresh1 at 128, gc_thresh2 at 512 " +
    "and gc_thresh3 at 1024, and net/ipv6/ndisc.c ships exactly the same three, so a flat /22 " +
    "with 900 dual stack hosts is over the IPv6 hard limit before anybody has done anything " +
    "unusual, because each host costs a link local entry and a global one. Overflow also takes a " +
    "failed garbage collection rather than a full table alone: neigh_alloc tries a forced " +
    "collection first, and that may only take entries untouched for five seconds, so the same " +
    "table fails after a power cut and runs fine all afternoon. " +
    `${NEIGH_CASES.length} segments here, ${neighOverflowing} refusing new neighbors and ${neighForced} running ` +
    "permanently in forced collection with nothing logged anywhere.";

  await writePage("neigh", base, {
    title: "Neighbor Table Overflow, on a Network With Nothing Wrong | Max Doubin",
    description: neighDescription,
    canonical: `${SITE_URL}/neigh`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Neighbor table overflow",
  description: neighDescription,
  url: `${SITE_URL}/neigh`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "What the three neighbor table thresholds actually do: gc_thresh1 as a floor below which the periodic collector never runs, gc_thresh2 as the target of a forced collection rather than a limit, and gc_thresh3 as an exact hard limit read before the allocation's own increment; why an IPv6 host costs at least two entries against a table with the same defaults as IPv4; why overflow needs both a full table and a forced collection that frees nothing, so arrival speed decides the outcome; why NUD_PERMANENT entries are exempt from the counter and do not relieve pressure; and why raising gc_thresh3 alone converts a logged failure into an unlogged cost",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Neighbor table overflow</h1>
  <p>
    ${NEIGH_CASES.length} segments and one neighbor table each. ${neighOverflowing} of them refuse
    new neighbors outright, and ${neighForced} run permanently in forced collection, which costs
    latency on every new neighbor and is logged nowhere.
  </p>
  <p>
    The shipped thresholds are gc_thresh1 128, gc_thresh2 512 and gc_thresh3 1024, the same in
    <code>net/ipv4/arp.c</code> and <code>net/ipv6/ndisc.c</code>. An IPv4 host costs one entry and
    an IPv6 host costs at least two, a link local address and a global one, so a dual stack
    segment reaches its IPv6 limit at about half the host count. And <code>neigh_alloc</code>
    refuses only when the table is at gc_thresh3 <em>and</em> a forced collection frees nothing,
    where that collection may only take entries untouched for five seconds. The count is not the
    whole story; the age distribution is the rest of it.
  </p>
  <h2>What each segment holds</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Table</th><th>Hosts</th><th>Per host</th><th>Entries</th><th>gc_thresh3</th><th>Arrived</th><th>State</th><th>Needs</th></tr>
    </thead>
    <tbody>
${NEIGH_CASES.map((item) => {
  const s = item.setup;
  return `      <tr><td>${esc(neighTableId(s.family))}</td><td>${s.hosts}</td><td>${s.addressesPerHost}</td>` +
    `<td>${neighEntries(s)}${s.permanent > 0 ? ` (+${s.permanent} permanent)` : ""}</td><td>${s.thresh3}</td>` +
    `<td>${s.arrivedInABurst ? "all at once" : "gradually"}</td><td>${esc(neighState(s))}</td>` +
    `<td>${neighNeeded(s)}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${NEIGH_CASES.map((item) => {
  const right = neighCorrect(item);
  const s = item.setup;
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>$ sysctl -a | grep neigh.default.gc_thresh
${esc(neighSysctl(s))}

${esc(neighCounts(s))}

$ dmesg | tail
${esc(neighDmesg(s))}</code></pre>
    <p>${neighEntries(s)} counted entries against a hard limit of ${s.thresh3}, ${neighHeadroom(s)} of headroom, ${esc(neighState(s))}.${
      neighOverflows(s)
        ? " A new neighbor cannot be created and the packet is dropped."
        : neighCanReclaim(s)
          ? " It survives its own size because a forced collection has entries old enough to take."
          : ""
    }</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-arp-cache-holds-a-thousand-and-twenty-four", "The ARP cache holds a thousand and twenty four"], ["/allocate", "The plan that has to grow"], ["/leases", "Forty minutes dark"]])}
</main>`,
  });

  // ── the start rate limit ──
  /*
    The table is the point of putting this in the static body: two columns,
    "dies after" and "what happens", and the rows are not monotonic. A unit
    dying at 200ms is failed, one at 500ms is failed, one at 2.3s restarts
    forever. Somebody searching "start request repeated too quickly" wants to
    know which side of that line their unit is on, and the table says.
  */
  const startlimitStoppedCount = STARTLIMIT_CASES.filter((item) => startlimitStopped(item.setup)).length;
  const startlimitForever = STARTLIMIT_CASES.filter((item) => startlimitEnding(item.setup) === "restarting-forever").length;
  const startlimitDescription =
    "Restart=always does not mean the service will always be restarted. systemd rate limits unit " +
    "starts, five inside ten seconds by default, and a unit that exceeds it is failed with " +
    "start-limit-hit and left there until somebody runs systemctl reset-failed. The window is " +
    "fixed at the first start rather than sliding, so the limit trips only when the whole burst " +
    "fits inside one interval: a worker dying half a second in is stopped for good, and the same " +
    "worker dying 2.3 seconds in walks past the end of the window, resets the counter and " +
    `restarts forever. ${STARTLIMIT_CASES.length} units here, ${startlimitStoppedCount} stopped for good and ` +
    `${startlimitForever} restarting with nothing to stop them.`;

  await writePage("startlimit", base, {
    title: "The Service Gave Up, and Only Because It Crashed Fast | Max Doubin",
    description: startlimitDescription,
    canonical: `${SITE_URL}/startlimit`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "The service gave up",
  description: startlimitDescription,
  url: `${SITE_URL}/startlimit`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "How systemd's start rate limit actually behaves: that Restart= governs whether a restart is scheduled and StartLimitBurst governs whether the start is permitted, that the defaults are five starts in ten seconds, that the window is fixed at the first start rather than sliding so a slower crash loop resets the counter and never trips, that the comparison against the interval is strictly greater than so a start landing exactly on the boundary is refused, that raising StartLimitBurst above what the interval can hold disables the limit rather than raising it, that widening StartLimitIntervalSec makes the limiter stricter rather than kinder, and why a unit that burns its allowance in the first second of boot is never retried when its dependency appears",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>The service gave up</h1>
  <p>
    ${STARTLIMIT_CASES.length} units in a crash loop, and one question each.
    ${startlimitStoppedCount} are stopped for good by systemd's start rate limit and
    ${startlimitForever} restart with nothing at all to stop them. Which of those happens is not
    decided by the restart policy. It is decided by how fast the process dies.
  </p>
  <p>
    systemd.unit(5) gives every unit <code>StartLimitIntervalSec</code>, 10s by default, and
    <code>StartLimitBurst</code>, 5. Past that the unit is failed with result
    <code>start-limit-hit</code> and stays failed until <code>systemctl reset-failed</code>.
    <code>Restart=</code> in [Service] decides whether a restart is scheduled; it has no say in
    whether the start is permitted. And the window is fixed at the first start rather than
    sliding: src/basic/ratelimit.c resets the counter wholesale once the interval has elapsed,
    so the limit trips exactly when the burst fits inside one interval, which is
    <code>burst x cycle &lt;= interval</code> where the cycle is the crash time plus RestartSec.
  </p>
  <h2>What happens to each unit</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Dies after</th><th>RestartSec</th><th>Cycle</th><th>Restart=</th><th>Limiter</th><th>Starts</th><th>Refused at</th><th>Ends</th></tr>
    </thead>
    <tbody>
${STARTLIMIT_CASES.map((item) => {
  const s = item.setup;
  const gave = startlimitGivesUp(s);
  const cycle = startlimitCycle(s);
  return `      <tr><td>${s.crashAfterMs === null ? "never" : esc(startlimitHuman(s.crashAfterMs))}</td>` +
    `<td>${esc(startlimitHuman(s.restartSecMs))}</td><td>${cycle === null ? "n/a" : esc(startlimitHuman(cycle))}</td>` +
    `<td>${esc(s.restart)}</td><td>${s.burst === 0 || s.intervalMs === 0 ? "off" : `${s.burst} per ${esc(startlimitHuman(s.intervalMs))}`}</td>` +
    `<td>${startlimitStarts(s) >= 10_000 ? "no end" : startlimitStarts(s)}</td>` +
    `<td>${gave === null ? "never" : esc(startlimitHuman(gave))}</td><td>${esc(startlimitEnding(s))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${STARTLIMIT_CASES.map((item) => {
  const right = startlimitCorrect(item);
  const s = item.setup;
  const safe = startlimitSafe(s);
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(startlimitUnit(s))}

$ journalctl -u ${esc(s.unit)} -o short-monotonic
${esc(startlimitJournal(s))}

$ systemctl status ${esc(s.unit)}
${esc(startlimitStatus(s))}</code></pre>
    <p>${
      startlimitStopped(s)
        ? `Refused at ${esc(startlimitHuman(startlimitGivesUp(s) as number))}, after ${startlimitStarts(s)} starts.${safe !== null ? ` RestartSec of ${esc(startlimitHuman(safe))} would have avoided it.` : ""}`
        : startlimitEnding(s) === "restarting-forever"
          ? "Never refused: the window elapses and resets the counter before it can refuse anything."
          : "The restart policy never asks for a restart, so the limiter is never consulted."
    }</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-service-that-crashed-faster-is-the-one-that-stopped", "The service that crashed faster is the one that stopped"], ["/units", "It started before the thing it needs"], ["/backlog", "Idle, and the connections time out"]])}
</main>`,
  });

  // ── idle connections ──
  /*
    The table is the argument here: five columns of timers, one of which is
    always much larger than the others, and that one is the keepalive default.
    Seeing 7200 next to 350 does the work that a paragraph about middlebox
    idle timeouts does not.
  */
  const keepaliveForgetting = KEEPALIVE_CASES.filter((item) => !keepaliveSurvives(item.setup)).length;
  const keepaliveLate = KEEPALIVE_CASES.filter((item) => {
    const probe = keepaliveFirstProbe(item.setup);
    const forgotten = keepaliveForgotten(item.setup);
    return probe !== null && forgotten !== null && probe > forgotten;
  }).length;
  const keepaliveDescription =
    "TCP has no idle timeout of its own, so an established connection with nothing to say lives " +
    "forever at both ends. The path is not the protocol: every stateful device in it holds a row " +
    "with a countdown, and 350 seconds on a Network Load Balancer or four minutes on an Azure " +
    "Load Balancer is shorter than most quiet periods. TCP keepalive is the usual answer and it " +
    "is wrong twice, because SO_KEEPALIVE is off per socket unless something set it and because " +
    "the first probe is due at tcp_keepalive_time, which defaults to 7200 seconds. " +
    `${KEEPALIVE_CASES.length} connections here, ${keepaliveForgetting} that the path forgets, and ` +
    `${keepaliveLate} where keepalive is switched on and its first probe still arrives after the flow is gone.`;

  await writePage("keepalive", base, {
    title: "The Connection Was Fine Until Nobody Spoke for Six Minutes | Max Doubin",
    description: keepaliveDescription,
    canonical: `${SITE_URL}/keepalive`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Six minutes of silence",
  description: keepaliveDescription,
  url: `${SITE_URL}/keepalive`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "Why an idle TCP connection dies in the middle rather than at either end: that TCP itself has no idle timeout, that stateful firewalls, NAT gateways and cloud load balancers each delete a flow after their own idle timer, that SO_KEEPALIVE is off per socket and net.ipv4.tcp_keepalive_time defaults to 7200 seconds so the first probe is far too late to hold a flow open, how TCP_KEEPIDLE, an application heartbeat and TCP_USER_TIMEOUT each change the outcome, and why the next write after the flow is forgotten either resets immediately or hangs for the roughly fifteen minutes that tcp_retries2 allows",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Six minutes of silence</h1>
  <p>
    ${KEEPALIVE_CASES.length} idle connections, each through a device that keeps its own countdown.
    ${keepaliveForgetting} of them are forgotten by the path, and in ${keepaliveLate} of those the
    socket has keepalive switched on and its first probe still arrives after the flow is gone.
  </p>
  <p>
    There is no idle timeout in TCP. A connection with nothing to say is two pieces of memory, one
    at each end, and they will hold it forever. Everything between them is different: a stateful
    firewall, a NAT gateway or a load balancer holds a row per flow and deletes it when its own
    timer runs out, and then the next segment either draws a reset or is dropped without a word.
    Keepalive is the usual answer, and at stock settings it does not work for this, because
    <code>SO_KEEPALIVE</code> is off unless the application set it and
    <code>net.ipv4.tcp_keepalive_time</code> is 7200 seconds. The probe that would have kept the
    row alive is due two hours after the row was deleted.
  </p>
  <h2>Which timer runs out first</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Path</th><th>Its idle timeout</th><th>Idle for</th><th>SO_KEEPALIVE</th><th>First probe</th><th>Flow forgotten at</th><th>The next write</th></tr>
    </thead>
    <tbody>
${KEEPALIVE_CASES.map((item) => {
  const s = item.setup;
  const probe = keepaliveFirstProbe(s);
  const forgotten = keepaliveForgotten(s);
  const out = keepaliveOutcome(s);
  return `      <tr><td>${esc(s.middlebox.label)}</td><td>${esc(keepaliveTimer(s.middlebox.idleTimeout))}</td>` +
    `<td>${esc(keepaliveTimer(s.idleSeconds))}</td><td>${s.soKeepalive ? "on" : "off"}</td>` +
    `<td>${probe === null ? "never" : esc(keepaliveTimer(probe))}</td>` +
    `<td>${forgotten === null ? "never" : esc(keepaliveTimer(forgotten))}</td>` +
    `<td>${esc(out.nextWrite.what)}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${KEEPALIVE_CASES.map((item) => {
  const right = keepaliveCorrect(item);
  const s = item.setup;
  const noticed = keepaliveNoticed(s);
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(keepaliveSysctl(s))}

${esc(keepaliveSs(s))}

${esc(keepaliveMiddlebox(s))}</code></pre>
    <p>${keepaliveSurvives(s) ? "The flow survives the quiet period." : `The path forgets the flow at ${esc(keepaliveTimer(keepaliveForgotten(s) as number))}.`} The next write gets ${esc(keepaliveOutcome(s).nextWrite.what)}${noticed === null ? "" : `, and the application learns of it after ${esc(keepaliveTimer(noticed))}`}.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-first-probe-is-two-hours-late", "The first probe is two hours late"], ["/backlog", "Idle, and the connections time out"], ["/ports", "Out of ports"]])}
</main>`,
  });

  // ── the accept queue ──
  /*
    The point of putting this one in the static body is the counter. Somebody
    searching "connections timing out cpu idle" has already looked at CPU,
    memory and the application log, and the thing that would have answered it
    in one line is nstat TcpExtListenOverflows, which almost nobody runs. So
    the rendered nstat block goes in the document, per case.
  */
  const backlogOverflowing = BACKLOG_CASES.filter((item) => backlogOverflowed(item.setup) > 0).length;
  const backlogClamped = BACKLOG_CASES.filter((item) => backlogCap(item.setup) !== item.setup.backlog).length;
  const backlogWorstMs = Math.max(...BACKLOG_CASES.map((item) => backlogFate(item.setup).delayMs));
  const backlogDescription =
    "listen(2) does not install the backlog an application passed: the accept queue cap is " +
    "min(backlog, net.core.somaxconn), clamped silently, and the queue holds one more than that " +
    "because the kernel's test is greater-than rather than greater-or-equal. When it fills, the " +
    "kernel does not refuse the connection. With tcp_abort_on_overflow at its default of 0 it " +
    "drops the client's final ACK, so connect() has already returned and the first request goes " +
    "into silence until a retransmission finds room. " +
    `${BACKLOG_CASES.length} listeners here, ${backlogOverflowing} that overflow, ${backlogClamped} whose backlog argument ` +
    `was silently clamped, and a worst observed client delay of ${backlogHuman(backlogWorstMs)} on a host with an idle CPU.`;

  await writePage("backlog", base, {
    title: "The Server Is Idle and the Connections Are Timing Out | Max Doubin",
    description: backlogDescription,
    canonical: `${SITE_URL}/backlog`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "The server is idle and the connections are timing out",
  description: backlogDescription,
  url: `${SITE_URL}/backlog`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Advanced",
  teaches:
    "How the TCP accept queue actually behaves: that listen(2) installs min(backlog, net.core.somaxconn) and clamps without telling anyone, that somaxconn's default changed from 128 to 4096 in Linux 5.4, that sk_acceptq_is_full compares with greater-than so the queue holds one past the cap, that an overflowing listener with tcp_abort_on_overflow at 0 drops the final ACK rather than sending RST so the client believes it is connected, how the SYN-ACK retransmission schedule and the client's own RTO decide when such a connection recovers or dies, and that TcpExtListenOverflows in nstat is the counter that proves it",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>The server is idle and the connections are timing out</h1>
  <p>
    ${BACKLOG_CASES.length} listeners, each with a burst of connections arriving and an application
    accepting at some rate. ${backlogOverflowing} of them overflow, ${backlogClamped} had the backlog
    argument silently clamped to something smaller than what was passed, and the worst client delay
    here is ${backlogHuman(backlogWorstMs)} on a machine doing almost nothing.
  </p>
  <p>
    listen(2): "If the backlog argument is greater than the value in
    <code>/proc/sys/net/core/somaxconn</code>, then it is silently truncated to that value."
    somaxconn defaulted to 128 until Linux 5.4 raised it to 4096. The queue holds one more than the
    cap, because <code>sk_acceptq_is_full()</code> tests greater-than. And when it is full, the
    default <code>tcp_abort_on_overflow=0</code> means the kernel drops the completing handshake's
    final ACK instead of resetting the connection, so the client's connect() has already succeeded
    and its first write goes nowhere. The server retransmits its SYN-ACK on the schedule set by
    tcp_synack_retries; whichever of that and the client's own retransmission arrives after a slot
    opens is what rescues the connection, if anything does.
  </p>
  <h2>What each listener does</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Kernel</th><th>listen() asked</th><th>somaxconn</th><th>Queue holds</th><th>Arrivals</th><th>Accepted</th><th>Overflowed</th><th>Ending</th></tr>
    </thead>
    <tbody>
${BACKLOG_CASES.map((item) => {
  const s = item.setup;
  const f = backlogFate(s);
  return `      <tr><td>${esc(s.kernel)}</td><td>${s.backlog}</td><td>${s.somaxconn}</td>` +
    `<td>${backlogQueueCap(s)}</td><td>${s.arrivals}</td><td>${backlogAccepted(s)}</td>` +
    `<td>${backlogOverflowed(s)}</td><td>${esc(f.ending)} after ${esc(backlogHuman(f.delayMs))}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${BACKLOG_CASES.map((item) => {
  const right = backlogCorrect(item);
  const s = item.setup;
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>${esc(backlogSysctl(s))}

${esc(backlogSs(s))}

${esc(backlogNstat(s))}</code></pre>
    <p>listen(${s.backlog}) on a host with somaxconn ${s.somaxconn} installs a cap of ${backlogCap(s)}, so the queue holds ${backlogQueueCap(s)}. Peak depth was ${backlogPeak(s)}, ${backlogAccepted(s)} of ${s.arrivals} were accepted and ${backlogOverflowed(s)} overflowed.</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/the-connection-opened-and-then-nothing-happened", "The connection opened and then nothing happened"], ["/ports", "Out of ports"], ["/load", "Forty, and idle"]])}
</main>`,
  });

  // ── DHCP leases ──
  /*
    The band goes into the static body as a table of what each network loses,
    because the argument is a number people guess wrong: a DHCP outage costs
    the clients whose leases expire during it, which is a computable fraction
    of the room rather than all of it or none of it. Somebody searching
    "dhcp server down clients lost lease" lands here and the first row is
    forty minutes on an hour lease costing exactly a third.
  */
  const leasesLosing = LEASES_CASES.filter((item) => leasesLost(item.setup) > 0).length;
  const leasesTight = LEASES_CASES.filter((item) => leasesPressure(item.setup)).length;
  const leasesWorst = Math.max(...LEASES_CASES.map((item) => leasesLost(item.setup)));
  const leasesDescription =
    "A DHCP server is unreachable for forty minutes and exactly a third of a 300 machine office " +
    "loses its address, while the other two hundred never notice. RFC 2131 puts two timers in " +
    "every lease: T1, half the lease by default, when a client renews by unicast, and T2, seven " +
    "eighths, when it broadcasts to any server. So a renewing client always holds between the " +
    "lease less T1 and the whole lease, which makes the lease less T1, not the lease, the outage " +
    "a room survives. " +
    `${LEASES_CASES.length} networks here, ${leasesLosing} that lose clients, up to ${leasesWorst} at once, and ` +
    `${leasesTight} whose address pool is smaller than arrivals per hour times lease hours.`;

  await writePage("leases", base, {
    title: "Forty Minutes Dark, and a Third of the Office Fell Off | Max Doubin",
    description: leasesDescription,
    canonical: `${SITE_URL}/leases`,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Forty minutes dark",
  description: leasesDescription,
  url: `${SITE_URL}/leases`,
  learningResourceType: "Interactive exercise",
  educationalLevel: "Intermediate",
  teaches:
    "How DHCP lease timing decides what a server outage costs: the T1 and T2 timers of RFC 2131 and their defaults of half and seven eighths of the lease, why a renewing client never holds less than the lease minus T1, how to compute the fraction of a population that loses an address during an outage of a given length, why option 58 rather than the lease length is the dial for outage tolerance, why address pool occupancy is arrivals per hour times lease hours by Little's law rather than the number of devices present, why a device that returns after its lease expired gets a different address on a pool under pressure, and why an infinite lease returns nothing to the pool",
  isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
})}
</script>`,
    rootContent: `
<main>
  <h1>Forty minutes dark</h1>
  <p>
    ${LEASES_CASES.length} networks, ${LEASES_CASES.length} DHCP leases, and one question each.
    ${leasesLosing} of them lose clients to an outage, the worst losing ${leasesWorst} at once, and
    ${leasesTight} are asking their address pool for more than it holds.
  </p>
  <p>
    RFC 2131 section 4.4.5: "T1 defaults to (0.5 * duration_of_lease). T2 defaults to (0.875 *
    duration_of_lease)." At T1 a client sends a DHCPREQUEST by unicast to the server that granted
    the lease, and a successful renewal resets the clock to a full lease. At T2 it gives up on
    that server and broadcasts to any server. At expiry it must stop using the address. Because
    every client renews at T1, a room of them holds between the lease less T1 and the whole lease,
    spread evenly, and an outage takes exactly the clients holding less than its length. The
    number that sets outage tolerance is therefore the lease less T1, which a server can make
    almost the whole lease with option 58.
  </p>
  <h2>What each network loses</h2>
  <div class="post-table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">
  <table>
    <thead>
      <tr><th>Lease</th><th>T1</th><th>T2</th><th>Survives up to</th><th>Outage</th><th>Clients lost</th><th>Pool</th></tr>
    </thead>
    <tbody>
${LEASES_CASES.map((item) => {
  const s = item.setup;
  const t = leasesTimers(s);
  const infinite = leasesInfinite(s.lease);
  const pool =
    s.arrivalsPerHour === 0
      ? "not in question"
      : `${leasesConcurrent(s) === Infinity ? "every address" : leasesConcurrent(s)} wanted of ${s.pool}` +
        (leasesDry(s) !== null ? `, dry after ${leasesHuman(leasesDry(s) as number)}` : "");
  return `      <tr><td>${infinite ? "infinite" : esc(leasesHuman(s.lease as number))}</td>` +
    `<td>${infinite ? "none" : esc(leasesHuman(t.t1))}</td><td>${infinite ? "none" : esc(leasesHuman(t.t2))}</td>` +
    `<td>${infinite ? "any outage" : esc(leasesHuman(t.guaranteed))}</td>` +
    `<td>${s.outage === 0 ? "none" : esc(leasesHuman(s.outage))}</td>` +
    `<td>${s.clients === 0 ? "n/a" : `${leasesLost(s)} of ${s.clients}`}</td><td>${esc(pool)}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>
${LEASES_CASES.map((item) => {
  const right = leasesCorrect(item);
  const s = item.setup;
  return `  <article>
    <h2>${esc(item.name)}</h2>
    <p>${esc(item.brief)}</p>
    <p><strong>${esc(item.question)}</strong></p>
    <pre><code>$ cat /var/lib/dhcp/dhclient.leases
${esc(leasesFile(s))}

${esc(leasesTimeline(s))}</code></pre>
    <p>${
      leasesInfinite(s.lease)
        ? "An infinite lease has no T1, no T2 and no expiry."
        : `T1 is ${esc(leasesHuman(leasesTimers(s).t1))}, T2 is ${esc(leasesHuman(leasesTimers(s).t2))}, and a renewing client always holds at least ${esc(leasesHuman(leasesTimers(s).guaranteed))}.`
    }${
      s.outage > 0
        ? ` An outage of ${esc(leasesHuman(s.outage))} ${leasesLost(s) === 0 ? "catches nobody" : `catches ${Math.round(leasesShare(s) * 100)}% of the room, ${leasesLost(s)} of ${s.clients}`}.`
        : ""
    }${
      s.arrivalsPerHour > 0
        ? ` At ${s.arrivalsPerHour} arrivals an hour the pool is asked for ${leasesConcurrent(s) === Infinity ? "every address it has, permanently" : `${leasesConcurrent(s)} addresses against ${s.pool}`}${leasesDry(s) !== null ? `, and runs dry ${esc(leasesHuman(leasesDry(s) as number))} after opening` : ""}.`
        : ""
    }</p>
    <ol>
${item.options.map((option) => `      <li>${esc(option.claim)}${option.id === right?.id ? " <strong>(this one)</strong>" : ""}</li>`).join("\n")}
    </ol>
    <p>${esc(item.why)}</p>
    <p>${esc(item.fix.charAt(0).toUpperCase() + item.fix.slice(1))}</p>
    <p>It breaks the belief ${esc(item.breaks)}.</p>
  </article>`;
}).join("\n")}
  ${backLinks([["/practice", "All practice material"], ["/blog/forty-minutes-dark", "Forty minutes dark, and a third of the office fell off"], ["/allocate", "The plan that has to grow"], ["/ndots", "Ten queries for one name"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/blog/nothing-translates-the-reply", "Nothing translates the reply"], ["/blog/netfilter-hook-order", "Netfilter hook order"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/blog/systemd-units-that-behave", "systemd units that behave"], ["/blog/init-scripts-to-systemd-units", "From init scripts to systemd units"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/blog/minus-one-thousand-is-not-a-hint", "Minus one thousand is not a hint"], ["/blog/oom-killer-and-swap-sizing", "The OOM killer and swap sizing"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/blog/ntp-enterprise-networks", "NTP in enterprise networks"], ["/blog/how-totp-codes-actually-work", "How TOTP codes actually work"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/transfer", "Why the transfer is slow"], ["/blog/queueing-theory-for-operators", "Queueing theory for operators"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/scenarios/no-patch-until-tuesday", "No Patch Until Tuesday"], ["/firewall", "Firewall exercises"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/firewall", "Firewall exercises, the same first-match rule on packets"], ["/tools/chmod-calculator", "Permissions calculator"]])}
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
    teaching you to recognize something you will never see.
  </p>
  ${backLinks([["/practice", "All practice material"], ["/capture", "Packet captures"], ["/labs", "Hands-on labs"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/glossary", "Glossary"], ["/capture", "Packet captures"]])}
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
  ${backLinks([["/practice", "The practice hub"], ["/blog", "Field Notes"], ["/study", "Study guides"]])}
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
    against nothing else. The failure that is not modeled is correlated
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
    "unaligned networks, summary routes and growth, marked on behavior rather than on matching " +
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
  ${backLinks([["/practice", "All practice material"], ["/firewall", "Firewall exercises"], ["/tools/vlsm-practice", "The subnetting drill"]])}
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
    The exercise is marked by behavior rather than by matching one answer, so
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
  ${backLinks([["/practice", "All practice material"], ["/resolve", "DNS resolution"], ["/labs", "Hands-on labs"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/capture", "Packet captures"], ["/labs", "Hands-on labs"]])}
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
  ${backLinks([["/practice", "All practice material"], ["/capture", "Packet captures"], ["/labs", "Hands-on labs"]])}
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
    The exercise is marked by behavior rather than by shape, so any chain that
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
  ${backLinks([["/practice", "All practice material"], ["/challenges", "Capture the flag"], ["/labs", "Hands-on labs"]])}
</main>`,
  });

  // ── capture the flag challenges ──
  /*
    The artefacts are printed into the static body deliberately: a hex dump
    and a summarized auth.log are exactly the sort of thing someone searches
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
      "Browse writing on networking, servers, security, Linux, storage, AI infrastructure and more, organized by subject rather than by date.",
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
  description: `Two openly licensed datasets: modeling figures for ${catalogCount} rack-mount devices, and ${rackDeviceCount} devices across ${RACKS.length} rack elevations with their vendor published figures.`,
  url: `${SITE_URL}/data`,
  license: "https://creativecommons.org/licenses/by/4.0/",
  creator: dataCreator,
  dataset: [
    {
      "@type": "Dataset",
      name: "Rack hardware power and thermal catalog",
      description: `Modeling figures for ${catalogCount} rack-mount devices: power draw in watts, derived heat output in BTU per hour, rack units, port count and indicative cost. Representative values for a class of hardware, not vendor specifications and not measurements.`,
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
  <p>These are modeling figures, not vendor specifications and not measurements. powerDraw is representative for the class of hardware named. heatOutput is derived as watts multiplied by 3.412142. price is order of magnitude. Do not cite them as manufacturer data.</p>
  <ul>
    <li><a href="${SITE_URL}/data/equipment-catalog.json">equipment-catalog.json</a></li>
    <li><a href="${SITE_URL}/data/equipment-catalog.csv">equipment-catalog.csv</a></li>
  </ul>
  <h2>Rack library elevations</h2>
  <p>${rackDeviceCount} devices across ${RACKS.length} rack elevations, with vendor, model, rack units, position in the frame and published draw. ${rackSourcedCount} of them carry the datasheet page their figures came from.</p>
  <p>These are the vendors' own published figures rather than modeling ones. watts is null wherever a vendor publishes a power supply rating or a PoE budget instead of the device's own consumption, which is most of the enterprise hardware here: a 715W supply is not a 715W switch. Port link state and drive bay occupancy on the rack pages are illustrative and are not in the file.</p>
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
    The hardware catalog. Two hundred and fifty two vendor models with
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
  <h1>Hardware catalog</h1>
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
    title: "Hardware Catalog | Max Doubin",
    description:
      "Every UniFi model on this site, measured: switches, access points, cameras, gateways and door hardware, with real dimensions and triangle counts taken from the geometry itself.",
    canonical: `${SITE_URL}/gear`,
    rootContent: gearContent,
    schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Hardware catalog",
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
    { loc: `${SITE_URL}/ports`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/limits`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/free`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/ndots`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/leases`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/backlog`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/keepalive`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/startlimit`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/neigh`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/shm`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/maxstartups`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/retrans`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/inotify`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/atime`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/nagle`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/argmax`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/eloop`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/pipebuf`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/locks`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/signals`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/exit`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/umask`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/pss`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/sparse`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/append`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/mapped`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/overcommit`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/timewait`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/rcvbuf`, lastmod: today, changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_URL}/fds`, lastmod: today, changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_URL}/writeback`, lastmod: today, changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_URL}/conntrack`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/route`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/restore`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/handshake`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/capture`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/practice`, lastmod: today, changefreq: "monthly", priority: "0.9" },
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
    // summarizes.
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
