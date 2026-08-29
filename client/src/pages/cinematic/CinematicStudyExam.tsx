/**
 * One certification at /study/:exam.
 *
 * This level of the hierarchy did not exist. /study/ccna/ip-connectivity
 * resolved and /study/ccna returned a 404, so trimming a URL, which is
 * ordinary navigation and something crawlers do too, walked into a dead end
 * on a path the site itself publishes.
 *
 * It also answers a broader query than any single domain page can. Somebody
 * searching for the CCNA objectives wants the whole list, not section 3.
 */

import { Link, useRoute } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { getExam } from "@/lib/examObjectives";

const SITE_URL = "https://maxdoubin.com";

export function CinematicStudyExam() {
  const [, params] = useRoute("/study/:exam");
  const exam = getExam(params?.exam ?? "");

  useSEO({
    title: exam
      ? `${exam.name} ${exam.code} objectives | Max Doubin`
      : "Exam not found | Max Doubin",
    description: exam
      ? `Every ${exam.name} ${exam.code} exam domain, its published weighting, and what each one actually asks of you, with the posts and free tools that cover it.`
      : "That certification does not exist on this site.",
    canonical: exam ? `${SITE_URL}/study/${exam.slug}` : `${SITE_URL}/study`,
    noindex: !exam,
    schema: exam
      ? {
          "@context": "https://schema.org",
          "@type": "LearningResource",
          name: `${exam.name} ${exam.code} exam objectives`,
          description: exam.intro,
          url: `${SITE_URL}/study/${exam.slug}`,
          educationalLevel: "Beginner to intermediate",
          learningResourceType: "Study guide",
          hasPart: exam.domains.map((d) => ({
            "@type": "LearningResource",
            name: d.name,
            description: d.summary,
            url: `${SITE_URL}/study/${exam.slug}/${d.slug}`,
          })),
        }
      : undefined,
  });

  if (!exam) {
    return (
      <CinematicLayout>
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="text-center">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]">
              · Study · Not found
            </div>
            <h1 className="mt-4 font-display text-4xl font-medium text-[hsl(var(--brand-bone))]">
              No such certification.
            </h1>
            <Link
              href="/study"
              className="mt-8 inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← All exams
            </Link>
          </div>
        </div>
      </CinematicLayout>
    );
  }

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <nav aria-label="Breadcrumb">
            <Link
              href="/study"
              data-testid="link-study-index"
              className="inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← All exams
            </Link>
          </nav>

          <header className="mt-6">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {exam.vendor} · {exam.code}
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.2rem,5.4vw,3.6rem)] font-medium leading-[0.98] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              {exam.name}
            </h1>
            <p className="mt-4 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
              {exam.status}
            </p>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {exam.intro}
            </p>
          </header>

          <section className="mt-14">
            <h2 className="font-display text-xl text-[hsl(var(--brand-bone))]">
              Exam domains
            </h2>
            <ul className="mt-5 space-y-3">
              {exam.domains.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/study/${exam.slug}/${d.slug}`}
                    data-testid={`link-exam-domain-${d.slug}`}
                    className="group block rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))] px-5 py-4 transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display text-base text-[hsl(var(--brand-bone))] group-hover:text-[hsl(var(--brand-signal))]">
                        {d.name}
                      </span>
                      <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                        {d.weight === null ? "no published weighting" : `${d.weight}% of the exam`}
                      </span>
                    </div>
                    <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {d.summary}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-14">
            <h2 className="font-display text-xl text-[hsl(var(--brand-bone))]">
              The official objectives
            </h2>
            <p className="mt-3 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Weightings and domain names here follow the published objectives for{" "}
              {exam.code}. The vendor revises them, so treat their document as the
              source of truth rather than this page.
            </p>
            <a
              href={exam.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              Official {exam.code} objectives →
            </a>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}
