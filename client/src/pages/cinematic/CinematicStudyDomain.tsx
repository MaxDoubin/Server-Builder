/**
 * One exam domain at /study/:exam/:domain.
 *
 * The page exists to answer a specific high-intent query ("Network+
 * troubleshooting objectives") with material rather than an affiliate list.
 * Posts are matched from the domain's keyword set against titles and tags,
 * so the mapping stays honest as the archive grows: a domain with nothing
 * behind it says so rather than padding itself with loosely related posts.
 */

import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { getAllPosts, readMinutes } from "@/lib/blogPosts";
import { getDomain, type ExamDomain } from "@/lib/examObjectives";
import { getTool } from "@/lib/toolsRegistry";

const SITE_URL = "https://maxdoubin.com";

/** Posts whose title or tags match any of the domain's keywords. */
function matchPosts(domain: ExamDomain) {
  const needles = domain.keywords.map((k) => k.toLowerCase());
  return getAllPosts().filter((p) => {
    const title = p.title.toLowerCase();
    const tags = p.tags.map((t) => t.toLowerCase());
    return needles.some((n) => title.includes(n) || tags.includes(n));
  });
}

export function CinematicStudyDomain() {
  const [, params] = useRoute("/study/:exam/:domain");
  const found = getDomain(params?.exam ?? "", params?.domain ?? "");

  const posts = useMemo(() => (found ? matchPosts(found.domain) : []), [found]);

  useSEO({
    title: found
      ? `${found.domain.name} | ${found.exam.name} ${found.exam.code} | Max Doubin`
      : "Exam domain not found | Max Doubin",
    description: found
      ? `${found.domain.summary} Mapped to ${posts.length} posts and free tools covering ${found.exam.name} ${found.exam.code}.`
      : "That exam domain does not exist on this site.",
    canonical: found
      ? `${SITE_URL}/study/${found.exam.slug}/${found.domain.slug}`
      : `${SITE_URL}/study`,
    noindex: !found,
    schema: found
      ? {
          "@context": "https://schema.org",
          "@type": "LearningResource",
          name: `${found.exam.name} ${found.exam.code}: ${found.domain.name}`,
          description: found.domain.summary,
          url: `${SITE_URL}/study/${found.exam.slug}/${found.domain.slug}`,
          educationalLevel: "Beginner to intermediate",
          teaches: found.domain.name,
          isPartOf: {
            "@type": "Course",
            name: `${found.exam.name} ${found.exam.code}`,
            url: found.exam.officialUrl,
          },
        }
      : null,
    schemaId: "study-domain-schema",
  });

  if (!found) {
    return (
      <CinematicLayout>
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="text-center">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]">
              · Study · Not found
            </div>
            <h1 className="mt-4 font-display text-4xl font-medium text-[hsl(var(--brand-bone))]">
              No such exam domain.
            </h1>
            <Link
              href="/study"
              className="mt-8 inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← All exam domains
            </Link>
          </div>
        </div>
      </CinematicLayout>
    );
  }

  const { exam, domain } = found;
  const tools = (domain.tools ?? []).map((slug) => getTool(slug)).filter(Boolean);
  const siblings = exam.domains.filter((d) => d.slug !== domain.slug);

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
              ← {exam.name} and other exams
            </Link>
          </nav>

          <header className="mt-6">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {exam.name} · {exam.code}
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.2rem,5.4vw,3.6rem)] font-medium leading-[0.98] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              {domain.name}
            </h1>
            <p className="mt-4 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
              {domain.weight === null
                ? `${exam.vendor} publishes no weighting for this domain`
                : `${domain.weight}% of the ${exam.code} exam`}
            </p>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {domain.summary}
            </p>
          </header>

          {tools.length > 0 && (
            <section className="mt-12">
              <h2 className="font-display text-xl text-[hsl(var(--brand-bone))]">
                Practise it
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {tools.map((t) => (
                  <li key={t!.slug}>
                    <Link
                      href={`/tools/${t!.slug}`}
                      data-testid={`link-study-tool-${t!.slug}`}
                      className="block rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.4)] px-4 py-3 transition-colors hover:border-[hsl(var(--brand-signal)/0.5)]"
                    >
                      <span className="font-display text-sm text-[hsl(var(--brand-bone))]">
                        {t!.name}
                      </span>
                      <p className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {t!.blurb}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-12">
            <h2 className="font-display text-xl text-[hsl(var(--brand-bone))]">
              Read it
            </h2>
            {posts.length === 0 ? (
              <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Nothing in the archive covers this domain properly yet. Rather
                than pad the page with loosely related posts, it says so.
              </p>
            ) : (
              <>
                <p className="mt-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                  {posts.length} {posts.length === 1 ? "post" : "posts"}
                </p>
                <ul className="mt-4 space-y-px overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))]">
                  {posts.map((post) => (
                    <li key={post.slug} className="bg-[hsl(var(--brand-graphite)/0.4)]">
                      <Link
                        href={`/blog/${post.slug}`}
                        data-testid={`link-study-post-${post.slug}`}
                        className="block px-5 py-4 transition-colors hover:bg-[hsl(var(--brand-graphite)/0.8)]"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <span className="font-display text-base text-[hsl(var(--brand-bone))]">
                            {post.title}
                          </span>
                          <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                            {readMinutes(post)} min
                          </span>
                        </div>
                        <p className="mt-1.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                          {post.excerpt}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="mt-12 border-t border-[hsl(var(--brand-iron))] pt-8">
            <h2 className="font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
              Other {exam.code} domains
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {siblings.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/study/${exam.slug}/${d.slug}`}
                    className="inline-flex min-h-[24px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                  >
                    {d.name}
                  </Link>
                </li>
              ))}
            </ul>
            <a
              href={exam.officialUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-6 inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              Official {exam.code} objectives →
            </a>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}
