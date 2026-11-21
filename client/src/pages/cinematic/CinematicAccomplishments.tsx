import type { ReactNode } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { isTiled, type Cert, type CredentialGroup } from "@/lib/certConfig";
import {
  ACADEMICS,
  ACCOMPLISHMENTS_PATH,
  ACCOMPLISHMENTS_TITLE,
  COMPETITION,
  EARNED_CERTS,
  IN_PROGRESS_CERTS,
  ISSUER_GROUPS,
  BADGE_COUNT,
  LEADERSHIP,
  MILESTONE_COUNT,
  MUSIC,
  PRESS,
  PROJECTS,
  RECOGNITION,
  STATS,
  TRAINING_COUNT,
  YEARS,
  accomplishmentsDescription,
  type Achievement,
  type Leadership,
  type Project,
} from "@/lib/accomplishmentsConfig";

const SITE_URL = "https://maxdoubin.com";

/*
 * The tile and card looks are the certifications page's, so a badge reads the
 * same on both pages: the same border, the same translucent graphite, the same
 * badge size.
 */
const CARD =
  "rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 backdrop-blur-sm";
const TILE = `flex h-full flex-col ${CARD}`;
const TILE_GRID = "mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";
const TILE_BADGE = "h-20 w-20 shrink-0 md:h-24 md:w-24";
const H2 =
  "font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl";
const H3 =
  "font-display text-lg font-medium leading-snug tracking-tight text-[hsl(var(--brand-bone))]";
const EYEBROW =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const BODY = "font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]";
const TEXT_LINK =
  "inline-flex min-h-[24px] items-center gap-1.5 py-1 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

