import { useEffect } from "react";
import { useRoute, Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { CopyButton } from "@/components/ui/copy-button";
import { Quiz } from "@/components/study/Quiz";
import { getGuide, NCL_GUIDES, type WalkthroughStep } from "@/lib/nclGuides";

const SITE_URL = "https://maxdoubin.com";

export function CinematicNclGuide() {
  const [, params] = useRoute("/ncl/:slug");
  const slug = params?.slug ?? "";
  const guide = getGuide(slug);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  const canonical = guide
    ? `${SITE_URL}/ncl/${guide.slug}`
    : `${SITE_URL}/ncl`;

  useSEO({
    title: guide
      ? `${guide.category} | NCL Guide | Max Doubin`
      : "NCL Guide | Max Doubin",
    description: guide
      ? guide.seoDescription
      : "A study guide for a National Cyber League category.",
    canonical,
    schema: guide
      ? {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: `${guide.category}: National Cyber League Study Guide`,
          description: guide.seoDescription,
          url: canonical,
          mainEntityOfPage: canonical,
          about: guide.category,
          author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
          publisher: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
          isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
        }
      : null,
    schemaId: "ncl-guide-schema",
  });

  if (!guide) {
    return (
      <CinematicLayout>
        <div className="relative px-6 pb-32 pt-32 md:px-10">
          <div className="mx-auto max-w-[1100px]">
            <h1 className="font-display text-[clamp(2.25rem,5vw,3.75rem)] font-medium leading-[0.98] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Guide not found.
            </h1>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              That category does not exist. Browse all seven from the index.
            </p>
            <Link
              href="/ncl"
              className="mt-8 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal))] hover:text-[hsl(var(--brand-signal))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              All NCL guides
            </Link>
          </div>
        </div>
      </CinematicLayout>
    );
  }

  const nextGuide =
    NCL_GUIDES[(NCL_GUIDES.findIndex((g) => g.slug === guide.slug) + 1) % NCL_GUIDES.length];

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <nav aria-label="Breadcrumb">
            <Link
              href="/ncl"
              data-testid="link-ncl-index"
              className="inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← All NCL guides
            </Link>
          </nav>

          <header className="mt-6">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · NCL Category · Guide {guide.order} of {NCL_GUIDES.length}
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.25rem,5vw,3.75rem)] font-medium leading-[0.98] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              {guide.category}
            </h1>
            <p className="mt-4 max-w-2xl font-mono-tight text-base leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {guide.tagline}
            </p>
          </header>

          <Section title="What this category tests" eyebrow="01">
            {guide.whatItTests.map((p, i) => (
              <p key={i} className="body-copy">
                {p}
              </p>
            ))}
          </Section>

          <Section title="The mental model" eyebrow="02">
            {guide.mentalModel.map((p, i) => (
              <p key={i} className="body-copy">
                {p}
              </p>
            ))}
          </Section>

          <Section title="Tools you actually use" eyebrow="03">
            <div className="grid gap-3 sm:grid-cols-2">
              {guide.tools.map((tool) => (
                <div
                  key={tool.name}
                  className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-4 backdrop-blur-sm"
                >
                  <div className="font-mono-tight text-sm font-medium text-[hsl(var(--brand-signal))]">
                    {tool.name}
                  </div>
                  <p className="mt-1.5 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {tool.use}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Worked example" eyebrow="04">
            <div className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.4)] p-5 backdrop-blur-sm md:p-6">
              <div className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                · Scenario
              </div>
              <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]">
                {guide.walkthrough.scenario}
              </p>
              <p className="mt-3 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Invented for teaching. No real NCL question is reproduced.
              </p>

              <ol className="mt-6 space-y-6">
                {guide.walkthrough.steps.map((step, i) => (
                  <WalkStep key={i} index={i + 1} step={step} />
                ))}
              </ol>

              <div className="mt-6 rounded-xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] p-4">
                <div className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
                  · Answer
                </div>
                <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]">
                  {guide.walkthrough.answer}
                </p>
              </div>
            </div>
          </Section>

          <Section title="Common mistakes" eyebrow="05">
            <ul className="space-y-3">
              {guide.mistakes.map((m, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                >
                  <span
                    aria-hidden
                    className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--brand-amber))]"
                  />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Practice resources" eyebrow="06">
            <ul className="space-y-3">
              {guide.resources.map((r) => (
                <li key={r.url}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start justify-between gap-3 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] px-4 py-3 backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/0.5)]"
                  >
                    <span>
                      <span className="font-mono-tight text-sm font-medium text-[hsl(var(--brand-bone))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                        {r.label}
                      </span>
                      <span className="mt-1 block font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
                        {r.detail}
                      </span>
                    </span>
                    <span aria-hidden className="mt-0.5 shrink-0 text-[hsl(var(--brand-ash))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Check yourself" eyebrow="07">
            <Quiz questions={guide.quiz} title={guide.category} testId="ncl-guide-quiz" />
          </Section>

          <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-[hsl(var(--brand-iron))] pt-8">
            <Link
              href="/ncl"
              className="inline-flex min-h-[44px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← All guides
            </Link>
            <Link
              href={`/ncl/${nextGuide.slug}`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              Next: {nextGuide.category} →
            </Link>
          </div>
        </div>
      </div>
    </CinematicLayout>
  );
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <div className="flex items-baseline gap-3">
        <span className="font-mono-tight text-[11px] tracking-[0.2em] text-[hsl(var(--brand-signal))]">
          {eyebrow}
        </span>
        <h2 className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-[1.75rem]">
          {title}
        </h2>
      </div>
      <div className="mt-5 space-y-4 [&_.body-copy]:font-mono-tight [&_.body-copy]:text-sm [&_.body-copy]:leading-relaxed [&_.body-copy]:text-[hsl(var(--brand-bone-dim))]">
        {children}
      </div>
    </section>
  );
}

function WalkStep({ index, step }: { index: number; step: WalkthroughStep }) {
  return (
    <li className="relative pl-10">
      <span
        aria-hidden
        className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--brand-signal)/0.5)] font-mono-tight text-[11px] text-[hsl(var(--brand-signal))]"
      >
        {index}
      </span>
      <div className="font-mono-tight text-sm font-medium text-[hsl(var(--brand-bone))]">
        {step.label}
      </div>
      <p className="mt-1.5 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
        {step.detail}
      </p>
      {step.code ? (
        <div className="mt-3">
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 pr-14 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]">
              {step.code}
            </pre>
            <div className="absolute right-2 top-2">
              <CopyButton value={step.code} label="Copy command" />
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
