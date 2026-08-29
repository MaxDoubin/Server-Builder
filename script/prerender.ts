/**
 * Static pre-renderer for maxdoubin.com
 *
 * Runs after `vite build` and writes per-page HTML files into dist/public.
 * Each file contains correct <title>, <meta>, <link rel="canonical">, JSON-LD
 * schema, and the full rendered blog content inside the <div id="root"> so
 * Google can read everything without executing JavaScript.
 *
 * React's createRoot will take over the root div when JS loads. The page
 * content is identical, so there is no visible flash for users.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { Marked } from "marked";
import { uniqueHeadingId } from "../client/src/lib/headingSlug";

// ─── import blog data (tsx handles .ts extensions at runtime) ────────────────
// postIndex is plain data with no Vite-only syntax in it, so it imports
// cleanly here. lib/blogPosts.ts cannot: it reaches for the bodies through
// import.meta.glob, which only exists inside a Vite build.
const { postIndex } = await import("../client/src/lib/postIndex.ts");
const { pageTitle } = await import("../client/src/lib/pageTitle.ts");
const { NCL_GUIDES: NCL_GUIDE_DATA } = await import("../client/src/lib/nclGuides.ts");
const { getTagPage } = await import("../client/src/lib/tagPages.ts");
const { EXAMS } = await import("../client/src/lib/examObjectives.ts");
const { TAG_PAGES } = await import("../client/src/lib/tagPages.ts");
const { TOOLS } = await import("../client/src/lib/toolsRegistry.ts");
const { formatPostDate } = await import("../client/src/lib/formatDate.ts");
const { FAQS } = await import("../client/src/lib/faqs.ts");
const { KIT_SESSIONS, KIT_RULES, KIT_RESOURCES } = await import("../client/src/lib/clubKit.ts");
const { siteConfig, PRESS } = await import("../client/src/lib/siteConfig.ts");
const { clubConfig } = await import("../client/src/lib/clubConfig.ts");
const { nowConfig } = await import("../client/src/lib/nowConfig.ts");
const { usesConfig } = await import("../client/src/lib/usesConfig.ts");
const { readingPaths } = await import("../client/src/lib/readingPaths.ts");
const { TIMELINE_GROUPS } = await import("../client/src/lib/timelineConfig.ts");
const { ALL_CERTS } = await import("../client/src/lib/certConfig.ts");
const { ROADMAP, ROADMAP_UPDATED, roadmapCounts } = await import("../client/src/lib/roadmap.ts");
const { CHANGELOG } = await import("../client/src/lib/changelog.ts");
const { DECKS } = await import("../client/src/lib/flashcardDecks.ts");
const { LINK_GROUPS } = await import("../client/src/lib/linksConfig.ts");
const { STACK, DECISIONS } = await import("../client/src/lib/colophonConfig.ts");
const { READERS } = await import("../client/src/lib/subscribeConfig.ts");
const { ANSWERED } = await import("../client/src/lib/askConfig.ts");
const { COVERS, TAKEAWAYS } = await import("../client/src/lib/campsConfig.ts");
const { DAY_CHECKLIST, MISTAKES } = await import("../client/src/lib/nclHubConfig.ts");
const { TOOL_NOTES } = await import("../client/src/lib/toolNotes.ts");
const POSTS_DIR = path.resolve("client/src/content/posts");

/** One post's markdown, straight off disk. */
async function readBody(slug: string): Promise<string> {
  return readFile(path.join(POSTS_DIR, `${slug}.md`), "utf-8");
}

// ─── constants ───────────────────────────────────────────────────────────────
const SITE_URL = "https://maxdoubin.com";
const DIST = path.resolve("dist/public");
const BATCH = 10; // blog posts per parallel batch

