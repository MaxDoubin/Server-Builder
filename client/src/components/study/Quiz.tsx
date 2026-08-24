/**
 * A reusable self-check quiz.
 *
 * One question at a time: pick an answer, get immediate feedback with an
 * explanation whether you were right or wrong, then move on. A running score
 * is kept and shown at the end, with a retry that reshuffles nothing but
 * simply clears the answers so the same set can be redrilled.
 *
 * Feedback never relies on colour alone: correctness is stated in words and
 * marked with a glyph, and the live region announces it for screen readers.
 */

import { useMemo, useState } from "react";

export interface QuizQuestion {
  id: string;
  question: string;
  /** Answer options in display order. */
  choices: string[];
  /** Index into `choices` of the correct answer. */
  correctIndex: number;
  /** Shown after answering, for both correct and incorrect responses. */
  explanation: string;
}

interface Props {
  questions: QuizQuestion[];
  /** Heading for the quiz block. Defaults to a generic label. */
  title?: string;
  testId?: string;
}

export function Quiz({ questions, title = "Check yourself", testId }: Props) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>(
    () => questions.map(() => null),
  );
  const [finished, setFinished] = useState(false);

  const total = questions.length;
  const question = questions[current];

  const score = useMemo(
    () => answers.reduce((sum, ans, i) => (ans === questions[i].correctIndex ? sum + 1 : sum), 0),
    [answers, questions],
  );

  function choose(index: number) {
    if (selected !== null) return; // Lock the answer once chosen.
    setSelected(index);
    setAnswers((prev) => {
      const next = [...prev];
      next[current] = index;
      return next;
    });
  }

  function advance() {
    if (current + 1 >= total) {
      setFinished(true);
      return;
    }
    setCurrent((c) => c + 1);
    setSelected(answers[current + 1]);
  }

  function retry() {
    setAnswers(questions.map(() => null));
    setSelected(null);
    setCurrent(0);
    setFinished(false);
  }

  if (total === 0) return null;

  if (finished) {
    const pct = Math.round((score / total) * 100);
    return (
      <section
        aria-labelledby="quiz-results-heading"
        data-testid={testId}
        className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
      >
        <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
          · {title} · Result
        </div>
        <h3
          id="quiz-results-heading"
          className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]"
        >
          {score} / {total} correct
        </h3>
        <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          {pct >= 80
            ? "Solid. You have the fundamentals for this category."
            : pct >= 50
              ? "A good start. Review the misses and run it again."
              : "Worth another pass through the guide before you retry."}
        </p>
        <button
          type="button"
          onClick={retry}
          data-testid="quiz-retry"
          className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal))] hover:text-[hsl(var(--brand-signal))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
        >
          Retry quiz
        </button>
      </section>
    );
  }

  const answered = selected !== null;

  return (
    <section
      aria-labelledby="quiz-heading"
      data-testid={testId}
      className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
          · {title}
        </div>
        <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
          {current + 1} / {total}
        </div>
      </div>

      <h3
        id="quiz-heading"
        className="mt-3 font-display text-lg font-medium leading-snug tracking-tight text-[hsl(var(--brand-bone))]"
      >
        {question.question}
      </h3>

      <ul className="mt-5 space-y-3">
        {question.choices.map((choice, index) => {
          const isCorrect = index === question.correctIndex;
          const isChosen = index === selected;
          // Once answered, mark the correct option and any wrong pick.
          let state: "idle" | "correct" | "wrong" | "muted" = "idle";
          if (answered) {
            if (isCorrect) state = "correct";
            else if (isChosen) state = "wrong";
            else state = "muted";
          }
          const stateClasses = {
            idle: "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:bg-[hsl(var(--brand-signal)/0.05)]",
            correct: "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.08)] text-[hsl(var(--brand-bone))]",
            wrong: "border-[hsl(var(--brand-danger))] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-bone))]",
            muted: "border-[hsl(var(--brand-iron)/0.5)] text-[hsl(var(--brand-ash))]",
          }[state];

          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => choose(index)}
                disabled={answered}
                data-testid={`quiz-choice-${index}`}
                className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left font-mono-tight text-sm leading-relaxed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-default ${stateClasses}`}
              >
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[10px]"
                >
                  {answered && isCorrect ? "✓" : answered && isChosen ? "✗" : String.fromCharCode(65 + index)}
                </span>
                <span className="flex-1">{choice}</span>
                {answered && isCorrect ? (
                  <span className="font-techno text-[9px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))]">
                    Correct
                  </span>
                ) : answered && isChosen ? (
                  <span className="font-techno text-[9px] uppercase tracking-[0.24em] text-[hsl(var(--brand-danger))]">
                    Your pick
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div aria-live="polite" className="min-h-[1px]">
        {answered ? (
          <div className="mt-5 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-4">
            <div
              className={`font-techno text-[10px] uppercase tracking-[0.32em] ${
                selected === question.correctIndex
                  ? "text-[hsl(var(--brand-signal))]"
                  : "text-[hsl(var(--brand-amber))]"
              }`}
            >
              {selected === question.correctIndex ? "Correct" : "Not quite"}
            </div>
            <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {question.explanation}
            </p>
          </div>
        ) : null}
      </div>

      {answered ? (
        <button
          type="button"
          onClick={advance}
          data-testid="quiz-next"
          className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
        >
          {current + 1 >= total ? "See results" : "Next question"}
        </button>
      ) : (
        <p className="mt-5 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
          Select an answer to see the explanation.
        </p>
      )}
    </section>
  );
}
