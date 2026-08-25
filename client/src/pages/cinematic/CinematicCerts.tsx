import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import {
  CERTS_EARNED,
  CERTS_IN_PROGRESS,
  type Cert,
  type CertResource,
} from "@/lib/certConfig";

const SITE_URL = "https://maxdoubin.com";

export function CinematicCerts() {
  useSEO({
    title: "Certifications | Max Doubin",
    description:
      "An honest status board: CompTIA Tech+ earned, with Security+, Network+, and CCNA in progress, plus each exam's official domains and resources.",
    canonical: `${SITE_URL}/certifications`,
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1000px]">
          <header className="max-w-3xl">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Status · Certifications
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Certifications.
            </h1>
            <p className="mt-6 font-mono-tight text-base leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              I hold CompTIA Tech+ and I am certifying in Security+, Network+,
              and the CCNA. This page tracks what each one covers, what it is
              worth, and how far through the objectives I am.
            </p>
          </header>

          {/* Status is stated plainly so an "in progress" card is never read as
              a credential already held. Confident, not apologetic. */}
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
              <span className="text-[hsl(var(--brand-signal))]">In progress</span> means the
              objectives are being worked through and the exam has not been sat yet.
            </p>
          </div>

          <section className="mt-14" aria-labelledby="earned-heading">
            <h2
              id="earned-heading"
              className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              Earned
            </h2>
            <div className="mt-6 space-y-6">
              {CERTS_EARNED.map((cert) => (
                <CertCard key={cert.id} cert={cert} />
              ))}
            </div>
          </section>

          <section className="mt-16" aria-labelledby="progress-heading">
            <h2
              id="progress-heading"
              className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              In progress
            </h2>
            <p className="mt-3 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Working through these now. Each card lists the official exam
              objective domains for the stated exam version and the resources I
              use per domain. Weightings change between versions, so each card
              also links the vendor's current objectives.
            </p>
            <div className="mt-6 space-y-6">
              {CERTS_IN_PROGRESS.map((cert) => (
                <CertCard key={cert.id} cert={cert} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}

function StatusChip({ cert }: { cert: Cert }) {
  const earned = cert.status === "earned";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono-tight text-[10px] uppercase tracking-[0.2em] ${
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

function CertCard({ cert }: { cert: Cert }) {
  return (
    <article
      data-testid={`cert-${cert.id}`}
      className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 backdrop-blur-sm md:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
            {cert.vendor} · {cert.code}
          </div>
          <h3 className="mt-2 font-display text-xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-2xl">
            {cert.name}
          </h3>
          <div className="mt-1 font-mono-tight text-[13px] text-[hsl(var(--brand-ash))]">
            {cert.level}
          </div>
        </div>
        <StatusChip cert={cert} />
      </div>

      <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]">
        {cert.statusDetail}
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
            What it covers
          </div>
          <p className="mt-2 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            {cert.covers}
          </p>
        </div>
        <div>
          <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
            What it is worth
          </div>
          <p className="mt-2 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            {cert.worth}
          </p>
        </div>
      </div>

      <a
        href={cert.officialUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex min-h-[24px] items-center gap-1.5 py-1 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-signal))]"
      >
        Official objectives ↗
      </a>

      {cert.domains.length > 0 ? (
        <details className="group mt-5 border-t border-[hsl(var(--brand-iron))] pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:text-[hsl(var(--brand-signal))]">
            <span>Exam objective domains ({cert.code})</span>
            <span aria-hidden className="text-[hsl(var(--brand-ash))] transition-transform group-open:rotate-90">
              →
            </span>
          </summary>
          <div className="mt-4 space-y-4">
            {cert.domains.map((domain) => (
              <div
                key={domain.name}
                className="rounded-xl border border-[hsl(var(--brand-iron)/0.7)] bg-[hsl(var(--brand-obsidian)/0.4)] p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="font-mono-tight text-sm font-medium text-[hsl(var(--brand-bone))]">
                    {domain.name}
                  </h4>
                  <span className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))]">
                    {domain.weight}
                  </span>
                </div>
                <p className="mt-1.5 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {domain.summary}
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {domain.resources.map((r) => (
                    <li key={r.url}>
                      <ResourceLink resource={r} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function ResourceLink({ resource }: { resource: CertResource }) {
  const internal = resource.url.startsWith("/");
  const className =
    "inline-flex min-h-[28px] items-center gap-1 rounded-md border border-[hsl(var(--brand-iron))] px-2.5 py-1 font-mono-tight text-[11px] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";

  if (internal) {
    return (
      <Link href={resource.url} className={className}>
        {resource.label}
      </Link>
    );
  }
  return (
    <a href={resource.url} target="_blank" rel="noopener noreferrer" className={className}>
      {resource.label} <span aria-hidden>↗</span>
    </a>
  );
}
