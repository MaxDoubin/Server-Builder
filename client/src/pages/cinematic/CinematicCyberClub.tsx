import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { clubConfig } from "@/lib/clubConfig";
import { siteConfig } from "@/lib/siteConfig";

const CANONICAL = "https://maxdoubin.com/cyber-club";

const DESCRIPTION =
  "The Cyber Club at South Career Technical Academy in Las Vegas. Members practice capture the flag challenges, work in a lab built to be broken, and compete in the National Cyber League. No background required.";

// Module scope so the object identity is stable: useSEO lists `schema` in its
// effect dependencies, and an inline literal would be a new object every render.
const CLUB_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: clubConfig.name,
  alternateName: clubConfig.fullName,
  url: CANONICAL,
  description: DESCRIPTION,
  email: siteConfig.email,
  parentOrganization: {
    "@type": "EducationalOrganization",
    name: clubConfig.school,
    address: {
      "@type": "PostalAddress",
      addressLocality: clubConfig.city,
      addressRegion: clubConfig.region,
      addressCountry: "US",
    },
  },
  areaServed: { "@type": "City", name: `${clubConfig.city}, Nevada` },
  member: {
    "@type": "OrganizationRole",
    roleName: "President",
    member: {
      "@type": "Person",
      name: clubConfig.president,
      url: "https://maxdoubin.com/",
    },
  },
  knowsAbout: [
    "Cybersecurity",
    "Capture the flag competition",
    "Open source intelligence",
    "Cryptography",
    "Log analysis",
    "Network forensics",
    "Web application security",
  ],
};

export function CinematicCyberClub() {
  useSEO({
    title: "South CTA Cyber Club | Max Doubin",
    description:
      "Join the Cyber Club at South Career Technical Academy in Las Vegas: capture the flag practice, a lab built to be broken, and no experience required.",
    canonical: CANONICAL,
    schema: CLUB_SCHEMA,
    schemaId: "cyber-club-schema",
  });

  const { day, time, room, cadence } = clubConfig.meeting;
  const hasMeetingDetail = Boolean(day || time || room || cadence);
  const meetingLine = [cadence, day, time, room].filter(Boolean).join(" · ");

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Club · {clubConfig.school}
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Cyber Club.
            </h1>
            <p className="mt-6 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {clubConfig.intro}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={`mailto:${siteConfig.email}?subject=${encodeURIComponent("Cyber Club")}`}
                data-testid="link-club-email"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Ask about joining
              </a>
              {clubConfig.signupUrl ? (
                <a
                  href={clubConfig.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.5)]"
                >
                  Sign up
                </a>
              ) : null}
            </div>
          </header>

          <section
            aria-labelledby="club-kit-heading"
            className="mt-12 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] p-6"
          >
            <h2
              id="club-kit-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
            >
              Starting one at your own school
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Everything this club runs on is published as{" "}
              <Link
                href="/cyber-club/kit"
                data-testid="link-club-kit"
                className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                Cyber Club in a Box
              </Link>
              : twelve meeting plans, written rules of engagement, a materials
              list that assumes no budget, and the reasons clubs fall apart in
              month two. Free, downloadable, and yours to change without
              asking.
            </p>
          </section>

          <section
            aria-labelledby="club-meeting-heading"
            className="mt-12 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
          >
            <h2
              id="club-meeting-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              When and where
            </h2>
            {hasMeetingDetail ? (
              <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]">
                {meetingLine}
              </p>
            ) : (
              <p className="mt-3 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                The meeting schedule is not posted here, because a wrong room number sends someone
                to an empty classroom. Email{" "}
                <a
                  href={`mailto:${siteConfig.email}?subject=${encodeURIComponent("Cyber Club meeting times")}`}
                  className="break-all text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
                >
                  {siteConfig.email}
                </a>{" "}
                and I will tell you exactly when and where we meet next.
              </p>
            )}

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                  President
                </dt>
                <dd className="mt-1 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {clubConfig.president}
                </dd>
              </div>
              {clubConfig.advisor ? (
                <div>
                  <dt className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    Faculty advisor
                  </dt>
                  <dd className="mt-1 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    {clubConfig.advisor}
                  </dd>
                </div>
              ) : null}
              {clubConfig.memberCount !== null ? (
                <div>
                  <dt className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    Members
                  </dt>
                  <dd className="mt-1 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    {clubConfig.memberCount}
                  </dd>
                </div>
              ) : null}
              {clubConfig.costNote ? (
                <div>
                  <dt className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    Cost
                  </dt>
                  <dd className="mt-1 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    {clubConfig.costNote}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section aria-labelledby="club-do-heading" className="mt-16">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Club · Practice
            </div>
            <h2
              id="club-do-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              What members actually do
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {clubConfig.whatWeDo.map((item) => (
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

          <section aria-labelledby="club-learn-heading" className="mt-16">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Club · Skills
            </div>
            <h2
              id="club-learn-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              What you learn
            </h2>
            <p className="mt-3 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              These are the categories National Cyber League scores, which is not a coincidence.
              They are also the categories that describe most real security work.
            </p>
            <dl className="mt-6 divide-y divide-[hsl(var(--brand-iron)/0.6)] border-y border-[hsl(var(--brand-iron)/0.6)]">
              {clubConfig.whatYouLearn.map((item) => (
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

          <section aria-labelledby="club-join-heading" className="mt-16">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Club · Join
            </div>
            <h2
              id="club-join-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              How to join
            </h2>
            <ol className="mt-6 space-y-3">
              {clubConfig.howToJoin.map((step, index) => (
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

          <section aria-labelledby="club-faq-heading" className="mt-16">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Club · For parents
            </div>
            <h2
              id="club-faq-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              Questions parents ask
            </h2>
            <div className="mt-6 space-y-4">
              {clubConfig.parentFaq.map((item) => (
                <div
                  key={item.q}
                  className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm"
                >
                  <h3 className="font-display text-base font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                    {item.q}
                  </h3>
                  <p className="mt-2 max-w-[70ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="club-contact-heading"
            className="mt-16 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] p-6"
          >
            <h2
              id="club-contact-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
            >
              Still deciding
            </h2>
            <p className="mt-3 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Come to one meeting before deciding anything. If you want to know what the work looks
              like first, the{" "}
              <Link
                href="/tools"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                browser tools
              </Link>{" "}
              and the{" "}
              <Link
                href="/blog"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                Field Notes archive
              </Link>{" "}
              cover much of the same ground. Questions from students or parents both go to{" "}
              <a
                href={`mailto:${siteConfig.email}?subject=${encodeURIComponent("Cyber Club")}`}
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

export default CinematicCyberClub;
