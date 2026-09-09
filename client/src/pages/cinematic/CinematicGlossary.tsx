/**
 * The vocabulary, with the part an expansion cannot give you.
 *
 * Every glossary on the internet will tell you that VLAN stands for virtual
 * LAN. Almost none of them will tell you that a VLAN is not a security
 * boundary, which is the sentence that changes what somebody builds. So the
 * expansion is the small print here and the misconception is the headline:
 * each entry leads with what the thing is, and where there is one, closes
 * with the thing people reliably get wrong about it.
 *
 * The filter drives the stage accent, so choosing a field changes the colour
 * of the whole screen rather than just the list. Filtering is URL state, so a
 * filtered view is a link somebody can send.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { useSEO } from "@/lib/useSEO";
import { FIELD_LABEL, TERMS, slugFor, type Field, type Term } from "@/lib/glossary/index";
import { pluralise } from "@/lib/plural";

const SITE_URL = "https://maxdoubin.com";

/**
 * Field to accent.
 *
 * Four accents for seven fields, because the site has four accent tokens that
 * are contrast-checked in both themes. Inventing three more would mean three
 * more colours that have to be legible on white as well as on obsidian.
 */
const ACCENT: Record<Field, StageAccent> = {
  networking: "signal",
  protocols: "cyan",
  security: "danger",
  systems: "signal",
  storage: "amber",
  hardware: "amber",
  operations: "cyan",
};

const FIELDS = Object.keys(FIELD_LABEL) as Field[];

/** Terms matching a query, matched on every field a reader might search by. */
function matches(term: Term, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    term.term.toLowerCase().includes(needle) ||
    (term.expansion ?? "").toLowerCase().includes(needle) ||
    term.definition.toLowerCase().includes(needle) ||
    (term.confusion ?? "").toLowerCase().includes(needle)
  );
}

