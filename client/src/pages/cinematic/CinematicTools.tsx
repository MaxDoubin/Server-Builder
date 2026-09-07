/**
 * The /tools index.
 *
 * Reads the registry rather than listing anything by hand, so a tool that
 * exists is on this page and a tool that is not on this page does not exist.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { TOOLS, TOOL_CATEGORIES, type ToolCategory, type ToolEntry } from "@/lib/toolsRegistry";

const SITE_URL = "https://maxdoubin.com";

/**
 * Reading order, roughly how a network is learned rather than alphabetical.
 * Anything the registry adds later still appears, just at the end.
 */
const PREFERRED: ToolCategory[] = ["networking", "systems", "encoding", "security"];

function orderedCategories(): ToolCategory[] {
  const all = Object.keys(TOOL_CATEGORIES) as ToolCategory[];
  const rest = all.filter((c) => !PREFERRED.includes(c));
  return [...PREFERRED.filter((c) => all.includes(c)), ...rest];
}

function matches(tool: ToolEntry, query: string): boolean {
  const haystack = `${tool.name} ${tool.blurb} ${tool.keywords.join(" ")} ${tool.slug}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function CinematicTools() {
  const [query, setQuery] = useState("");

  const toolsSchema = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${SITE_URL}/tools#list`,
      name: "Networking and security tools",
      description:
        "Free browser-based utilities for networking, security, systems and encoding work.",
      url: `${SITE_URL}/tools`,
      numberOfItems: TOOLS.length,
      itemListOrder: "https://schema.org/ItemListUnordered",
      isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
      itemListElement: TOOLS.map((tool, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/tools/${tool.slug}`,
        name: tool.name,
        description: tool.blurb,
      })),
    }),
    [],
  );

  useSEO({
    title: "Tools | Max Doubin",
    description:
      "Free browser-based tools for networking and security study: subnetting, packet headers, cron, regex, encoding, and classical ciphers.",
    canonical: `${SITE_URL}/tools`,
    schema: toolsSchema,
    schemaId: "tools-list-schema",
  });

  const filtered = useMemo(
    () => (query.trim() === "" ? TOOLS : TOOLS.filter((tool) => matches(tool, query.trim()))),
    [query],
  );

  const categories = useMemo(orderedCategories, []);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1100px]">
          <header className="max-w-[62ch]">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Utilities · Free
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Tools.
            </h1>
            <p className="mt-6 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              These are the small utilities I kept needing while studying networking and
              security, so I built them properly instead of searching for one every time. A
              subnet calculator that handles the edge cases, a cron parser that says what an
              expression actually does, a regex tester that will not hang on a bad pattern.
              Each one is a single page that does one thing and explains the thing it does.
            </p>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              All of them are free, none of them need an account, and every calculation
              happens in your browser. Nothing you type is uploaded, logged, or sent anywhere,
              which matters when the thing you are decoding came out of a packet capture.
            </p>
          </header>

          <div data-print-hide className="mt-10 max-w-xl">
            <label
              htmlFor="tools-search"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              Search
            </label>
            <input
              id="tools-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="subnet, base64, cron, hash..."
              data-testid="input-tools-search"
              className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            <p
              role="status"
              data-testid="text-tools-count"
              className="mt-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
            >
              {filtered.length} of {TOOLS.length} tools
            </p>
          </div>

          {filtered.length === 0 ? (
            <div
              data-testid="text-no-tools"
              className="mt-12 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-8 text-center backdrop-blur-sm"
            >
              <p className="font-display text-xl text-[hsl(var(--brand-bone))]">
                Nothing matches that.
              </p>
              <p className="mt-2 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                Try a protocol, a command name, or what you are trying to work out.
              </p>
            </div>
          ) : null}

          <div className="mt-14 space-y-16">
            {categories.map((category) => {
              const meta = TOOL_CATEGORIES[category];
              const tools = filtered.filter((tool) => tool.category === category);
              if (tools.length === 0) return null;
              return (
                <section key={category} aria-labelledby={`category-${category}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[hsl(var(--brand-iron))] pb-4">
                    <h2
                      id={`category-${category}`}
                      className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]"
                    >
                      {meta.label}
                    </h2>
                    <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      {tools.length.toString().padStart(2, "0")} ·{" "}
                      {tools.length === 1 ? "tool" : "tools"}
                    </span>
                  </div>
                  <p className="mt-3 max-w-[60ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {meta.blurb}
                  </p>

                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {tools.map((tool) => (
                      <li key={tool.slug}>
                        <Link
                          href={`/tools/${tool.slug}`}
                          data-testid={`card-tool-${tool.slug}`}
                          className="group flex h-full flex-col rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-5 backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                        >
                          <h3 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                            {tool.name}
                          </h3>
                          <p className="mt-2 flex-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                            {tool.blurb}
                          </p>
                          <span className="mt-4 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                            /tools/{tool.slug}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <p className="mt-20 max-w-[62ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Found something wrong? These get used for coursework and competition practice, so
            a wrong answer is worse than a missing feature. Corrections are welcome through the
            contact page.
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