const marked = new Marked({ gfm: true, breaks: true });

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Replace a meta tag's attribute value in raw HTML using a regex. */
function replaceMeta(
  html: string,
  selector: string,
  attrName: string,
  value: string,
): string {
  // Match e.g. <meta property="og:title" content="...">
  // The selector here is something like: meta[property="og:title"]
  // We convert it into a regex that matches the attribute value.
  const escaped = selector.replace(/[\[\]"]/g, (c) =>
    ({ "[": "\\[", "]": "\\]", '"': '"' })[c] ?? c,
  );
  const re = new RegExp(
    `(<${escaped}[^>]*\\s${attrName}=")([^"]*)(")`,
    "i",
  );
  return html.replace(re, `$1${esc(value)}$3`);
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
}

function replaceCanonical(html: string, url: string): string {
  return html.replace(
    /(<link rel="canonical" href=")[^"]*(")/,
    `$1${url}$2`,
  );
}

function injectBeforeHead(html: string, injection: string): string {
  return html.replace("</head>", `${injection}\n</head>`);
}

/**
 * Site navigation, appended to every prerendered page.
 *
 * The real footer is a React component, so it exists only after hydration.
 * A crawler on its first pass sees the prerendered body and nothing else,
 * which meant nine pages were linked from nowhere at all: /now, /uses,
 * /projects, /paths, /timeline, /links, /subscribe, /roadmap and
 * /study-timer were each reachable only from themselves. They were in the
 * sitemap, so Google knew the URLs existed, but a URL with no inbound link
 * is a URL nothing vouches for, and it is crawled last if at all.
 *
 * This is the same set of destinations the rendered footer offers. It is
 * replaced by React on hydration like the rest of the prerendered body, so
 * readers never see it and it cannot drift visually from the real footer.
 */
const SITE_NAV = `
<nav aria-label="Site">
  <a href="${SITE_URL}/">Home</a>
  <a href="${SITE_URL}/blog">Field Notes</a>
  <a href="${SITE_URL}/topics">Topics</a>
  <a href="${SITE_URL}/archive">Archive</a>
  <a href="${SITE_URL}/projects">Projects</a>
  <a href="${SITE_URL}/tools">Tools</a>
  <a href="${SITE_URL}/study">Study</a>
  <a href="${SITE_URL}/data">Open data</a>
  <a href="${SITE_URL}/game">Simulator</a>
  <a href="${SITE_URL}/ncl">National Cyber League</a>
  <a href="${SITE_URL}/cyber-club">Cyber Club</a>
  <a href="${SITE_URL}/cyber-club/kit">Cyber Club in a Box</a>
  <a href="${SITE_URL}/coding-camps">Coding camps</a>
  <a href="${SITE_URL}/certifications">Certifications</a>
  <a href="${SITE_URL}/paths">Paths</a>
  <a href="${SITE_URL}/roadmap">Roadmap</a>
  <a href="${SITE_URL}/resume">Resume</a>
  <a href="${SITE_URL}/timeline">Timeline</a>
  <a href="${SITE_URL}/now">Now</a>
  <a href="${SITE_URL}/uses">Uses</a>
  <a href="${SITE_URL}/faq">FAQ</a>
  <a href="${SITE_URL}/links">Links</a>
  <a href="${SITE_URL}/subscribe">Subscribe</a>
  <a href="${SITE_URL}/study-timer">Study timer</a>
  <a href="${SITE_URL}/changelog">Changelog</a>
  <a href="${SITE_URL}/colophon">Colophon</a>
  <a href="${SITE_URL}/contact">Contact</a>
</nav>`;

function injectRootContent(html: string, content: string): string {
  // Replace the spinner placeholder with pre-rendered content.
  // React's createRoot overwrites this on hydration. Purely for crawlers.
  return html.replace(
    /<div id="root">[\s\S]*?<\/div>\s*<style>/,
    `<div id="root">${content}${SITE_NAV}</div>\n    <style>`,
  );
}

// ─── page injection ───────────────────────────────────────────────────────────

interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogType?: string;
  ogImage?: string;
  ogImageAlt?: string;
  schema?: string;
  rootContent?: string;
  /** Keep a page out of the index. For interactive pages with little prose. */
  noindex?: boolean;
}

function buildPageHtml(base: string, meta: PageMeta): string {
  let html = base;
  const {
    title,
    description,
    canonical,
    ogType = "website",
    ogImage = `${SITE_URL}/images/og-image.jpg`,
    ogImageAlt = "Max Doubin",
    schema,
    rootContent,
    noindex = false,
  } = meta;

  html = replaceTitle(html, title);
  html = replaceCanonical(html, canonical);

  // <meta name="description">
  html = html.replace(
    /(<meta name="description" content=")[^"]*(")/,
    `$1${esc(description)}$2`,
  );

  // Open Graph
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/,   `$1${esc(title)}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/,`$1${esc(description)}$2`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/,     `$1${canonical}$2`);
  html = html.replace(/(<meta property="og:type" content=")[^"]*(")/,    `$1${ogType}$2`);
  html = html.replace(/(<meta property="og:image" content=")[^"]*(")/,   `$1${ogImage}$2`);
  html = html.replace(/(<meta property="og:image:alt" content=")[^"]*(")/,`$1${esc(ogImageAlt)}$2`);

  // Twitter
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/,      `$1${esc(title)}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/,`$1${esc(description)}$2`);
  html = html.replace(/(<meta name="twitter:image" content=")[^"]*(")/,      `$1${ogImage}$2`);
  html = html.replace(/(<meta name="twitter:image:alt" content=")[^"]*(")/,  `$1${esc(ogImageAlt)}$2`);
  html = html.replace(/(<meta name="twitter:url" content=")[^"]*(")/,        `$1${canonical}$2`);

  if (noindex) {
    html = html.replace(
      /(<meta name="robots" content=")[^"]*(")/,
      "$1noindex, follow$2",
    );
  }

  if (schema) html = injectBeforeHead(html, schema);
  // Always inject, even with no body: the nav has to reach every page, and
  // the pages with no body of their own are exactly the ones that were
  // otherwise linked from nowhere.
  html = injectRootContent(html, rootContent ?? "");

  return html;
}


// ─── write helpers ────────────────────────────────────────────────────────────

/**
 * Write one prerendered page.
 *
 * As <path>.html, not <path>/index.html, because of how Cloudflare Pages
 * resolves a request. Given foo/index.html it answers /foo with a 308 to
 * /foo/ and serves the page on the second request. Given foo.html it answers
 * /foo with the page, 200, first time.
 *
 * That mattered because every canonical tag, every sitemap entry and every
 * internal link on this site uses the extensionless form. All 331 of them
 * were redirecting: two round trips per page for every visitor and every
 * crawl, and a canonical URL that did not itself resolve.
 *
 * Verified against the live host before making the change: /404 returned 200
 * from 404.html while /404.html returned a 308, which is the same rule in the
 * other direction.
 */

/*
  Stamp ids onto the h2 and h3 of a rendered article.

  Without these a section is not linkable until the page hydrates: the
  table of contents assigns ids client side, so a visitor arriving on a
  #section URL, and every crawler, sees headings with no targets at all.
  Google cannot offer a jump to a section it cannot address.

  The slug rule is shared with usePostHeadings rather than reimplemented, so
  the id the crawler indexes is the id the page still has after hydration.

  Heading text can contain inline markup like <code>, and the client derives
  its slug from textContent, so tags are stripped and entities decoded before
  slugifying. scroll-margin-top matches the client's NAV_OFFSET, otherwise an
  anchor jump lands underneath the fixed nav.
*/
function addHeadingIds(html: string): string {
  const used = new Set<string>();
  return html.replace(
    /<(h[23])>([\s\S]*?)<\/\1>/g,
    (whole, tag: string, inner: string) => {
      const text = inner
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return whole;
      const id = uniqueHeadingId(text, used);
      return `<${tag} id="${id}" style="scroll-margin-top:96px">${inner}</${tag}>`;
    },
  );
}

async function writePage(
  relDir: string,
  base: string,
  meta: PageMeta,
): Promise<void> {
  const target = path.join(DIST, `${relDir}.html`);
  await mkdir(path.dirname(target), { recursive: true });

  /*
    Standalone pages get their own social card when one has been generated,
    the same way posts do. /resume, /projects and /certifications are the
    pages most likely to be sent to an admissions officer or a recruiter, and
    they used to share the one generic site image with everything else, so a
    shared link said nothing about what it pointed at.

    Resolved here rather than at each call site so a new page picks its card
    up automatically: add the slug to STANDALONE in scripts-ci/make-og-images.py,
    regenerate, and this finds it. Falls back to the generic image when no
    card exists, which is correct for the home page and for utility pages.
  */
  const cardPath = `/images/og/${relDir}.jpg`;
  const ogImage =
    meta.ogImage ??
    (existsSync(path.join(DIST, cardPath.slice(1)))
      ? `${SITE_URL}${cardPath}`
      : undefined);

  const html = buildPageHtml(base, { ...meta, ogImage });
  await writeFile(target, html, "utf-8");
}

/**
 * The 404 document, served by Cloudflare Pages with a real 404 status.
 *
 * Pages looks for 404.html at the output root when a request matches neither
 * a static file nor a rewrite in _redirects. It has to sit at the root as
 * 404.html rather than 404/index.html, which is why this does not go through
 * writePage.
 *
 * It carries the app shell, so React boots and the client router renders the
 * real not-found page. The crawler gets the status code it needs before any
 * of that runs.
 */
async function writeNotFoundPage(base: string): Promise<void> {
  const html = buildPageHtml(base, {
    title: "Page not found | Max Doubin",
    description:
      "That page does not exist on maxdoubin.com. The writing is in Field Notes and everything else is linked from the home page.",
    // Stripped again below. buildPageHtml requires one, but a page that does
    // not exist has no canonical URL to point at, and claiming one that also
    // does not exist just leaves a dead reference in the HTML.
    canonical: `${SITE_URL}/404`,
    noindex: true,
    rootContent: `
<main>
  <h1>Page not found</h1>
  <p>
    There is nothing at this address. It may have been renamed, or the link
    that brought you here may have been wrong.
  </p>
  <ul>
    <li><a href="${SITE_URL}/">Home</a></li>
    <li><a href="${SITE_URL}/blog">Field Notes, the writing archive</a></li>
    <li><a href="${SITE_URL}/topics">Topics</a></li>
    <li><a href="${SITE_URL}/tools">Browser tools</a></li>
    <li><a href="${SITE_URL}/sitemap.xml">Sitemap</a></li>
  </ul>
</main>`,
  });
  await writeFile(
    path.join(DIST, "404.html"),
    html.replace(/\s*<link rel="canonical"[^>]*>/i, ""),
    "utf-8",
  );
}

// ─── blog post pre-render ─────────────────────────────────────────────────────

async function prerenderPost(
  base: string,
  post: (typeof postIndex)[number],
  all: (typeof postIndex)[number][] = [],
): Promise<void> {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const body = await readBody(post.slug);
  /*
    Social preview uses the branded card, not the raw cover.

    A shared link used to show the bare photo, so every post looked alike in
    a feed and none of them said what they were. The cards in images/og
    carry the title and tags baked in at 1200x630, generated by
    scripts-ci/make-og-images.py. Scrapers do not run JavaScript, so setting
    this here in the static HTML is what actually reaches them.

    Falls back to the cover if a card is missing, which is better than
    emitting a URL that 404s.
  */
  const cardPath = `/images/og/${post.slug}.jpg`;
  const hasCard = existsSync(path.join(DIST, cardPath.slice(1)));
  const ogImage = `${SITE_URL}${hasCard ? cardPath : post.coverImage}`;
  const coverImage = `${SITE_URL}${post.coverImage}`;

  const schema = `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "@id": url,
  headline: post.title,
  description: post.excerpt,
  datePublished: post.date,
  dateModified: post.updated ?? post.date,
  url,
  image: { "@type": "ImageObject", url: coverImage, contentUrl: coverImage },
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin", url: SITE_URL },
  publisher: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin", url: SITE_URL },
  isPartOf: { "@type": "Blog", "@id": `${SITE_URL}/#blog` },
  keywords: post.tags.join(", "),
  inLanguage: "en-US",
  wordCount: post.wordCount,
  mainEntityOfPage: { "@type": "WebPage", "@id": url },
})}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Field Notes", item: `${SITE_URL}/blog` },
    { "@type": "ListItem", position: 3, name: post.title, item: url },
  ],
})}
</script>`;

  // Full article HTML. Google reads this on the first HTML crawl
  const contentHtml = addHeadingIds(await Promise.resolve(marked.parse(body)));
  /*
    Formatted from the string parts, not through a Date.

    `new Date("2026-05-09")` is UTC midnight, and toLocaleDateString then
    renders it in whatever zone the machine is in. On a build runner set to
    anything west of Greenwich that prints the day before, so the static
    HTML would disagree with what the browser shows. A post date is a
    calendar date, not an instant, and should never touch a timezone.
  */
  const dateStr = formatPostDate(post.date);
  const updatedStr = post.updated
    ? ` · Rewritten <time datetime="${post.updated}">${formatPostDate(post.updated)}</time>`
    : "";
  const readMins = Math.max(1, Math.ceil(post.wordCount / 200));
  // Point each tag at its topic hub where one exists. Every tag on every
  // post used to link to /blog, so roughly 700 crawler-visible links pointed
  // at the index and the 26 hubs had almost no inbound links from the
  // archive they summarise. Tags without a hub still go to the index.
  const tagLinks = post.tags
    .map((t) => {
      const href = getTagPage(t) ? `${SITE_URL}/topics/${t}` : `${SITE_URL}/blog`;
      return `<a href="${href}">${esc(t)}</a>`;
    })
    .join(" ");

  /*
    Onward links in the static HTML.

    The React page renders neighbours and related posts, but a crawler that
    does not execute JavaScript only ever saw a link back to the index, so
    every one of 236 posts was a dead end on the first pass. These mirror
    what the page shows.
  */
  const idx = all.findIndex((p) => p.slug === post.slug);
  const newer = idx > 0 ? all[idx - 1] : undefined;
  const older = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : undefined;

  const tagCounts = new Map<string, number>();
  all.forEach((p) => p.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));
  const related = all
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({
      p,
      score: p.tags
        .filter((t) => post.tags.includes(t))
        .reduce((sum, t) => sum + 1 / (tagCounts.get(t) ?? 1), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.p.date < b.p.date ? 1 : -1))
    .slice(0, 3)
    .map((x) => x.p);

  const link = (p: (typeof postIndex)[number]) =>
    `<a href="${SITE_URL}/blog/${p.slug}">${esc(p.title)}</a>`;

  const neighbourNav =
    older || newer
      ? `<nav aria-label="Adjacent posts">${
          older ? `<span>Previous: ${link(older)}</span>` : ""
        }${newer ? `<span>Next: ${link(newer)}</span>` : ""}</nav>`
      : "";

  const relatedNav = related.length
    ? `<aside aria-label="Related posts"><h2>Related</h2><ul>${related
        .map((r) => `<li>${link(r)}</li>`)
        .join("")}</ul></aside>`
    : "";

  const rootContent = `
<main>
  <a href="${SITE_URL}/blog">← Back to Blog</a>
  <img src="${coverImage}" alt="${esc(post.title)}" width="800" height="320" />
  <article>
    <time datetime="${post.date}">${dateStr}</time>${updatedStr} · ${readMins} min read
    <h1>${esc(post.title)}</h1>
    <p>${esc(post.excerpt)}</p>
    <nav>${tagLinks}</nav>
    ${contentHtml}
  </article>
  ${neighbourNav}
  ${relatedNav}
</main>`;

  await writePage(`blog/${post.slug}`, base, {
    title: pageTitle(post.title),
    description: post.excerpt,
    canonical: url,
    ogType: "article",
    ogImage,
    ogImageAlt: post.title,
    schema,
    rootContent,
  });
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!existsSync(DIST)) {
    console.log("⚠  dist/public not found, skipping prerender");
    return;
  }

  const base = await readFile(path.join(DIST, "index.html"), "utf-8");
  const posts = postIndex.filter((p) => !p.draft);

  /*
    The home page had no prerendered body at all.

    Every other page goes through writePage, which injects content and the
    site nav. index.html is the Vite output that those pages are built FROM,
    so it never went through that path: a crawler's first pass at
    maxdoubin.com found an empty div and a spinner. That is the most
    important page on the site.

    Written last, after the base has been used as the template for everything
    else, so this content cannot leak into the other 332 pages.
  */
  const homeContent = `
<main>
  <h1>Max Doubin</h1>
  <p>
    Cybersecurity student in Las Vegas. This site is a working notebook:
    ${posts.length} articles on enterprise networking, servers, storage and
    security, each one sourced, plus browser tools, exam study material and an
    openly licensed hardware dataset.
  </p>
  <h2>Start here</h2>
  <ul>
    <li><a href="${SITE_URL}/blog">Field Notes</a>, ${posts.length} articles on infrastructure and security.</li>
    <li><a href="${SITE_URL}/topics">Topics</a>, the same archive grouped by subject.</li>
    <li><a href="${SITE_URL}/tools">Browser tools</a>, subnet and VLSM calculators, packet header references, hash identification and more.</li>
    <li><a href="${SITE_URL}/study">Certification study</a>, mapped to the published Security+, Network+ and CCNA exam objectives.</li>
    <li><a href="${SITE_URL}/data">Open rack hardware dataset</a>, power, heat, rack units and port counts as JSON and CSV under CC BY 4.0.</li>
    <li><a href="${SITE_URL}/game">Hyperscale</a>, a datacenter simulator running on real power and cooling maths.</li>
    <li><a href="${SITE_URL}/ncl">National Cyber League guides</a> for all nine scored categories.</li>
    <li><a href="${SITE_URL}/cyber-club/kit">Cyber Club in a Box</a>, a free twelve week plan for starting a school cybersecurity club.</li>
  </ul>
  <h2>About</h2>
  <ul>
    <li><a href="${SITE_URL}/resume">Resume</a> and <a href="${SITE_URL}/timeline">timeline</a>.</li>
    <li><a href="${SITE_URL}/projects">Projects</a>, <a href="${SITE_URL}/uses">uses</a> and <a href="${SITE_URL}/now">what I am working on now</a>.</li>
    <li><a href="${SITE_URL}/contact">Contact</a>.</li>
  </ul>
</main>`;

  // ── blog posts ──
  console.log(`Prerendering ${posts.length} blog posts...`);
  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH);
    await Promise.all(batch.map((p) => prerenderPost(base, p, posts)));
    process.stdout.write(`  ${Math.min(i + BATCH, posts.length)}/${posts.length}\r`);
  }
  console.log(`  ${posts.length}/${posts.length} done          `);

  // ── blog list ──
  const blogListSchema = `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Blog",
  "@id": `${SITE_URL}/blog`,
  name: "Max Doubin's Blog",
  url: `${SITE_URL}/blog`,
  description: "Technical writing on enterprise networking, cybersecurity, homelab infrastructure, and systems engineering.",
  author: { "@id": `${SITE_URL}/#person` },
  inLanguage: "en-US",
  blogPost: posts.slice(0, 20).map((p) => ({
    "@type": "BlogPosting",
    "@id": `${SITE_URL}/blog/${p.slug}`,
    headline: p.title,
    url: `${SITE_URL}/blog/${p.slug}`,
    datePublished: p.date,
    description: p.excerpt,
  })),
})}
</script>`;

  const blogRootContent = `
