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

/*
  The pill is opaque rather than a 0.4 wash.

  It rides the meta row on a post hero, so at 0.4 the cover photo showed
  through it and the label's contrast became a property of whichever image
  the post happened to have. Measured across eight covers by masking the
  glyphs: fine on seven, 4.06:1 on the eighth, under the 4.5 floor. Opaque
  makes it 5.61:1 in light and 9.77:1 in dark on every cover, because the
  photograph is no longer part of the sum.

  On a card, where the badge also appears, an opaque pill is simply a pill.
*/
export function DifficultyBadge({ level, className = "" }: Props) {
  return (
    <span
      title={DIFFICULTY_BLURB[level]}
      data-testid={`badge-difficulty-${level}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-[hsl(var(--brand-obsidian))] px-2 py-0.5 font-mono-tight text-[9px] uppercase tracking-[0.22em] ${TONE[level]} ${className}`}
    >
      <span aria-hidden className="tracking-normal">
        {DIFFICULTY_MARK[level]}
      </span>
      {level}
    </span>
  );
}
