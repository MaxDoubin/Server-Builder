/**
 * Which posts a reader has opened, and how far down each one they got.
 *
 * Local only. Nothing leaves the browser and nothing is sent anywhere; the
 * blog listing reads it back to offer a "continue reading" strip.
 *
 * Every access is wrapped. Safari in private mode gives you a localStorage
 * that throws on write, some browsers throw on read when site data is
 * blocked, and JSON.parse throws on anything a different version of this
 * file (or a user with devtools open) left behind. An unguarded access here
 * would take down the whole listing page, so failures degrade to "no
 * history" instead.
 */

const KEY = "maxdoubin:reading-history:v1";

/** Entries past this many are dropped, oldest first. */
export const HISTORY_LIMIT = 50;

/**
 * Progress at which a post counts as read.
 *
 * Not 1.0: the last stretch of an article is the closing paragraph, the
 * neighbour links and the related list, and a reader who has reached that
 * point does not need to be told to come back.
 */
export const FINISHED_AT = 0.92;

/** Below this the reader only glanced at the page, so it is not "started". */
export const STARTED_AT = 0.03;

export interface ReadingEntry {
  slug: string;
  /** Epoch milliseconds of the most recent visit. */
  at: number;
  /** Furthest point reached, 0 to 1. */
  progress: number;
}

function isEntry(value: unknown): value is ReadingEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.slug === "string" &&
    e.slug.length > 0 &&
    typeof e.at === "number" &&
    Number.isFinite(e.at) &&
    typeof e.progress === "number" &&
    Number.isFinite(e.progress)
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Everything on record, most recently visited first. */
export function readHistory(): ReadingEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isEntry)
      .map((e) => ({ slug: e.slug, at: e.at, progress: clamp01(e.progress) }))
      .sort((a, b) => b.at - a.at)
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeHistory(entries: ReadingEntry[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  } catch {
    // Full, blocked, or private mode. The reader loses the bookmark, which
    // is not worth interrupting them over.
  }
}

/**
 * Record how far a reader got in one post.
 *
 * Progress only ever moves up for a given slug. Storing the last value seen
 * instead would mean opening a finished article and closing it again reset
 * it to a few percent, and it would reappear as unfinished.
 */
export function recordProgress(slug: string, progress: number): void {
  if (!slug) return;
  const next = clamp01(progress);
  const history = readHistory();
  const existing = history.find((e) => e.slug === slug);
  const merged: ReadingEntry = {
    slug,
    at: Date.now(),
    progress: existing ? Math.max(existing.progress, next) : next,
  };
  writeHistory([merged, ...history.filter((e) => e.slug !== slug)]);
}

export function getEntry(slug: string): ReadingEntry | undefined {
  return readHistory().find((e) => e.slug === slug);
}

/** Started but not finished, most recent first. */
export function unfinishedEntries(limit = 3): ReadingEntry[] {
  return readHistory()
    .filter((e) => e.progress >= STARTED_AT && e.progress < FINISHED_AT)
    .slice(0, limit);
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Same story as writeHistory.
  }
}