<main>
  <h1>Blog | Max Doubin</h1>
  <p>Technical writing on enterprise networking, cybersecurity, homelab infrastructure, and systems engineering.</p>
  <ul>
    ${posts
      .map(
        (p) =>
          `<li><a href="${SITE_URL}/blog/${p.slug}">${esc(p.title)}</a>: <span>${esc(p.excerpt)}</span></li>`,
      )
      .join("\n    ")}
  </ul>
</main>`;

  await writePage("blog", base, {
    title: "Blog | Max Doubin",
    description:
      "Technical writing on enterprise networking, cybersecurity, homelab infrastructure, and systems engineering by Max Doubin.",
    canonical: `${SITE_URL}/blog`,
    schema: blogListSchema,
    rootContent: blogRootContent,
  });

  /*
    Standalone pages.

    Every one of these is a real page in the router, so every one needs a
    static document. Without it a crawler following a link gets the SPA
    fallback: the home page's title, the home page's canonical, and no
    indication the target exists. Descriptions are per page and unique,
    which check-meta enforces.
  */
  const STANDALONE: Array<PageMeta & { dir: string }> = [
    {
      dir: "archive",
      title: "Archive | Max Doubin",
      description:
        "Every field note on maxdoubin.com in one chronological list, grouped by year and month, with tags and read times.",
      canonical: `${SITE_URL}/archive`,
    },
    {
      dir: "paths",
      title: "Reading paths | Max Doubin",
      description:
        "Four curated routes through the archive: networking from scratch, security fundamentals, AI meets infrastructure, and homelab operations.",
      canonical: `${SITE_URL}/paths`,
    },
    {
      dir: "now",
      title: "Now | Max Doubin",
      description:
        "What Max Doubin is focused on this month: certification study, what he is building, what he is reading, and what the South CTA Cyber Club is working on.",
      canonical: `${SITE_URL}/now`,
    },
    {
      dir: "uses",
      title: "Uses | Max Doubin",
      description:
        "The software Max Doubin actually uses: terminal and analysis tools, languages, virtualization, monitoring, and this site's own stack, with why for each.",
      canonical: `${SITE_URL}/uses`,
    },
    {
      dir: "resume",
      title: "Resume | Max Doubin",
      description:
        "Resume for Max Doubin: cybersecurity study at South Career Technical Academy, National Cyber League results, leadership roles, projects, and skills.",
      canonical: `${SITE_URL}/resume`,
    },
    {
      dir: "timeline",
      title: "Timeline | Max Doubin",
      description:
        "Competitions, awards, and milestones for Max Doubin, from National Cyber League results and certifications to leadership roles and press coverage.",
      canonical: `${SITE_URL}/timeline`,
    },
    {
      dir: "cyber-club",
      title: "South CTA Cyber Club | Max Doubin",
      description:
        "Join the Cyber Club at South Career Technical Academy in Las Vegas: capture the flag practice, a lab built to be broken, and no experience required.",
      canonical: `${SITE_URL}/cyber-club`,
    },
    {
      dir: "cyber-club/kit",
      title: "Cyber Club in a Box: a free 12 week plan | Max Doubin",
      description:
        "A free twelve week plan for starting a high school cybersecurity club: meeting plans, rules of engagement, a no budget materials list, and what kills clubs.",
      canonical: `${SITE_URL}/cyber-club/kit`,
    },
    {
      dir: "coding-camps",
      title: "Youth Coding Camps | Max Doubin",
      description:
        "Youth coding camps across the Las Vegas Valley taught by Max Doubin: what they cover, what a session looks like, and what a beginner takes home.",
      canonical: `${SITE_URL}/coding-camps`,
    },
    {
      dir: "colophon",
      title: "Colophon | Max Doubin",
      description:
        "How maxdoubin.com is built: React and TypeScript, Vite with manual chunk splitting, static prerendering so crawlers read full articles, no backend.",
      canonical: `${SITE_URL}/colophon`,
    },
    {
      dir: "faq",
      title: "Frequently Asked Questions | Max Doubin",
      description:
        "Answers about Max Doubin: what he studies, his National Cyber League placement, the South CTA Cyber Club, what he builds and teaches, and how to reach him.",
      canonical: `${SITE_URL}/faq`,
    },
    {
      dir: "links",
      title: "Links | Max Doubin",
      description:
        "Free and freemium resources Max Doubin recommends for learning networking and security: fundamentals, capture the flag practice, and certification prep.",
      canonical: `${SITE_URL}/links`,
    },
    {
      dir: "subscribe",
      title: "Subscribe | Max Doubin",
      description:
        "Follow the field notes by RSS. What a feed actually is, why it beats an algorithm, five readers worth trying, and the feed URL for maxdoubin.com.",
      canonical: `${SITE_URL}/subscribe`,
    },
    {
      dir: "study-timer",
      title: "Study timer | Max Doubin",
      description:
        "A pomodoro study timer that keeps correct time in a background tab, with configurable work and break lengths, a session counter and an optional chime.",
      canonical: `${SITE_URL}/study-timer`,
    },
    {
      dir: "ask",
      title: "Ask | Max Doubin",
      description:
        "Ask about networking, security, homelabs or competition. The page composes your question for email or GitHub and shows the text before anything is sent.",
      canonical: `${SITE_URL}/ask`,
    },
    {
      dir: "changelog",
      title: "Changelog | Max Doubin",
      description:
        "A plain-language history of what has changed on maxdoubin.com: speed work, accessibility fixes, new writing and new tools, dated and grouped by month.",
      canonical: `${SITE_URL}/changelog`,
    },
    {
      dir: "ncl",
      title: "National Cyber League Study Guide | Max Doubin",
      description:
        "What the National Cyber League is, how scoring works, how to prepare, and guides to all nine challenge categories, from a top 1 percent competitor.",
      canonical: `${SITE_URL}/ncl`,
      // The seven guides were reachable from nowhere: this index rendered its
      // list client side, so a crawler saw an empty page with no links out.
      rootContent: `
