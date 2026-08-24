/**
 * The public roadmap.
 *
 * Shows every planned improvement to this site and its honest status,
 * including the ones that are blocked and why. Sustained, visible work is
 * the point: a backlog with real "not done yet" entries says more about how
 * someone works than a page of finished features does.
 */

import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import {
  ROADMAP,
  ROADMAP_ITEMS,
  ROADMAP_UPDATED,
  roadmapCounts,
  type RoadmapStatus,
} from "@/lib/roadmap";

const SITE_URL = "https://maxdoubin.com";

const STATUS_STYLE: Record<RoadmapStatus, { label: string; className: string; mark: string }> = {
  done: {
    label: "Done",
    mark: "✓",
    className:
      "border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]",
  },
  "in-progress": {
    label: "In progress",
    mark: "◐",
    className:
      "border-[hsl(var(--brand-cyan)/0.5)] bg-[hsl(var(--brand-cyan)/0.12)] text-[hsl(var(--brand-cyan))]",
  },
  planned: {
    label: "Planned",
    mark: "○",
    className:
      "border-[hsl(var(--brand-iron))] bg-transparent text-[hsl(var(--brand-ash))]",
  },
  blocked: {
    label: "Blocked",
    mark: "▲",
    className:
      "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.1)] text-[hsl(var(--brand-amber))]",
  },
};

function StatusBadge({ status }: { status: RoadmapStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono-tight text-[9px] uppercase tracking-[0.2em] ${style.className}`}
    >
      {/* The glyph carries the state alongside the colour, so the status is
          still readable if the colours are indistinguishable. */}
      <span aria-hidden>{style.mark}</span>
      {style.label}
    </span>
  );
}

export function CinematicRoadmap() {
  const counts = roadmapCounts();
  const total = ROADMAP_ITEMS.length;
  const shipped = counts.done;
  const percent = Math.round((shipped / total) * 100);

  useSEO({
    title: "Roadmap | Max Doubin",
    description:
      "What is planned, in progress, done and blocked on maxdoubin.com, tracked in public across 100 improvements.",
    canonical: `${SITE_URL}/roadmap`,
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1000px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Meta · Roadmap
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.25rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Building this in public.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              One hundred improvements to this site, with honest status on each.
              Items marked blocked are waiting on an account, a credential, or a
              decision, and each says what it is waiting for. Nothing here is
              marked done until it is live.
            </p>
            <p className="mt-3 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
              last updated {ROADMAP_UPDATED}
            </p>
          </header>

          <section className="mt-10 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm">
            <h2 className="sr-only">Progress summary</h2>
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <div className="font-display text-3xl font-medium text-[hsl(var(--brand-bone))]">
                {shipped}
                <span className="text-[hsl(var(--brand-ash))]"> / {total}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status="done" />
                <StatusBadge status="in-progress" />
                <StatusBadge status="planned" />
                <StatusBadge status="blocked" />
              </div>
            </div>
            <div
              className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--brand-obsidian))]"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${shipped} of ${total} items complete`}
            >
              <div
                className="h-full rounded-full bg-[hsl(var(--brand-signal))] transition-[width] duration-700"
                style={{ width: `${percent}%` }}
              />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(Object.keys(STATUS_STYLE) as RoadmapStatus[]).map((status) => (
                <div key={status}>
                  <dt className="font-mono-tight text-[9px] uppercase tracking-[0.26em] text-[hsl(var(--brand-ash))]">
                    {STATUS_STYLE[status].label}
                  </dt>
                  <dd className="mt-1 font-display text-xl text-[hsl(var(--brand-bone))]">
                    {counts[status]}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="mt-16 space-y-14">
            {ROADMAP.map((group) => (
              <section key={group.key} aria-labelledby={`group-${group.key}`}>
                <h2
                  id={`group-${group.key}`}
                  className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]"
                >
                  {group.title}
                </h2>
                <p className="mt-2 max-w-2xl font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {group.blurb}
                </p>

                <ul className="mt-6 space-y-px overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))]">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-start gap-x-4 gap-y-2 bg-[hsl(var(--brand-graphite)/0.4)] px-4 py-3"
                    >
                      <span className="w-8 shrink-0 pt-0.5 font-mono-tight text-[10px] tabular-nums text-[hsl(var(--brand-ash))]">
                        {String(item.id).padStart(3, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {item.title}
                        </div>
                        {item.note ? (
                          <p className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                            {item.note}
                          </p>
                        ) : null}
                      </div>
                      <StatusBadge status={item.status} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </CinematicLayout>
  );
}
