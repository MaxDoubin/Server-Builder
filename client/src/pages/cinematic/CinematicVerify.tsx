/**
 * Claim ledger at /verify.
 *
 * Every substantive claim this site makes, graded by how strong the evidence
 * behind it is. The data lives in lib/claims.ts; this file only renders it.
 *
 * The page is deliberately unflattering in places. A portfolio that admits
 * which of its claims rest on nothing but the author's word is more credible
 * than one that presents everything at the same confident volume, and a
 * reader who can see the weak claims marked as weak has a reason to believe
 * the strong ones.
 */

import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { siteConfig } from "@/lib/siteConfig";
import {
  CLAIM_GROUPS,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_MEANING,
  ALL_CLAIMS,
  countByStatus,
  type ClaimStatus,
} from "@/lib/claims";

const SITE_URL = "https://maxdoubin.com";
const CANONICAL = `${SITE_URL}/verify`;

const STATUS_ORDER: ClaimStatus[] = [
  "public",
  "on-request",
  "self-reported",
  "in-progress",
];

const STATUS_STYLE: Record<ClaimStatus, string> = {
  public:
    "border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]",
  "on-request":
    "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.8)] text-[hsl(var(--brand-bone))]",
  "self-reported":
    "border-[hsl(var(--brand-iron)/0.7)] bg-transparent text-[hsl(var(--brand-ash))]",
  "in-progress":
    "border-[hsl(var(--brand-iron)/0.7)] bg-transparent text-[hsl(var(--brand-ash))]",
};

const DESCRIPTION =
  "Every claim on this site, graded by evidence: which ones have a public document, which ones have a record available on request, and which ones rest on nothing but Max Doubin's word.";

const VERIFY_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Claim ledger",
  description: DESCRIPTION,
  url: CANONICAL,
  about: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: siteConfig.name },
  isPartOf: { "@type": "WebSite", url: SITE_URL },
};

function StatusBadge({ status }: { status: ClaimStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 font-mono-tight text-[10px] uppercase tracking-[0.2em] ${STATUS_STYLE[status]}`}
    >
      {CLAIM_STATUS_LABEL[status]}
    </span>
  );
}

export function CinematicVerify() {
  const counts = countByStatus();
  const total = ALL_CLAIMS.length;

  useSEO({
    title: "Verify these claims | Max Doubin",
    description: DESCRIPTION,
    canonical: CANONICAL,
    schema: VERIFY_SCHEMA,
    schemaId: "verify-schema",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Claim ledger
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Verify these claims
            </h1>
            <p className="mt-6 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A portfolio written by a high school student is asking to be
              taken on trust. The usual response to that is to write louder.
              This page does the opposite. Every substantive claim on this
              site is listed below with the evidence behind it, and the weak
              ones are marked weak.
            </p>
            <p className="mt-4 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {total} claims. {counts.public} can be checked right now from
              this page. {counts["on-request"]} have a real record that is not
              published on the open web, so ask and it gets sent.{" "}
              {counts["self-reported"]} rest on nothing but my word, and are
              labelled that way.{" "}
              {counts["in-progress"]} describe work that is not finished, so
              there is nothing to verify yet.
            </p>
            <div className="mt-8">
              <a
                href={`mailto:${siteConfig.email}?subject=${encodeURIComponent("Verification request")}`}
                data-testid="link-verify-email"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Request documentation
              </a>
            </div>
          </header>

          <section
            aria-labelledby="verify-key-heading"
            className="mt-14 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 backdrop-blur-sm"
          >
            <h2
              id="verify-key-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              What the labels mean
            </h2>
            <dl className="mt-5 space-y-4">
              {STATUS_ORDER.map((status) => (
                <div key={status} className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                  <dt className="sm:w-40 sm:shrink-0">
                    <StatusBadge status={status} />
                  </dt>
                  <dd className="max-w-[62ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {CLAIM_STATUS_MEANING[status]}{" "}
                    <span className="text-[hsl(var(--brand-ash))]">
                      ({counts[status]} of {total})
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {CLAIM_GROUPS.map((group) => (
            <section
              key={group.id}
              id={group.id}
              aria-labelledby={`${group.id}-heading`}
              className="mt-16 scroll-mt-24"
            >
              <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
                · Ledger
              </div>
              <h2
                id={`${group.id}-heading`}
                className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
              >
                {group.title}
              </h2>
              <p className="mt-3 max-w-[68ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {group.note}
              </p>

              <ul className="mt-6 divide-y divide-[hsl(var(--brand-iron)/0.6)] border-y border-[hsl(var(--brand-iron)/0.6)]">
                {group.claims.map((claim) => (
                  <li key={claim.claim} className="py-6" data-testid="claim-row">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <h3 className="max-w-[58ch] font-mono-tight text-sm font-medium leading-relaxed text-[hsl(var(--brand-bone))]">
                        {claim.claim}
                      </h3>
                      <StatusBadge status={claim.status} />
                    </div>
                    <p className="mt-3 max-w-[70ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {claim.evidence}
                    </p>
                    {claim.url ? (
                      <p className="mt-3">
                        <a
                          href={claim.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[32px] items-center break-all font-mono-tight text-xs text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
                        >
                          {claim.url}
                        </a>
                      </p>
                    ) : null}
                    <p className="mt-3 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                      Stated on{" "}
                      {claim.appearsOn.map((path, index) => (
                        <span key={path}>
                          {index > 0 ? ", " : ""}
                          <Link
                            href={path}
                            className="normal-case tracking-normal text-[hsl(var(--brand-bone-dim))] underline-offset-4 hover:text-[hsl(var(--brand-signal))] hover:underline"
                          >
                            {path}
                          </Link>
                        </span>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section
            aria-labelledby="verify-wrong-heading"
            className="mt-16 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] p-6"
          >
            <h2
              id="verify-wrong-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
            >
              If something here is wrong
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Tell me and it gets corrected, not argued about. That has already
              happened more than once: the home page used to show four made up
              numbers under a badge reading LIVE, and the rack dataset used to
              read like manufacturer specifications. Both were wrong, both were
              changed, and the{" "}
              <Link
                href="/changelog"
                className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                changelog
              </Link>{" "}
              records when. Corrections go to{" "}
              <a
                href={`mailto:${siteConfig.email}?subject=${encodeURIComponent("Correction")}`}
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

export default CinematicVerify;