<main>
  <h1>National Cyber League study guide</h1>
  <p>
    The National Cyber League scores nine categories. Each guide below covers
    what that category tests, the tools worth knowing, a worked example, and
    the mistakes that cost the most time.
  </p>
  <ul>
${[...NCL_GUIDE_DATA]
  .sort((a, b) => a.order - b.order)
  .map(
    (g) =>
      `    <li><a href="${SITE_URL}/ncl/${g.slug}">${esc(g.category)}</a>: ${esc(g.tagline)}</li>`,
  )
  .join("\n")}
  </ul>
  <p>
    The competition itself is covered in the
    <a href="${SITE_URL}/blog">Field Notes archive</a>, and the
    <a href="${SITE_URL}/tools">browser tools</a> cover several of the same
    techniques.
  </p>
</main>`,
    },
    {
      dir: "certifications",
      title: "Certifications | Max Doubin",
      description:
        "An honest status board: CompTIA Tech+ earned, with Security+, Network+, and CCNA in progress, plus each exam's official domains and resources.",
      canonical: `${SITE_URL}/certifications`,
    },
    {
      // A trainer, not an article. Indexing it would put a page of controls
      // into results alongside the writing.
      dir: "flashcards",
      title: "Flashcards | Max Doubin",
      description:
        "A spaced-repetition flashcard trainer for networking, ports, security, Linux, and cryptography, with an SM-2 scheduler that plans each card's next review.",
      canonical: `${SITE_URL}/flashcards`,
      noindex: true,
    },
  ];

  /*
    The FAQ needs its schema and its answers in the first response.

    FAQPage markup that only appears after React runs is markup Google may
    never see, which made the rich result it was written for unreachable.
    Both are built from the same array the page renders, so they cannot
    disagree.
  */
  const faqSchema = `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${SITE_URL}/faq#faq`,
  url: `${SITE_URL}/faq`,
  inLanguage: "en-US",
  about: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
})}
</script>`;
  const faqContent = `
<main>
  <h1>Questions and answers</h1>
  <p>Straight answers to what people actually ask about Max Doubin.</p>
  ${FAQS.map(
    (item) => `<section><h2>${esc(item.q)}</h2><p>${esc(item.a)}</p></section>`,
  ).join("\n  ")}
  <nav><a href="${SITE_URL}/resume">Resume</a> · <a href="${SITE_URL}/blog">Field Notes</a> · <a href="${SITE_URL}/contact">Contact</a></nav>
</main>`;

  /*
    The claim ledger and the club plan are the two pages most likely to be
    read by something that does not run JavaScript: a crawler deciding
    whether the site is credible, or an assistant answering "is this real".
    Both were empty shells on the first response. These mirror what the
    React pages render.
  */
  const kitContent = `
<main>
  <h1>Start a cyber club</h1>
  <p>Twelve meetings, from a room where nobody has opened a terminal to a team registered for the National Cyber League. Free, CC BY 4.0, and downloadable in full at <a href="${SITE_URL}/data/cyber-club-kit.md">cyber-club-kit.md</a>.</p>
  <section>
    <h2>Rules of engagement, before week one</h2>
    <ol>${KIT_RULES.map((rule) => `<li>${esc(rule)}</li>`).join("")}</ol>
  </section>
  ${KIT_SESSIONS.map(
    (session) => `<section>
    <h2>Week ${session.week}: ${esc(session.title)}</h2>
    <p>${esc(session.goal)}</p>
    <p>Before the meeting: ${esc(session.prep)}</p>
    <ol>${session.run.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
    <p>How you know it worked: ${esc(session.evidence)}</p>
  </section>`,
  ).join("\n  ")}
  <section>
    <h2>Tools the plan uses</h2>
    <ul>${KIT_RESOURCES.map(
      (r) => `<li><a href="${r.url}">${esc(r.name)}</a> (${esc(r.cost)}): ${esc(r.what)}</li>`,
    ).join("")}</ul>
  </section>
  <nav><a href="${SITE_URL}/cyber-club">South CTA Cyber Club</a> · <a href="${SITE_URL}/ncl">National Cyber League notes</a> · <a href="${SITE_URL}/tools">Browser tools</a></nav>
</main>`;

  /*
    Static bodies for the pages that had none.

    Nineteen routes prerendered the site nav and nothing else: 297 characters,
    no heading, no prose. /resume, /projects, /contact and /certifications
    were among them, so a crawler reading the page a hiring manager or an
    admissions officer would be sent to found an empty document. React filled
    them in on the client, which does not help anything that does not run it.

    Every body below is generated from the same module the React page renders
    from, so the two cannot drift. Where a page's copy lives in the component
    rather than a config module, the summary here is deliberately short: it
    states what the page is and links onward, rather than duplicating prose
    that would go stale silently.
  */
  const li = (items: string[]) => items.map((i) => `<li>${i}</li>`).join("");
  const dl = (items: Array<{ title: string; detail: string }>) =>
    items
      .map((i) => `<dt>${esc(i.title)}</dt><dd>${esc(i.detail)}</dd>`)
      .join("\n    ");
  const backLinks = (
    links: Array<[string, string]>,
  ) => `<nav>${links.map(([href, label]) => `<a href="${SITE_URL}${href}">${esc(label)}</a>`).join(" · ")}</nav>`;

  const resumeContent = `
<main>
  <h1>Resume: ${esc(siteConfig.name)}</h1>
  <p>${esc(siteConfig.tagline)}</p>
  ${siteConfig.fullBio.map((para) => `<p>${esc(para)}</p>`).join("\n  ")}
  <section>
    <h2>Currently</h2>
    ${siteConfig.currently
      .map(
        (group) => `<h3>${esc(group.category)}</h3>
    <ul>${li(group.items.map(esc))}</ul>`,
      )
      .join("\n    ")}
  </section>
  <section>
    <h2>Leadership and service</h2>
    ${siteConfig.leadership
      .map(
        (role) => `<h3>${esc(role.title)}, ${esc(role.org)}</h3>
    <ul>${li(role.details.map(esc))}</ul>`,
      )
      .join("\n    ")}
  </section>
  <section>
    <h2>Achievements</h2>
    <dl>${dl(siteConfig.achievements.map((a) => ({ title: a.title, detail: a.description })))}</dl>
  </section>
  <section>
    <h2>Skills</h2>
    ${siteConfig.skillCategories
      .map(
        (cat) => `<h3>${esc(cat.name)}</h3>
    <ul>${li(cat.skills.map(esc))}</ul>`,
      )
      .join("\n    ")}
  </section>
  <section>
    <h2>Contact</h2>
    <p><a href="mailto:${esc(siteConfig.email)}">${esc(siteConfig.email)}</a></p>
  </section>
  ${backLinks([["/projects", "Projects"], ["/timeline", "Timeline"], ["/certifications", "Certifications"], ["/contact", "Contact"]])}
</main>`;

  const projectsContent = `
<main>
  <h1>Projects</h1>
  <p>Work by ${esc(siteConfig.name)} across cybersecurity, enterprise networking, 3D simulation and web development. Each one is something that runs, not a description of something planned.</p>
  ${siteConfig.projects
    .map(
      (project) => `<section>
    <h2>${esc(project.title)}</h2>
    <p>${esc(project.description)}</p>
    <p>Built with: ${project.tech.map(esc).join(", ")}</p>
    ${project.link ? `<p><a href="${project.link.startsWith("http") ? project.link : SITE_URL + project.link}">Open ${esc(project.title)}</a></p>` : ""}
  </section>`,
    )
    .join("\n  ")}
  ${backLinks([["/resume", "Resume"], ["/blog", "Field Notes"], ["/game", "Simulator"]])}
</main>`;

  const timelineContent = `
