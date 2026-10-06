import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { COVERS, TAKEAWAYS } from "@/lib/campsConfig";

const CANONICAL = "https://maxdoubin.com/coding-camps";

/**
 * A past volunteer role: Max taught at Code Central's youth coding camps in
 * 2022. This page used to read as camps he runs now, with a registration slot,
 * a box of practical details for parents, and Course structured data. It
 * describes what he taught instead and offers no sessions, so a parent is
 * never left waiting on a camp that is not on offer here.
 */
export function CinematicCamps() {
  useSEO({
    title: "Youth Coding Camps | Max Doubin",
    description:
      "What Max Doubin taught as a volunteer at Code Central's youth coding camps in 2022: what the camps covered, how a session ran, and what beginners took home.",
    canonical: CANONICAL,
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[0.625rem] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Teaching · Volunteer
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Youth coding camps.
            </h1>
            <p className="mt-6 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              In 2022 I volunteered as an instructor at Code Central&apos;s youth coding camps. The
              camps were for students who had never written a line of code, and the goal was not to
              produce a programmer in a week. It was to make a computer feel knowable.
            </p>
          </header>

          <section
            aria-labelledby="camps-role-heading"
            className="mt-12 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
          >
            <h2
              id="camps-role-heading"
              className="font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              The role
            </h2>
            <p className="mt-3 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Volunteer instructor at Code Central coding camps in 2022, teaching coding to
              beginners. This page describes that teaching. It is not a camp you can sign up for.
            </p>
          </section>

          <section aria-labelledby="camps-covers-heading" className="mt-16">
            <div className="font-techno text-[0.625rem] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Camps · Curriculum
            </div>
            <h2
              id="camps-covers-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              What the camps covered
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
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
            <div className="font-techno text-[0.625rem] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Camps · A session
            </div>
            <h2
              id="camps-session-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              What a session looked like
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
                  <span className="font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))]">
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
            <div className="font-techno text-[0.625rem] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Camps · Outcome
            </div>
            <h2
              id="camps-takeaway-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              What a student took away
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
              className="font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
            >
              Who taught
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Max Doubin, now a cybersecurity student at South Career and Technical Academy in Las
              Vegas, where he is president of the Cyber Club and a teaching assistant for
              Cybersecurity I. He placed in the top 1 percent of competitors in the National Cyber
              League Fall 2025 Individual Game and writes a technical journal at{" "}
              <Link
                href="/blog"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                Field Notes
              </Link>
              . Being close in age to the students was an advantage: the gap between not knowing
              this and knowing it was still recent.
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}

export default CinematicCamps;
