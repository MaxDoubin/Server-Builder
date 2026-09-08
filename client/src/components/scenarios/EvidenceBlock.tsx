/**
 * The verbatim artefacts a scene shows you: a terminal, a log, an email.
 *
 * These are the part of a scenario that carries the actual technical content,
 * so they are rendered as what they are rather than as prose. A log excerpt
 * set in the body font reads as description; set in a monospace panel with a
 * source label it reads as evidence, and a reader treats it the way they
 * would treat the real thing, which is the whole point of the exercise.
 *
 * Wide content scrolls inside the panel. The page body must never scroll
 * sideways on a phone, and a 90-column log line will do exactly that if it is
 * allowed to.
 */

import type { Evidence } from "@/lib/scenarios/types";

const KIND_LABEL: Record<Evidence["kind"], string> = {
  terminal: "Terminal",
  log: "Log",
  email: "Email",
  chat: "Chat",
  alert: "Alert",
  ticket: "Ticket",
  note: "Note",
};

/** Alerts and ransom notes read as urgent; everything else reads as reference. */
const KIND_ACCENT: Record<Evidence["kind"], string> = {
  terminal: "text-[hsl(var(--brand-signal))]",
  log: "text-[hsl(var(--brand-ash))]",
  email: "text-[hsl(var(--brand-ash))]",
  chat: "text-[hsl(var(--brand-ash))]",
  alert: "text-[hsl(var(--brand-amber))]",
  ticket: "text-[hsl(var(--brand-ash))]",
  note: "text-[hsl(var(--brand-amber))]",
};

export function EvidenceBlock({ evidence }: { evidence: Evidence }) {
  return (
    <figure className="mt-5 overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.55)]">
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[hsl(var(--brand-iron))] px-4 py-2.5">
        <span className={`font-techno text-[9px] uppercase tracking-[0.32em] ${KIND_ACCENT[evidence.kind]}`}>
          {KIND_LABEL[evidence.kind]}
        </span>
        {evidence.title ? (
          <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-bone-dim))]">
            {evidence.title}
          </span>
        ) : null}
      </figcaption>
      <div className="overflow-x-auto">
        <pre className="px-4 py-3 font-mono-tight text-[12px] leading-[1.65] text-[hsl(var(--brand-bone-dim))]">
          <code>{evidence.lines.join("\n")}</code>
        </pre>
      </div>
    </figure>
  );
}
