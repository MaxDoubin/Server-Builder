/**
 * The derived difficulty label as a badge.
 *
 * The word is always present, and the dot glyph repeats the same
 * information, so the badge never depends on its colour to be read.
 */

import {
  DIFFICULTY_BLURB,
  DIFFICULTY_MARK,
  type Difficulty,
} from "@/lib/postDifficulty";

const TONE: Record<Difficulty, string> = {
  beginner:
    "border-[hsl(var(--brand-cyan)/0.4)] text-[hsl(var(--brand-cyan))]",
  intermediate:
    "border-[hsl(var(--brand-signal)/0.4)] text-[hsl(var(--brand-signal))]",
  advanced:
    "border-[hsl(var(--brand-amber)/0.45)] text-[hsl(var(--brand-amber))]",
};

interface Props {
  level: Difficulty;
  className?: string;
}

export function DifficultyBadge({ level, className = "" }: Props) {
  return (
    <span
      title={DIFFICULTY_BLURB[level]}
      data-testid={`badge-difficulty-${level}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-[hsl(var(--brand-obsidian)/0.4)] px-2 py-0.5 font-mono-tight text-[9px] uppercase tracking-[0.22em] ${TONE[level]} ${className}`}
    >
      <span aria-hidden className="tracking-normal">
        {DIFFICULTY_MARK[level]}
      </span>
      {level}
    </span>
  );
}
