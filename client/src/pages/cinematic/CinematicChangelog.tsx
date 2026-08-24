/**
 * The site's own changelog.
 *
 * A portfolio that quietly rewrites itself gives a visitor no way to tell
 * whether it is maintained. This page states what changed and when, in
 * language that does not assume the reader writes software.
 */

import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { CHANGELOG, CHANGELOG_UPDATED, type ChangelogRelease } from "@/lib/changelog";

const SITE_URL = "https://maxdoubin.com";
const REPO_COMMITS = "https://github.com/MaxDoubin/Server-Builder/commits/main";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Format an ISO date without going through the Date constructor.
 *
 * `new Date("2026-08-24")` is parsed as UTC midnight, which renders as the
 * 23rd for every reader west of Greenwich. These dates carry no time, so
 * splitting the string is both simpler and correct everywhere.
 */
function formatDay(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${Number(day)}, ${year}`;
}

function formatMonth(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

interface MonthGroup {
  key: string;
  releases: ChangelogRelease[];
}

/** Bucket releases by YYYY-MM, preserving the newest-first order they arrive in. */
function groupByMonth(releases: ChangelogRelease[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const release of releases) {
    const key = release.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.releases.push(release);
    } else {
      groups.push({ key, releases: [release] });
    }
  }
  return groups;
}

export function CinematicChangelog() {
  useSEO({
    title: "Changelog | Max Doubin",
    description:
      "A plain-language history of what has changed on maxdoubin.com: speed work, accessibility fixes, new writing and new tools, dated and grouped by month.",
    canonical: `${SITE_URL}/changelog`,
  });

  const months = groupByMonth(CHANGELOG);
  const totalChanges = CHANGELOG.reduce((sum, r) => sum + r.entries.length, 0);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Meta · Changelog
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.25rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              What has changed here.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Notable changes to this site, newest first, written so they make
              sense without knowing what any of the underlying pieces are
              called. Small fixes and typo corrections are left out. Everything
              here corresponds to work that is live, not planned.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
              <span>last updated {CHANGELOG_UPDATED}</span>
              <span aria-hidden className="h-px w-6 bg-[hsl(var(--brand-iron))]" />
              <span>
                {totalChanges} changes · {CHANGELOG.length} releases
              </span>
            </div>
            <p className="mt-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The unabridged version is the{" "}
              <a
                href={REPO_COMMITS}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-changelog-commits"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                commit history
              </a>
              , which is public.
            </p>
          </header>

          <div className="mt-16 space-y-16">
            {months.map((group) => (
              <section key={group.key} aria-labelledby={`month-${group.key}`}>
                <div className="flex items-center gap-4">
                  <h2
                    id={`month-${group.key}`}
                    className="shrink-0 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]"
                  >
                    {formatMonth(group.key)}
                  </h2>
                  <span aria-hidden className="h-px flex-1 bg-[hsl(var(--brand-iron))]" />
                  <span className="shrink-0 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                    {group.releases.length}{" "}
                    {group.releases.length === 1 ? "release" : "releases"}
                  </span>
                </div>

                <div className="mt-8 space-y-6">
                  {group.releases.map((release) => (
                    <article
                      key={`${release.date}-${release.title}`}
                      data-testid="changelog-release"
                      className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                        <h3 className="font-display text-lg font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                          {release.title}
                        </h3>
                        <time
                          dateTime={release.date}
                          className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                        >
                          {formatDay(release.date)}
                        </time>
                      </div>

                      <ul className="mt-5 space-y-3">
                        {release.entries.map((entry) => (
                          <li key={entry} className="flex gap-3">
                            <span
                              aria-hidden
                              className="mt-[0.55rem] h-[5px] w-[5px] shrink-0 rounded-full bg-[hsl(var(--brand-signal))]"
                            />
                            <span className="min-w-0 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                              {entry}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </CinematicLayout>
  );
}
