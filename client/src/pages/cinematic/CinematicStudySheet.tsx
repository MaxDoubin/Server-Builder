/**
 * One exam, one page, made to be printed.
 *
 * The study pages are good on a screen and useless away from one. An exam
 * has five or six domains, each on its own URL, so revising from them means
 * keeping five tabs open, and a teacher handing them to a class has nothing
 * to hand over.
 *
 * This is the same material gathered onto a single page: every domain with
 * its published weighting and what it asks of you, the tools that practise
 * it, and the articles that cover it. The post and tool matching is the
 * shared postsForDomain, so the sheet and the domain pages cannot list
 * different things.
 *
 * PRINT. Links carry their URL after them here, which the site's print
 * stylesheet otherwise only does inside article prose, because a reading
 * list on paper with no addresses on it is a reading list you cannot use.
 * The screen hides those, and there is a checkbox column down the left that
 * only exists on paper, because the first thing anyone does with a printed
 * objectives list is tick things off it.
 */

import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { getAllPosts, readMinutes } from "@/lib/blogPosts";
import { getExam, postsForDomain } from "@/lib/examObjectives";
import { getTool } from "@/lib/toolsRegistry";
import { pluralise } from "@/lib/plural";

const SITE_URL = "https://maxdoubin.com";

export function CinematicStudySheet() {
  const [, params] = useRoute("/study/:exam/sheet");
  const exam = getExam(params?.exam ?? "");

  const domains = useMemo(() => {
    if (!exam) return [];
    const all = getAllPosts();
    return exam.domains.map((domain) => ({
      domain,
      posts: postsForDomain(domain, all),
      tools: (domain.tools ?? []).map(getTool).filter((t) => t !== undefined),
    }));
  }, [exam]);

  const postCount = useMemo(
    () => new Set(domains.flatMap((d) => d.posts.map((p) => p.slug))).size,
    [domains],
  );

  useSEO({
    title: exam
      ? `${exam.name} ${exam.code} revision sheet | Max Doubin`
      : "Revision sheet not found | Max Doubin",
    description: exam
      ? `Every ${exam.name} ${exam.code} domain on one printable page, with its published weighting and the ${postCount} articles and free tools on this site that cover it.`
      : "That exam does not exist on this site.",
    canonical: exam
      ? `${SITE_URL}/study/${exam.slug}/sheet`
      : `${SITE_URL}/study`,
    noindex: !exam,
  });

  if (!exam) {
    return (
      <CinematicLayout>
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="text-center">
            <h1 className="font-display text-3xl text-[hsl(var(--brand-bone))]">
              No sheet for that exam.
            </h1>
            <Link
              href="/study"
              data-testid="link-sheet-not-found-study"
              className="mt-6 inline-block font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))]"
            >
              ← All exams
            </Link>
          </div>
        </div>
      </CinematicLayout>
    );
  }

  const totalPosts = postCount;
  const totalTools = new Set(
    domains.flatMap((d) => d.tools.map((t) => t.slug)),
  ).size;

  return (
    <CinematicLayout>
      <div className="relative min-h-screen px-6 pb-32 pt-[22vh] md:px-10">
        <div className="mx-auto max-w-[900px]">
          <nav data-print-hide>
            <Link
              href={`/study/${exam.slug}`}
              data-testid="link-sheet-back"
              className="inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← {exam.name}
            </Link>
          </nav>

          <header className="mt-6">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Revision sheet · {exam.code}
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.2rem,5.4vw,3.6rem)] font-medium leading-[0.98] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              {exam.name}
            </h1>
            <p className="mt-4 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
              {exam.domains.length} {pluralise(exam.domains.length, "domain")} ·{" "}
              {totalPosts} {pluralise(totalPosts, "article")} · {totalTools}{" "}
              {pluralise(totalTools, "tool")}
            </p>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Every domain on one page, made to print. Weightings are the
              vendor's published figures. Objectives change between exam
              versions, so check them against{" "}
              <a
                href={exam.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                {exam.vendor}'s own page
                <span className="sheet-url"> ({exam.officialUrl})</span>
              </a>{" "}
              before you rely on them.
            </p>

            <button
              type="button"
              data-print-hide
              data-testid="button-print-sheet"
              onClick={() => window.print()}
              className="mt-8 inline-flex min-h-[44px] items-center gap-3 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-5 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              <span
                aria-hidden
                className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
              />
              Print this sheet
            </button>
          </header>

          <div className="study-sheet mt-14 space-y-12">
            {domains.map(({ domain, posts, tools }) => (
              <section
                key={domain.slug}
                data-testid={`sheet-domain-${domain.slug}`}
                className="break-inside-avoid border-t border-[hsl(var(--brand-iron))] pt-6"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h2 className="font-display text-xl text-[hsl(var(--brand-bone))]">
                    {domain.name}
                  </h2>
                  <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    {domain.weight === null
                      ? "no published weighting"
                      : `${domain.weight}% of the exam`}
                  </span>
                </div>

                <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {domain.summary}
                </p>

                {tools.length > 0 && (
                  <>
                    <h3 className="mt-6 font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                      Practise
                    </h3>
                    <ul className="mt-2 space-y-1">
                      {tools.map((t) => (
                        <li key={t.slug} className="sheet-item">
                          <Link
                            href={`/tools/${t.slug}`}
                            className="font-mono-tight text-sm text-[hsl(var(--brand-bone))] underline-offset-4 hover:underline"
                          >
                            {t.name}
                            <span className="sheet-url">
                              {" "}
                              ({SITE_URL}/tools/{t.slug})
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <h3 className="mt-6 font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                  Read
                </h3>
                {posts.length === 0 ? (
                  <p className="mt-2 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                    Nothing in the archive covers this one yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {posts.map((p) => (
                      <li key={p.slug} className="sheet-item">
                        <Link
                          href={`/blog/${p.slug}`}
                          className="font-mono-tight text-sm text-[hsl(var(--brand-bone))] underline-offset-4 hover:underline"
                        >
                          {p.title}
                          <span className="sheet-url">
                            {" "}
                            ({SITE_URL}/blog/{p.slug})
                          </span>
                        </Link>
                        <span className="ml-2 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                          {readMinutes(p)} min
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </CinematicLayout>
  );
}
