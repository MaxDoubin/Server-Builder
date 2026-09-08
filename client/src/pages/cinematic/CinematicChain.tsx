/**
 * TLS chain validation, one check at a time, with a name on each failure.
 *
 * The check list is the content. A browser reduces all of this to an
 * interstitial and openssl gives you a verify code, and neither answers the
 * question anyone actually has, which is not "is it broken" but "which of us
 * fixes it". Every failing step here names an owner.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { CHAIN_CASES, validate, type ChainCase } from "@/lib/chain/index";

const SITE_URL = "https://maxdoubin.com";

const OWNER_LABEL: Record<string, string> = {
  server: "the server operator",
  client: "the client, and only the client",
  ca: "the certificate authority, via the server",
  requester: "whoever requested the certificate",
  nobody: "nobody, this one is fine",
};

const FAULT_LABEL: Record<string, string> = {
  ok: "Valid",
  "not-yet-valid": "Not valid yet",
  expired: "Expired leaf",
  "name-mismatch": "Name mismatch",
  "missing-intermediate": "Missing intermediate",
  "untrusted-root": "Root not in the trust store",
  "expired-in-chain": "Expired certificate in the chain",
  "not-a-ca": "Issuer is not a CA",
  revoked: "Revoked",
  "weak-signature": "Weak signature",
  "out-of-order": "Chain out of order",
  "self-signed": "Self-signed",
};

export function CinematicChain() {
  useSEO({
    title: "Certificate chain validation | Max Doubin",
    description:
      "Nine servers presenting nine chains, validated check by check. A missing intermediate, an expired intermediate, a wildcard that does not cover the bare domain, and a root a device is too old to have all look the same from a browser.",
    canonical: `${SITE_URL}/chain`,
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[940px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Practise · Which of us fixes it
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Chain.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Nine servers presenting nine chains, validated check by check against a named trust
              store at a named moment. Read the steps, then say what is wrong.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              A browser reduces all of this to one interstitial and about five error codes, and
              openssl gives you a verify code and a chain dump. Neither answers the question anyone
              actually has. A missing intermediate is the server operator's. An expired root is the
              client's, and no amount of reissuing helps. A wildcard that does not cover the bare
              domain was wrong before it was signed. Same padlock, three different people, so every
              failing check here says who.
            </p>
          </header>

          <ol className="mt-11 space-y-6">
            {CHAIN_CASES.map((item) => (
              <CaseCard key={item.id} item={item} />
            ))}
          </ol>

          <p className="mt-14 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI runs every chain through the same validator this page uses and fails the build if a
            stated fault or a named owner disagrees with it. The owner is the half that would rot
            silently: an explanation saying only the client can fix this, against a validator
            naming the server, is a page that teaches someone to open a ticket with the wrong team
            while looking entirely correct.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For a certificate at a prompt rather than on a page, one of the{" "}
            <Link
              href="/labs/used-before-issued"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              labs
            </Link>{" "}
            gives you a host whose clock disagrees with its certificate, and{" "}
            <Link
              href="/resolve"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the resolver
            </Link>{" "}
            does the same thing for DNS.
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}

function CaseCard({ item }: { item: ChainCase }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const result = useMemo(
    () => validate(item.presented, item.store, item.hostname, item.now, item.extra ?? []),
    [item],
  );

  return (
    <li className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5">
      <p className="font-mono-tight text-[14px] leading-relaxed text-[hsl(var(--brand-bone))]">
        “{item.symptom}”
      </p>
      <p className="mt-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">
        {item.hostname} · {item.store.name} · {item.now}
      </p>
      {item.store.note ? (
        <p className="mt-1 font-mono-tight text-[11.5px] text-[hsl(var(--brand-ash))]">
          {item.store.note}
        </p>
      ) : null}

      <div className="mt-4">
        <h3 className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
          · Presented, in the order sent
        </h3>
        <ol className="mt-2 space-y-1">
          {item.presented.map((cert) => (
            <li
              key={cert.id}
              className="break-words font-mono-tight text-[12px] leading-snug text-[hsl(var(--brand-bone-dim))]"
            >
              <span className="text-[hsl(var(--brand-bone))]">{cert.subject}</span>
              <span className="text-[hsl(var(--brand-ash))]"> issued by {cert.issuer}</span>
              <span className="block pl-4 text-[hsl(var(--brand-ash))]">
                {cert.notBefore} to {cert.notAfter} · {cert.sigAlg} ·{" "}
                {cert.isCa ? "CA" : "end entity"}
                {cert.sans.length ? ` · SAN ${cert.sans.join(", ")}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={`chain-steps-${item.id}`}
        className="mt-3 min-h-[36px] font-mono-tight text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
      >
        {open ? "Hide the checks" : "Run the checks"}
      </button>

      {open ? (
        <ol className="mt-3 space-y-1.5 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)] p-3">
          {result.steps.map((step, index) => (
            <li key={index} className="font-mono-tight text-[12.5px] leading-snug">
              <span
                className={
                  step.pass
                    ? "text-[hsl(var(--brand-signal))]"
                    : "text-[hsl(var(--brand-danger))]"
                }
              >
                {step.pass ? "pass " : "FAIL "}
              </span>
              <span className="text-[hsl(var(--brand-bone-dim))]">{step.label}</span>
              <span className="block pl-[3.2rem] text-[hsl(var(--brand-ash))]">{step.detail}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-4 flex flex-col gap-2">
        {item.options.map((option, index) => {
          const chosen = picked === index;
          const right = index === item.answer;
          const show = picked !== null;
          const tone = !show
            ? "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)]"
            : right
              ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.08)] text-[hsl(var(--brand-signal))]"
              : chosen
                ? "border-[hsl(var(--brand-danger)/0.7)] bg-[hsl(var(--brand-danger)/0.07)] text-[hsl(var(--brand-danger))]"
                : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]";
          return (
            <button
              key={option}
              type="button"
              onClick={() => {
                setPicked(index);
                setOpen(true);
              }}
              disabled={picked !== null}
              aria-pressed={chosen}
              data-testid={`chain-option-${item.id}-${index}`}
              className={`rounded-xl border px-4 py-2.5 text-left font-mono-tight text-[12.5px] leading-snug transition-colors ${tone}`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {picked !== null ? (
        <div
          className="mt-4 border-t border-[hsl(var(--brand-iron))] pt-3"
          data-testid={`chain-explain-${item.id}`}
        >
          <p className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
            · {picked === item.answer ? "That is it" : "Not that one"} ·{" "}
            {FAULT_LABEL[result.fault] ?? result.fault}
          </p>
          <p className="mt-2 font-mono-tight text-[12px] uppercase tracking-[0.14em] text-[hsl(var(--brand-ash))]">
            Fixed by {OWNER_LABEL[result.owner] ?? result.owner}
          </p>
          <p className="mt-2.5 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]">
            {result.summary}
          </p>
          {item.explain.map((paragraph, index) => (
            <p
              key={index}
              className="mt-2.5 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
            >
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}
    </li>
  );
}