export function CinematicGlossary() {
  useSEO({
    title: "Glossary | Max Doubin",
    description:
      "Ninety-six terms from networking, security, systems and storage, each one saying what the thing is and what people reliably get wrong about it. A VLAN is not a security boundary. A URE figure is a warranty bound, not a measured rate.",
    canonical: `${SITE_URL}/glossary`,
  });

  const search = useSearch();
  const [query, setQuery] = useState("");
  const [field, setField] = useState<Field | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  /*
    The stage flashes on a filter change, so the colour arrives as a wash
    rather than a swap. It counts changes rather than keying on the field
    because PracticeStage skips zero, and "all" would otherwise never flash.
  */
  const [flash, setFlash] = useState(0);

  /*
    The field comes out of the query string so a filtered view is a link.
    Reading it on every render rather than seeding state once means the back
    button moves the filter, which is what a reader expects from a URL.
  */
  useEffect(() => {
    const value = new URLSearchParams(search).get("field");
    setField(FIELDS.includes(value as Field) ? (value as Field) : null);
  }, [search]);

  /**
   * Move the URL, and tell wouter it moved.
   *
   * Everything on this page that changes what is shown goes through here, so
   * the address bar is always the whole of the state: a filtered view, a
   * linked term, or both, is a link somebody can send.
   */
  const go = useCallback((next: Field | null, hash?: string) => {
    const url = `/glossary${next ? `?field=${next}` : ""}${hash ? `#${hash}` : ""}`;
    window.history.pushState({}, "", url);
    /* wouter reads location from history, so tell it the URL moved. */
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const choose = useCallback(
    (next: Field | null) => {
      setFlash((count) => count + 1);
      go(next);
    },
    [go],
  );

  /**
   * Follow a cross-reference.
   *
   * The awkward case is a reference that points out of the current filter:
   * ARP sees 802.1X, which is filed under security, so from the networking
   * view the anchor would land on an element that is not rendered and the
   * page would appear to ignore the click. Clearing the filter first is the
   * only behaviour that does what the reader asked for.
   */
  const follow = useCallback(
    (target: Term, event: { preventDefault: () => void }) => {
      event.preventDefault();
      const slug = slugFor(target);
      setLinked(slug);
      go(field && target.field !== field ? null : field, slug);
    },
    [field, go],
  );

  const shown = useMemo(
    () => TERMS.filter((term) => (!field || term.field === field) && matches(term, query)),
    [field, query],
  );

  /*
    The anchor is read on mount and on every hash change, not just on mount.
    Arriving at /glossary#mac-address from another page in the same tab is a
    same-document navigation: React does not remount, so a mount-only effect
    would leave the reader at the top of an unmarked list having clicked a
    link to one specific term. Verified in a browser, because it looked
    correct on a cold load.
  */
  useEffect(() => {
    const land = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      if (!TERMS.some((term) => slugFor(term) === hash)) return;
      setLinked(hash);
      /* One frame, so a term revealed by clearing a filter exists to scroll to. */
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ block: "center" });
      });
    };
    land();
    window.addEventListener("hashchange", land);
    return () => window.removeEventListener("hashchange", land);
  }, []);

  const accent: StageAccent = field ? ACCENT[field] : "signal";
  const counts = useMemo(() => {
    const out = new Map<Field, number>();
    for (const term of TERMS) out.set(term.field, (out.get(term.field) ?? 0) + 1);
    return out;
  }, []);

  return (
    <CinematicLayout>
      <PracticeStage accent={accent} mood="calm" flashKey={flash} />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[940px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {TERMS.length} terms
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Glossary.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Every glossary will tell you that VLAN stands for virtual LAN. Almost none of them
              will tell you that a VLAN is not a security boundary, which is the sentence that
              changes what somebody builds. The expansion is the small print here.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              {TERMS.filter((term) => term.confusion).length} of the {TERMS.length} entries close
              with what people get wrong. Nothing here is defined that the site does not use, and a
              term the writing leans on and this page has not defined fails the build, so the
              glossary cannot fall behind the articles.
            </p>
          </header>

          <div className="mt-11 flex flex-wrap items-center gap-2">
            <label className="relative flex-1 basis-[240px]">
              <span className="sr-only">Search the glossary</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search terms and definitions"
                data-testid="glossary-search"
                className="w-full rounded-full border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] px-5 py-2.5 font-mono-tight text-[13px] text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus-visible:border-[hsl(var(--brand-signal)/0.7)] focus-visible:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => choose(null)}
              aria-pressed={field === null}
              data-testid="glossary-field-all"
              className={`rounded-full border px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] transition-colors ${
                field === null
                  ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                  : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
              }`}
            >
              All {TERMS.length}
            </button>
            {FIELDS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => choose(name)}
                aria-pressed={field === name}
                data-testid={`glossary-field-${name}`}
                className={`rounded-full border px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] transition-colors ${
                  field === name
                    ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                }`}
              >
                {FIELD_LABEL[name]} {counts.get(name) ?? 0}
              </button>
            ))}
          </div>

          <p
            className="mt-5 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="glossary-count"
          >
            {shown.length} {pluralise(shown.length, "term")}
            {field ? ` in ${FIELD_LABEL[field].toLowerCase()}` : ""}
            {query ? ` matching "${query}"` : ""}
          </p>

          <div className="mt-6 space-y-3" data-testid="glossary-list">
            {shown.map((term) => {
              const slug = slugFor(term);
              const isLinked = linked === slug;
              return (
                <article
                  key={slug}
                  id={slug}
                  data-testid={`glossary-term-${slug}`}
                  className={`scroll-mt-28 rounded-2xl border bg-[hsl(var(--brand-graphite)/0.5)] p-5 transition-colors hover:border-[hsl(var(--brand-signal)/0.4)] ${
                    isLinked
                      ? "border-[hsl(var(--brand-signal)/0.75)]"
                      : "border-[hsl(var(--brand-iron))]"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
                      <a
                        href={`#${slug}`}
                        onClick={(event) => follow(term, event)}
                        className="hover:text-[hsl(var(--brand-signal))]"
                      >
                        {term.term}
                      </a>
                      {term.expansion ? (
                        <span className="ml-3 font-mono-tight text-[12.5px] font-normal text-[hsl(var(--brand-ash))]">
                          {term.expansion}
                        </span>
                      ) : null}
                    </h2>
                    <button
                      type="button"
                      onClick={() => choose(term.field)}
                      className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))] hover:underline"
                    >
                      · {FIELD_LABEL[term.field]}
                    </button>
                  </div>

                  <p className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {term.definition}
                  </p>

                  {term.confusion ? (
                    <p
                      className="mt-4 border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                      data-testid={`glossary-confusion-${slug}`}
                    >
                      <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                        What people get wrong ·{" "}
                      </span>
                      {term.confusion}
                    </p>
                  ) : null}

                  {term.see?.length ? (
                    <p className="mt-4 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">
                      Next ·{" "}
                      {term.see.map((other, index) => {
                        const target = TERMS.find(
                          (candidate) => candidate.term.toLowerCase() === other.toLowerCase(),
                        );
                        /* CI resolves every cross-reference, so this cannot be null in a build. */
                        if (!target) return null;
                        return (
                          <span key={other}>
                            {index > 0 ? " · " : ""}
                            <a
                              href={`#${slugFor(target)}`}
                              onClick={(event) => follow(target, event)}
                              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
                            >
                              {other}
                            </a>
                          </span>
                        );
                      })}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>

          {shown.length === 0 ? (
            <p
              className="mt-6 rounded-2xl border border-[hsl(var(--brand-iron))] p-6 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="glossary-empty"
            >
              Nothing here matches that. The glossary only covers vocabulary the site actually
              uses, so a term missing from it is usually a subject nothing here has written about
              yet rather than an omission.
            </p>
          ) : null}

          <p className="mt-12 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            To use any of this rather than read it, the{" "}
            <Link
              href="/practice"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              practice hub
            </Link>{" "}
            has the exercises these terms come out of, and{" "}
            <Link
              href="/blog"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the archive
            </Link>{" "}
            is where they get used in anger.
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
