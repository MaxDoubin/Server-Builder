import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { usesConfig } from "@/lib/usesConfig";

export function CinematicUses() {
  useSEO({
    title: "Uses | Max Doubin",
    description:
      "The software Max Doubin actually uses: terminal and analysis tools, languages, virtualization, monitoring, and this site's own stack, with why for each.",
    canonical: "https://maxdoubin.com/uses",
  });

  // Entries flagged `unconfirmed` are seeded guesses, so they never render.
  // See the note at the top of usesConfig.ts.
  const groups = usesConfig.groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.unconfirmed) }))
    .filter((group) => group.items.length > 0);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Uses · Software
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              What I use.
            </h1>
            <p className="mt-6 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {usesConfig.intro}
            </p>
            <p className="mt-4 max-w-[62ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Software and services only. This page does not list hardware.
            </p>
          </header>

          <nav aria-label="Sections on this page" className="mt-10">
            <ul className="flex flex-wrap gap-2">
              {groups.map((group) => (
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
            {groups.map((group) => (
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
                {group.summary ? (
                  <p className="mt-3 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {group.summary}
                  </p>
                ) : null}

                <dl className="mt-6 divide-y divide-[hsl(var(--brand-iron)/0.6)] border-y border-[hsl(var(--brand-iron)/0.6)]">
                  {group.items.map((item) => (
                    <div key={item.name} className="py-5">
                      <dt className="font-mono-tight text-sm font-medium text-[hsl(var(--brand-bone))]">
                        {item.name}
                      </dt>
                      <dd className="mt-2 max-w-[68ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {item.why}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          <section
            aria-labelledby="uses-more-heading"
            className="mt-16 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
          >
            <h2
              id="uses-more-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              Related
            </h2>
            <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              How this site is built, and why each of those decisions was made, is written up on the{" "}
              <Link
                href="/colophon"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                colophon
              </Link>
              . What I am working on this month is on the{" "}
              <Link
                href="/now"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                now page
              </Link>
              , and the resources I recommend to other people learning this are on the{" "}
              <Link
                href="/links"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                links page
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}

export default CinematicUses;
