import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { siteConfig } from "@/lib/siteConfig";
import { STACK, DECISIONS } from "@/lib/colophonConfig";


export function CinematicColophon() {
  useSEO({
    title: "Colophon | Max Doubin",
    description:
      "How maxdoubin.com is built: React and TypeScript, Vite with manual chunk splitting, static prerendering so crawlers read full articles, no backend.",
    canonical: "https://maxdoubin.com/colophon",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Build · Colophon
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              How this site is built.
            </h1>
            <p className="mt-6 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              This page is the technical write up of the site you are reading, including the
              decisions that were wrong the first time. A portfolio that claims infrastructure work
              should be willing to show its own build.
            </p>
          </header>

          <section aria-labelledby="colophon-stack-heading" className="mt-16">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Colophon · Stack
            </div>
            <h2
              id="colophon-stack-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              The stack
            </h2>
            <dl className="mt-6 divide-y divide-[hsl(var(--brand-iron)/0.6)] border-y border-[hsl(var(--brand-iron)/0.6)]">
              {STACK.map((item) => (
                <div key={item.name} className="py-5">
                  <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono-tight text-sm font-medium text-[hsl(var(--brand-bone))]">
                      {item.name}
                    </span>
                    <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      {item.role}
                    </span>
                  </dt>
                  <dd className="mt-2 max-w-[68ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {item.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="colophon-decisions-heading" className="mt-20">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Colophon · Engineering
            </div>
            <h2
              id="colophon-decisions-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              Decisions that mattered
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Most of these exist because the obvious version was measurably worse. The comments
              explaining them are still in the source.
            </p>

            <div className="mt-8 space-y-10">
              {DECISIONS.map((decision, index) => (
                <article
                  key={decision.id}
                  id={decision.id}
                  className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 backdrop-blur-sm"
                >
                  <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <h3 className="mt-2 max-w-[52ch] font-display text-lg font-medium leading-snug tracking-tight text-[hsl(var(--brand-bone))] md:text-xl">
                    {decision.title}
                  </h3>
                  <div className="mt-4 space-y-3">
                    {decision.body.map((paragraph) => (
                      <p
                        key={paragraph.slice(0, 40)}
                        className="max-w-[70ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="colophon-type-heading" className="mt-20">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Colophon · Type and colour
            </div>
            <h2
              id="colophon-type-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              Type and colour
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm">
                <h3 className="font-display text-base font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                  Four typefaces, each with a job
                </h3>
                <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Space Grotesk and Inter for display and body, JetBrains Mono for anything that is
                  data, a label, or code, and Orbitron for the small technical eyebrow labels. They
                  load from Google Fonts with a preconnect and a preloaded stylesheet. That and the
                  Cloudflare Web Analytics beacon are the only third party requests a page makes.
                </p>
              </div>
              <div className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm">
                <h3 className="font-display text-base font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                  One accent, used sparingly
                </h3>
                <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Obsidian background, bone text, and a single signal lime accent, all defined as
                  HSL custom properties so opacity variants come free. Colour is never the only
                  thing carrying meaning: every state that uses it also says what it is in words.
                </p>
              </div>
            </div>
          </section>

          <section aria-labelledby="colophon-absent-heading" className="mt-20">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Colophon · Absent
            </div>
            <h2
              id="colophon-absent-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              What is deliberately not here
            </h2>
            <ul className="mt-6 space-y-3">
              {[
                "Cloudflare Web Analytics is enabled on the Pages project, so the edge injects a beacon that counts page views and Core Web Vitals. It sets no cookie, records no identifier, and follows nobody between sites. Nothing else reports what you read.",
                "No content management system. A post is a markdown file and a commit, so there is no admin login to secure and no database to back up.",
                "No comment system, no chat widget, no newsletter modal.",
                "No server. The whole site is static files, which is also the strongest security posture available to it.",
              ].map((line) => (
                <li
                  key={line}
                  className="flex gap-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                >
                  <span aria-hidden className="select-none text-[hsl(var(--brand-signal))]">
                    ·
                  </span>
                  <span className="max-w-[70ch]">{line}</span>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="colophon-source-heading"
            className="mt-20 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] p-6"
          >
            <h2
              id="colophon-source-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
            >
              Source and tools
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The software I use day to day is listed on the{" "}
              <Link
                href="/uses"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                uses page
              </Link>
              , and my code is at{" "}
              <a
                href={siteConfig.social.github.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[24px] items-center break-all py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                github.com/{siteConfig.social.github.handle}
              </a>
              . If something on this page is wrong, or you want detail on one of the decisions
              above, email{" "}
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

export default CinematicColophon;
