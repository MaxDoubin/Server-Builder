import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { siteConfig, PRESS } from "@/lib/siteConfig";
import { FAQS } from "@/lib/faqs";

const CANONICAL = "https://maxdoubin.com/faq";


// Built once at module scope: the object identity has to be stable because
// useSEO lists `schema` in its effect dependencies, and the answers must be
// the exact strings rendered below.
const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${CANONICAL}#faq`,
  url: CANONICAL,
  inLanguage: "en-US",
  about: { "@type": "Person", name: siteConfig.name, url: "https://maxdoubin.com/" },
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

export function CinematicFaq() {
  useSEO({
    title: "Frequently Asked Questions | Max Doubin",
    description:
      "Answers about Max Doubin: what he studies, his National Cyber League placement, the South CTA Cyber Club, what he builds and teaches, and how to reach him.",
    canonical: CANONICAL,
    schema: FAQ_SCHEMA,
    schemaId: "faq-schema",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[860px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Reference · FAQ
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Questions and answers.
            </h1>
            <p className="mt-6 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Straight answers to what people actually ask about Max Doubin: the school, the
              competition results, the club, the projects, and how to get in touch. Every answer
              here is self-contained, and nothing on this page is claimed that is not held.
            </p>
          </header>

          <div className="mt-14 space-y-4">
            {FAQS.map((item, index) => (
              <section
                key={item.q}
                aria-labelledby={`faq-${index}`}
                className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 backdrop-blur-sm"
              >
                <h2
                  id={`faq-${index}`}
                  className="max-w-[52ch] font-display text-lg font-medium leading-snug tracking-tight text-[hsl(var(--brand-bone))] md:text-xl"
                >
                  {item.q}
                </h2>
                <p className="mt-3 max-w-[72ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {item.a}
                </p>
              </section>
            ))}
          </div>

          <section
            aria-labelledby="faq-next-heading"
            className="mt-16 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] p-6"
          >
            <h2
              id="faq-next-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
            >
              Not answered here
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The{" "}
              <Link
                href="/resume"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                resume
              </Link>{" "}
              has the full record,{" "}
              <Link
                href="/timeline"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                the timeline
              </Link>{" "}
              puts it in order, and{" "}
              <Link
                href="/now"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                the now page
              </Link>{" "}
              says what this month looks like. Anything still missing goes to{" "}
              <a
                href={`mailto:${siteConfig.email}`}
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

export default CinematicFaq;