<main>
  <h1>Timeline</h1>
  <p>Competitions, awards and milestones for ${esc(siteConfig.name)}. Entries carry a date only where one is actually recorded; the rest are grouped as undated rather than given a guessed year.</p>
  ${TIMELINE_GROUPS.map(
    (group) => `<section>
    <h2>${esc(group.label)}</h2>
    ${group.note ? `<p>${esc(group.note)}</p>` : ""}
    <dl>${group.entries
      .map(
        (entry) =>
          `<dt>${esc(entry.title)}${entry.when ? ` (${esc(entry.when)})` : ""}</dt><dd>${esc(entry.description)}</dd>`,
      )
      .join("\n    ")}</dl>
  </section>`,
  ).join("\n  ")}
  <p>Press: <a href="${PRESS.url}">${esc(PRESS.headline)}</a>, ${esc(PRESS.outlet)}, ${esc(PRESS.displayDate)}.</p>
  ${backLinks([["/resume", "Resume"], ["/certifications", "Certifications"], ["/ncl", "National Cyber League"]])}
</main>`;

  const certificationsContent = `
<main>
  <h1>Certifications</h1>
  <p>What ${esc(siteConfig.name)} has earned, what is in progress, and what each exam actually covers. Nothing in progress is listed as earned.</p>
  ${ALL_CERTS.map(
    (cert) => `<section>
    <h2>${esc(cert.name)} (${esc(cert.code)})</h2>
    <p>${esc(cert.vendor)}, ${esc(cert.level)}. Status: ${esc(cert.statusLabel)}. ${esc(cert.statusDetail)}</p>
    <p>${esc(cert.covers)}</p>
    <p>${esc(cert.worth)}</p>
    <h3>Exam domains</h3>
    <dl>${dl(
      cert.domains.map((d: { name: string; weight: string; summary: string }) => ({
        title: `${d.name} (${d.weight})`,
        detail: d.summary,
      })),
    )}</dl>
    <p><a href="${cert.officialUrl}">Official ${esc(cert.code)} objectives</a></p>
  </section>`,
  ).join("\n  ")}
  ${backLinks([["/study", "Study guides"], ["/flashcards", "Flashcards"], ["/resume", "Resume"]])}
</main>`;

  const cyberClubContent = `