export function CinematicAccomplishments() {
  useSEO({
    title: ACCOMPLISHMENTS_TITLE,
    description: accomplishmentsDescription(),
    canonical: `${SITE_URL}${ACCOMPLISHMENTS_PATH}`,
    ogImage: `${SITE_URL}/images/og/accomplishments.jpg`,
  });

  const longestYear = Math.max(...YEARS.map((year) => year.count));

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1000px]">
          <header className="max-w-3xl">
            <div className="font-techno text-[0.625rem] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Record · Accomplishments
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Accomplishments.
            </h1>
            <p className="mt-6 font-mono-tight text-base leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Everything on record, grouped by kind. Every entry and every figure here is
              generated from the same records as the{" "}
              <Link href="/resume" className="text-[hsl(var(--brand-bone))] underline underline-offset-4 hover:text-[hsl(var(--brand-signal))]">
                resume
              </Link>
              , the{" "}
              <Link href="/timeline" className="text-[hsl(var(--brand-bone))] underline underline-offset-4 hover:text-[hsl(var(--brand-signal))]">
                timeline
              </Link>{" "}
              and the{" "}
              <Link href="/certifications" className="text-[hsl(var(--brand-bone))] underline underline-offset-4 hover:text-[hsl(var(--brand-signal))]">
                certifications
              </Link>{" "}
              page, so it changes when they do.
            </p>
          </header>

          {/* The counts are computed, and each one jumps to the section it counts. */}
          <ul
            data-testid="accomplishment-stats"
            className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            {STATS.map((stat) => (
              <li key={stat.id}>
                <a
                  href={stat.href}
                  data-testid={`stat-${stat.id}`}
                  className="flex h-full flex-col rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-4 transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] md:p-5"
                >
                  <span className="font-display text-4xl font-medium leading-none tracking-[-0.03em] text-[hsl(var(--brand-signal))] tabular-nums md:text-5xl">
                    {stat.value}
                  </span>
                  <span className="mt-3 font-mono-tight text-[0.75rem] leading-snug text-[hsl(var(--brand-bone-dim))]">
                    {stat.label}
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <div
            role="note"
            className="mt-8 flex items-start gap-3 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.07)] p-5"
          >
            <span aria-hidden className="mt-0.5 font-mono-tight text-[hsl(var(--brand-signal))]">
              #
            </span>
            <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]">
              <span className="text-[hsl(var(--brand-signal))]">Earned</span> means the
              credential is held today.{" "}
              <span className="text-[hsl(var(--brand-amber))]">In progress</span> means the
              objectives are being worked through and the exam has not been sat yet, so it is
              shown apart and never counted above.
            </p>
          </div>

          <Section id="competition" title="Competition and cybersecurity" count={COMPETITION.length} unit="results">
            <AchievementGrid items={COMPETITION} />
          </Section>

          <Section id="certifications" title="Certifications" count={EARNED_CERTS.length} unit="earned">
            <h3 className={`mt-6 ${H3}`}>
              Earned <span className={EYEBROW}>· {EARNED_CERTS.length} exams passed</span>
            </h3>
            <ul data-testid="accomplishment-certs-earned" className={TILE_GRID}>
              {EARNED_CERTS.map((cert) => (
                <CertTile key={cert.id} cert={cert} />
              ))}
            </ul>
            <p className="mt-4">
              <Link href="/certifications" className={TEXT_LINK}>
                What each exam covers <span aria-hidden>→</span>
              </Link>
            </p>

            {/* Apart from the earned tiles, dashed and amber, so a target is
                never read as a credential already held. */}
            <div
              data-testid="accomplishment-certs-in-progress"
              className="mt-10 rounded-2xl border border-dashed border-[hsl(var(--brand-amber)/0.6)] bg-[hsl(var(--brand-amber)/0.05)] p-5 md:p-6"
            >
              <h3 className={H3}>
                In progress, not yet earned{" "}
                <span className={EYEBROW}>· {IN_PROGRESS_CERTS.length} targets</span>
              </h3>
              <p className={`mt-2 max-w-2xl ${BODY}`}>
                Working through these now. The exams have not been sat, so none of them is counted
                as earned.
              </p>
              <ul className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                {IN_PROGRESS_CERTS.map((cert) => (
                  <CertTile key={cert.id} cert={cert} />
                ))}
              </ul>
            </div>
          </Section>

          <Section id="training" title="Training credentials and badges" count={TRAINING_COUNT} unit="credentials">
            <p className={`mt-3 max-w-2xl ${BODY}`}>
              {TRAINING_COUNT} credentials from {ISSUER_GROUPS.length} issuers, {BADGE_COUNT} of them
              with the badge the issuer gave, grouped by issuer.
            </p>
            <IssuerGroups groups={ISSUER_GROUPS} />
          </Section>

          <Section id="leadership" title="Leadership and community" count={LEADERSHIP.length} unit="roles">
            <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {LEADERSHIP.map((role) => (
                <RoleCard key={`${role.title}-${role.org}`} role={role} />
              ))}
            </ul>
          </Section>

          <Section id="recognition" title="Recognition and press" count={RECOGNITION.length + 1} unit="entries">
            <article className="mt-6 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.07)] p-6">
              <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                In the press
              </div>
              <h3 className={`mt-2 ${H3} md:text-xl`}>
                <a
                  href={PRESS.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-words underline-offset-4 hover:text-[hsl(var(--brand-signal))] hover:underline"
                >
                  {PRESS.headline} <span aria-hidden>↗</span>
                </a>
              </h3>
              <p className={`mt-2 ${BODY}`}>
                {PRESS.outlet}, {PRESS.displayDate}. By {PRESS.author}.
              </p>
            </article>
            <AchievementGrid items={RECOGNITION} />
          </Section>

          <Section id="music" title="Music" count={MUSIC.length} unit="honors">
            <AchievementGrid items={MUSIC} />
          </Section>

          <Section id="academics" title="Academics">
            <ul
              data-testid="accomplishment-academics"
              className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 backdrop-blur-sm sm:grid-cols-2 md:p-8"
            >
              {ACADEMICS.map((line) => (
                <CheckItem key={line}>{line}</CheckItem>
              ))}
            </ul>
          </Section>

          <Section id="projects" title="Projects" count={PROJECTS.length} unit="projects">
            <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {PROJECTS.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </ul>
          </Section>

          <Section id="years" title="Year by year" count={MILESTONE_COUNT} unit="milestones">
            <ul data-testid="accomplishment-years" className="mt-6 space-y-3">
              {YEARS.map((year) => (
                <li key={year.id} className="flex items-center gap-4">
                  <span className="w-12 shrink-0 font-display text-lg font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                    {year.label}
                  </span>
                  <span aria-hidden className="h-2 flex-1 rounded-full bg-[hsl(var(--brand-iron)/0.6)]">
                    <span
                      className="block h-2 rounded-full bg-[hsl(var(--brand-signal))]"
                      style={{ width: `${(year.count / longestYear) * 100}%` }}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-right font-mono-tight text-[0.8125rem] text-[hsl(var(--brand-bone-dim))]">
                    {year.count} {year.count === 1 ? "milestone" : "milestones"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6">
              <Link href="/timeline" className={TEXT_LINK}>
                Every milestone, in order <span aria-hidden>→</span>
              </Link>
            </p>
          </Section>
        </div>
      </div>
    </CinematicLayout>
  );
}

function Section({
  id,
  title,
  count,
  unit,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  unit?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-16 scroll-mt-28" aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id={`${id}-heading`} className={H2}>
          {title}
        </h2>
        {count !== undefined ? (
          <span className="font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))]">
            {count}
            {unit ? ` ${unit}` : ""}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function AchievementGrid({ items }: { items: Achievement[] }) {
  return (
    <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((item) => (
        <li key={item.title} className={CARD}>
          <h3 className={H3}>{item.title}</h3>
          <p className={`mt-2 ${BODY}`}>{item.description}</p>
        </li>
      ))}
    </ul>
  );
}

function StatusChip({ cert }: { cert: Cert }) {
  const earned = cert.status === "earned";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] ${
        earned
          ? "border-[hsl(var(--brand-signal))] text-[hsl(var(--brand-signal))]"
          : "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]"
      }`}
    >
      <span aria-hidden>{earned ? "✓" : "◔"}</span>
      {cert.statusLabel}
    </span>
  );
}

function CertTile({ cert }: { cert: Cert }) {
  return (
    <li data-testid={`accomplishment-cert-${cert.id}`} className={TILE}>
      <div className="flex items-start justify-between gap-3">
        {cert.badge ? (
          <img
            src={cert.badge.src}
            alt={cert.badge.alt}
            width={96}
            height={96}
            loading="lazy"
            decoding="async"
            className={TILE_BADGE}
          />
        ) : cert.status === "earned" ? (
          // Some issuers give a certificate but no badge image; a plain mark
          // keeps the tile's shape without imitating one. An exam not yet sat
          // gets no mark at all: an empty box beside "in progress" reads as a
          // missing image, and the chip already says what it is.
          <span
            aria-hidden
            className={`${TILE_BADGE} flex items-center justify-center rounded-2xl border border-[hsl(var(--brand-iron))] font-mono-tight text-3xl text-[hsl(var(--brand-signal))]`}
          >
            ✓
          </span>
        ) : null}
        <StatusChip cert={cert} />
      </div>
      <div className={`mt-4 ${EYEBROW}`}>
        <span className="whitespace-nowrap">{cert.vendor}</span>
        {cert.code ? (
          <>
            {" "}
            <span className="whitespace-nowrap">· {cert.code}</span>
          </>
        ) : null}
      </div>
      <h4 className={`mt-2 ${H3}`}>{cert.name}</h4>
      <div className="mt-1 font-mono-tight text-[0.75rem] text-[hsl(var(--brand-ash))]">{cert.level}</div>
      <p className={`mt-3 ${BODY}`}>{cert.statusDetail}</p>
    </li>
  );
}

/**
 * Training credentials by issuer.
 *
 * An issuer whose every item came with a badge shows tiles, as on the
 * certifications page; the rest stay a list. Issuers with a single item pair
 * up in one grid, each under its own heading, so five one-badge issuers do
 * not stack as five near-empty rows. The two long lists take the full width.
 */
function IssuerGroups({ groups }: { groups: CredentialGroup[] }) {
  const tiledMany = groups.filter((group) => isTiled(group) && group.items.length > 1);
  const tiledOne = groups.filter((group) => isTiled(group) && group.items.length === 1);
  const lists = groups.filter((group) => !isTiled(group));
  const longLists = lists.filter((group) => group.items.length > 6);
  const shortLists = lists.filter((group) => group.items.length <= 6);

  return (
    <div className="mt-2">
      {tiledMany.map((group) => (
        <div key={group.id} className="mt-10">
          <GroupHeading group={group} />
          <BadgeTiles group={group} />
        </div>
      ))}

      {/* Each cell is three rows of the shared grid (heading, meta, tile), so
          a meta line that wraps in one cell does not push its tile below its
          neighbors'. */}
      <div className="mt-10 grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiledOne.map((group) => (
          <div key={group.id} className="row-span-3 mb-8 grid grid-rows-subgrid gap-y-0">
            <GroupHeading group={group} />
            <BadgeTiles group={group} single />
          </div>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-x-4 gap-y-8 lg:grid-cols-2">
        {shortLists.map((group) => (
          <div key={group.id}>
            <GroupHeading group={group} />
            <CredentialList group={group} columns={1} />
          </div>
        ))}
      </div>

      {longLists.map((group) => (
        <div key={group.id} className="mt-10">
          <GroupHeading group={group} />
          <CredentialList group={group} columns={2} />
        </div>
      ))}
    </div>
  );
}

function GroupHeading({ group }: { group: CredentialGroup }) {
  return (
    <>
      <h3 className={H3}>
        {group.heading}{" "}
        <span className="font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))]">
          · {group.items.length}
        </span>
      </h3>
      <p className={`mt-1 ${EYEBROW}`}>{group.meta}</p>
    </>
  );
}

function BadgeTiles({ group, single = false }: { group: CredentialGroup; single?: boolean }) {
  return (
    <ul
      data-testid={`accomplishment-credentials-${group.id}`}
      className={single ? "mt-4 grid grid-cols-1 gap-4" : TILE_GRID}
    >
      {group.items.map((item) => {
        const badge = group.badges?.[item];
        return (
          <li key={item} className={TILE}>
            {badge ? (
              <img
                src={badge.src}
                alt={badge.alt}
                width={96}
                height={96}
                loading="lazy"
                decoding="async"
                className={TILE_BADGE}
              />
            ) : null}
            <div className={`mt-4 ${H3}`}>{item}</div>
          </li>
        );
      })}
    </ul>
  );
}

function CredentialList({ group, columns }: { group: CredentialGroup; columns: 1 | 2 }) {
  return (
    <ul
      data-testid={`accomplishment-credentials-${group.id}`}
      className={`mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 backdrop-blur-sm ${
        columns === 2 ? "sm:grid-cols-2 md:p-8" : ""
      }`}
    >
      {group.items.map((item) => (
        <CheckItem key={item}>{item}</CheckItem>
      ))}
    </ul>
  );
}

function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
      <span aria-hidden className="text-[hsl(var(--brand-signal))]">
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

function RoleCard({ role }: { role: Leadership }) {
  return (
    <li className={CARD}>
      <h3 className={H3}>{role.title}</h3>
      <p className={`mt-1 ${EYEBROW}`}>{role.org}</p>
      <ul className="mt-3 space-y-1.5">
        {role.details.map((detail) => (
          <li key={detail} className={`flex gap-2 ${BODY}`}>
            <span aria-hidden className="select-none text-[hsl(var(--brand-ash))]">
              ·
            </span>
            <span>{detail}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const external = project.link.startsWith("http");
  return (
    <li className={TILE}>
      <h3 className={H3}>{project.title}</h3>
      <p className={`mt-2 ${BODY}`}>{project.description}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {project.tech.map((tech) => (
          <li
            key={tech}
            className="rounded-md border border-[hsl(var(--brand-iron))] px-2.5 py-1 font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-ash))]"
          >
            {tech}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-4">
        {external ? (
          <a href={project.link} target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>
            Open <span aria-hidden>↗</span>
          </a>
        ) : (
          <Link href={project.link} className={TEXT_LINK}>
            Open <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </li>
  );
}

export default CinematicAccomplishments;
