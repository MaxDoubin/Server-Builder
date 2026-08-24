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

// ─── import blog data (tsx handles .ts extensions at runtime) ────────────────
// postIndex is plain data with no Vite-only syntax in it, so it imports
// cleanly here. lib/blogPosts.ts cannot: it reaches for the bodies through
// import.meta.glob, which only exists inside a Vite build.
const { postIndex } = await import("../client/src/lib/postIndex.ts");
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

function injectRootContent(html: string, content: string): string {
  // Replace the spinner placeholder with pre-rendered content.
  // React's createRoot overwrites this on hydration. Purely for crawlers.
  return html.replace(
    /<div id="root">[\s\S]*?<\/div>\s*<style>/,
    `<div id="root">${content}</div>\n    <style>`,
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
}

function buildPageHtml(base: string, meta: PageMeta): string {
  let html = base;
  const {
    title,
    description,
    canonical,
    ogType = "website",
    ogImage = `${SITE_URL}/images/og-image.png`,
    ogImageAlt = "Max Doubin",
    schema,
    rootContent,
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

  if (schema) html = injectBeforeHead(html, schema);
  if (rootContent) html = injectRootContent(html, rootContent);

  return html;
}

// ─── write helpers ────────────────────────────────────────────────────────────

async function writePage(
  relDir: string,
  base: string,
  meta: PageMeta,
): Promise<void> {
  const dir = path.join(DIST, relDir);
  await mkdir(dir, { recursive: true });
  const html = buildPageHtml(base, meta);
  await writeFile(path.join(dir, "index.html"), html, "utf-8");
}

// ─── blog post pre-render ─────────────────────────────────────────────────────

async function prerenderPost(
  base: string,
  post: (typeof postIndex)[number],
  all: (typeof postIndex)[number][] = [],
): Promise<void> {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const body = await readBody(post.slug);
  const ogImage = `${SITE_URL}${post.coverImage}`;

  const schema = `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "@id": url,
  headline: post.title,
  description: post.excerpt,
  datePublished: post.date,
  dateModified: post.date,
  url,
  image: { "@type": "ImageObject", url: ogImage, contentUrl: ogImage },
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin", url: SITE_URL },
  publisher: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin", url: SITE_URL },
  isPartOf: { "@type": "Blog", "@id": `${SITE_URL}/#blog` },
  keywords: post.tags.join(", "),
  inLanguage: "en-US",
  wordCount: post.wordCount,
  mainEntityOfPage: { "@type": "WebPage", "@id": url },
})}
</script>`;

  // Full article HTML. Google reads this on the first HTML crawl
  const contentHtml = await Promise.resolve(marked.parse(body));
  const dateStr = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const readMins = Math.max(1, Math.ceil(post.wordCount / 200));
  const tagLinks = post.tags
    .map((t) => `<a href="${SITE_URL}/blog">${esc(t)}</a>`)
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
  <img src="${ogImage}" alt="${esc(post.title)}" width="800" height="320" />
  <article>
    <time datetime="${post.date}">${dateStr}</time> · ${readMins} min read
    <h1>${esc(post.title)}</h1>
    <p>${esc(post.excerpt)}</p>
    <nav>${tagLinks}</nav>
    ${contentHtml}
  </article>
  ${neighbourNav}
  ${relatedNav}
</main>`;

  await writePage(`blog/${post.slug}`, base, {
    title: `${post.title} | Max Doubin`,
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

  // ── projects ──
  await writePage("projects", base, {
    title: "Projects | Max Doubin",
    description:
      "Projects by Max Doubin in cybersecurity, enterprise networking, 3D datacenter simulation, and web development.",
    canonical: `${SITE_URL}/projects`,
  });

  // ── contact ──
  await writePage("contact", base, {
    title: "Contact | Max Doubin",
    description:
      "Get in touch with Max Doubin, cybersecurity specialist and enterprise networking expert based in Las Vegas, Nevada.",
    canonical: `${SITE_URL}/contact`,
  });

  // ── sitemap ──
  // Generated here rather than hand-maintained. The checked-in sitemap had
  // gone stale, listing 105 URLs with a lastmod months behind the newest
  // post, so anything published since was invisible to crawlers.
  await writeSitemap(posts);
  await writeFeed(posts);

  console.log("Prerender complete.");
}

/**
 * Emit sitemap.xml covering every route and every published post.
 *
 * lastmod comes from each post's own date, so a crawler can tell what
 * actually changed instead of re-reading the whole archive.
 */
async function writeSitemap(posts: Array<{ slug: string; date: string; draft?: boolean }>) {
  const live = posts.filter((p) => !p.draft);
  const newest = live.reduce((a, p) => (p.date > a ? p.date : a), "1970-01-01");
  const today = newest;

  const urls: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }> = [
    { loc: `${SITE_URL}/`, lastmod: today, changefreq: "weekly", priority: "1.0" },
    { loc: `${SITE_URL}/blog`, lastmod: today, changefreq: "daily", priority: "0.9" },
    { loc: `${SITE_URL}/projects`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/contact`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/game`, lastmod: today, changefreq: "monthly", priority: "0.6" },
  ];
  for (const post of live) {
    urls.push({
      loc: `${SITE_URL}/blog/${post.slug}`,
      lastmod: post.date,
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
