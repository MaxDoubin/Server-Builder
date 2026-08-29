import type { ReactNode } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { siteConfig, PRESS } from "@/lib/siteConfig";

/**
 * Print rules for this page only.
 *
 * They live in a <style> element rendered by the component rather than in the
 * global stylesheet, so they exist in the document only while /resume is
 * mounted. That is what makes the broad selectors safe: `.fixed` covers the
 * nav, the scroll progress bar, and the cursor glow, all of which are fixed
 * decoration that a printer would either drop mid-page or stamp on top of the
 * text. On any other route this stylesheet is not in the document at all.
 */
const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }

  .fixed,
  footer,
  .resume-noprint { display: none !important; }

  .cinematic-grain::before { content: none !important; }
  .cinematic > .pointer-events-none { display: none !important; }

  html, body, .cinematic { background: #fff !important; }

  .resume-shell { padding: 0 !important; }

  .resume-doc {
    max-width: none !important;
    font-size: 9.5pt !important;
    line-height: 1.4 !important;
  }
  .resume-doc,
  .resume-doc * {
    color: #000 !important;
    background: transparent !important;
    border-color: #999 !important;
    box-shadow: none !important;
    text-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  .resume-doc a { text-decoration: none !important; }
  .resume-doc h1 { font-size: 22pt !important; line-height: 1.05 !important; }
  .resume-doc h2 { font-size: 10pt !important; letter-spacing: 0.14em !important; }
  .resume-doc h3 { font-size: 9.5pt !important; }
  .resume-doc section { break-inside: avoid; page-break-inside: avoid; margin-top: 14px !important; }
  .resume-doc li { break-inside: avoid; page-break-inside: avoid; }
  .resume-entry { margin-top: 7px !important; }
}
`;

/** Already covered by the education and certification sections above it. */
const SKILLS_FOR_RESUME = siteConfig.skillCategories.filter(
  (category) => category.name !== "Academics & Certifications",
);

const STUDYING_TOWARD = ["CompTIA Security+", "CompTIA Network+", "Cisco CCNA"];

export function CinematicResume() {
  useSEO({
    title: "Resume | Max Doubin",
    description:
      "Resume for Max Doubin: cybersecurity study at South Career Technical Academy, National Cyber League results, leadership roles, projects, and skills.",
    canonical: "https://maxdoubin.com/resume",
  });

  return (
    <CinematicLayout>
      <style>{PRINT_CSS}</style>

      <div className="resume-shell relative px-6 pb-32 pt-32 md:px-10">
        <div className="resume-doc mx-auto max-w-[820px]">
          <div className="resume-noprint mb-10 flex flex-wrap items-center justify-between gap-4">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Resume
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              data-testid="button-print-resume"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              Print or save as PDF
            </button>
          </div>

          <header className="border-b border-[hsl(var(--brand-iron))] pb-6">
            <h1 className="font-display text-[clamp(2.25rem,6vw,3.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              {siteConfig.name}
            </h1>
            <p className="mt-3 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Cybersecurity student. Enterprise networking, systems infrastructure, and community
              leadership. Las Vegas, Nevada.
            </p>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              <li>
                <a
                  href={`mailto:${siteConfig.email}`}
                  className="inline-flex min-h-[24px] items-center break-all py-1 text-[hsl(var(--brand-bone-dim))] underline-offset-4 hover:text-[hsl(var(--brand-signal))] hover:underline"
                >
                  {siteConfig.email}
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.siteUrl}
                  className="inline-flex min-h-[24px] items-center break-all py-1 text-[hsl(var(--brand-bone-dim))] underline-offset-4 hover:text-[hsl(var(--brand-signal))] hover:underline"
                >
                  maxdoubin.com
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.social.github.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[24px] items-center break-all py-1 text-[hsl(var(--brand-bone-dim))] underline-offset-4 hover:text-[hsl(var(--brand-signal))] hover:underline"
                >
                  github.com/{siteConfig.social.github.handle}
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.social.instagram.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[24px] items-center break-all py-1 text-[hsl(var(--brand-bone-dim))] underline-offset-4 hover:text-[hsl(var(--brand-signal))] hover:underline"
                >
                  instagram.com/maxdoubin
                </a>
              </li>
            </ul>
          </header>

          <Section title="Summary">
            <p className="max-w-[78ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {siteConfig.shortBio}
            </p>
          </Section>

          <Section title="Education">
            <div className="resume-entry">
              <h3 className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">
                South Career Technical Academy
              </h3>
              <p className="mt-1 font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                Cybersecurity program · Las Vegas, Nevada · 10th grade
              </p>
              <ul className="mt-2 space-y-1">
                <Bullet>
                  Advanced Placement: scored 5, the top of the scale, on both Computer Science
                  Principles and Human Geography
                </Bullet>
                <Bullet>
                  Currently taking AP Seminar, AP World History: Modern, and AP Precalculus
                </Bullet>
                <Bullet>
                  CYBER.ORG coursework: search operator reconnaissance, WHOIS and nslookup lookups,
                  ARP poisoning, and packet capture analysis in Wireshark
                </Bullet>
                <Bullet>Preferred languages: Python and JavaScript</Bullet>
              </ul>
            </div>
          </Section>

          <Section title="Certifications">
            <div className="resume-entry">
              <h3 className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">
                Earned
              </h3>
              <ul className="mt-2 space-y-1">
                <Bullet>CompTIA Tech+</Bullet>
              </ul>
            </div>
            <div className="resume-entry mt-4">
              <h3 className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">
                Studying toward
              </h3>
              <p className="mt-1 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                In progress. Not held.
              </p>
              <ul className="mt-2 space-y-1">
                {STUDYING_TOWARD.map((cert) => (
                  <Bullet key={cert}>{cert}</Bullet>
                ))}
              </ul>
            </div>
          </Section>

          <Section title="Competition">
            <div className="resume-entry">
              <h3 className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">
                National Cyber League · Cyber Skyline
              </h3>
              <ul className="mt-2 space-y-1">
                <Bullet>
                  Ranked in the top 1 percent of National Cyber League competitors
                </Bullet>
                <Bullet>
                  Helped lead South Career Technical Academy to 7th nationally among high schools in
                  the Fall 2025 Cyber Power Rankings
                </Bullet>
                <Bullet>
                  Categories: open source intelligence, cryptography, log analysis, hash cracking,
                  network forensics, and web exploitation
                </Bullet>
              </ul>
            </div>
          </Section>

          <Section title="Leadership and service">
            <div className="space-y-4">
              {siteConfig.leadership.map((role) => (
                <div key={`${role.title}-${role.org}`} className="resume-entry">
                  <h3 className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">
                    {role.title}
                  </h3>
                  <p className="mt-1 font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                    {role.org}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {role.details.map((detail) => (
                      <Bullet key={detail}>{detail}</Bullet>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Projects">
            <div className="space-y-4">
              {siteConfig.projects.map((project) => (
                <div key={project.id} className="resume-entry">
                  <h3 className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">
                    {project.title}
                  </h3>
                  <p className="mt-1 max-w-[78ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {project.description}
                  </p>
                  <p className="mt-1 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    {project.tech.join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Skills">
            <dl className="space-y-3">
              {SKILLS_FOR_RESUME.map((category) => (
                <div key={category.name} className="resume-entry">
                  <dt className="font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                    {category.name}
                  </dt>
                  <dd className="mt-1 max-w-[78ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {category.skills.join(", ")}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Recognition">
            <ul className="space-y-1">
              <Bullet>Nevada All-State Band selection in 6th, 7th, and 9th grade</Bullet>
              <Bullet>Ranked #1 percussionist in the state of Nevada in 2024</Bullet>
              <Bullet>Student of the Month, South Career Technical Academy</Bullet>
            </ul>
          </Section>

          <Section title="Press">
            <p className="max-w-[78ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <a
                href={PRESS.url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-words text-[hsl(var(--brand-bone))] underline-offset-4 hover:text-[hsl(var(--brand-signal))] hover:underline"
              >
                {PRESS.headline}
              </a>
              <span className="block text-[hsl(var(--brand-ash))]">
                {PRESS.outlet}, {PRESS.displayDate}. By {PRESS.author}.
              </span>
            </p>
          </Section>

          <p className="resume-noprint mt-14 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Everything on this page is drawn from the same source of truth as the rest of the site.
            Certifications marked "studying toward" are in progress, not held.
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `resume-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="mt-10 border-t border-[hsl(var(--brand-iron))] pt-6">
      <h2
        id={id}
        className="font-mono-tight text-[11px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
      >
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
      <span aria-hidden className="select-none text-[hsl(var(--brand-ash))]">
        ·
      </span>
      <span className="max-w-[76ch]">{children}</span>
    </li>
  );
}

export default CinematicResume;
