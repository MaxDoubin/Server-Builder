import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { siteConfig, PRESS } from "@/lib/siteConfig";

interface TimelineEntry {
  title: string;
  description: string;
  /**
   * Displayed under the title. Only ever set when the site actually records
   * it. Everything else is grouped as undated rather than given a guessed year.
   */
  when?: string;
  href?: string;
  external?: boolean;
}

interface TimelineGroup {
  id: string;
  /** Year, or the label for the undated group. */
  label: string;
  note?: string;
  entries: TimelineEntry[];
}

/**
 * Drawn from siteConfig only.
 *
 * siteConfig carries a date for three things: the 2024 percussion ranking,
 * the 2026 PBS Varsity Quiz finals, and the press feature. Everything else has no date recorded, so it
 * is grouped as undated. Do not infer a year for an entry from the year next
 * to it: an approximately right date on a portfolio is a wrong date.
 */
const GROUPS: TimelineGroup[] = [
  {
    id: "y2026",
    label: "2026",
    entries: [
      {
        title: "President, South CTA Music Club",
        when: "2026/2027 school year",
        description:
          "Leads club activities, coordination, and student participation for the school year.",
      },
      {
        title: "PBS Varsity Quiz state finalist",
        when: "2026",
        description:
          "Reached the state finals on a team made up entirely of freshmen.",
      },
      {
        title: PRESS.headline,
        when: PRESS.displayDate,
        description: `Coverage of CCSD magnet programs in ${PRESS.outlet}, reported by ${PRESS.author}.`,
        href: PRESS.url,
        external: true,
      },
    ],
  },
  {
    id: "y2024",
    label: "2024",
    entries: [
      {
        title: "#1 percussionist in the state of Nevada",
        when: "2024",
        description:
          "Ranked first in the state. Nevada All-State Band selection came in 6th, 7th, and 9th grade.",
      },
    ],
  },
  {
    id: "undated",
    label: "No date on record",
    note:
      "These are real and verifiable, but this site does not record when each one happened. They are listed without a date rather than with a guessed one.",
    entries: [
      {
        title: "Top 1% · National Cyber League",
        description:
          "Scored in the top 1 percent of National Cyber League competitors, across open source intelligence, cryptography, log analysis, hash cracking, network forensics, and web exploitation.",
      },
      {
        title: "South CTA finishes 7th in the nation",
        description:
          "Helped lead the school to a 7th place national finish among schools in National Cyber League competition.",
      },
      {
        title: "CompTIA Tech+ certified",
        description:
          "The one certification currently held. Security+, Network+, and Cisco CCNA are in progress and are not claimed as earned.",
      },
      {
        title: "President, South CTA Cyber Club",
        description:
          "Runs preparation, training, and student engagement for the school's cybersecurity club.",
        href: "/cyber-club",
      },
      {
        title: "Lead instructor, youth coding camps",
        description:
          "Teaches coding and technical fundamentals to younger students at camps across the Las Vegas Valley.",
        href: "/coding-camps",
      },
      {
        title: "Blue Ribbon Commissioner, City of Henderson",
        description:
          "Serves on the City of Henderson's Blue Ribbon Commission, contributing a student perspective to civic discussion.",
      },
      {
        title: "Youth Advisory Council, Nevada OWINN",
        description:
          "Participates in the Office of Workforce Innovation's youth advisory work on workforce readiness and opportunity.",
      },
      {
        title: "Big Future Ambassador, College Board",
        description: "Represents student perspective and outreach through College Board programs.",
      },
      {
        title: "Student of the Month",
        when: "October",
        description:
          "Recognised as Student of the Month at South Career Technical Academy. The year is not recorded here.",
      },
      {
        title: "Former President, NJHS at Pinecrest Inspirada",
        description: "Served as chapter president before attending South Career Technical Academy.",
      },
    ],
  },
];

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
