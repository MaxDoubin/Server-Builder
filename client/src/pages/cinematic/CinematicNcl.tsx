import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { DAY_CHECKLIST as dayChecklist, MISTAKES as mistakes } from "@/lib/nclHubConfig";
import { NCL_GUIDES } from "@/lib/nclGuides";

const SITE_URL = "https://maxdoubin.com";

const courseSchema = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: "National Cyber League Preparation",
  description:
    "A preparation guide for the National Cyber League, covering all nine challenge categories with mental models, tooling, worked examples, and self-check quizzes.",
  url: `${SITE_URL}/ncl`,
  inLanguage: "en",
  about: NCL_GUIDES.map((g) => g.category),
  provider: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
};


export function CinematicNcl() {
  useSEO({
    title: "National Cyber League Study Guide | Max Doubin",
    description:
      "What the National Cyber League is, how scoring works, how to prepare, and guides to all nine challenge categories, from a top 1 percent competitor.",
    canonical: `${SITE_URL}/ncl`,
    schema: courseSchema,
    schemaId: "ncl-course-schema",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1100px]">
          <header className="max-w-3xl">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Study · Competitive Cyber
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              National Cyber League.
            </h1>
            <p className="mt-6 font-mono-tight text-base leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The National Cyber League is a real cybersecurity competition for
              high school and college students in the United States. It runs in
              seasons and is built around hands-on challenges scored on a public
              scoreboard. These are my study notes for it: how it works, how to
              prepare, and a full guide to every category.
            </p>
            <p className="mt-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
              Season dates, fees, and the exact scoring details change over time.
              Always confirm the current specifics at{" "}
              <a
                href="https://nationalcyberleague.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                nationalcyberleague.org
              </a>
              .
            </p>
          </header>

          <section className="mt-16">
            <h2 className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl">
              How the competition is structured
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <InfoCard title="Gymnasium">
                An open practice environment with challenges and content you can
                work through at your own pace before the games. It is the place to
                learn the categories and fail safely.
              </InfoCard>
              <InfoCard title="Individual Game">
                A timed event where you solve challenges on your own across all
                the categories, and your results place you on the individual
                scoreboard.
              </InfoCard>
              <InfoCard title="Team Game">
                A timed event where you work as a team, combining strengths across
                categories, ranked on a separate team scoreboard.
              </InfoCard>
            </div>
          </section>

          <section className="mt-14 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 backdrop-blur-sm md:p-8">
            <h2 className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl">
              How scoring works, in general terms
            </h2>
            <div className="mt-5 space-y-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <p>
                Each challenge is worth points, and harder challenges are worth
                more. You earn points by submitting correct answers, usually as a
                flag in a specific format. Your standing on the scoreboard
                reflects how much you completed and how accurately, and results
                are commonly reported as a percentile so you can see where you
                rank against everyone else.
              </p>
              <p>
                I am describing this in durable, general terms on purpose. The
                precise point values, any accuracy or speed weighting, and how
                percentiles are calculated are set by the organisers and can
                change from season to season, so treat the official rules as the
                source of truth rather than anything here.
              </p>
            </div>
          </section>

          <section className="mt-16">
            <h2 className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl">
              The nine categories
            </h2>
            <p className="mt-3 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Each guide covers what the category tests, the mental model, the
              tools, a worked example, common mistakes, practice resources, and a
              short quiz.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {NCL_GUIDES.map((guide) => (
                <li key={guide.slug}>
                  <Link
                    href={`/ncl/${guide.slug}`}
                    data-testid={`link-guide-${guide.slug}`}
                    className="group flex h-full items-start justify-between gap-3 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/0.5)]"
                  >
                    <span>
                      <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                        {String(guide.order).padStart(2, "0")}
                      </span>
                      <span className="mt-2 block font-display text-lg font-medium tracking-tight text-[hsl(var(--brand-bone))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                        {guide.category}
                      </span>
                      <span className="mt-2 block font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
                        {guide.tagline}
                      </span>
                    </span>
                    <span aria-hidden className="mt-1 shrink-0 text-[hsl(var(--brand-ash))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-16">
            <h2 className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl">
              How to prepare
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <InfoCard title="Drill the fundamentals">
                Ports, protocols, the OSI model, Linux commands, and crypto basics
                come up everywhere. The{" "}
                <Link href="/flashcards" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
                  flashcard trainer
                </Link>{" "}
                on this site drills exactly these with spaced repetition.
              </InfoCard>
              <InfoCard title="Practice in the Gymnasium">
                Work challenges before the games, not during. The goal of practice
                is to make your mistakes where they do not cost you points.
              </InfoCard>
              <InfoCard title="Learn your tools cold">
                CyberChef, Wireshark, hashcat, binwalk, and exiftool should be
                muscle memory. The{" "}
                <Link href="/tools" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
                  tools
                </Link>{" "}
                here cover the reference material you reach for most.
              </InfoCard>
            </div>
          </section>

          <section className="mt-14 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 backdrop-blur-sm md:p-8">
            <div className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
              · My experience
            </div>
            <h2 className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl">
              Where I have landed
            </h2>
            <div className="mt-5 space-y-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <p>
                I have competed in the National Cyber League and finished in the
                top 1 percent of competitors individually. As president of the
                South CTA Cyber Club, I also helped the school place 7th nationally
                among high schools in the Fall 2025 Cyber Power Rankings. That
                ranking blends a school's top team, its top individual and its
                participation, so it is not a team result on its own. Those two
                results are the honest summary of where I have gotten to so far.
              </p>
              <p>
                My strongest categories have been the ones I practised most
                deliberately: OSINT, log analysis, and the crypto and encoding
                puzzles. The guides on this page are the notes I wish I had when I
                started.
              </p>
            </div>
          </section>

          <section className="mt-16">
            <h2 className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl">
              Competition-day checklist
            </h2>
            <ul className="mt-6 space-y-3">
              {dayChecklist.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.4)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] backdrop-blur-sm"
                >
                  <span aria-hidden className="mt-0.5 shrink-0 font-mono-tight text-[hsl(var(--brand-signal))]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-16">
            <h2 className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl">
              Mistakes I made
            </h2>
            <p className="mt-3 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The honest version, so you can skip them.
            </p>
            <ul className="mt-6 space-y-4">
              {mistakes.map((m, i) => (
                <li
                  key={i}
                  className="border-l-2 border-[hsl(var(--brand-signal)/0.4)] pl-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                >
                  {m}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm">
      <h3 className="font-display text-lg font-medium tracking-tight text-[hsl(var(--brand-bone))]">
        {title}
      </h3>
      <p className="mt-2 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
        {children}
      </p>
    </div>
  );
}