<main>
  <h1>${esc(clubConfig.fullName)}</h1>
  <p>${esc(clubConfig.intro)}</p>
  <p>${esc(clubConfig.school)}, ${esc(clubConfig.city)}, ${esc(clubConfig.region)}. President: ${esc(clubConfig.president)}.</p>
  <section>
    <h2>What the club does</h2>
    <dl>${dl(clubConfig.whatWeDo)}</dl>
  </section>
  <section>
    <h2>What you learn</h2>
    <dl>${dl(clubConfig.whatYouLearn)}</dl>
  </section>
  <section>
    <h2>How to join</h2>
    <ul>${li(clubConfig.howToJoin.map(esc))}</ul>
  </section>
  <section>
    <h2>Questions parents ask</h2>
    <dl>${clubConfig.parentFaq
      .map((f: { q: string; a: string }) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`)
      .join("\n    ")}</dl>
  </section>
  ${backLinks([["/cyber-club/kit", "Cyber Club in a Box"], ["/ncl", "National Cyber League notes"], ["/contact", "Contact"]])}
</main>`;

  const nowContent = `
<main>
  <h1>Now</h1>
  <p>${esc(nowConfig.intro)}</p>
  <p>Covering ${esc(nowConfig.period)}. Last updated ${esc(nowConfig.lastUpdatedDisplay)}.</p>
  ${nowConfig.sections
    .map(
      (section) => `<section>
    <h2>${esc(section.heading)}</h2>
    ${section.summary ? `<p>${esc(section.summary)}</p>` : ""}
    <dl>${dl(section.items.map((i: { title: string; detail: string }) => ({ title: i.title, detail: i.detail })))}</dl>
  </section>`,
    )
    .join("\n  ")}
  ${backLinks([["/uses", "Uses"], ["/roadmap", "Roadmap"], ["/blog", "Field Notes"]])}
</main>`;

  const usesContent = `
<main>
  <h1>Uses</h1>
  <p>${esc(usesConfig.intro)}</p>
  ${usesConfig.groups
    .map((group) => {
      // unconfirmed entries are placeholders the React page also refuses to
      // render. Prerendering them would publish a claim the site withholds.
      const items = group.items.filter(
        (i: { unconfirmed?: boolean }) => !i.unconfirmed,
      );
      if (!items.length) return "";
      return `<section>
    <h2>${esc(group.heading)}</h2>
    ${group.summary ? `<p>${esc(group.summary)}</p>` : ""}
    <dl>${items
      .map(
        (i: { name: string; why: string }) =>
          `<dt>${esc(i.name)}</dt><dd>${esc(i.why)}</dd>`,
      )
      .join("\n    ")}</dl>
  </section>`;
    })
    .filter(Boolean)
    .join("\n  ")}
  ${backLinks([["/now", "Now"], ["/colophon", "How this site is built"], ["/tools", "Browser tools"]])}
</main>`;

  const pathsContent = `
<main>
  <h1>Reading paths</h1>
  <p>Curated routes through the archive, in the order the ideas actually build on each other. Each step says why it comes after the one before it.</p>
  ${readingPaths
    .map(
      (rp) => `<section>
    <h2>${esc(rp.title)}</h2>
    <p>${esc(rp.blurb)}</p>
    <ol>${rp.steps
      .map((step: { slug: string; why: string }) => {
        const post = postIndex.find((p) => p.slug === step.slug);
        const label = post ? post.title : step.slug;
        return `<li><a href="${SITE_URL}/blog/${step.slug}">${esc(label)}</a>: ${esc(step.why)}</li>`;
      })
      .join("")}</ol>
  </section>`,
    )
    .join("\n  ")}
  ${backLinks([["/blog", "Field Notes"], ["/archive", "Archive"], ["/topics", "Topics"]])}
</main>`;

  const archiveContent = `
<main>
  <h1>Archive</h1>
  <p>Every field note on ${esc(siteConfig.siteUrl.replace("https://", ""))}, newest first. ${postIndex.length} articles.</p>
  <ul>${postIndex
    .map(
      (p) =>
        `<li><a href="${SITE_URL}/blog/${p.slug}">${esc(p.title)}</a> (${esc(formatPostDate(p.date))}): ${esc(p.excerpt)}</li>`,
    )
    .join("\n    ")}</ul>
  ${backLinks([["/blog", "Field Notes"], ["/topics", "Topics"], ["/paths", "Reading paths"]])}
</main>`;

  const roadmapContent = (() => {
    const counts = roadmapCounts();
    return `
<main>
  <h1>Roadmap</h1>
  <p>What is planned, in progress, done and blocked on this site, tracked in public. Last updated ${esc(ROADMAP_UPDATED)}. Done: ${counts.done}. In progress: ${counts["in-progress"]}. Planned: ${counts.planned}. Blocked: ${counts.blocked}.</p>
  ${ROADMAP.map(
    (group) => `<section>
    <h2>${esc(group.title)}</h2>
    <p>${esc(group.blurb)}</p>
    <ul>${group.items
      .map(
        (item: { id: number; title: string; status: string; note?: string }) =>
          `<li>${esc(item.title)} (${esc(item.status)})${item.note ? `: ${esc(item.note)}` : ""}</li>`,
      )
      .join("")}</ul>
  </section>`,
  ).join("\n  ")}
  ${backLinks([["/changelog", "Changelog"], ["/colophon", "Colophon"], ["/now", "Now"]])}
</main>`;
  })();

  const changelogContent = `
<main>
  <h1>Changelog</h1>
  <p>What changed on this site and when, newest first.</p>
  ${CHANGELOG.map(
    (release) => `<section>
    <h2>${esc(release.title)}</h2>
    <p>${esc(release.date)}</p>
    <ul>${li(release.entries.map(esc))}</ul>
  </section>`,
  ).join("\n  ")}
  ${backLinks([["/roadmap", "Roadmap"], ["/colophon", "Colophon"]])}
</main>`;

  const flashcardsContent = `
<main>
  <h1>Flashcards</h1>
  <p>Spaced repetition decks for networking, ports, security, Linux and cryptography. ${DECKS.reduce((n: number, d: { cards: unknown[] }) => n + d.cards.length, 0)} cards across ${DECKS.length} decks, scheduled in the browser with nothing sent anywhere.</p>
  ${DECKS.map(
    (deck) => `<section>
    <h2>${esc(deck.name)}</h2>
    <p>${esc(deck.description)} ${deck.cards.length} cards.</p>
  </section>`,
  ).join("\n  ")}
  ${backLinks([["/study", "Study guides"], ["/certifications", "Certifications"], ["/tools", "Browser tools"]])}
</main>`;

  const linksContent = `
<main>
  <h1>Links</h1>
  <p>Free and freemium resources worth the time, grouped by what they are for. Every entry points at a site root rather than a deep path, because a guessed deep link rots and takes the reader's trust with it.</p>
  ${LINK_GROUPS.map(
    (group) => `<section>
    <h2>${esc(group.heading)}</h2>
    <p>${esc(group.summary)}</p>
    <dl>${group.items
      .map(
        (r: { name: string; url: string; why: string; access: string }) =>
          `<dt><a href="${r.url}">${esc(r.name)}</a> (${esc(r.access)})</dt><dd>${esc(r.why)}</dd>`,
      )
      .join("\n    ")}</dl>
  </section>`,
  ).join("\n  ")}
  ${backLinks([["/study", "Study guides"], ["/ncl", "National Cyber League notes"], ["/tools", "Browser tools"]])}
</main>`;

  const colophonContent = `
<main>
  <h1>Colophon</h1>
  <p>How ${esc(siteConfig.siteUrl.replace("https://", ""))} is built, and why each piece was chosen over the alternative.</p>
  <section>
    <h2>Stack</h2>
    <dl>${STACK.map(
      (item: { name: string; role: string; detail: string }) =>
        `<dt>${esc(item.name)} (${esc(item.role)})</dt><dd>${esc(item.detail)}</dd>`,
    ).join("\n    ")}</dl>
  </section>
  <section>
    <h2>Decisions</h2>
    ${DECISIONS.map(
      (d: { title: string; body: string[] }) => `<h3>${esc(d.title)}</h3>
    ${d.body.map((para) => `<p>${esc(para)}</p>`).join("\n    ")}`,
    ).join("\n    ")}
  </section>
  ${backLinks([["/roadmap", "Roadmap"], ["/changelog", "Changelog"], ["/uses", "Uses"]])}
</main>`;

  const subscribeContent = `
<main>
  <h1>Subscribe</h1>
  <p>The field notes publish to a feed at <a href="${SITE_URL}/feed.xml">${SITE_URL}/feed.xml</a>. A feed is a plain file this site updates when something new goes out; your reader checks it and shows you the new posts. No account, no algorithm deciding what you see, and no way for anyone here to know you are reading.</p>
  <section>
    <h2>Readers worth trying</h2>
    <p>One per situation rather than a ranked list. Which one is right depends far more on which devices you own than on features.</p>
    <dl>${READERS.map(
      (r: { name: string; url: string; platforms: string; note: string }) =>
        `<dt><a href="${r.url}">${esc(r.name)}</a> (${esc(r.platforms)})</dt><dd>${esc(r.note)}</dd>`,
    ).join("\n    ")}</dl>
  </section>
  ${backLinks([["/blog", "Field Notes"], ["/archive", "Archive"], ["/paths", "Reading paths"]])}
</main>`;

  const askContent = `
<main>
  <h1>Ask</h1>
  <p>Questions about networking, security, the home lab, competition prep or starting a club. This site is static files on a CDN with nothing running behind it, so the page composes your message and hands it to something that can deliver it: a mail client, or GitHub. You see the full text before anything is sent.</p>
  <section>
    <h2>Already answered</h2>
    <p>These have a written answer already. Worth checking before asking.</p>
    <ul>${ANSWERED.map(
      (a: { question: string; href: string; answer: string }) =>
        `<li>${esc(a.question)}: <a href="${SITE_URL}${a.href}">${esc(a.answer)}</a></li>`,
    ).join("\n    ")}</ul>
  </section>
  <p>Direct email: <a href="mailto:${esc(siteConfig.email)}">${esc(siteConfig.email)}</a></p>
  ${backLinks([["/contact", "Contact"], ["/faq", "FAQ"], ["/blog", "Field Notes"]])}
</main>`;

  const campsContent = `
<main>
  <h1>Youth coding camps</h1>
  <p>Coding camps taught by ${esc(siteConfig.name)} across the Las Vegas Valley. Students write real code from the first session; nothing is dragged into place on their behalf.</p>
  <section>
    <h2>What the camps cover</h2>
    <dl>${dl(COVERS)}</dl>
  </section>
  <section>
    <h2>What a beginner takes home</h2>
    <dl>${dl(TAKEAWAYS)}</dl>
  </section>
  <p>To ask about a session, email <a href="mailto:${esc(siteConfig.email)}">${esc(siteConfig.email)}</a>.</p>
  ${backLinks([["/contact", "Contact"], ["/cyber-club", "Cyber Club"], ["/projects", "Projects"]])}
</main>`;

  const contactContent = `
<main>
  <h1>Contact</h1>
  <p>${esc(siteConfig.name)}, ${esc(siteConfig.tagline)}. Based in Las Vegas, Nevada.</p>
  <p>Email: <a href="mailto:${esc(siteConfig.email)}">${esc(siteConfig.email)}</a></p>
  <p>GitHub: <a href="${siteConfig.social.github.url}">${esc(siteConfig.social.github.handle)}</a></p>
  <p>Worth reaching out about: cybersecurity competition and club setup, enterprise networking and home lab questions, youth coding instruction, and speaking to student groups. Questions with a general answer are better on <a href="${SITE_URL}/ask">the ask page</a>, where the answer can be published for the next person with the same one.</p>
  ${backLinks([["/ask", "Ask"], ["/resume", "Resume"], ["/faq", "FAQ"]])}
</main>`;

  const studyTimerContent = `
<main>
  <h1>Study timer</h1>
  <p>A focus timer for certification study, built around work intervals separated by short breaks and a longer break every few cycles. Work, short break, long break and cycle length are all adjustable.</p>
  <p>It runs entirely in the browser. Settings and session counts are kept in local storage on your own device, nothing is sent anywhere, and no account is needed. Closing the tab loses nothing; reopening it restores where you were.</p>
  ${backLinks([["/study", "Study guides"], ["/flashcards", "Flashcards"], ["/certifications", "Certifications"]])}
</main>`;

  const nclHubContent = `
<main>
  <h1>National Cyber League</h1>
  <p>What the National Cyber League is, how the scoring works, how to prepare for it, and a written guide to every challenge category. The competition runs capture the flag style challenges on the Cyber Skyline platform, scored on accuracy and completion rather than speed alone.</p>
  <section>
    <h2>Category guides</h2>
    <dl>${NCL_GUIDE_DATA.map(
      (guide: { slug: string; category: string; tagline: string }) =>
        `<dt><a href="${SITE_URL}/ncl/${guide.slug}">${esc(guide.category)}</a></dt><dd>${esc(guide.tagline)}</dd>`,
    ).join("\n    ")}</dl>
  </section>
  <section>
    <h2>Competition day checklist</h2>
    <ol>${li(DAY_CHECKLIST.map(esc))}</ol>
  </section>
  <section>
    <h2>Mistakes worth not repeating</h2>
    <ul>${li(MISTAKES.map(esc))}</ul>
  </section>
  ${backLinks([["/study", "Study guides"], ["/flashcards", "Flashcards"], ["/cyber-club", "Cyber Club"], ["/links", "Links"]])}
</main>`;

  /*
    Keyed by the same `dir` the STANDALONE list uses, so adding a page without
    a body here is caught by check-prerender-depth rather than shipping empty.
  */
  const STANDALONE_CONTENT: Record<string, string> = {
    archive: archiveContent,
    paths: pathsContent,
    now: nowContent,
    uses: usesContent,
    resume: resumeContent,
    timeline: timelineContent,
    "cyber-club": cyberClubContent,
    "cyber-club/kit": kitContent,
    "coding-camps": campsContent,
    colophon: colophonContent,
    links: linksContent,
    subscribe: subscribeContent,
    "study-timer": studyTimerContent,
    ask: askContent,
    changelog: changelogContent,
    certifications: certificationsContent,
    ncl: nclHubContent,
    flashcards: flashcardsContent,
  };

  for (const page of STANDALONE) {
    const { dir, ...meta } = page;
    if (dir === "faq") {
      await writePage(dir, base, { ...meta, schema: faqSchema, rootContent: faqContent });
      continue;
    }
    await writePage(dir, base, { ...meta, rootContent: STANDALONE_CONTENT[dir] });
  }

  // ── projects ──
  await writePage("projects", base, {
    title: "Projects | Max Doubin",
    description:
      "Projects by Max Doubin in cybersecurity, enterprise networking, 3D datacenter simulation, and web development.",
    canonical: `${SITE_URL}/projects`,
    rootContent: projectsContent,
  });

  // ── contact ──
  await writePage("contact", base, {
    title: "Contact | Max Doubin",
    description:
      "Get in touch with Max Doubin, cybersecurity specialist and enterprise networking expert based in Las Vegas, Nevada.",
    canonical: `${SITE_URL}/contact`,
    rootContent: contactContent,
  });

  // ── National Cyber League category guides ──
  /*
    Derived from nclGuides.ts rather than listed here. The hardcoded copy of
    this list had seven entries while the data had nine, so two guides existed
    in the app and in no static document. A list that has to be edited twice
    gets edited once.
  */
  const NCL_GUIDES: Array<[string, string, string]> = NCL_GUIDE_DATA.map(
    (g: { slug: string; category: string; seoDescription: string }) =>
      [g.slug, g.category, g.seoDescription] as [string, string, string],
  );
  for (const [slug, name, description] of NCL_GUIDES) {
    const url = `${SITE_URL}/ncl/${slug}`;
    /*
      Give the guide a body a crawler can read.

      These pages were prerendering ten characters: the loading
      placeholder. Everything a reader sees is rendered from nclGuides.ts
      after hydration, so to Google they were empty pages in the sitemap,
      which is worse than not listing them. The data was already there; it
      just was not being written into the HTML.
    */
    const guide = NCL_GUIDE_DATA.find((g) => g.slug === slug);
    const guideContent = guide
      ? `
<main>
  <h1>${esc(guide.category)}</h1>
  <p>${esc(guide.tagline)}</p>
  <h2>What it tests</h2>
  <ul>
${guide.whatItTests.map((t) => `    <li>${esc(t)}</li>`).join("\n")}
  </ul>
  <h2>How to think about it</h2>
${guide.mentalModel.map((m) => `  <p>${esc(m)}</p>`).join("\n")}
  <h2>Tools</h2>
  <ul>
${guide.tools.map((t) => `    <li><strong>${esc(t.name)}</strong>: ${esc(t.use)}</li>`).join("\n")}
  </ul>
  <h2>Worked example</h2>
  <p>${esc(guide.walkthrough.scenario)}</p>
  <ol>
${guide.walkthrough.steps.map((st) => `    <li><strong>${esc(st.label)}</strong>: ${esc(st.detail)}</li>`).join("\n")}
  </ol>
  <p>Answer: ${esc(guide.walkthrough.answer)}</p>
  <h2>Common mistakes</h2>
  <ul>
${guide.mistakes.map((m) => `    <li>${esc(m)}</li>`).join("\n")}
  </ul>
  <h2>References</h2>
  <ul>
${guide.resources.map((r) => `    <li><a href="${r.url}">${esc(r.label)}</a>: ${esc(r.detail)}</li>`).join("\n")}
  </ul>
  <p><a href="${SITE_URL}/ncl">All National Cyber League category guides</a></p>
</main>`
      : undefined;
    await writePage(`ncl/${slug}`, base, {
      title: pageTitle(`${name} | NCL Guide`),
      description,
      canonical: url,
      rootContent: guideContent,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "National Cyber League", item: `${SITE_URL}/ncl` },
    { "@type": "ListItem", position: 3, name, item: url },
  ],
})}
</script>`,
    });
  }

  // ── tools ──
  await writePage("tools", base, {
    title: "Tools | Max Doubin",
    description:
      "Free browser-based tools for networking and security study: subnetting, packet headers, cron, regex, encoding, and classical ciphers.",
    canonical: `${SITE_URL}/tools`,
    rootContent: `
