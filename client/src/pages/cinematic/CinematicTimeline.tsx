import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { siteConfig } from "@/lib/siteConfig";
import { TIMELINE_GROUPS as GROUPS } from "@/lib/timelineConfig";

export function CinematicTimeline() {
  useSEO({
    title: "Timeline | Max Doubin",
    description:
      "Competitions, awards, and milestones for Max Doubin, from National Cyber League results and certifications to leadership roles and press coverage.",
    canonical: "https://maxdoubin.com/timeline",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[820px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Record · Timeline
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Timeline.
            </h1>
            <p className="mt-6 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Competitions, awards, and milestones. Dated where the record carries a date, grouped
              separately where it does not. Nothing here is estimated.
            </p>
          </header>

          <div className="mt-14 space-y-16">
            {GROUPS.map((group) => (
              <section key={group.id} aria-labelledby={`${group.id}-heading`}>
                <h2
                  id={`${group.id}-heading`}
                  className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
                >
                  {group.label}
                </h2>
                {group.note ? (
                  <p className="mt-3 max-w-[62ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {group.note}
                  </p>
                ) : null}

                <ol className="mt-8 space-y-10 border-l border-[hsl(var(--brand-iron))] pl-6">
                  {group.entries.map((entry) => (
                    <li key={entry.title} className="relative">
                      <span
                        aria-hidden
                        className="absolute -left-[29px] top-[7px] h-[9px] w-[9px] rounded-full bg-[hsl(var(--brand-signal))]"
                        style={{ boxShadow: "0 0 10px hsl(var(--brand-signal) / 0.6)" }}
                      />
                      {entry.when ? (
                        <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                          {entry.when}
                        </div>
                      ) : null}
                      <h3 className="mt-1 font-display text-lg font-medium leading-snug tracking-tight text-[hsl(var(--brand-bone))]">
                        {entry.title}
                      </h3>
                      <p className="mt-2 max-w-[66ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {entry.description}
                      </p>
                      {entry.href ? (
                        <a
                          href={entry.href}
                          {...(entry.external
                            ? { target: "_blank", rel: "noopener noreferrer" }
                            : {})}
                          className="mt-2 inline-flex min-h-[24px] items-center gap-2 break-words py-1 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                        >
                          {entry.external ? "Read the article" : "More"}
                          <span aria-hidden>{entry.external ? "↗" : "→"}</span>
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>

          <p className="mt-16 max-w-[62ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Every entry above comes from the same record that drives the rest of {siteConfig.name}'s
            site. If a date is missing here, it is missing there too.
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}

export default CinematicTimeline;
