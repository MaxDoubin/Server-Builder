import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { nowConfig, type NowItem } from "@/lib/nowConfig";

export function CinematicNow() {
  useSEO({
    title: `Now · ${nowConfig.period} | Max Doubin`,
    description:
      "What Max Doubin is focused on this month: certification study, what he is building, what he is reading, and what the South CTA Cyber Club is working on.",
    canonical: "https://maxdoubin.com/now",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Now · {nowConfig.period}
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              What I am doing now.
            </h1>
            <p className="mt-6 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {nowConfig.intro}
            </p>

            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                />
                Last updated
              </span>
              <time dateTime={nowConfig.lastUpdated} className="text-[hsl(var(--brand-bone))]">
                {nowConfig.lastUpdatedDisplay}
              </time>
            </p>
          </header>

          <div className="mt-12 space-y-14">
            {nowConfig.sections.map((section) => (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
                <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
                  {section.label}
                </div>
                <h2
                  id={`${section.id}-heading`}
                  className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
                >
                  {section.heading}
                </h2>
                {section.summary ? (
                  <p className="mt-3 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {section.summary}
                  </p>
                ) : null}

                <ul className="mt-6 space-y-3">
                  {section.items.map((item) => (
                    <li key={item.title}>
                      <NowCard item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section
            aria-labelledby="now-about-heading"
            className="mt-16 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
          >
            <h2
              id="now-about-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              About this page
            </h2>
            <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              This is a <strong className="font-medium text-[hsl(var(--brand-bone))]">now page</strong>,
              a convention started by Derek Sivers: one page that says what a person is focused on at
              this point in their life, updated when that changes rather than kept permanently
              current. There is a directory of them at{" "}
              <a
                href="https://nownownow.com/about"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[24px] items-center break-words py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                nownownow.com/about
              </a>
              .
            </p>
            <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              For the longer version, the{" "}
              <Link
                href="/blog"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                Field Notes archive
              </Link>{" "}
              is updated far more often than this page is.
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}

function NowCard({ item }: { item: NowItem }) {
  const body = (
    <>
      <div className="font-display text-base font-medium tracking-tight text-[hsl(var(--brand-bone))]">
        {item.title}
      </div>
      <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
        {item.detail}
      </p>
    </>
  );

  const shell =
    "block rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm";

  if (!item.href) {
    return <div className={shell}>{body}</div>;
  }

  const interactive =
    `${shell} transition-colors hover:border-[hsl(var(--brand-signal)/0.45)] ` +
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={interactive}>
        {body}
      </a>
    );
  }

  return (
    <Link href={item.href} className={interactive}>
      {body}
    </Link>
  );
}

export default CinematicNow;
