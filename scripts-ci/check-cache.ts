/**
 * The shared cache surface: which request receives somebody else's page.
 *
 * Three halves, and the third is the one that earns its keep.
 *
 * The cases carry no answer. Each declares three requests and what the origin
 * answered; the model replays them through a cache built to RFC 9111 and
 * works out which request, if any, is served a body belonging to somebody
 * else. Exactly one option must name it, and no two options may name the same
 * request, because on this surface the answer is a request and two options
 * naming one request are the same answer written twice.
 *
 * Then the model is held to the caching rules over generated sequences rather
 * than over the cases, because a model that agrees with six hand-written
 * examples has been checked against six hand-written examples.
 *
 * And then the replay is checked against a second implementation that keeps
 * no state at all: for each request, scan every earlier request, take the
 * most recent one with the same key whose response was storable, and that is
 * what should come back. The map in replay() is an optimisation of exactly
 * that sentence, and a map is the sort of thing that is nearly right.
 *
 * One check reads prose. Every case states a fix, and the fix has to be a
 * change that actually stops the leak, which the gate verifies by applying
 * each candidate repair to the case's own exchanges and replaying. A fix that
 * would not have worked is worse than no fix, and nothing else here would
 * notice.
 */

import {
  CASES,
  correctOption,
  directives,
  freshness,
  hits,
  keyOf,
  leakAt,
  leaks,
  replay,
  SHARED,
  storable,
  varyOn,
  type Case,
  type Exchange,
  type Request,
  type Response,
} from "../client/src/lib/cache/index";

const problems: string[] = [];

/* --------------------------------------------- an independent replay */

/**
 * What each request should receive, worked out without keeping a cache.
 *
 * Recursive rather than accumulating, which is what makes it an independent
 * check: replay() walks forward carrying a map, and this defines the same
 * answer by looking backwards.
 *
 * Only the nearest earlier request with the same key matters, and three
 * cases exhaust it. If that request was itself a hit, whatever it hit is
 * still held, so this one gets the same thing. If it was a miss and its
 * response was storable, this one gets that response. And if it was a miss
 * whose response was not storable, then nothing was under this key before it
 * either, and nothing is under it now.
 *
 * The first version of this took every earlier request's response as
 * something that had been fetched, which is wrong in a way that took a
 * disagreement to see: a request that hits never reaches the origin, so its
 * paired response never existed and could not have been stored.
 */
function bruteForce(exchanges: Exchange[]): { id: string; outcome: string; served: string }[] {
  const solve = (index: number): { outcome: string; served: string } => {
    const exchange = exchanges[index];
    const miss = { outcome: "miss", served: exchange.response.belongsTo };
    const key = keyOf(exchange.request, exchange.response);
    if (key.includes("never reusable")) return miss;

    for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
      const candidate = exchanges[earlier];
      if (keyOf(candidate.request, candidate.response) !== key) continue;
      const before = solve(earlier);
      if (before.outcome === "hit") return { outcome: "hit", served: before.served };
      return storable(candidate).ok
        ? { outcome: "hit", served: candidate.response.belongsTo }
        : miss;
    }
    return miss;
  };
  return exchanges.map((exchange, index) => ({ id: exchange.request.id, ...solve(index) }));
}

const shape = (steps: { id: string; outcome: string; served: string }[]) =>
  steps.map((step) => `${step.id}:${step.outcome}:${step.served}`).join(" ");

/* ------------------------------------------------------------- the cases */

const slugs = new Set<string>();
const breaks = new Set<string>();
const positions = new Map<number, number>();
const refusalsSeen = new Set<string>();
let leaking = 0;
let clean = 0;

