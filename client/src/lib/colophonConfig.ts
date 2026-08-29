/**
 * The stack list and the decision log behind /colophon.
 *
 * Extracted from the page component so the prerenderer renders the same
 * entries into the static HTML rather than shipping an empty document.
 */

export const STACK = [
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

export const DECISIONS = [
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
