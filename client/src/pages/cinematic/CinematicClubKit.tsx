/**
 * Cyber Club in a Box at /cyber-club/kit.
 *
 * The most reusable thing this site has to give away. A student somewhere
 * has been told to start a cybersecurity club and has no plan, no budget and
 * an advisor who teaches history. This is the whole plan, free, with the
 * rules of engagement written out, because the part that goes wrong is never
 * the curriculum.
 *
 * Content lives in lib/clubKit.ts and is also emitted as a markdown file at
 * build time, so a club can print it and stop depending on this site.
 */

import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { siteConfig } from "@/lib/siteConfig";
import {
  KIT_SESSIONS,
  KIT_RESOURCES,
  KIT_BUDGET,
  KIT_FAILURES,
  KIT_RULES,
  KIT_VERSION,
} from "@/lib/clubKit";

const SITE_URL = "https://maxdoubin.com";
const CANONICAL = `${SITE_URL}/cyber-club/kit`;
const DOWNLOAD = "/data/cyber-club-kit.md";

const DESCRIPTION =
  "A free twelve week plan for starting a high school cybersecurity club: meeting plans, rules of engagement, a no budget materials list, and what kills clubs.";

const KIT_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "LearningResource",
  name: "Cyber Club in a Box",
  description: DESCRIPTION,
  url: CANONICAL,
  learningResourceType: "Curriculum",
  educationalLevel: "High school",
  audience: {
    "@type": "EducationalAudience",
    educationalRole: ["student", "teacher"],
  },
  teaches: [
    "Capture the flag competition",
    "Command line fundamentals",
    "Open source intelligence",
    "Cryptography",
    "Network packet analysis",
    "Password hashing",
    "Web application security",
    "Log analysis",
    "Digital forensics",
  ],
  timeRequired: "P12W",
  isAccessibleForFree: true,
  license: "https://creativecommons.org/licenses/by/4.0/",
  version: KIT_VERSION,
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: siteConfig.name },
};

const COST_LABEL: Record<string, string> = {
  free: "Free",
  "free tier": "Free tier",
  paid: "Costs money",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
      {children}
    </div>
  );
}