/** The repairs worth trying, as a person would describe them. */
const REPAIRS: { name: string; words: RegExp; apply: (exchange: Exchange) => Exchange }[] = [
  {
    name: "Cache-Control: private",
    words: /\bprivate\b/i,
    apply: (e) => ({ ...e, response: { ...e.response, cacheControl: `private, ${e.response.cacheControl}` } }),
  },
  {
    name: "Cache-Control: no-store",
    words: /\bno-store\b/i,
    apply: (e) => ({ ...e, response: { ...e.response, cacheControl: `no-store, ${e.response.cacheControl}` } }),
  },
  {
    name: "Vary: Cookie",
    words: /vary:?\s*cookie/i,
    apply: (e) => ({ ...e, response: { ...e.response, vary: [e.response.vary, "Cookie"].filter(Boolean).join(", ") } }),
  },
  {
    name: "Vary: Authorization",
    words: /vary:?\s*authorization/i,
    apply: (e) => ({ ...e, response: { ...e.response, vary: [e.response.vary, "Authorization"].filter(Boolean).join(", ") } }),
  },
  {
    name: "dropping Set-Cookie",
    words: /(strip|drop|remov\w*)[^.]{0,40}set-cookie|set-cookie[^.]{0,40}(strip|drop|remov)/i,
    apply: (e) => ({ ...e, response: { ...e.response, setCookie: undefined, belongsTo: SHARED } }),
  },
  {
    name: "normalising the Cookie header down to the session",
    words: /normalis\w*|normaliz\w*|identity into the URL|in the URL/i,
    apply: (e) => ({
      ...e,
      request: {
        ...e.request,
        headers: { ...e.request.headers, Cookie: `session=${e.request.who}` },
      },
      response: { ...e.response, vary: [e.response.vary, "Cookie"].filter(Boolean).join(", ") },
    }),
  },
];

