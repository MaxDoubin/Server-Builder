/**
 * A post link that shows a small preview card on hover or focus.
 *
 * Used on the onward links at the end of an article, where the link text is
 * a title and nothing else: the date and the first sentence are usually
 * enough to decide whether to follow it.
 *
 * Rules it follows:
 *  - Pointer devices only. On a touch screen there is no hover, and a card
 *    that appears on tap would just delay the navigation the tap asked for.
 *  - The card holds nothing focusable and is never focused, so tabbing
 *    moves straight from this link to the next one. No focus trap.
 *  - Escape dismisses it, and it stays open while the pointer is over the
 *    card itself so it can be read without racing the mouse.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import type { PostMeta } from "@/lib/postIndex";
import { readMinutes } from "@/lib/blogPosts";
import { postDifficulty } from "@/lib/postDifficulty";
import { DifficultyBadge } from "./DifficultyBadge";

/** Long enough that skimming across a list does not flash cards. */
const OPEN_DELAY_MS = 170;
const CLOSE_DELAY_MS = 120;

function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(hover: hover) and (pointer: fine)");
    if (!mq) return;
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return fine;
}

interface Props {
  post: PostMeta;
  children: ReactNode;
  /** Classes for the link itself. */
  className?: string;
  /** Classes for the positioning wrapper. */
  wrapperClassName?: string;
  /** Which edge the card hangs from, so it does not run off the layout. */
  align?: "left" | "right";
  testId?: string;
}

export function PostPreviewLink({
  post,
  children,
  className = "",
  wrapperClassName = "",
  align = "left",
  testId,
}: Props) {
  const fine = useFinePointer();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const cardId = `post-preview-${useId()}`;

  const clearTimers = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  useEffect(() => clearTimers, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Stays dismissed until the pointer leaves, otherwise it reopens
      // under a stationary cursor the moment anything re-renders.
      setDismissed(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const scheduleOpen = () => {
    if (!fine || dismissed) return;
    clearTimers();
    openTimer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };

  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  const showCard = fine && open;

  return (
    <div
      className={`relative ${wrapperClassName}`}
      onMouseEnter={scheduleOpen}
      onMouseLeave={() => {
        setDismissed(false);
        scheduleClose();
      }}
    >
      <Link
        href={`/blog/${post.slug}`}
        data-testid={testId}
        className={className}
        aria-describedby={showCard ? cardId : undefined}
        onFocus={() => {
          if (!fine || dismissed) return;
          clearTimers();
          setOpen(true);
        }}
        onBlur={scheduleClose}
      >
        {children}
      </Link>

      {showCard && (
        <div
          id={cardId}
          role="tooltip"
          data-testid="post-hover-preview"
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
          className={`absolute top-[calc(100%+8px)] z-30 w-[min(22rem,calc(100vw-3rem))] rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.97)] p-4 text-left shadow-2xl backdrop-blur-md ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 font-mono-tight text-[10px] uppercase tracking-[0.26em] text-[hsl(var(--brand-ash))]">
            <time dateTime={post.date}>
              {new Date(post.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </time>
            <span aria-hidden className="h-px w-3 bg-[hsl(var(--brand-iron))]" />
            <span>{readMinutes(post)} min</span>
            <DifficultyBadge level={postDifficulty(post)} />
          </div>
          {/* The link already reads out the title, so do not repeat it. */}
          <div
            aria-hidden
            className="mt-2 font-display text-sm leading-snug text-[hsl(var(--brand-bone))]"
          >
            {post.title}
          </div>
          <p className="mt-2 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            {post.excerpt}
          </p>
          <p className="mt-3 font-mono-tight text-[9px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
            Esc to dismiss
          </p>
        </div>
      )}
    </div>
  );
}
