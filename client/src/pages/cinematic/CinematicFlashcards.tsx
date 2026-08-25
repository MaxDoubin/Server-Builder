import { useCallback, useEffect, useMemo, useState } from "react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { DECKS, getDeck } from "@/lib/flashcardDecks";
import {
  type CardSchedule,
  type DeckState,
  type Grade,
  gradeCard,
  isDue,
  loadDeckState,
  newCardSchedule,
  previewInterval,
  resetDeckState,
  saveDeckState,
} from "@/lib/spacedRepetition";

const SITE_URL = "https://maxdoubin.com";

const GRADES: { grade: Grade; key: string; label: string; hint: string }[] = [
  { grade: "again", key: "1", label: "Again", hint: "Missed it" },
  { grade: "hard", key: "2", label: "Hard", hint: "Struggled" },
  { grade: "good", key: "3", label: "Good", hint: "Recalled" },
  { grade: "easy", key: "4", label: "Easy", hint: "Instant" },
];

interface SessionStats {
  reviewed: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
}

const EMPTY_STATS: SessionStats = { reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 };

function dueIdsFor(deckId: string, state: DeckState, now: number): string[] {
  const deck = getDeck(deckId);
  if (!deck) return [];
  return deck.cards
    .filter((card) => isDue(state[card.id] ?? newCardSchedule(now), now))
    .map((card) => card.id);
}