for (const item of CASES) {
  const where = item.slug;
  if (slugs.has(item.slug)) problems.push(`${where}: two cases share this slug`);
  slugs.add(item.slug);
  if (breaks.has(item.breaks)) {
    problems.push(`${where}: breaks a belief another case already breaks. Six cases teaching one thing is one case.`);
  }
  breaks.add(item.breaks);

  if (item.breaks.length < 40) problems.push(`${where}: the belief it breaks is too short to be one`);
  if (item.why.length < 400) problems.push(`${where}: the explanation is too short to work through`);
  if (item.fix.length < 120) problems.push(`${where}: the fix is too short to act on, and the fix is the point`);
  if (item.brief.length < 150) problems.push(`${where}: the brief does not set up a situation`);
  if (!item.question.trim().endsWith("?")) problems.push(`${where}: the question does not read as a question`);

  if (item.exchanges.length < 3) {
    problems.push(
      `${where}: ${item.exchanges.length} requests. Two can show a collision and cannot show a request` +
        ` that does not collide, which is half of what there is to learn.`,
    );
  }

  const ids = new Set(item.exchanges.map((exchange) => exchange.request.id));
  if (ids.size !== item.exchanges.length) problems.push(`${where}: two requests share an id`);
  for (const exchange of item.exchanges) {
    const { request, response } = exchange;
    if (!request.path.startsWith("/")) problems.push(`${where}: ${request.id} has no path`);
    if (response.body.length < 20) problems.push(`${where}: ${request.id}'s response body is not described`);
    /*
      The origin always answers the asker with the asker's own data, or with
      a response that is nobody's. Anything else is an origin bug, and this
      surface is about caches. SHARED is the exemption and it is the point of
      having it: a public page belongs to no one and is meant to be handed
      to whoever asks.
    */
    if (response.belongsTo !== request.who && response.belongsTo !== SHARED && response.status === 200) {
      problems.push(
        `${where}: ${request.id} asked as ${request.who} and the origin answered with` +
          ` ${response.belongsTo}'s data, which is an origin bug and not a cache one`,
      );
    }
    /* A freshness figure has to parse, or the model silently reads NaN. */
    const lifetime = freshness(response);
    if (lifetime !== null && !Number.isFinite(lifetime)) {
      problems.push(`${where}: ${request.id}'s response has an unparseable lifetime in "${response.cacheControl}"`);
    }
    for (const name of varyOn(response)) {
      if (name !== "*" && !/^[a-z-]+$/.test(name)) problems.push(`${where}: "${name}" is not a header name`);
    }
  }

  /*
    keyOf() reads Vary off the response paired with the request, which is the
    same as a real cache reading it off the stored response only when every
    response on the path agrees. Assert that, rather than leaving the
    simplification to be discovered.
  */
  const varies = new Set(item.exchanges.map((exchange) => exchange.response.vary ?? "absent"));
  if (varies.size > 1) {
    problems.push(
      `${where}: the responses disagree about Vary (${[...varies].join(" against ")}), which is the one` +
        ` case the key computation here does not model`,
    );
  }

  const steps = replay(item.exchanges);
  for (const step of steps) if (step.refusal) refusalsSeen.add(step.refusal);
  if (!steps.some((step) => step.outcome === "miss")) {
    problems.push(`${where}: every request was a hit, so nothing shows the cache being populated`);
  }

  /* The replay and the stateless recomputation have to agree exactly. */
  const mine = shape(steps.map((step) => ({ id: step.request.id, outcome: step.outcome, served: step.served })));
  const theirs = shape(bruteForce(item.exchanges));
  if (mine !== theirs) {
    problems.push(`${where}: replay() says ${mine} and looking back over every earlier request says ${theirs}`);
  }

  const at = leakAt(item.exchanges);
  if (at) leaking += 1;
  else clean += 1;

  if (item.options.length !== 4) problems.push(`${where}: ${item.options.length} options rather than four`);
  const optionIds = new Set(item.options.map((option) => option.id));
  if (optionIds.size !== item.options.length) problems.push(`${where}: two options share an id`);
  const answers = new Set(item.options.map((option) => String(option.leakAt)));
  if (answers.size !== item.options.length) {
    problems.push(`${where}: two options name the same request, so they are the same answer written twice`);
  }
  for (const option of item.options) {
    if (option.claim.length < 40) problems.push(`${where}: option ${option.id} is too short to be a claim`);
    if (option.leakAt !== null && !ids.has(option.leakAt)) {
      problems.push(`${where}: option ${option.id} names ${option.leakAt}, which is not one of the requests`);
    }
  }

  const matching = item.options.filter((option) => option.leakAt === at);
  if (matching.length === 0) {
    problems.push(
      `${where}: the model says ${at ?? "nothing"} receives somebody else's data and no option says so`,
    );
  }
  if (matching.length > 1) problems.push(`${where}: ${matching.length} options name the derived answer`);
  const chosen = correctOption(item);
  if (chosen && matching[0] && chosen.id !== matching[0].id) {
    problems.push(`${where}: correctOption() disagrees, so the page would mark the wrong option`);
  }
  if (chosen) {
    const index = item.options.findIndex((option) => option.id === chosen.id);
    positions.set(index, (positions.get(index) ?? 0) + 1);
  }

  /*
    The stated fix has to be one that works.

    Written because prose is where this surface could go wrong invisibly: a
    case whose numbers are right and whose remedy is not. Each repair the fix
    text names is applied to this case's own exchanges and replayed, and at
    least one of them has to stop the leak.
  */
  if (at) {
    const named = REPAIRS.filter((repair) => repair.words.test(item.fix));
    if (named.length === 0) {
      problems.push(`${where}: the fix names no change this gate can apply, so nothing checks that it works`);
    }
    const effective = named.filter((repair) => leakAt(item.exchanges.map(repair.apply)) === null);
    if (named.length > 0 && effective.length === 0) {
      problems.push(
        `${where}: the fix names ${named.map((repair) => repair.name).join(" and ")}, and applying` +
          ` ${named.length === 1 ? "it" : "any of them"} to these exchanges still leaks at` +
          ` ${named.map((repair) => leakAt(item.exchanges.map(repair.apply))).join(", ")}`,
      );
    }
  }
}

/* ----------------------------------------------------- the set as a whole */

if (CASES.length < 6) problems.push(`${CASES.length} cases is too few`);
if (leaking < 4) problems.push(`only ${leaking} of ${CASES.length} cases leak, so the set is mostly reassurance`);
if (clean === 0) {
  problems.push("every case leaks, so a reader who always answers with a request is always right");
}
for (const [position, count] of positions) {
  if (count > CASES.length * 0.45) {
    problems.push(`the answer is in position ${position + 1} for ${count} of ${CASES.length} cases`);
  }
}
/*
  The refusals are the reasons a shared cache declines to store, and they are
  what the page prints under each miss. A set that only ever shows one of them
  teaches that there is one way to be safe.
*/
if (refusalsSeen.size < 3) {
  problems.push(
    `only ${refusalsSeen.size} distinct reasons for not storing appear across the set (${[...refusalsSeen].join(", ")})`,
  );
}