<main>
  <h1>Tools</h1>
  <ul>
${TOOLS.map(
  (t) =>
    `    <li><a href="${SITE_URL}/tools/${t.slug}">${esc(t.name)}</a> <span>${esc(t.blurb)}</span></li>`,
).join("\n")}
  </ul>
</main>`,
  });

  for (const tool of TOOLS) {
    const url = `${SITE_URL}/tools/${tool.slug}`;
    await writePage(`tools/${tool.slug}`, base, {
      title: pageTitle(tool.name),
      description: tool.blurb,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: tool.name,
  description: tool.blurb,
  url,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
    { "@type": "ListItem", position: 3, name: tool.name, item: url },
  ],
})}
</script>`,
      rootContent: `
<main>
  <nav><a href="${SITE_URL}/">Home</a> / <a href="${SITE_URL}/tools">Tools</a></nav>
  <h1>${esc(tool.name)}</h1>
  <p>${esc(tool.blurb)}</p>
  <p>Runs in your browser. Nothing is uploaded.</p>
  ${
    // The same paragraphs ToolShell renders. Without them the pages aimed at
    // the highest-traffic queries on this site were the emptiest ones a
    // crawler could fetch: a heading and a one-line blurb.
    (TOOL_NOTES[tool.slug] ?? []).length
      ? `<section>
    <h2>Notes</h2>
    ${(TOOL_NOTES[tool.slug] ?? [])
      .map(
        (para: Array<string | { code: string } | { em: string }>) =>
          `<p>${para
            .map((span) => {
              if (typeof span === "string") return esc(span);
              if ("code" in span) return `<code>${esc(span.code)}</code>`;
              return `<em>${esc(span.em)}</em>`;
            })
            .join("")}</p>`,
      )
      .join("\n    ")}
  </section>`
      : ""
  }
  <nav><a href="${SITE_URL}/tools">All tools</a> · <a href="${SITE_URL}/study">Study guides</a> · <a href="${SITE_URL}/blog">Field Notes</a></nav>
</main>`,
    });
  }

  // ── topic hubs ──
  /*
    One page per subject, with real editorial copy and the full post list
    rendered into the static HTML. These exist so a crawler has a route
    into the archive by subject as well as by date, and so a reader can
    land on "networking" rather than on post 214 of 236.

    Only tags in lib/tagPages get a page. A tag with two posts stays a
    filter on the index: a page for it would be thin, would compete with
    the index, and would add nothing.
  */
  for (const topic of TAG_PAGES) {
    const tagged = posts.filter((p) => p.tags.includes(topic.tag));
    if (tagged.length === 0) continue;
    const url = `${SITE_URL}/topics/${topic.tag}`;
    const list = tagged
      .map(
        (p) =>
          `      <li><a href="${SITE_URL}/blog/${p.slug}">${esc(p.title)}</a> ` +
          `<time datetime="${p.date}">${p.date}</time> <span>${esc(p.excerpt)}</span></li>`,
      )
      .join("\n");
    await writePage(`topics/${topic.tag}`, base, {
      title: pageTitle(topic.title),
      description: topic.description,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: topic.title,
  description: topic.description,
  url,
  isPartOf: { "@type": "Blog", "@id": `${SITE_URL}/#blog` },
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: tagged.length,
    itemListElement: tagged.slice(0, 25).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/blog/${p.slug}`,
      name: p.title,
    })),
  },
})}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Topics", item: `${SITE_URL}/topics` },
    { "@type": "ListItem", position: 3, name: topic.title, item: url },
  ],
})}
</script>`,
      rootContent: `
<main>
  <nav><a href="${SITE_URL}/">Home</a> / <a href="${SITE_URL}/topics">Topics</a></nav>
  <article>
    <h1>${esc(topic.title)}</h1>
    <p>${esc(topic.intro)}</p>
    <p>${tagged.length} posts.</p>
    <ul>
${list}
    </ul>
  </article>
</main>`,
    });
  }

  // ── topics index ──
  await writePage("topics", base, {
    title: "Topics | Max Doubin",
    description:
      "Browse writing on networking, servers, security, Linux, storage, AI infrastructure and more, organised by subject rather than by date.",
    canonical: `${SITE_URL}/topics`,
    rootContent: `
<main>
  <h1>Topics</h1>
  <ul>
${TAG_PAGES.map(
  (t) =>
    `    <li><a href="${SITE_URL}/topics/${t.tag}">${esc(t.title)}</a> <span>${esc(t.description)}</span></li>`,
).join("\n")}
  </ul>
</main>`,
  });

  // ── the simulator ──
  // /game used to be served as the bare app shell, which meant a crawler read
  // it as a duplicate of the home page: same title, same description, and a
  // canonical pointing at "/". It is the most distinctive thing on this site
  // and it was invisible. The canvas cannot be prerendered, but what the
  // simulator actually models can be, and that is what a search is for.
  await writePage("game", base, {
    title: pageTitle("Hyperscale, a data center simulator"),
    description:
      "A browser data center simulator with real power and cooling maths: 3.412142 BTU per hour per watt, and a PUE that rises with rack count. Build 1 to 500 racks.",
    canonical: `${SITE_URL}/game`,
    rootContent: `
<main>
  <h1>Hyperscale, a data center simulator</h1>
  <p>
    A data center you build in a browser. Place racks, fill them with real
    hardware, and watch the power and thermal budget respond. It runs on the
    same equipment table published as an
    <a href="${SITE_URL}/data">open dataset</a>, and on the same physics as
    the <a href="${SITE_URL}/tools/rack-budget">rack budget tool</a>.
  </p>
  <h2>What it actually models</h2>
  <ul>
    <li>Heat load derived from IT load at 3.412142 BTU per hour per watt, which is a definition rather than an estimate.</li>
    <li>Cooling capacity in tons, at 3516.85 watts per ton.</li>
    <li>Facility PUE that rises with rack count, so efficiency is something you design for rather than a constant.</li>
    <li>CRAH capacity, in-room losses, and a design ceiling on IT load, so a floor plan can run out of cooling before it runs out of space.</li>
    <li>Rack units, port counts and indicative cost per device, so a build has a budget and a cable plan, not just a shape.</li>
  </ul>
  <h2>What it is not</h2>
  <p>
    It is a teaching model, not a design tool. The numbers behind it are
    representative figures for a class of hardware, not vendor specifications
    and not measurements taken from a real facility. The
    <a href="${SITE_URL}/data">dataset page</a> says exactly where each figure
    comes from.
  </p>
  <p>
    It needs WebGL. If your browser or machine cannot run it, the
    <a href="${SITE_URL}/tools/rack-budget">rack budget tool</a> does the same
    power and cooling arithmetic with no 3D at all, and the
    <a href="${SITE_URL}/blog">Field Notes archive</a> covers the underlying
    infrastructure in writing.
  </p>
</main>`,
  })

  // ── open dataset ──
  await writePage("data", base, {
    title: "Open rack hardware dataset | Max Doubin",
    description:
      "An openly licensed table of 28 rack-mount devices with power draw, heat output, rack units, port count and indicative cost, as JSON and CSV under CC BY 4.0.",
    canonical: `${SITE_URL}/data`,
    rootContent: `
<main>
  <h1>Rack hardware dataset</h1>
  <p>28 rack-mount devices with power draw, heat output, rack units, port count and indicative cost, licensed CC BY 4.0.</p>
  <p>These are modelling figures, not vendor specifications and not measurements. powerDraw is representative for the class of hardware named. heatOutput is derived as watts multiplied by 3.412142. price is order of magnitude. Do not cite them as manufacturer data.</p>
  <ul>
    <li><a href="${SITE_URL}/data/equipment-catalog.json">equipment-catalog.json</a></li>
    <li><a href="${SITE_URL}/data/equipment-catalog.csv">equipment-catalog.csv</a></li>
  </ul>
</main>`,
  });

  // ── certification study index and one page per exam domain ──
  // These answer high-intent objective queries, so they have to exist as
  // static HTML rather than only after hydration.
  await writePage("study", base, {
    title: "Certification study by exam objective | Max Doubin",
    description:
      "Security+ SY0-701, Network+ N10-009 and CCNA 200-301 exam domains mapped to the posts and free tools on this site that cover each one.",
    canonical: `${SITE_URL}/study`,
    rootContent: `
<main>
  <h1>Study by exam objective</h1>
${EXAMS.map(
  (e) =>
    `  <section>\n    <h2>${esc(e.name)} (${esc(e.code)})</h2>\n    <p>${esc(e.intro)}</p>\n    <ul>\n` +
    e.domains
      .map(
        (d) =>
          `      <li><a href="${SITE_URL}/study/${e.slug}/${d.slug}">${esc(d.name)}</a>` +
          `${d.weight === null ? "" : ` <span>${d.weight}% of exam</span>`}` +
          ` <span>${esc(d.summary)}</span></li>`,
      )
      .join("\n") +
    `\n    </ul>\n    <p><a href="${e.officialUrl}">Official ${esc(e.code)} objectives</a></p>\n  </section>`,
).join("\n")}
</main>`,
  });

  for (const exam of EXAMS) {
    for (const domain of exam.domains) {
      const matched = posts.filter((post) => {
        const title = post.title.toLowerCase();
        const tags = post.tags.map((t) => t.toLowerCase());
        return domain.keywords.some(
          (k) => title.includes(k.toLowerCase()) || tags.includes(k.toLowerCase()),
        );
      });
      await writePage(`study/${exam.slug}/${domain.slug}`, base, {
        title: pageTitle(`${domain.name} | ${exam.name} ${exam.code}`),
        description: `${domain.name} for ${exam.name} ${exam.code}: ${matched.length} articles and free tools mapped to this exam objective.`,
        canonical: `${SITE_URL}/study/${exam.slug}/${domain.slug}`,
        rootContent: `
<main>
  <nav><a href="${SITE_URL}/study">All exam domains</a></nav>
  <h1>${esc(domain.name)}</h1>
  <p>${esc(exam.name)} ${esc(exam.code)}${domain.weight === null ? "" : `, ${domain.weight}% of the exam`}</p>
  <p>${esc(domain.summary)}</p>
  <h2>Posts covering this domain</h2>
  <ul>
${matched
  .map(
    (post) =>
      `    <li><a href="${SITE_URL}/blog/${post.slug}">${esc(post.title)}</a> <span>${esc(post.excerpt)}</span></li>`,
  )
  .join("\n")}
  </ul>
  <p><a href="${exam.officialUrl}">Official ${esc(exam.code)} objectives</a></p>
</main>`,
      });
    }
  }

  // ── roadmap ──
  await writePage("roadmap", base, {
    title: "Roadmap | Max Doubin",
    description:
      "What is planned, in progress, done and blocked on maxdoubin.com, tracked in public across 100 improvements.",
    canonical: `${SITE_URL}/roadmap`,
    rootContent: roadmapContent,
  });

  // ── sitemap ──
  // Generated here rather than hand-maintained. The checked-in sitemap had
  // gone stale, listing 105 URLs with a lastmod months behind the newest
  // post, so anything published since was invisible to crawlers.
  await writeSitemap(posts);
  await writeFeed(posts);

  // Home page last: everything above uses `base` as its template, so giving
  // it a body any earlier would put the home page's content on all of them.
  await writeFile(
    path.join(DIST, "index.html"),
    injectRootContent(base, homeContent),
    "utf-8",
  );
  console.log("index.html: home page body written");

  // Served with a real 404 by Cloudflare Pages for anything that matches
  // neither a prerendered file nor a rewrite in _redirects.
  await writeNotFoundPage(base);
  console.log("404.html: written");

  console.log("Prerender complete.");
}

