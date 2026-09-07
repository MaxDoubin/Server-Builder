/**
 * A small SM-2-style spaced-repetition scheduler.
 *
 * The algorithm is an adaptation of SuperMemo's SM-2 (P.A. Wozniak, 1990,
 * https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method) to the four-button grading
 * interface popularised by Anki: again / hard / good / easy. SM-2 proper
 * takes a recall quality of 0 to 5; we map the four buttons onto that scale
 * and keep SM-2's ease-factor update and interval progression.
 *
 * Each card carries an ease factor (how fast its interval grows), the
 * current interval in days, a repetition count (consecutive successful
 * recalls), and the timestamp when it next falls due. State is keyed by
 * card id and persisted per deck in localStorage.
 *
 * Nothing here is a security-sensitive claim, but the scheduling maths is
 * still meant to be correct: a lapse resets the repetition count, the ease
 * factor is floored at 1.3 exactly as SM-2 specifies, and intervals never
 * collapse below one day for a successful review.
 */

export type Grade = "again" | "hard" | "good" | "easy";

export interface CardSchedule {
  /** Ease factor. SM-2 starts new cards at 2.5 and floors the value at 1.3. */
  ease: number;
  /** Current inter-repetition interval, in whole days. */
  intervalDays: number;
  /** Consecutive successful recalls. A lapse (again) resets this to 0. */
  repetitions: number;
  /** Epoch milliseconds when the card next becomes due. */
  due: number;
  /** Total times this card has been graded, for the session summary. */
  reviews: number;
  /** The most recent grade, so the UI can show it. */
  lastGrade?: Grade;
}

/** Map of card id to its schedule. One of these is stored per deck. */
export type DeckState = Record<string, CardSchedule>;

const MIN_EASE = 1.3;
const START_EASE = 2.5;
const DAY_MS = 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = "ncl-srs:v1:";

/** A brand-new card: due immediately, at the default ease. */
export function newCardSchedule(now: number = Date.now()): CardSchedule {
  return {
    ease: START_EASE,
    intervalDays: 0,
    repetitions: 0,
    due: now,
    reviews: 0,
  };
}

/**
 * Apply a grade to a card and return its next schedule.
 *
 * `again` is a lapse: the repetition count resets and the card is put back
 * into the current session (it comes due again straight away) so the user
 * sees it once more before finishing. The other three grades advance the
 * card, using SM-2's fixed first two intervals (1 day, then 6 days) before
 * switching to geometric growth by the ease factor.
 */
export function gradeCard(
  prev: CardSchedule,
  grade: Grade,
  now: number = Date.now(),
): CardSchedule {
  let ease = prev.ease;
  let repetitions = prev.repetitions;
  let intervalDays: number;

  switch (grade) {
    case "again": {
      // Lapse. SM-2 zeroes the repetition count on quality < 3. We drop the
      // ease by 0.2 and requeue the card inside this session rather than
      // waiting a day, which is how short "relearning" steps behave.
      repetitions = 0;
      ease = Math.max(MIN_EASE, ease - 0.2);
      intervalDays = 0;
      return {
        ease,
        intervalDays,
        repetitions,
        // A one-minute nudge keeps it due now without colliding with cards
        // graded in the same millisecond.
        due: now + 60 * 1000,
        reviews: prev.reviews + 1,
        lastGrade: grade,
      };
    }
    case "hard": {
      ease = Math.max(MIN_EASE, ease - 0.15);
      repetitions += 1;
      intervalDays =
        prev.intervalDays < 1 ? 1 : Math.max(1, Math.round(prev.intervalDays * 1.2));
      break;
    }
    case "good": {
      // SM-2 leaves the ease factor unchanged for a quality-4 recall.
      repetitions += 1;
      if (repetitions === 1) intervalDays = 1;
      else if (repetitions === 2) intervalDays = 6;
      else intervalDays = Math.max(1, Math.round(prev.intervalDays * ease));
      break;
    }
    case "easy": {
      ease += 0.15;
      repetitions += 1;
      if (repetitions === 1) intervalDays = 4;
      else if (repetitions === 2) intervalDays = 8;
      else intervalDays = Math.max(1, Math.round(prev.intervalDays * ease * 1.3));
      break;
    }
  }

  return {
    ease,
    intervalDays,
    repetitions,
    due: now + intervalDays * DAY_MS,
    reviews: prev.reviews + 1,
    lastGrade: grade,
  };
}

/** True when the card has reached or passed its due time. */
export function isDue(schedule: CardSchedule, now: number = Date.now()): boolean {
  return schedule.due <= now;
}

/**
 * A short, human-readable preview of when the next review would land, so the
 * grading buttons can show the consequence of each choice before it is made.
 */
export function previewInterval(
  prev: CardSchedule,
  grade: Grade,
  now: number = Date.now(),
): string {
  const next = gradeCard(prev, grade, now);
  if (grade === "again") return "<1 min";
  if (next.intervalDays <= 1) return "1 day";
  if (next.intervalDays < 30) return `${next.intervalDays} days`;
  if (next.intervalDays < 365) return `${Math.round(next.intervalDays / 30)} mo`;
  return `${(next.intervalDays / 365).toFixed(1)} yr`;
}

function storageKey(deckId: string): string {
  return `${STORAGE_PREFIX}${deckId}`;
}

const GRADES: Grade[] = ["again", "hard", "good", "easy"];

/**
 * Whether a stored value is a schedule this module can actually compute on.
 *
 * Casting the parsed object to DeckState was not enough. The scheduler does
 * arithmetic on every field, and JavaScript will not stop it: a schedule
 * whose numbers are strings grades to intervalDays NaN and due NaN, and a
 * card whose due date is NaN never compares as due again, so it leaves the
 * rotation permanently. The label under the buttons reads "NaN yr" while
 * that happens, and gradeCard writes the result straight back, so one bad
 * entry keeps getting worse instead of being cleaned up.
 *
 * A dropped entry becomes a new card, which is the right way to lose this:
 * the reader repeats one card sooner than they needed to.
 */
function isSchedule(value: unknown): value is CardSchedule {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  for (const field of ["ease", "intervalDays", "repetitions", "due", "reviews"]) {
    if (typeof s[field] !== "number" || !Number.isFinite(s[field])) return false;
  }
  return s.lastGrade === undefined || GRADES.includes(s.lastGrade as Grade);
}

/**
 * Read a deck's saved schedules, keeping only the ones that are usable.
 *
 * localStorage throws in private-browsing modes and when storage is
 * disabled, and JSON.parse throws on anything corrupt, so both are caught
 * and treated as "no saved state" rather than crashing the trainer. Entries
 * that parse but are not schedules are dropped one at a time, so one bad
 * card does not cost the reader the rest of the deck's progress.
 */
export function loadDeckState(deckId: string): DeckState {
  try {
    const raw = localStorage.getItem(storageKey(deckId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const state: DeckState = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isSchedule(value)) state[id] = value;
    }
    return state;
  } catch {
    return {};
  }
}

/** Persist a deck's schedules. Silently no-ops if storage is unavailable. */
export function saveDeckState(deckId: string, state: DeckState): void {
  try {
    localStorage.setItem(storageKey(deckId), JSON.stringify(state));
  } catch {
    // Private browsing or a full quota. The session still works in memory.
  }
}

/** Forget all scheduling for a deck. */
export function resetDeckState(deckId: string): void {
  try {
    localStorage.removeItem(storageKey(deckId));
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