/* ------------------------------------------- the model, over generated */

/*
  xorshift32, not an LCG masked to 31 bits. The permissions gate here once
  shipped with a generator whose low bits had a period of eight, so `% n`
  locked onto a subset and four thousand rounds ran against nothing. The
  corpus is measured below for the same reason.
*/
let seed = 0x5be1d3;
function next(): number {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed >>> 0;
}
const upto = (n: number) => next() % n;
const pick = <T,>(list: T[]): T => list[upto(list.length)];

const PATHS = ["/dashboard", "/api/me", "/pricing"];
const WHO = ["acct-1", "acct-2", "acct-3"];
const CONTROLS = [
  "",
  "max-age=60",
  "public, max-age=60",
  "private, max-age=60",
  "no-store",
  "max-age=30, s-maxage=3600",
  "must-revalidate, max-age=60",
];
const VARIES = [undefined, "Accept-Encoding", "Cookie", "Cookie, Accept-Encoding", "Authorization", "*"];

function generate(): Exchange[] {
  const path = pick(PATHS);
  const control = pick(CONTROLS);
  const vary = pick(VARIES);
  /*
    Some paths are genuinely public, so the exclusion for a response that is
    nobody's gets exercised over the corpus and not only in the seven cases.
    Without this, a model that called every hit on a public page a leak would
    pass every property here.
  */
  const anonymousPath = upto(4) === 0;
  const count = 2 + upto(3);
  const out: Exchange[] = [];
  for (let index = 0; index < count; index += 1) {
    const who = pick(WHO);
    const headers: Record<string, string> = {
      "Accept-Encoding": pick(["gzip, br", "gzip"]),
    };
    if (upto(3) > 0) headers.Cookie = pick([`session=${who}`, "consent=all"]);
    if (upto(4) === 0) headers.Authorization = `Bearer ${who}`;
    out.push({
      request: { id: `g${index}`, who, method: upto(8) === 0 ? "POST" : "GET", path, headers },
      response: {
        status: upto(10) === 0 ? 302 : 200,
        cacheControl: control,
        vary,
        belongsTo: anonymousPath ? SHARED : who,
        body: anonymousPath ? `${path}, the same for everybody` : `${who}'s copy of ${path}`,
      },
    });
  }
  return out;
}

const ROUNDS = 4000;
const corpus = {
  leaked: 0,
  clean: 0,
  anyHit: 0,
  neverStored: 0,
  varyStar: 0,
  publicPage: 0,
  publicHit: 0,
  authorized: 0,
  authorizedStored: 0,
  bothLifetimes: 0,
  nonGet: 0,
};