export function CinematicClubKit() {
  useSEO({
    title: "Cyber Club in a Box: a free 12 week plan | Max Doubin",
    description: DESCRIPTION,
    canonical: CANONICAL,
    schema: KIT_SCHEMA,
    schemaId: "club-kit-schema",
  });

  const freeCount = KIT_RESOURCES.filter((r) => r.cost !== "paid").length;

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Cyber Club in a Box · v{KIT_VERSION}
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Start a cyber club
            </h1>
            <p className="mt-6 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Twelve meetings, from a room where nobody has opened a terminal
              to a team registered for the National Cyber League. This is the
              plan the South CTA Cyber Club runs, written out for someone who
              has been handed a club and a classroom and nothing else.
            </p>
            <p className="mt-4 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              It assumes no budget, no lab, and school laptops.{" "}
              {freeCount} of the {KIT_RESOURCES.length} tools it uses are free,
              and the only line item with no free path is competition
              registration. Take it, change it, and do not credit me.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={DOWNLOAD}
                download
                data-testid="link-kit-download"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Download the whole plan
              </a>
              <Link
                href="/cyber-club"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.5)]"
              >
                The club this came from
              </Link>
            </div>
          </header>

          <section
            aria-labelledby="kit-rules-heading"
            className="mt-14 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] p-6"
          >
            <h2
              id="kit-rules-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
            >
              Read this before week one
            </h2>
            <p className="mt-3 max-w-[66ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The part that goes wrong in a school cyber club is never the
              curriculum. Write these down, have the advisor sign them, and
              keep them on file. A club without written rules of engagement
              gets shut down by the first misunderstanding, and it will
              deserve it.
            </p>
            <ol className="mt-5 space-y-3">
              {KIT_RULES.map((rule, index) => (
                <li key={rule} className="flex gap-4">
                  <span className="shrink-0 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="max-w-[66ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]">
                    {rule}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="kit-sessions-heading" className="mt-16">
            <SectionLabel>· Kit · Meetings</SectionLabel>
            <h2
              id="kit-sessions-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              Twelve weeks, one meeting each
            </h2>
            <p className="mt-3 max-w-[68ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The order is not arbitrary. The first four weeks are chosen
              because they produce a solved thing inside fifteen minutes with
              nothing installed, which is the only thing that brings a new
              member back. The heavy sessions land after the club has people
              who will show up regardless.
            </p>

            <ol className="mt-8 space-y-6">
              {KIT_SESSIONS.map((session) => (
                <li
                  key={session.week}
                  id={`week-${session.week}`}
                  data-testid="kit-session"
                  className="scroll-mt-24 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 backdrop-blur-sm"
                >
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                      Week {String(session.week).padStart(2, "0")}
                    </span>
                    <h3 className="font-display text-lg font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                      {session.title}
                    </h3>
                  </div>

                  <p className="mt-3 max-w-[68ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {session.goal}
                  </p>

                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <div>
                      <h4 className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                        Before the meeting
                      </h4>
                      <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {session.prep}
                      </p>
                      <h4 className="mt-5 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                        How you know it worked
                      </h4>
                      <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {session.evidence}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                        In the room
                      </h4>
                      <ol className="mt-2 space-y-2">
                        {session.run.map((step, index) => (
                          <li
                            key={step}
                            className="flex gap-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                          >
                            <span className="shrink-0 text-[hsl(var(--brand-signal))]">
                              {index + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {session.tools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="kit-budget-heading" className="mt-16">
            <SectionLabel>· Kit · Money</SectionLabel>
            <h2
              id="kit-budget-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              What it costs, honestly
            </h2>
            <p className="mt-3 max-w-[68ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Two columns: what you do with nothing, and what money buys if you
              have it. No dollar figures are printed here on purpose, because a
              price written down once is wrong within a year and a club that
              trusts it gets a nasty surprise at registration.
            </p>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th className="py-3 pr-4 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      Line
                    </th>
                    <th className="py-3 pr-4 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      With no budget
                    </th>
                    <th className="py-3 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      With a budget
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {KIT_BUDGET.map((line) => (
                    <tr
                      key={line.item}
                      className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top"
                    >
                      <td className="py-4 pr-4 font-mono-tight text-xs font-medium text-[hsl(var(--brand-bone))]">
                        {line.item}
                        <p className="mt-2 max-w-[34ch] font-normal leading-relaxed text-[hsl(var(--brand-ash))]">
                          {line.note}
                        </p>
                      </td>
                      <td className="py-4 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {line.zero}
                      </td>
                      <td className="py-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {line.funded}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="kit-resources-heading" className="mt-16">
            <SectionLabel>· Kit · Tools</SectionLabel>
            <h2
              id="kit-resources-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              Everything the plan links to
            </h2>
            <ul className="mt-6 divide-y divide-[hsl(var(--brand-iron)/0.6)] border-y border-[hsl(var(--brand-iron)/0.6)]">
              {KIT_RESOURCES.map((resource) => (
                <li key={resource.url} className="py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono-tight text-sm font-medium text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
                    >
                      {resource.name}
                    </a>
                    <span className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                      {COST_LABEL[resource.cost]}
                    </span>
                  </div>
                  <p className="mt-2 max-w-[70ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {resource.what}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="kit-failures-heading" className="mt-16">
            <SectionLabel>· Kit · What goes wrong</SectionLabel>
            <h2
              id="kit-failures-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              How clubs die, and what to do instead
            </h2>
            <div className="mt-6 space-y-4">
              {KIT_FAILURES.map((failure) => (
                <div
                  key={failure.symptom}
                  className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm"
                >
                  <h3 className="font-display text-base font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                    {failure.symptom}
                  </h3>
                  <p className="mt-2 max-w-[70ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    Why: {failure.cause}
                  </p>
                  <p className="mt-2 max-w-[70ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {failure.fix}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="kit-help-heading"
            className="mt-16 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
          >
            <h2
              id="kit-help-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              If you get stuck
            </h2>
            <p className="mt-3 max-w-[66ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              This is published under CC BY 4.0, which means you can copy it,
              change it, and hand it to your advisor without asking. If a week
              does not work in your room, tell me what happened and the plan
              gets fixed for the next club. The{" "}
              <Link
                href="/ncl"
                className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                National Cyber League notes
              </Link>{" "}
              and the{" "}
              <Link
                href="/tools"
                className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                browser tools
              </Link>{" "}
              on this site are the practice material for several of these
              weeks. Questions to{" "}
              <a
                href={`mailto:${siteConfig.email}?subject=${encodeURIComponent("Cyber Club in a Box")}`}
                className="break-all text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                {siteConfig.email}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}

export default CinematicClubKit;
