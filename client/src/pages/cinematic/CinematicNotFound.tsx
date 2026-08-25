import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";

/**
 * Five real posts, hard coded on purpose.
 *
 * Importing postIndex to pick these at runtime would pull the whole metadata
 * index into the chunk that every mistyped URL loads. Slugs are verified
 * against client/src/content/posts; if one is ever renamed, this list is the
 * thing to update.
 */
const POPULAR_POSTS = [
  {
    slug: "subnetting-practical-guide",
    title: "Subnetting Made Practical: A Real-World Guide",
  },
  {
    slug: "wireshark-packet-analysis",
    title: "Practical Packet Analysis with Wireshark",
  },
  {
    slug: "vlan-segmentation-guide",
    title: "Network Segmentation with VLANs: A Practical Guide",
  },
  {
    slug: "nmap-scanning-techniques",
    title: "Nmap Scanning Techniques for Network Discovery",
  },
  {
    slug: "ncl-competition-lessons",
    title: "Lessons from Competing in the National Cyber League",
  },
];

export function CinematicNotFound() {
  useSEO({
    title: "404 · Signal Lost | Max Doubin",
    description:
      "That path does not exist. Search the Field Notes archive, or jump to the writing, the browser tools, or the home page.",
    canonical: "https://maxdoubin.com/404",
    ogType: "website",
    // Every mistyped URL renders this page. Indexing it would put an error
    // page in the results for arbitrary paths.
    noindex: true,
  });

  const [location, navigate] = useLocation();
  const [query, setQuery] = useState("");

  // wouter gives the pathname without the query string, which is exactly what
  // belongs in the shell transcript below.
  const attempted = location && location !== "/" ? location : "/404";
  const command = attempted.replace(/^\/+/, "").split("/")[0] || "404";

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/blog?q=${encodeURIComponent(trimmed)}` : "/blog");
  }

  return (
    <CinematicLayout skipPreloader>
      <div
        data-testid="section-cinematic-not-found"
        className="relative px-6 pb-32 pt-32 md:px-10"
      >
        <div className="mx-auto max-w-[860px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Signal · Lost
            </div>
            <h1
              data-testid="text-404-code"
              className="mt-4 font-display text-[clamp(2.5rem,7vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]"
            >
              4<span className="signal-text">0</span>4: no such path.
            </h1>
            <p className="mt-6 max-w-[58ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Nothing is served at that address. The page may have been renamed, the link may have
              been truncated in transit, or the path may never have existed. Everything below is
              still here.
            </p>
          </header>

          {/* A <pre> maps to a generic element, which many screen readers will
              not announce an aria-label on. figure takes a name properly. */}
          <figure className="mt-10 overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
            <figcaption className="sr-only">
              Terminal session showing the failed request for {attempted}
            </figcaption>
            <div className="flex items-center gap-2 border-b border-[hsl(var(--brand-iron))] px-4 py-3">
              <span aria-hidden className="h-[9px] w-[9px] rounded-full bg-[hsl(var(--brand-danger))]" />
              <span aria-hidden className="h-[9px] w-[9px] rounded-full bg-[hsl(var(--brand-amber))]" />
              <span aria-hidden className="h-[9px] w-[9px] rounded-full bg-[hsl(var(--brand-signal))]" />
              <span className="ml-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                maxdoubin.com · shell
              </span>
            </div>

            <pre className="overflow-x-auto p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] md:p-6 md:text-[13px]">
              <code>
                <Prompt />
                <span className="text-[hsl(var(--brand-bone))]">cat .{attempted}</span>
                {"\n"}
                <span className="text-[hsl(var(--brand-danger))]">
                  cat: .{attempted}: No such file or directory
                </span>
                {"\n"}
                <Prompt />
                <span className="text-[hsl(var(--brand-bone))]">{command}</span>
                {"\n"}
                <span className="text-[hsl(var(--brand-danger))]">
                  {command}: command not found
                </span>
                {"\n"}
                <Prompt />
                <span className="text-[hsl(var(--brand-bone))]">ls</span>
                {"\n"}
                <span className="text-[hsl(var(--brand-signal))]">
                  blog{"  "}tools{"  "}archive{"  "}projects{"  "}resume{"  "}contact
                </span>
                {"\n"}
                <Prompt />
                <span
                  aria-hidden
                  className="inline-block h-[1em] w-[0.55em] translate-y-[0.15em] animate-pulse bg-[hsl(var(--brand-signal))]"
                />
              </code>
            </pre>
          </figure>

          <section aria-labelledby="notfound-search-heading" className="mt-14">
            <h2
              id="notfound-search-heading"
              className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]"
            >
              Search the archive
            </h2>
            <p className="mt-3 max-w-[58ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Over two hundred technical articles on networking, security, Linux, storage, and
              operations. If you arrived looking for something specific, start here.
            </p>

            <form onSubmit={handleSearch} role="search" className="mt-5">
              <label
                htmlFor="notfound-search"
                className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
              >
                Query
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input
                  id="notfound-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="subnetting, wireshark, vlan..."
                  data-testid="input-404-search"
                  className="w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                />
                <button
                  type="submit"
                  data-testid="button-404-search"
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  Search Field Notes
                </button>
              </div>
            </form>
          </section>

          <section aria-labelledby="notfound-posts-heading" className="mt-14">
            <h2
              id="notfound-posts-heading"
              className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]"
            >
              Start with these
            </h2>
            <ul className="mt-5 divide-y divide-[hsl(var(--brand-iron)/0.6)] border-y border-[hsl(var(--brand-iron)/0.6)]">
              {POPULAR_POSTS.map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/blog/${post.slug}`}
                    data-testid={`link-404-post-${post.slug}`}
                    className="flex min-h-[44px] items-center justify-between gap-4 py-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))] transition-colors hover:text-[hsl(var(--brand-signal))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                  >
                    <span className="max-w-[62ch]">{post.title}</span>
                    <span aria-hidden className="shrink-0 text-[hsl(var(--brand-ash))]">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="notfound-elsewhere-heading" className="mt-14">
            <h2
              id="notfound-elsewhere-heading"
              className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]"
            >
              Or go somewhere that exists
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <RecoveryLink
                href="/tools"
                testId="link-404-tools"
                label="Tools"
                detail="Subnet arithmetic, packet headers, ciphers, and encoders. All in the browser."
              />
              <RecoveryLink
                href="/archive"
                testId="link-404-archive"
                label="Archive"
                detail="Every article, listed in one place, by date and by tag."
              />
              <RecoveryLink
                href="/"
                testId="link-404-home"
                label="Home"
                detail="Back to the start, and the rest of the site from there."
              />
            </div>
          </section>

          <p className="mt-14 font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
            // trace dropped · returning to main
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}

function Prompt() {
  return (
    <span className="text-[hsl(var(--brand-ash))]">
      max@maxdoubin<span className="text-[hsl(var(--brand-cyan))]">:~</span>${" "}
    </span>
  );
}

function RecoveryLink({
  href,
  label,
  detail,
  testId,
}: {
  href: string;
  label: string;
  detail: string;
  testId: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="block rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
    >
      <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
        {label}
      </span>
      <span className="mt-2 block font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
        {detail}
      </span>
    </Link>
  );
}

export default CinematicNotFound;