for (let round = 0; round < ROUNDS; round += 1) {
  const exchanges = generate();
  const at = `round ${round}`;

  const steps = replay(exchanges);
  if (leakAt(exchanges) !== null) corpus.leaked += 1;
  else corpus.clean += 1;
  if (steps.some((step) => step.outcome === "hit")) corpus.anyHit += 1;
  if (steps.every((step) => !step.stored)) corpus.neverStored += 1;
  if (steps.some((step) => step.key.includes("never reusable"))) corpus.varyStar += 1;
  if (exchanges.every((exchange) => exchange.response.belongsTo === SHARED)) {
    corpus.publicPage += 1;
    if (steps.some((step) => step.outcome === "hit")) corpus.publicHit += 1;
    /* A public page shared between visitors is never a leak, on any sequence. */
    if (leakAt(exchanges) !== null) {
      problems.push(`${at}: a page belonging to nobody was reported as leaking at ${leakAt(exchanges)}`);
    }
  }

  /* The replay has to equal looking back over every earlier request. */
  const mine = shape(steps.map((step) => ({ id: step.request.id, outcome: step.outcome, served: step.served })));
  const theirs = shape(bruteForce(exchanges));
  if (mine !== theirs) problems.push(`${at}: replay() says ${mine} and the stateless version says ${theirs}`);

  for (const exchange of exchanges) {
    const { request, response } = exchange;
    const found = directives(response.cacheControl);
    const verdict = storable(exchange);
    const authorized = Object.keys(request.headers).some((n) => n.toLowerCase() === "authorization");
    if (authorized) corpus.authorized += 1;
    if (authorized && verdict.ok) corpus.authorizedStored += 1;
    if (request.method !== "GET") corpus.nonGet += 1;

    /* The three refusals that are absolute. */
    if (found.has("no-store") && verdict.ok) problems.push(`${at}: stored a no-store response`);
    if (found.has("private") && verdict.ok) problems.push(`${at}: a shared cache stored a private response`);
    if (request.method !== "GET" && verdict.ok) problems.push(`${at}: stored a response to a ${request.method}`);
    if (response.status !== 200 && verdict.ok) problems.push(`${at}: stored a ${response.status}`);

    /*
      RFC 9111 section 3.5, and the exact list of exceptions, because the
      surface exists because that list is surprising. max-age is not on it.
    */
    if (authorized && verdict.ok) {
      const optedIn = found.has("public") || found.has("s-maxage") || found.has("must-revalidate");
      if (!optedIn) problems.push(`${at}: stored a response to an Authorization request on "${response.cacheControl}"`);
    }
    if (authorized && !verdict.ok && verdict.refusal === "authorization") {
      const relaxed = { ...exchange, response: { ...response, cacheControl: `${response.cacheControl}, s-maxage=3600` } };
      if (!storable(relaxed).ok) problems.push(`${at}: s-maxage did not opt a shared cache back in`);
    }

    /*
      freshness(), characterised directly.

      Written because a blinding that stopped freshness() reading s-maxage
      passed everything. The reason is that its only caller uses it to ask
      whether any lifetime is present, so which lifetime it picks was never
      observed. Third time today a function with no property of its own has
      turned out to be broken-able in silence.

      s-maxage exists only for shared caches and beats max-age when both are
      given, which is the entire reason anybody sets it.
      */
    const both = found.has("s-maxage") && found.has("max-age");
    if (both) {
      corpus.bothLifetimes += 1;
      if (freshness(response) !== Number(found.get("s-maxage"))) {
        problems.push(
          `${at}: "${response.cacheControl}" gave a shared lifetime of ${freshness(response)},` +
            ` and s-maxage says ${found.get("s-maxage")}`,
        );
      }
    }
    if (found.has("max-age") && !found.has("s-maxage") && freshness(response) !== Number(found.get("max-age"))) {
      problems.push(`${at}: "${response.cacheControl}" ignored its max-age`);
    }
    if (!found.has("max-age") && !found.has("s-maxage") && freshness(response) !== null) {
      problems.push(`${at}: "${response.cacheControl}" invented a lifetime of ${freshness(response)}`);
    }

    /* Vary: * is never reusable, whatever else is true. */
    if (varyOn(response).includes("*") && !keyOf(request, response).includes("never reusable")) {
      problems.push(`${at}: Vary: * produced a reusable key`);
    }
  }

  /*
    keyOf(), characterised directly, because nothing else here can see it.

    Written after a blinding that dropped the Vary-named headers from the key
    produced one complaint, and that complaint was about answer positions. The
    reason is worth recording: every case offers four options covering all
    four possible answers, so a model change that merely moves the answer to a
    different request still finds exactly one option matching. The
    exactly-one-option check has no power against a shifted answer, and only a
    property about the key itself does.

    Two directions. Requests differing in a header Vary names must get
    different keys, or the cache cannot tell them apart. Requests agreeing on
    every header Vary names must get the same key, or the cache stores a copy
    per request and never hits.
  */
  for (const a of exchanges) {
    for (const b of exchanges) {
      if (a.request.id === b.request.id) continue;
      if (a.request.method !== b.request.method || a.request.path !== b.request.path) continue;
      const named = varyOn(a.response).filter((name) => name !== "*");
      const value = (request: Request, name: string) => {
        const found = Object.keys(request.headers).find((key) => key.toLowerCase() === name);
        return found ? request.headers[found] : "absent";
      };
      const differ = named.some((name) => value(a.request, name) !== value(b.request, name));
      const sameKey = keyOf(a.request, a.response) === keyOf(b.request, b.response);
      if (differ && sameKey && !varyOn(a.response).includes("*")) {
        problems.push(
          `${at}: ${a.request.id} and ${b.request.id} differ in a header Vary names` +
            ` (${named.join(", ")}) and got the same key`,
        );
      }
      if (!differ && !sameKey && !varyOn(a.response).includes("*")) {
        problems.push(
          `${at}: ${a.request.id} and ${b.request.id} agree on every header Vary names` +
            ` and got different keys, so the cache would never hit`,
        );
      }
    }
  }

  /*
    Naming a header in Vary can only ever split keys apart, never merge them.
    So adding Cookie to Vary can never turn a miss into a hit, and can never
    introduce a leak that was not there.
  */
  const narrowed = exchanges.map((exchange) => ({
    ...exchange,
    response: {
      ...exchange.response,
      vary: [exchange.response.vary, "Cookie"].filter(Boolean).join(", "),
    },
  }));
  if (hits(narrowed) > hits(exchanges)) {
    problems.push(`${at}: adding Cookie to Vary produced more hits (${hits(narrowed)} against ${hits(exchanges)})`);
  }

  /*
    And the one that matters: private stops every leak, on every sequence,
    with no exceptions. If this ever fails the model has a hole in it that no
    amount of header advice would paper over.
  */
  const madePrivate = exchanges.map((exchange) => ({
    ...exchange,
    response: { ...exchange.response, cacheControl: `private, ${exchange.response.cacheControl}` },
  }));
  if (leakAt(madePrivate) !== null) problems.push(`${at}: private did not stop the leak`);
  if (hits(madePrivate) !== 0) problems.push(`${at}: a private response was served from storage`);
}

