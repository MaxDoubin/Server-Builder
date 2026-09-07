/**
 * Table of contents for a post.
 *
 * The body arrives as markdown some time after the page mounts and is
 * handed to the DOM through dangerouslySetInnerHTML, so there is no React
 * tree to walk for headings. The TOC is therefore built from the rendered
 * DOM: usePostHeadings reads h2/h3 out of the article container once the
 * HTML is in place, stamps a stable id on each, and rebuilds whenever the
 * article changes.
 *
 * Because both the desktop sidebar and the small-screen <details> need the
 * same data, extraction and the active-section tracking live in hooks that
 * the page calls once, and PostToc is a pure renderer of the result.
 */

import { useEffect, useState, type RefObject } from "react";
import { useSmoothScroll } from "@/lib/motion/SmoothScrollProvider";
import { slugifyHeading } from "@/lib/headingSlug";

export interface TocHeading {
  id: string;
  text: string;
  /** 2 or 3. h3 renders indented under the preceding h2. */
  level: number;
}

/** Distance from the top of the viewport that counts as "at the top". */
const NAV_OFFSET = 96;

/**
 * Read the headings out of the rendered article.
 *
 * `contentKey` is whatever changes when the article does, normally the
 * rendered HTML itself. Passing it as a dependency is what makes the TOC
 * rebuild when the reader navigates from one post to another, since the
 * container element is reused across posts.
 *
 * Ids are assigned deterministically from the heading text, so running this
 * twice over the same DOM produces the same ids and re-running is harmless.
 */
export function usePostHeadings(
  contentRef: RefObject<HTMLElement | null>,
  contentKey: string,
): TocHeading[] {
  const [headings, setHeadings] = useState<TocHeading[]>([]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || !contentKey) {
      setHeadings([]);
      return;
    }

    const nodes = Array.from(root.querySelectorAll<HTMLElement>("h2, h3"));
    const used = new Set<string>();
    const found: TocHeading[] = [];

    for (const node of nodes) {
      const text = (node.textContent ?? "").trim();
      if (!text) continue;

      const base = slugifyHeading(text);
      let id = base;
      let n = 2;
      // Two sections can share a title, and the page has ids of its own
      // (the skip-link target, for one) that a heading must not steal.
      while (used.has(id) || (document.getElementById(id) !== null && document.getElementById(id) !== node)) {
        id = `${base}-${n}`;
        n += 1;
      }
      used.add(id);

      node.id = id;
      // Anchor jumps otherwise land under the fixed nav.
      node.style.scrollMarginTop = `${NAV_OFFSET}px`;

      found.push({ id, text, level: node.tagName === "H3" ? 3 : 2 });
    }

    setHeadings(found);
  }, [contentRef, contentKey]);

  return headings;
}

/**
 * Which section the reader is currently looking at.
 *
 * The observer band is the strip just under the nav down to a third of the
 * way into the viewport. When no heading is inside it the reader is in the
 * middle of a long section, so we fall back to the last heading that has
 * scrolled past the top.
 */
export function useActiveHeading(headings: TocHeading[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (headings.length === 0) {
      setActiveId(null);
      return;
    }
    setActiveId(headings[0].id);

    if (typeof IntersectionObserver === "undefined") return;

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const visible = new Set<string>();

    const pick = () => {
      const firstVisible = headings.find((h) => visible.has(h.id));
      if (firstVisible) {
        setActiveId(firstVisible.id);
        return;
      }
      let passed: string | null = null;
      for (const el of elements) {
        if (el.getBoundingClientRect().top < NAV_OFFSET) passed = el.id;
      }
      setActiveId(passed ?? headings[0].id);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        pick();
      },
      { rootMargin: `-${NAV_OFFSET}px 0px -66% 0px`, threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  return activeId;
}

interface Props {
  headings: TocHeading[];
  activeId: string | null;
  /**
   * "sidebar" is the sticky desktop column. "collapsible" is the closed
   * <details> that replaces it below lg, where there is no room beside the
   * text for a second column.
   */
  variant: "sidebar" | "collapsible";
  className?: string;
}

export function PostToc({ headings, activeId, variant, className = "" }: Props) {
  const { lenis, scrollTo } = useSmoothScroll();

  if (headings.length < 2) return null;

  const jump = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();

    if (lenis) {
      scrollTo(target, { offset: -NAV_OFFSET });
    } else {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET,
        behavior: reduced ? "auto" : "smooth",
      });
    }

    // Keyboard readers should land in the section they picked, not stay on
    // the link. The heading is not natively focusable, hence the tabindex.
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  };

  const list = (
    <ol className="space-y-1">
      {headings.map((heading) => {
        const active = heading.id === activeId;
        return (
          <li key={heading.id} className={heading.level === 3 ? "pl-4" : ""}>
            <a
              href={`#${heading.id}`}
              onClick={(e) => jump(e, heading.id)}
              aria-current={active ? "location" : undefined}
              data-testid={`toc-link-${heading.id}`}
              className={`flex min-h-[24px] items-start gap-2 py-1 font-mono-tight text-[11px] leading-relaxed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                active
                  ? "text-[hsl(var(--brand-signal))]"
                  : "text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
              }`}
            >
              <span
                aria-hidden
                className={`mt-[7px] h-px w-2 shrink-0 transition-colors ${
                  active
                    ? "bg-[hsl(var(--brand-signal))]"
                    : "bg-[hsl(var(--brand-iron))]"
                }`}
              />
              <span className="min-w-0">{heading.text}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );

  if (variant === "collapsible") {
    return (
      <details
        className={`rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.4)] px-4 py-3 ${className}`}
        data-print-hide
        data-testid="post-toc-collapsible"
      >
        <summary className="cursor-pointer list-none font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))] marker:content-none">
          <span className="text-[hsl(var(--brand-signal))]">·</span> Contents
          <span className="ml-2 text-[hsl(var(--brand-signal))]">
            ({headings.length})
          </span>
        </summary>
        <nav aria-label="Sections in this note" className="mt-3">
          {list}
        </nav>
      </details>
    );
  }

  return (
    <nav
      aria-label="Sections in this note"
      className={className}
      data-testid="post-toc-sidebar"
    >
      <div className="sticky top-28">
        <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
          · Contents
        </div>
        <div className="mt-4 border-l border-[hsl(var(--brand-iron))] pl-3">{list}</div>
      </div>
    </nav>
  );
}