export function CinematicFlashcards() {
  useSEO({
    title: "Flashcards | Max Doubin",
    description:
      "A spaced-repetition flashcard trainer for networking, ports, security, Linux, and cryptography, with an SM-2 scheduler that plans each card's next review.",
    canonical: `${SITE_URL}/flashcards`,
    // A trainer is almost all interaction and little readable prose, so it is
    // kept out of the index rather than competing with the written guides.
    noindex: true,
  });

  const [mounted, setMounted] = useState(false);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [deckState, setDeckState] = useState<DeckState>({});
  const [queue, setQueue] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dueCounts, setDueCounts] = useState<Record<string, number>>({});

  // localStorage is only touched after mount, so server prerender and the
  // first client render agree before per-viewer state is read in.
  useEffect(() => {
    setMounted(true);
    const now = Date.now();
    const counts: Record<string, number> = {};
    for (const deck of DECKS) {
      counts[deck.id] = dueIdsFor(deck.id, loadDeckState(deck.id), now).length;
    }
    setDueCounts(counts);
  }, []);

  const refreshDueCount = useCallback((id: string, state: DeckState) => {
    setDueCounts((prev) => ({
      ...prev,
      [id]: dueIdsFor(id, state, Date.now()).length,
    }));
  }, []);

  const startDeck = useCallback((id: string) => {
    const state = loadDeckState(id);
    const now = Date.now();
    let ids = dueIdsFor(id, state, now);
    // Nothing due means the user is ahead of schedule; let them review the
    // whole deck anyway rather than facing an empty session.
    if (ids.length === 0) {
      const deck = getDeck(id);
      ids = deck ? deck.cards.map((c) => c.id) : [];
    }
    setDeckId(id);
    setDeckState(state);
    setQueue(ids);
    setRevealed(false);
    setFinished(false);
    setStats(EMPTY_STATS);
    setConfirmReset(false);
  }, []);

  const currentId = queue[0];
  const deck = deckId ? getDeck(deckId) : undefined;
  const card = useMemo(
    () => (deck && currentId ? deck.cards.find((c) => c.id === currentId) : undefined),
    [deck, currentId],
  );
  const currentSchedule: CardSchedule = currentId
    ? deckState[currentId] ?? newCardSchedule()
    : newCardSchedule();

  const grade = useCallback(
    (g: Grade) => {
      if (!deckId || !currentId || !revealed) return;
      const now = Date.now();
      const prev = deckState[currentId] ?? newCardSchedule(now);
      const next = gradeCard(prev, g, now);
      const nextState: DeckState = { ...deckState, [currentId]: next };
      setDeckState(nextState);
      saveDeckState(deckId, nextState);

      setStats((s) => ({
        reviewed: s.reviewed + 1,
        again: s.again + (g === "again" ? 1 : 0),
        hard: s.hard + (g === "hard" ? 1 : 0),
        good: s.good + (g === "good" ? 1 : 0),
        easy: s.easy + (g === "easy" ? 1 : 0),
      }));

      setQueue((q) => {
        const rest = q.slice(1);
        // A lapse comes back later in the same session; a pass leaves it.
        const nextQueue = g === "again" ? [...rest, currentId] : rest;
        if (nextQueue.length === 0) setFinished(true);
        return nextQueue;
      });
      setRevealed(false);
      refreshDueCount(deckId, nextState);
    },
    [deckId, currentId, revealed, deckState, refreshDueCount],
  );

  // Keyboard shortcuts: space reveals, 1 to 4 grade once revealed.
  useEffect(() => {
    if (!deckId || finished) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed) {
        const match = GRADES.find((g) => g.key === e.key);
        if (match) {
          e.preventDefault();
          grade(match.grade);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deckId, finished, revealed, grade]);

  function doReset() {
    if (!deckId) return;
    resetDeckState(deckId);
    const cleared: DeckState = {};
    setDeckState(cleared);
    refreshDueCount(deckId, cleared);
    setConfirmReset(false);
    startDeck(deckId);
  }

  function backToDecks() {
    setDeckId(null);
    setRevealed(false);
    setFinished(false);
    setConfirmReset(false);
  }

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[820px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Study · Spaced Repetition
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Flashcards.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Five decks of exam and competition fundamentals, scheduled with an
              SM-2-style algorithm. Grade each card honestly and it plans the next
              review: cards you know come back rarely, cards you miss come back
              soon. Progress is saved in this browser only.
            </p>
          </header>

          {!deck ? (
            <DeckPicker mounted={mounted} dueCounts={dueCounts} onStart={startDeck} />
          ) : finished ? (
            <SessionSummary
              deckName={deck.name}
              stats={stats}
              onAgain={() => startDeck(deck.id)}
              onBack={backToDecks}
            />
          ) : (
            <div className="mt-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={backToDecks}
                  className="inline-flex min-h-[36px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                >
                  ← Decks
                </button>
                <div className="flex items-center gap-4">
                  <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    {deck.name}
                  </span>
                  <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    {queue.length} left
                  </span>
                </div>
              </div>

              <div className="mt-6 min-h-[16rem] rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm md:p-8">
                <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                  Front
                </div>
                <p className="mt-3 font-display text-xl font-medium leading-snug text-[hsl(var(--brand-bone))] md:text-2xl">
                  {card?.front}
                </p>

                <div aria-live="polite">
                  {revealed && card ? (
                    <div className="mt-6 border-t border-[hsl(var(--brand-iron))] pt-5">
                      <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                        Back
                      </div>
                      <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base">
                        {card.back}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              {!revealed ? (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  data-testid="flashcard-reveal"
                  className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] sm:w-auto"
                >
                  Reveal answer
                  <span className="rounded border border-[hsl(var(--brand-obsidian)/0.4)] px-1.5 py-0.5 text-[9px]">
                    Space
                  </span>
                </button>
              ) : (
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {GRADES.map(({ grade: g, key, label, hint }) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => grade(g)}
                      data-testid={`flashcard-grade-${g}`}
                      className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] px-3 py-2.5 transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:bg-[hsl(var(--brand-signal)/0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                    >
                      <span className="flex items-center gap-1.5 font-mono-tight text-xs font-medium uppercase tracking-[0.1em] text-[hsl(var(--brand-bone))]">
                        <span aria-hidden className="rounded border border-[hsl(var(--brand-iron))] px-1 text-[9px] text-[hsl(var(--brand-ash))]">
                          {key}
                        </span>
                        {label}
                      </span>
                      <span className="font-mono-tight text-[10px] text-[hsl(var(--brand-ash))]">
                        {previewInterval(currentSchedule, g)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  Space reveals · 1 to 4 grade · reviewed {stats.reviewed}
                </p>
                {confirmReset ? (
                  <div className="flex items-center gap-2" role="alert">
                    <span className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-amber))]">
                      Clear this deck's progress?
                    </span>
                    <button
                      type="button"
                      onClick={doReset}
                      data-testid="flashcard-reset-confirm"
                      className="min-h-[28px] rounded-md border border-[hsl(var(--brand-danger))] px-3 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-danger))] transition-colors hover:bg-[hsl(var(--brand-danger)/0.1)]"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="min-h-[28px] rounded-md border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    data-testid="flashcard-reset"
                    className="min-h-[28px] rounded-md border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-danger)/0.6)] hover:text-[hsl(var(--brand-danger))]"
                  >
                    Reset deck
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </CinematicLayout>
  );
}

function DeckPicker({
  mounted,
  dueCounts,
  onStart,
}: {
  mounted: boolean;
  dueCounts: Record<string, number>;
  onStart: (id: string) => void;
}) {
  return (
    <div className="mt-10">
      <h2 className="sr-only">Choose a deck</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {DECKS.map((deck) => {
          const due = dueCounts[deck.id];
          return (
            <li key={deck.id}>
              <button
                type="button"
                onClick={() => onStart(deck.id)}
                data-testid={`deck-${deck.id}`}
                className="group flex h-full w-full items-start justify-between gap-3 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 text-left backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                <span>
                  <span className="block font-display text-lg font-medium tracking-tight text-[hsl(var(--brand-bone))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                    {deck.name}
                  </span>
                  <span className="mt-1.5 block font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
                    {deck.description}
                  </span>
                  <span className="mt-3 block font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                    {deck.cards.length} cards
                    {mounted && typeof due === "number" ? (
                      <span className="text-[hsl(var(--brand-signal))]"> · {due} due</span>
                    ) : null}
                  </span>
                </span>
                <span aria-hidden className="mt-1 shrink-0 text-[hsl(var(--brand-ash))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                  →
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SessionSummary({
  deckName,
  stats,
  onAgain,
  onBack,
}: {
  deckName: string;
  stats: SessionStats;
  onAgain: () => void;
  onBack: () => void;
}) {
  const rows: { label: string; value: number }[] = [
    { label: "Reviewed", value: stats.reviewed },
    { label: "Again", value: stats.again },
    { label: "Hard", value: stats.hard },
    { label: "Good", value: stats.good },
    { label: "Easy", value: stats.easy },
  ];
  return (
    <section
      aria-labelledby="summary-heading"
      className="mt-10 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm md:p-8"
    >
      <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
        · Session complete
      </div>
      <h2
        id="summary-heading"
        className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]"
      >
        {deckName}
      </h2>
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-4 text-center"
          >
            <dt className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              {row.label}
            </dt>
            <dd className="mt-1 font-display text-2xl font-medium text-[hsl(var(--brand-bone))]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAgain}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
        >
          Study again
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal))] hover:text-[hsl(var(--brand-signal))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
        >
          Back to decks
        </button>
      </div>
    </section>
  );
}
