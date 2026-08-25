/**
 * Certification study index at /study.
 *
 * Exam-objective searches are high intent and usually answered by pages
 * with no material behind them. This archive has 236 posts and 16 tools, so
 * the version worth publishing is the one that names a domain and then
 * points at the writing that genuinely covers it.
 */

import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { EXAMS } from "@/lib/examObjectives";

const SITE_URL = "https://maxdoubin.com";

export function CinematicStudy() {
  useSEO({
    title: "Certification study by exam objective | Max Doubin",
    description:
      "Security+ SY0-701, Network+ N10-009 and CCNA 200-301 exam domains mapped to the posts and free tools on this site that cover each one.",
    canonical: `${SITE_URL}/study`,
    schema: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Certification study by exam objective",
      url: `${SITE_URL}/study`,
      description:
        "Exam domains for Security+, Network+ and CCNA mapped to technical writing and interactive tools.",
    },
    schemaId: "study-schema",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Study
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Study by exam objective
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Three certifications, broken into the domains the vendor
              publishes, each pointing at the posts and tools here that
              actually cover it. I am working through these myself, so this is
              a study plan I use rather than a syllabus I am selling.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Domain names and weightings were read from the vendor's own
              pages on 25 August 2026. Exam versions change. Every page below
              links the official objectives so you can check before you plan
              study time around anything here.
            </p>
          </header>

          <div className="mt-14 space-y-10">
            {EXAMS.map((exam) => (
              <section
                key={exam.slug}
                data-testid={`exam-${exam.slug}`}
                className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.4)] p-6"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <h2 className="font-display text-2xl text-[hsl(var(--brand-bone))]">
                    {exam.name}
                  </h2>
                  <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    {exam.code} · {exam.vendor}
                  </span>
                </div>
                <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {exam.intro}
                </p>
                <p className="mt-3 font-mono-tight text-[10px] uppercase tracking-[0.26em] text-[hsl(var(--brand-signal))]">
                  {exam.status}
                </p>

                <ul className="mt-6 space-y-px overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))]">
                  {exam.domains.map((d) => (
                    <li key={d.slug} className="bg-[hsl(var(--brand-obsidian)/0.5)]">
                      <Link
                        href={`/study/${exam.slug}/${d.slug}`}
                        data-testid={`link-domain-${exam.slug}-${d.slug}`}
                        className="block px-4 py-3 transition-colors hover:bg-[hsl(var(--brand-graphite)/0.8)]"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                          <span className="font-display text-base text-[hsl(var(--brand-bone))]">
                            {d.name}
                          </span>
                          {/*
                            Cisco does not publish per-domain weightings, so
                            the CCNA rows say so instead of showing a number
                            that would have to be invented.
                          */}
                          <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                            {d.weight === null ? "no published weighting" : `${d.weight}% of exam`}
                          </span>
                        </div>
                        <p className="mt-1.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                          {d.summary}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>

                <a
                  href={exam.officialUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-5 inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                >
                  Official objectives →
                </a>
              </section>
            ))}
          </div>
        </div>
      </div>
    </CinematicLayout>
  );
}
