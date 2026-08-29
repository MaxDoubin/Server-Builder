import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { COVERS, TAKEAWAYS } from "@/lib/campsConfig";
import { siteConfig } from "@/lib/siteConfig";

const CANONICAL = "https://maxdoubin.com/coding-camps";

const DESCRIPTION =
  "Youth coding camps across the Las Vegas Valley, taught by Max Doubin. Beginners write real programs, learn how a computer actually works, and leave with something they built themselves.";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  MAX: FILL THESE IN. Every field is null because none of it is recorded
 *  anywhere on this site, and a wrong age range or an invented price on a
 *  page aimed at parents is worse than no answer. The page renders a
 *  fallback for each null and swaps in the real detail the moment you set
 *  one. Do not let anyone guess these back in.
 * ─────────────────────────────────────────────────────────────────────────
 */
const CAMP_DETAILS: {
  ageRange: string | null;
  sessionLength: string | null;
  groupSize: string | null;
  cost: string | null;
  locations: string | null;
  registerUrl: string | null;
} = {
  ageRange: null,
  sessionLength: null,
  groupSize: null,
  cost: null,
  locations: null,
  registerUrl: null,
};

// Module scope keeps the object identity stable across renders, which matters
// because useSEO lists `schema` in its effect dependencies.
const COURSE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: "Youth Coding Camps",
  description: DESCRIPTION,
  url: CANONICAL,
  inLanguage: "en-US",
  educationalLevel: "Beginner",
  teaches: [
    "Programming fundamentals",
    "Python",
    "Problem decomposition",
    "Debugging",
    "How computers and networks work",
  ],
  about: ["Computer programming", "Computer science", "Technology education"],
  audience: {
    "@type": "EducationalAudience",
    educationalRole: "student",
  },
  spatialCoverage: {
    "@type": "Place",
    name: "Las Vegas Valley, Nevada",
  },
  provider: {
    "@type": "Person",
    name: siteConfig.name,
    url: "https://maxdoubin.com/",
  },
};


export function CinematicCamps() {
  useSEO({
    title: "Youth Coding Camps | Max Doubin",
    description:
      "Youth coding camps across the Las Vegas Valley taught by Max Doubin: what they cover, what a session looks like, and what a beginner takes home.",
    canonical: CANONICAL,
    schema: COURSE_SCHEMA,
    schemaId: "coding-camps-schema",
  });

  const facts = [
    { label: "Ages", value: CAMP_DETAILS.ageRange },
    { label: "Session length", value: CAMP_DETAILS.sessionLength },
    { label: "Group size", value: CAMP_DETAILS.groupSize },
    { label: "Cost", value: CAMP_DETAILS.cost },
    { label: "Where", value: CAMP_DETAILS.locations },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Teaching · Las Vegas Valley
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Youth coding camps.
            </h1>
            <p className="mt-6 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              I am a lead instructor for youth coding camps across the Las Vegas Valley. The camps
              are for students who have never written a line of code, and the goal is not to produce
              a programmer in a week. It is to make a computer feel knowable.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={`mailto:${siteConfig.email}?subject=${encodeURIComponent("Coding camps")}`}
                data-testid="link-camps-email"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Ask a question
              </a>
              {CAMP_DETAILS.registerUrl ? (
                <a
                  href={CAMP_DETAILS.registerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.5)]"
                >
                  Registration
                </a>
              ) : null}
            </div>
          </header>

          <section
            aria-labelledby="camps-facts-heading"
            className="mt-12 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
          >
            <h2
              id="camps-facts-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              Practical details
            </h2>
            {facts.length > 0 ? (
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      {fact.label}
                    </dt>
                    <dd className="mt-1 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Ages, session length, dates, and cost vary by camp and by the organisation hosting
                it, so this page does not publish numbers that would be wrong for the camp you are
                actually looking at. Email{" "}
                <a
                  href={`mailto:${siteConfig.email}?subject=${encodeURIComponent("Coding camps")}`}
                  className="break-all text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
                >
                  {siteConfig.email}
                </a>{" "}
                with the camp or the age of your student and you will get a straight answer.
              </p>
            )}
          </section>

          <section aria-labelledby="camps-covers-heading" className="mt-16">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Camps · Curriculum
            </div>
            <h2
              id="camps-covers-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              What the camps cover
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {COVERS.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm"
                >
                  <h3 className="font-display text-base font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                    {item.title}
                  </h3>
                  <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="camps-session-heading" className="mt-16">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Camps · A session
            </div>
            <h2
              id="camps-session-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              What a session looks like
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Short explanation, long practice. A student who spends a session listening has not
              learned to program; a student who spends it typing, breaking things, and fixing them
              has.
            </p>
            <ol className="mt-6 space-y-3">
              {[
                "A few minutes on the one new idea for the session, with an example on screen that everyone can see and copy.",
                "Students write it themselves. This is most of the time, and it is deliberately the loud part.",
                "Something goes wrong, which is the point. Reading the error and finding the typo is a taught skill, not a delay.",
                "A small extension: change one thing and predict what happens before running it.",
                "Everyone leaves with the file they wrote, so the work does not vanish when the laptop is handed back.",
              ].map((step, index) => (
                <li
                  key={step}
                  className="flex gap-4 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm"
                >
                  <span className="font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="camps-takeaway-heading" className="mt-16">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Camps · Outcome
            </div>
            <h2
              id="camps-takeaway-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              What a student takes away
            </h2>
            <dl className="mt-6 divide-y divide-[hsl(var(--brand-iron)/0.6)] border-y border-[hsl(var(--brand-iron)/0.6)]">
              {TAKEAWAYS.map((item) => (
                <div key={item.title} className="py-5">
                  <dt className="font-mono-tight text-sm font-medium text-[hsl(var(--brand-bone))]">
                    {item.title}
                  </dt>
                  <dd className="mt-2 max-w-[68ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {item.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section
            aria-labelledby="camps-who-heading"
            className="mt-16 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] p-6"
          >
            <h2
              id="camps-who-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
            >
              Who is teaching
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Max Doubin, a cybersecurity student at South Career Technical Academy in Las Vegas and
              president of its{" "}
              <Link
                href="/cyber-club"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                Cyber Club
              </Link>
              . He ranks in the top 1 percent of National Cyber League competitors and writes a
              technical journal at{" "}
              <Link
                href="/blog"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                Field Notes
              </Link>
              . Being close in age to the students is an advantage here: the gap between not knowing
              this and knowing it is still recent.
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}

export default CinematicCamps;
