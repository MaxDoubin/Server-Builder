import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { LINK_GROUPS as GROUPS } from "@/lib/linksConfig";


export function CinematicLinks() {
  useSEO({
    title: "Links | Max Doubin",
    description:
      "Free and freemium resources Max Doubin recommends for learning networking and security: fundamentals, capture the flag practice, and certification prep.",
    canonical: "https://maxdoubin.com/links",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Links · Resources
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Where to learn this.
            </h1>
            <p className="mt-6 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The resources I actually recommend when someone asks how to start in networking or
              security. Everything here is free or has a genuinely useful free tier, and each entry
              says why it is worth your time rather than just what it is.
            </p>
            <p className="mt-4 max-w-[64ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              These are external sites with no affiliation to me, and no link here is sponsored.
            </p>
          </header>

          <nav aria-label="Sections on this page" className="mt-10">
            <ul className="flex flex-wrap gap-2">
              {GROUPS.map((group) => (
                <li key={group.id}>
                  <a
                    href={`#${group.id}`}
                    className="inline-flex min-h-[32px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.45)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                  >
                    {group.heading}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-14 space-y-16">
            {GROUPS.map((group) => (
              <section key={group.id} id={group.id} aria-labelledby={`${group.id}-heading`}>
                <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
                  {group.label}
                </div>
                <h2
                  id={`${group.id}-heading`}
                  className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
                >
                  {group.heading}
                </h2>
                <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {group.summary}
                </p>

                <ul className="mt-6 space-y-3">
                  {group.items.map((item) => (
                    <li key={item.url}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                          <span className="font-display text-base font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                            {item.name} <span aria-hidden>↗</span>
                          </span>
                          <span className="rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-[9px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                            {item.access}
                          </span>
                        </div>
                        <p className="mt-2 max-w-[70ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                          {item.why}
                        </p>
                        <p className="mt-3 break-all font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                          {item.url.replace(/^https:\/\//, "").replace(/\/$/, "")}
                        </p>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section
            aria-labelledby="links-local-heading"
            className="mt-16 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] p-6"
          >
            <h2
              id="links-local-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
            >
              Closer to home
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The{" "}
              <Link
                href="/tools"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                browser tools
              </Link>{" "}
              on this site cover subnetting, packet headers, ciphers, and encoding, and{" "}
              <Link
                href="/blog"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                Field Notes
              </Link>{" "}
              works through most of these topics in more depth. If you are in the Las Vegas area and
              still in school, the{" "}
              <Link
                href="/cyber-club"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                Cyber Club
              </Link>{" "}
              is the fastest way in.
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}

export default CinematicLinks;
