/**
 * Eight call paths, each one a policy somebody signed off on.
 *
 * Every number here is a default from a real library or a value a person
 * would plausibly type. Nothing is exaggerated to make a point: three
 * attempts is the common default, 30 seconds is the common browser timeout,
 * and 100ms doubling is what every backoff example shows.
 *
 * No case states its own answer. Each declares which quantity is being asked
 * for, the model computes it, and CI requires exactly one option's value to
 * match. So a case whose prose and arithmetic disagree fails the build, and
 * two options cannot both be right, which happened twice while I was writing
 * these.
 */

import type { Chain } from "../types";

export const CHAINS: Chain[] = [
  {
    slug: "three-each",
    name: "Three attempts, four layers",
    brief:
      "A checkout button. The browser retries a failed fetch, the edge retries an upstream error, the API client retries a reset connection, and the database driver retries a broken pipe. Three attempts each, which is the default in all four libraries and which four different people configured on four different days.",
    callers: [
      { name: "browser", attempts: 3, timeout: 30000, backoff: 1000, factor: 2, jitter: 0.2, idempotent: true },
      { name: "edge", attempts: 3, timeout: 10000, backoff: 500, factor: 2, jitter: 0, idempotent: true },
      { name: "api client", attempts: 3, timeout: 3000, backoff: 200, factor: 2, jitter: 0, idempotent: true },
      { name: "pg driver", attempts: 3, timeout: 900, backoff: 100, factor: 2, jitter: 0, idempotent: true, note: "the default in the connection pool nobody configured" },
    ],
    leaf: { name: "postgres", latency: 4000, note: "a lock queue, so it answers eventually rather than refusing" },
    ask: { kind: "amplification" },
    question: "One person presses the button once. How many queries does postgres see?",
    options: [
      { id: "a", claim: "12 queries. Three attempts at each of four layers, added together.", value: "12" },
      { id: "b", claim: "27 queries. Three cubed, for the three server-side layers.", value: "27" },
      { id: "c", claim: "81 queries. Three to the fourth: every layer multiplies the one above it.", value: "81" },
      { id: "d", claim: "3 queries. Only the driver talks to postgres, so only its retries reach it.", value: "3" },
    ],
    why: "Retries compose by multiplication, not addition. The browser makes three requests; each one arrives at an edge that makes three of its own; each of those reaches an API client that makes three; each of those reaches a driver that makes three. Nothing in any of the four configurations contains the number 81, and no dashboard shows all four policies at once, which is why this is discovered from the database's side.",
    breaks: "that retry counts add up across a call path rather than multiplying",
  },
  {
    slug: "hung-up-first",
    name: "The layer that hangs up first",
    brief:
      "The same stack, and the question is not how many requests there are but who gives up while somebody else is still working. Every timeout below was chosen to be comfortably longer than a healthy response, and every one was chosen without reference to the layer beneath it.",
    callers: [
      { name: "browser", attempts: 2, timeout: 30000, backoff: 2000, factor: 1, jitter: 0.3, idempotent: true },
      { name: "edge", attempts: 3, timeout: 10000, backoff: 500, factor: 2, jitter: 0, idempotent: true },
      { name: "api client", attempts: 3, timeout: 2000, backoff: 200, factor: 2, jitter: 0, idempotent: true, note: "two seconds, which is generous for a query that normally takes 40ms" },
      { name: "pg driver", attempts: 3, timeout: 900, backoff: 100, factor: 2, jitter: 0, idempotent: true },
    ],
    leaf: { name: "postgres", latency: 4000 },
    ask: { kind: "truncates" },
    question: "Which layer gives up while the layer below it is still working?",
    options: [
      { id: "a", claim: "The api client. Two seconds is shorter than the time the driver needs to exhaust three 900ms attempts with backoff between them.", value: "api client" },
      { id: "b", claim: "The browser. Its 30 second budget is the only one that can expire from the user's side.", value: "browser" },
      { id: "c", claim: "The pg driver. Its 900ms timeout is shorter than the 4 second query.", value: "pg driver" },
      { id: "d", claim: "None of them. Every timeout is longer than a healthy response and the stack degrades cleanly.", value: "none" },
    ],
    why: "The driver is doing exactly what it was told: three attempts of 900ms with 100 and 200 milliseconds between them, which is 2.9 seconds before it has an answer to give. The API client waits two. So the client abandons the driver mid-flight and starts again, and the driver's third attempt runs into a socket nobody is reading. The driver's own 900ms timeout is not the fault, because giving up on a 4 second query is what a timeout is for. The fault is a caller whose budget is smaller than its callee's.",
    breaks: "that a timeout is correct if it is longer than a healthy response, when the number it has to beat is the whole retry budget of the layer below",
  },
  {
    slug: "the-wall-clock",
    name: "What the user actually waits",
    brief:
      "A single API call with a retrying driver underneath it, and a dependency that has gone from 40 milliseconds to a second and a half. Somebody wants to know what the page will feel like before they decide whether to page anybody.",
    callers: [
      { name: "api handler", attempts: 3, timeout: 8000, backoff: 250, factor: 2, jitter: 0, idempotent: true, note: "eight seconds, chosen so that it never cuts the driver short" },
      { name: "redis client", attempts: 4, timeout: 2000, backoff: 100, factor: 2, jitter: 0, idempotent: true, note: "four attempts, because the library counts three retries plus the original" },
    ],
    leaf: { name: "redis", latency: 1500, note: "swapping, so it answers slowly rather than not at all" },
    ask: { kind: "elapsed" },
    question: "Worst case, how long before the user is told anything? Answer in milliseconds.",
    options: [
      { id: "a", claim: "6000ms. Four attempts of 1500ms, and the backoff is too small to notice.", value: "6000" },
      { id: "b", claim: "1500ms. The dependency answers in 1500ms and the retries only happen on failure.", value: "1500" },
      { id: "c", claim: "18000ms. Three handler attempts of six seconds each.", value: "18000" },
      { id: "d", claim: "20850ms. Each handler attempt costs 6.7 seconds once the driver's backoff is counted, three of those, plus the handler's own 250 and 500.", value: "20850" },
    ],
    why: "The backoff delays are where this goes wrong, because they are small numbers that get added four times at one level and three at another. One driver pass is four attempts of 1500ms plus waits of 100, 200 and 400, which is 6.7 seconds. The handler does that three times with 250 and 500 milliseconds between, so 20.1 seconds plus 0.75. Almost twenty-one seconds, from two configurations that each look modest, for a dependency that is answering perfectly well in a second and a half.",
    breaks: "that the backoff delays are too small to matter, when they are added once per retry at every level",
  },
  {
    slug: "still-running",
    name: "The work nobody is waiting for",
    brief:
      "The stack from the first case, and the dependency is still slow. The user has closed the tab. Somebody asks whether the load will now go away.",
    callers: [
      { name: "browser", attempts: 3, timeout: 30000, backoff: 1000, factor: 2, jitter: 0.2, idempotent: true },
      { name: "edge", attempts: 3, timeout: 4000, backoff: 500, factor: 2, jitter: 0, idempotent: true, note: "four seconds, because the edge has a fixed upstream budget" },
      { name: "api client", attempts: 3, timeout: 2000, backoff: 200, factor: 2, jitter: 0, idempotent: true },
      { name: "pg driver", attempts: 3, timeout: 900, backoff: 100, factor: 2, jitter: 0, idempotent: true },
    ],
    leaf: { name: "postgres", latency: 4000 },
    ask: { kind: "orphaned" },
    question: "How many queries are still running after every caller above them has given up?",
    options: [
      { id: "a", claim: "0. When the caller disconnects, the query is cancelled, which is what closing a connection is for.", value: "0" },
      { id: "b", claim: "27. Only the queries below the layer whose budget was too small are abandoned.", value: "27" },
      { id: "c", claim: "81. Nothing propagates the cancellation, so every query issued runs to completion whether or not anybody is reading.", value: "81" },
      { id: "d", claim: "1. The one query in flight at the moment the timeout fired.", value: "1" },
    ],
    why: "A TCP close is not a cancellation. Postgres will notice eventually, on its next write to a dead socket, and until then it holds the lock and the buffers and the CPU. So the load does not fall when the callers give up, and the retries that replaced the abandoned requests are competing with them. This is the mechanism by which a slow dependency becomes a dead one: the offered load rises exactly when capacity is already gone, and every layer's logs show only timeouts.",
    breaks: "that a caller giving up stops the work it started, when a closed socket is not a cancellation and nothing downstream is told",
  },
  {
    slug: "counting-from-the-wrong-end",
    name: "How many the API sees",
    brief:
      "The team wants to size the API tier for this failure mode, so the number they need is the requests arriving at the API, not the ones arriving at the database. Two people give two different answers in the same meeting.",
    callers: [
      { name: "browser", attempts: 2, timeout: 30000, backoff: 1000, factor: 2, jitter: 0.25, idempotent: true },
      { name: "edge", attempts: 4, timeout: 8000, backoff: 500, factor: 2, jitter: 0, idempotent: true, note: "four, because this library's retries setting is three and it does not count the first" },
      { name: "api client", attempts: 3, timeout: 2000, backoff: 200, factor: 2, jitter: 0, idempotent: true },
      { name: "pg driver", attempts: 2, timeout: 900, backoff: 100, factor: 2, jitter: 0, idempotent: true },
    ],
    leaf: { name: "postgres", latency: 4000 },
    ask: { kind: "requests-at", at: 2 },
    question: "How many requests arrive at the api client layer?",
    options: [
      { id: "a", claim: "8. Everything above it multiplies: 2 browser attempts times 4 edge attempts.", value: "8" },
      { id: "b", claim: "24. Its own three attempts count too, since each one is a request it handles.", value: "24" },
      { id: "c", claim: "48. The whole chain multiplied out, which is what the database sees.", value: "48" },
      { id: "d", claim: "6. Two browser attempts times three api attempts; the edge is a proxy and does not multiply.", value: "6" },
    ],
    why: "A layer sees what everything above it sends, and issues what its own policy allows. Its own attempt count multiplies what arrives at the layer below, not what arrives at itself, so counting it here double counts by three. And the edge's four is worth reading twice: the setting says three retries and the library does not include the original, which is the single commonest reason a measured amplification factor is larger than the predicted one.",
    breaks: "that a layer's own retry count is part of the load arriving at it, rather than the load it creates below",
  },
  {
    slug: "one-layer-that-does-not",
    name: "The layer that does not retry",
    brief:
      "Somebody has already been through this stack once and turned off the retries in the API client, on the grounds that the driver underneath it already retries and the edge above it already retries. The question is what that actually bought.",
    callers: [
      { name: "browser", attempts: 3, timeout: 30000, backoff: 1000, factor: 2, jitter: 0.2, idempotent: true },
      { name: "edge", attempts: 3, timeout: 10000, backoff: 500, factor: 2, jitter: 0, idempotent: true },
      { name: "api client", attempts: 1, timeout: 3000, backoff: 0, factor: 1, jitter: 0, idempotent: true, note: "retries off, deliberately, by somebody who had read about this" },
      { name: "pg driver", attempts: 3, timeout: 900, backoff: 100, factor: 2, jitter: 0, idempotent: true },
    ],
    leaf: { name: "postgres", latency: 4000 },
    ask: { kind: "amplification" },
    question: "How many queries does postgres see now?",
    options: [
      { id: "a", claim: "81, unchanged. Turning off one layer's retries does not help while three others are on.", value: "81" },
      { id: "b", claim: "27. One layer set to a single attempt takes a factor of three out of the product.", value: "27" },
      { id: "c", claim: "9. With the middle layer passive, only the outermost and innermost policies apply.", value: "9" },
      { id: "d", claim: "54. Two thirds of the original, since one of three retrying layers was disabled.", value: "54" },
    ],
    why: "Setting a layer to one attempt replaces a factor of three with a factor of one, so 81 becomes 27. That is a two thirds reduction from one configuration change, which is the strongest argument there is for retrying in exactly one place. The usual choice is the layer that knows whether the operation is safe to repeat and can see the whole deadline, which is almost never the driver at the bottom.",
    breaks: "that removing one layer's retries makes a proportional difference, rather than dividing the whole product",
  },
  {
    slug: "budgeted-properly",
    name: "The stack that degrades cleanly",
    brief:
      "The same shape, rebuilt by somebody who divided one budget from the top instead of choosing four timeouts from the bottom. A control case: it is worth being able to recognise a correct configuration as quickly as a broken one.",
    callers: [
      { name: "browser", attempts: 2, timeout: 25000, backoff: 2000, factor: 2, jitter: 0.3, idempotent: true, note: "the only layer that retries, and it jitters" },
      { name: "edge", attempts: 1, timeout: 9000, backoff: 0, factor: 1, jitter: 0, idempotent: true },
      { name: "api client", attempts: 1, timeout: 8000, backoff: 0, factor: 1, jitter: 0, idempotent: true, note: "a second less than the edge, so it fails before its caller does" },
      { name: "pg driver", attempts: 1, timeout: 7000, backoff: 0, factor: 1, jitter: 0, idempotent: true, note: "a second less again" },
    ],
    leaf: { name: "postgres", latency: 4000 },
    ask: { kind: "truncates" },
    question: "Which layer gives up while the layer below it is still working?",
    options: [
      { id: "a", claim: "The api client, because 8 seconds is less than the 9 the edge allows.", value: "api client" },
      { id: "b", claim: "The edge. Nine seconds cannot cover a 25 second browser budget.", value: "edge" },
      { id: "c", claim: "The browser, since it is the only layer that retries at all.", value: "browser" },
      { id: "d", claim: "None. Each layer allows less time than its caller, so the innermost failure surfaces first and nothing is abandoned.", value: "none" },
    ],
    why: "The budgets descend, which is the whole trick: each layer allows less time than its caller, so the innermost thing to fail is the innermost layer, and every failure is reported upwards rather than abandoned. Retrying happens once, at the top, where the operation is known to be safe and the user's patience is the actual constraint, and it jitters so that a million browsers do not return together. Nothing here is clever. It is one budget divided downwards instead of four numbers chosen upwards.",
    breaks: "that a correct stack is one where every timeout is generous, rather than one where the budgets descend",
  },
  {
    slug: "the-one-that-charges",
    name: "Three attempts at taking the money",
    brief:
      "A payment. The gateway is slow rather than broken and returns after eleven seconds; the HTTP client gives up at four and tries again. Nobody has read whether the endpoint is idempotent, and the client's configuration has no field for that question.",
    callers: [
      { name: "checkout", attempts: 3, timeout: 4000, backoff: 500, factor: 2, jitter: 0, idempotent: false, note: "POST /charge, with no idempotency key" },
    ],
    leaf: { name: "payments gateway", latency: 11000, note: "answers after eleven seconds, having done the work" },
    ask: { kind: "amplification" },
    question: "How many charges does the gateway process?",
    options: [
      { id: "a", claim: "1. The first attempt succeeded and the retries would be rejected as duplicates.", value: "1" },
      { id: "b", claim: "3. Each attempt is a fresh POST that the gateway completes, because nothing tells it these are the same charge.", value: "3" },
      { id: "c", claim: "0. Every attempt timed out, so nothing was committed.", value: "0" },
      { id: "d", claim: "2. The first is abandoned before it commits and the last two land.", value: "2" },
    ],
    why: "A timeout tells you nothing about whether the work happened. It tells you that you stopped listening. Three attempts against a non-idempotent endpoint with no idempotency key are three charges, all of which succeed, none of which is reported as a success to the caller, and the customer sees the total on a statement three days later. This is the only case here that a retry budget does not fix: the fix is an idempotency key, so that the second and third requests are recognised as the same intent.",
    breaks: "that a request which timed out did not happen, when a timeout says only that you stopped listening",
  },
];
