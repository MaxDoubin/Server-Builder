import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { siteConfig } from "@/lib/siteConfig";

const STACK = [
  {
    name: "React 18 and TypeScript",
    role: "Application",
    detail:
      "One application, a lot of shared structure. Types are what stop a rename in a shared config file from quietly breaking a page nobody opened during review.",
  },
  {
    name: "wouter",
    role: "Routing",
    detail:
      "A router measured in kilobytes. On a static site the router is plumbing, and plumbing should not be the second largest dependency.",
  },
  {
    name: "Tailwind CSS",
    role: "Styling",
    detail:
      "Design tokens defined once as CSS custom properties, used everywhere as utilities. No stylesheet drifting away from the markup it belongs to.",
  },
  {
    name: "Framer Motion",
    role: "Component motion",
    detail:
      "Enter and exit transitions, staggered reveals, and the interactive card behaviour. Declarative, and it respects a reduced motion preference.",
  },
  {
    name: "GSAP and Lenis",
    role: "Scroll",
    detail:
      "GSAP drives the pinned scroll scenes on the home page. Lenis smooths the scroll itself. Both are doing work Framer is not designed for.",
  },
  {
    name: "React Three Fiber and three.js",
    role: "3D",
    detail:
      "The data center scene is real geometry with real lighting, so it needs a real renderer. It is also the heaviest thing on the site, which shaped most of the build configuration below.",
  },
  {
    name: "marked",
    role: "Markdown",
    detail:
      "Posts are markdown files. marked renders them in the browser, and the same library renders them again at build time inside the prerenderer.",
  },
  {
    name: "Vite",
    role: "Build",
    detail:
      "Fast builds, and manual control over chunk splitting, which this site needs more than most sites do.",
  },
  {
    name: "Cloudflare Pages",
    role: "Hosting",
    detail:
      "Static files on an edge network. There is no application server, which means there is no application server to patch, misconfigure, or compromise.",
  },
];

const DECISIONS = [
  {
    id: "one-article",
    title: "A reader downloads one article, not two hundred and thirty six",
    body: [
      "The archive is 236 posts. They used to live in one TypeScript module, which meant opening a single article pulled in roughly 1.1MB of the other 235 before a word appeared on screen.",
      "Now each post body is its own markdown file under content/posts, loaded through a dynamic import, so Vite emits one chunk per article. Metadata (title, date, tags, excerpt, word count) stays in a generated index that is cheap to hold in memory, which is why the listing page can show a read time for every post without touching a single body. Word counts are precomputed at build time for exactly that reason: the listing was calling split() on the full text of every article just to render a number.",
    ],
  },
  {
    id: "react-chunk",
    title: "React is pinned to its own chunk so the entry cannot drag in the 3D engine",
    body: [
      "Left to itself, Rollup parks a shared dependency in whichever chunk happens to claim it first. React and Vite's preload helper landed inside the react-three-fiber chunk. The entry bundle then had to statically import react-three-fiber, which statically imports three, purely to reach jsx() and the preload helper.",
      "The result was that every visitor downloaded roughly 950KB of WebGL before the page could render, including readers of the blog who would never open a canvas. The build config now pins React, the scheduler, and the preload helper into a chunk that r3f cannot absorb, and quarantines three, r3f, GSAP, Lenis, marked, and the post archive into chunks of their own.",
    ],
  },
  {
    id: "prerender",
    title: "Every page is prerendered to static HTML",
    body: [
      "After the Vite build, a Node script walks every route and writes a real HTML file per page with the correct title, description, canonical link, Open Graph tags, and JSON-LD already in the head. Blog pages go further: the full article, rendered from markdown at build time, is written into the root element.",
      "A crawler that does not execute JavaScript therefore sees the complete article, not a spinner. React's createRoot takes over the same element when the bundle loads, and because the content matches there is no flash for a human reader.",
      "The prerenderer also writes the onward links a crawler needs. The React page renders previous, next, and related posts, but a non-executing crawler used to see only a link back to the index, which made all 236 posts dead ends on the first pass. Those links are now in the static HTML too.",
    ],
  },
  {
    id: "css-transition",
    title: "The page transition is CSS, because the JavaScript version could hide the site",
    body: [
      "The route fade used to be a Framer Motion wrapper animating opacity from 0 to 1. Every route except the home page is a lazily loaded chunk behind Suspense, and Suspense sits inside that wrapper. Framer wrote opacity: 0 to the DOM, the child suspended, and the enter animation never started. It never recovered: the wrapper held opacity: 0 indefinitely. The page rendered, laid out, and was completely invisible. Clicking any navigation link produced a blank screen.",
      "It is a CSS keyframe now. A keyframe is owned by the compositor rather than a React lifecycle, and opacity: 1 is the element's natural state, so the worst case for the animation failing is that the page simply appears. A page transition is decoration. It must never be the thing that decides whether the site is visible.",
      "The same wrapper carries a second constraint. transform, filter, backdrop-filter, perspective, contain, and will-change all create a containing block, and a fixed element resolves against the nearest one. Framer leaves an animated property on the element after the transition ends, so a stray filter: blur(0px) there would silently make this div the containing block for the whole application, and GSAP's pinned hero would scroll away instead of pinning. Opacity does not create a containing block. That is why the transition animates nothing else.",
    ],
  },
  {
    id: "chunk-retry",
    title: "Chunk loads retry themselves",
    body: [
      "Right after a deploy, a browser can be holding stale HTML that references chunk paths the build has already replaced. The first dynamic import then fails with a generic loading error.",
      "Every lazy route is wrapped in a loader that retries a few times with exponential backoff, and a route level error boundary tries one silent remount before it shows anything to the reader. A transient network blip on first load should not put a reload button in front of someone.",
    ],
  },
  {
    id: "no-backend",
    title: "There is no backend, and the API proves it",
    body: [
      "The site deploys as static files. The handful of components that call /api/ endpoints still work, because a tiny interceptor installed before anything else can fetch rewrites those calls to an in-browser implementation.",
      "That implementation reaches the shared storage layer and pulls in a runtime schema validator with it, roughly 180KB, so it is imported on the first /api/ request rather than at startup. A reader who only reads the blog never fetches it. State that persists (theme, reading position, simulator saves) lives in localStorage in the reader's own browser, because there is nowhere else for it to go.",
    ],
  },
];

