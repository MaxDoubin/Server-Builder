/**
 * Copy-to-clipboard button with a confirmation state.
 *
 * Shared so the tools, the reference tables, and the code blocks in posts
 * all behave the same way. The confirmation is announced politely rather
 * than shown only as a colour change, since "it turned green" is invisible
 * to a screen reader and to anyone who cannot distinguish the two states.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  /** Text placed on the clipboard. */
  value: string;
  /** Accessible name. Defaults to a generic label. */
  label?: string;
  /** Visible text. Omit for an icon-only button. */
  children?: React.ReactNode;
  className?: string;
  testId?: string;
}

export function CopyButton({ value, label = "Copy to clipboard", children, className = "", testId }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access is refused in some browsers unless the page is
      // focused and served over https. Fall back to a selection the user
      // can copy by hand rather than failing silently.
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        document.body.removeChild(area);
        return;
      }
      document.body.removeChild(area);
    }
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      /*
        Stable name. Swapping this to "Copied" renamed the control while it
        still held focus, which some screen readers re-announce on top of the
        live region below, and for the 1.8s window the button's name stopped
        describing what pressing it does. The live region is what reports the
        result.
      */
      aria-label={label}
      data-testid={testId}
      className={`inline-flex min-h-[28px] shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono-tight text-[10px] uppercase tracking-[0.2em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
        copied
          ? "border-[hsl(var(--brand-signal))] text-[hsl(var(--brand-signal))]"
          : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
      } ${className}`}
    >
      <span aria-hidden>{copied ? "✓" : "⧉"}</span>
      {children ?? <span>{copied ? "Copied" : "Copy"}</span>}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