/*
  Measure the corpus before trusting a single property above. Each of these
  bounds is a thing a generator on this site has actually failed to produce.
*/
if (corpus.leaked < ROUNDS * 0.1) problems.push(`only ${corpus.leaked} of ${ROUNDS} sequences leaked`);
if (corpus.clean < ROUNDS * 0.1) problems.push(`only ${corpus.clean} of ${ROUNDS} sequences were clean`);
if (corpus.anyHit < ROUNDS * 0.2) problems.push(`only ${corpus.anyHit} of ${ROUNDS} sequences had any hit at all`);
if (corpus.neverStored < 100) problems.push(`only ${corpus.neverStored} of ${ROUNDS} stored nothing`);
if (corpus.varyStar < 100) problems.push(`only ${corpus.varyStar} of ${ROUNDS} used Vary: *`);
if (corpus.publicPage < 300) problems.push(`only ${corpus.publicPage} of ${ROUNDS} sequences were a public page`);
if (corpus.publicHit < 100) {
  problems.push(
    `only ${corpus.publicHit} public pages were ever served from storage, so the rule that a shared` +
      ` response is not a leak barely ran`,
  );
}
if (corpus.authorized < 500) problems.push(`only ${corpus.authorized} requests carried Authorization`);
if (corpus.authorizedStored < 50) {
  problems.push(
    `only ${corpus.authorizedStored} Authorization requests were stored, so the exception list` +
      ` in section 3.5 is barely exercised`,
  );
}
if (corpus.nonGet < 100) problems.push(`only ${corpus.nonGet} requests were not GETs`);
if (corpus.bothLifetimes < 200) {
  problems.push(
    `only ${corpus.bothLifetimes} responses carried both max-age and s-maxage, so which one a shared` +
      ` cache uses is barely exercised`,
  );
}

/* ----------------------------------------------------------------- report */

if (problems.length) {
  console.error(`check-cache: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} sequences, ${leaking} leaking and ${clean} clean, each deriving one answer that` +
    ` exactly one option names, ${CASES.length} distinct beliefs broken, every stated fix verified to` +
    ` stop its own leak, and the replay agreed with looking back over every earlier request across` +
    ` ${ROUNDS} generated sequences (${corpus.leaked} leaked, ${corpus.anyHit} had a hit,` +
    ` ${corpus.publicHit} public pages served from storage without leaking, and` +
    ` ${corpus.authorizedStored} of ${corpus.authorized} Authorization requests storable).`,
);
