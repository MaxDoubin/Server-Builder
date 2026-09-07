/**
 * Shared chrome for every tool page.
 *
 * Each tool supplies only its own controls and output. The heading, the SEO
 * head, the breadcrumb back to the index, and the explanatory notes all come
 * from here, so every tool stays visually identical and a new one cannot
 * drift. The notes are looked up from TOOL_NOTES by slug rather than passed
 * in, which is what lets the prerenderer emit the same words.
 */

import type { ReactNode } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { getTool } from "@/lib/toolsRegistry";
import { TOOL_NOTES, type NotePara } from "@/lib/toolNotes";

const SITE_URL = "https://maxdoubin.com";

interface Props {
  /** Registry slug. Title, blurb, and canonical all derive from it. */
  slug: string;
  children: ReactNode;
  /**
   * Extra JSX under the shared notes, for anything a tool can only say at
   * runtime. The prose itself comes from TOOL_NOTES, keyed by slug, so the
   * prerenderer can emit the same words into the static HTML.
   */
  notes?: ReactNode;
}

/** One paragraph of TOOL_NOTES, with inline code and emphasis preserved. */
function NoteParagraph({ para }: { para: NotePara }) {
  return (
    <p>
      {para.map((span, i) => {
        if (typeof span === "string") return <span key={i}>{span}</span>;
        if ("code" in span)
          return (
            <code key={i} className="break-words text-[hsl(var(--brand-cyan))]">
              {span.code}
            </code>
          );
        return <em key={i}>{span.em}</em>;
      })}
    </p>
  );
}

export function ToolShell({ slug, children, notes }: Props) {
  const paras = TOOL_NOTES[slug] ?? [];
  const tool = getTool(slug);
  const name = tool?.name ?? "Tool";
  const blurb = tool?.blurb ?? "";
  const canonical = `${SITE_URL}/tools/${slug}`;

  useSEO({
    title: `${name} | Max Doubin`,
    description: blurb,
    canonical,
    schema: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name,
      description: blurb,
      url: canonical,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      // Free, browser-based, and nothing is uploaded anywhere. Stating the
      // price explicitly is what makes this eligible for a rich result.
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
      isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
    },
    schemaId: "tool-schema",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1100px]">
          <nav aria-label="Breadcrumb">
            <Link
              href="/tools"
              data-testid="link-tools-index"
              className="inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← All tools
            </Link>
          </nav>

          <header className="mt-6">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Tool
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.25rem,5vw,3.75rem)] font-medium leading-[0.98] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              {name}
            </h1>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {blurb}
            </p>
            <p className="mt-3 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
              runs in your browser · nothing is uploaded
            </p>
          </header>

          <div className="mt-10">{children}</div>

          {paras.length || notes ? (
            <section className="mt-16 border-t border-[hsl(var(--brand-iron))] pt-8">
              <h2 className="font-display text-xl font-medium text-[hsl(var(--brand-bone))]">
                Notes
              </h2>
              <div className="mt-4 space-y-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {paras.map((para, i) => (
                  <NoteParagraph key={i} para={para} />
                ))}
                {notes}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </CinematicLayout>
  );
}

/** A labelled block of controls. */
export function ToolPanel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm ${className}`}
    >
      {title ? (
        <h2 className="mb-4 font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
          {title}
        </h2>
      ) : null}
      {children}
    </div>
  );
}

/** One name/value row in a results panel. */
export function ToolResult({
  label,
  value,
  mono = true,
  testId,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[hsl(var(--brand-iron)/0.5)] py-2.5 last:border-b-0">
      <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
        {label}
      </span>
      <span
        data-testid={testId}
        className={`${mono ? "font-mono-tight" : "font-display"} break-all text-sm text-[hsl(var(--brand-bone))]`}
      >
        {value}
      </span>
    </div>
  );
}