export function CinematicColophon() {
  useSEO({
    title: "Colophon | Max Doubin",
    description:
      "How maxdoubin.com is built: React and TypeScript, Vite with manual chunk splitting, static prerendering so crawlers read full articles, no backend.",
    canonical: "https://maxdoubin.com/colophon",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Build · Colophon
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              How this site is built.
            </h1>
            <p className="mt-6 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              This page is the technical write up of the site you are reading, including the
              decisions that were wrong the first time. A portfolio that claims infrastructure work
              should be willing to show its own build.
            </p>
          </header>

          <section aria-labelledby="colophon-stack-heading" className="mt-16">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Colophon · Stack
            </div>
            <h2
              id="colophon-stack-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              The stack
            </h2>
            <dl className="mt-6 divide-y divide-[hsl(var(--brand-iron)/0.6)] border-y border-[hsl(var(--brand-iron)/0.6)]">
              {STACK.map((item) => (
                <div key={item.name} className="py-5">
                  <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono-tight text-sm font-medium text-[hsl(var(--brand-bone))]">
                      {item.name}
                    </span>
                    <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      {item.role}
                    </span>
                  </dt>
                  <dd className="mt-2 max-w-[68ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {item.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="colophon-decisions-heading" className="mt-20">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Colophon · Engineering
            </div>
            <h2
              id="colophon-decisions-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              Decisions that mattered
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Most of these exist because the obvious version was measurably worse. The comments
              explaining them are still in the source.
            </p>

            <div className="mt-8 space-y-10">
              {DECISIONS.map((decision, index) => (
                <article
                  key={decision.id}
                  id={decision.id}
                  className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 backdrop-blur-sm"
                >
                  <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <h3 className="mt-2 max-w-[52ch] font-display text-lg font-medium leading-snug tracking-tight text-[hsl(var(--brand-bone))] md:text-xl">
                    {decision.title}
                  </h3>
                  <div className="mt-4 space-y-3">
                    {decision.body.map((paragraph) => (
                      <p
                        key={paragraph.slice(0, 40)}
                        className="max-w-[70ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="colophon-type-heading" className="mt-20">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Colophon · Type and colour
            </div>
            <h2
              id="colophon-type-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              Type and colour
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm">
                <h3 className="font-display text-base font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                  Four typefaces, each with a job
                </h3>
                <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Space Grotesk and Inter for display and body, JetBrains Mono for anything that is
                  data, a label, or code, and Orbitron for the small technical eyebrow labels. They
                  load from Google Fonts with a preconnect and a preloaded stylesheet, which is the
                  only third party request a page makes.
                </p>
              </div>
              <div className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm">
                <h3 className="font-display text-base font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                  One accent, used sparingly
                </h3>
                <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Obsidian background, bone text, and a single signal lime accent, all defined as
                  HSL custom properties so opacity variants come free. Colour is never the only
                  thing carrying meaning: every state that uses it also says what it is in words.
                </p>
              </div>
            </div>
          </section>

          <section aria-labelledby="colophon-absent-heading" className="mt-20">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Colophon · Absent
            </div>
            <h2
              id="colophon-absent-heading"
              className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              What is deliberately not here
            </h2>
            <ul className="mt-6 space-y-3">
              {[
                "No analytics and no tracking scripts. Nothing on this site reports what you read.",
                "No content management system. A post is a markdown file and a commit, so there is no admin login to secure and no database to back up.",
                "No comment system, no chat widget, no newsletter modal.",
                "No server. The whole site is static files, which is also the strongest security posture available to it.",
              ].map((line) => (
                <li
                  key={line}
                  className="flex gap-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                >
                  <span aria-hidden className="select-none text-[hsl(var(--brand-signal))]">
                    ·
                  </span>
                  <span className="max-w-[70ch]">{line}</span>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="colophon-source-heading"
            className="mt-20 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] p-6"
          >
            <h2
              id="colophon-source-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
            >
              Source and tools
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The software I use day to day is listed on the{" "}
              <Link
                href="/uses"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                uses page
              </Link>
              , and my code is at{" "}
              <a
                href={siteConfig.social.github.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[24px] items-center break-all py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                github.com/{siteConfig.social.github.handle}
              </a>
              . If something on this page is wrong, or you want detail on one of the decisions
              above, email{" "}
              <a
                href={`mailto:${siteConfig.email}`}
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

export default CinematicColophon;