/**
 * Emit sitemap.xml covering every route and every published post.
 *
 * lastmod comes from each post's own date, so a crawler can tell what
 * actually changed instead of re-reading the whole archive.
 */
async function writeSitemap(
  posts: Array<{ slug: string; date: string; updated?: string; tags: string[]; draft?: boolean }>,
) {
  const live = posts.filter((p) => !p.draft);
  const newest = live.reduce((a, p) => (p.date > a ? p.date : a), "1970-01-01");
  const today = newest;

  const urls: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }> = [
    { loc: `${SITE_URL}/`, lastmod: today, changefreq: "weekly", priority: "1.0" },
    { loc: `${SITE_URL}/blog`, lastmod: today, changefreq: "daily", priority: "0.9" },
    { loc: `${SITE_URL}/projects`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/contact`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/game`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/study`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/data`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/topics`, lastmod: today, changefreq: "weekly", priority: "0.8" },
    { loc: `${SITE_URL}/archive`, lastmod: today, changefreq: "weekly", priority: "0.8" },
    { loc: `${SITE_URL}/paths`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/tools`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/ncl`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/faq`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/resume`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/now`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/uses`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/timeline`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/cyber-club`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/cyber-club/kit`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/coding-camps`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/certifications`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/links`, lastmod: today, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/colophon`, lastmod: today, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/subscribe`, lastmod: today, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/changelog`, lastmod: today, changefreq: "weekly", priority: "0.4" },
    { loc: `${SITE_URL}/ask`, lastmod: today, changefreq: "monthly", priority: "0.4" },
    { loc: `${SITE_URL}/study-timer`, lastmod: today, changefreq: "monthly", priority: "0.4" },
    { loc: `${SITE_URL}/roadmap`, lastmod: today, changefreq: "weekly", priority: "0.4" },
  ];

  // Tools and the competition guides. /flashcards is deliberately absent:
  // it is noindex, and a sitemap should never advertise a page that tells
  // crawlers to go away.
  for (const tool of TOOLS) {
    urls.push({
      loc: `${SITE_URL}/tools/${tool.slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const slug of NCL_GUIDE_DATA.map((g: { slug: string }) => g.slug)) {
    urls.push({
      loc: `${SITE_URL}/ncl/${slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  // Topic hubs. Only those that actually have posts, so the sitemap never
  // advertises a page the prerenderer skipped.
  for (const topic of TAG_PAGES) {
    const newestTagged = live
      .filter((p) => p.tags.includes(topic.tag))
      .reduce((a, p) => (p.date > a ? p.date : a), "");
    if (!newestTagged) continue;
    urls.push({
      loc: `${SITE_URL}/topics/${topic.tag}`,
      lastmod: newestTagged,
      changefreq: "weekly",
      priority: "0.7",
    });
  }
  for (const exam of EXAMS) {
    for (const domain of exam.domains) {
      urls.push({
        loc: `${SITE_URL}/study/${exam.slug}/${domain.slug}`,
        lastmod: today,
        changefreq: "monthly",
        priority: "0.7",
      });
    }
  }
  for (const post of live) {
    urls.push({
      loc: `${SITE_URL}/blog/${post.slug}`,
      // A rewritten article is new information, and lastmod is the only way
      // to tell a crawler that. 45 posts here went from a 300 word stub to a
      // sourced 1500 word article while still reporting their original
      // publication date, which gave Google no reason to come back and look.
      lastmod: post.updated ?? post.date,
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n` +
          `    <loc>${u.loc}</loc>\n` +
          `    <lastmod>${u.lastmod}</lastmod>\n` +
          `    <changefreq>${u.changefreq}</changefreq>\n` +
          `    <priority>${u.priority}</priority>\n` +
          `  </url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;

  await writeFile(path.join(DIST, "sitemap.xml"), xml, "utf8");
  console.log(`sitemap.xml: ${urls.length} urls`);
}

main().catch((err) => {
  console.error("Prerender failed:", err);
  process.exit(1);
});

/**
 * Emit an RSS 2.0 feed of the most recent posts.
 *
 * A daily archive with no feed is only reachable by people who think to
 * revisit. Readers, aggregators and several crawlers all consume this.
 */
async function writeFeed(
  posts: Array<{ slug: string; title: string; date: string; excerpt: string; draft?: boolean }>,
) {
  // Newest first. The source array is in insertion order, not date order,
  // so slicing it directly published a feed headed by an arbitrary post.
  const live = posts
    .filter((p) => !p.draft)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 50);
  const rfc822 = (iso: string) => new Date(`${iso}T12:00:00Z`).toUTCString();
  const items = live
    .map(
      (p) =>
        `    <item>\n` +
        `      <title>${esc(p.title)}</title>\n` +
        `      <link>${SITE_URL}/blog/${p.slug}</link>\n` +
        `      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}</guid>\n` +
        `      <pubDate>${rfc822(p.date)}</pubDate>\n` +
        `      <description>${esc(p.excerpt)}</description>\n` +
        `    </item>`,
    )
    .join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>Max Doubin</title>\n` +
    `    <link>${SITE_URL}/blog</link>\n` +
    `    <description>Writing on cybersecurity, enterprise networking, and systems infrastructure.</description>\n` +
    `    <language>en-us</language>\n` +
    `    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />\n` +
    (live[0] ? `    <lastBuildDate>${rfc822(live[0].date)}</lastBuildDate>\n` : "") +
    `${items}\n` +
    `  </channel>\n` +
    `</rss>\n`;

  await writeFile(path.join(DIST, "feed.xml"), xml, "utf8");
  console.log(`feed.xml: ${live.length} items`);
}
