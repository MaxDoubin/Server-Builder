/**
 * Folds edits made to content/posts/*.md back into blogPosts.source.ts.
 *
 * The archive round trips: blogPosts.source.ts is the source of truth, and
 * script/generatePostIndex.ts writes one markdown file per post out of it.
 * That is a one-way street, and it quietly ate work. Anyone editing a post
 * naturally opens the markdown file, because that is the file with the
 * article in it and the file the "suggest an edit" link points at. The next
 * build regenerated it from the TypeScript and the edit was gone, with
 * nothing failing and nothing logged.
 *
 * So the build now runs this first: markdown up into the source, then the
 * source back down into markdown. Editing either surface works, and the
 * generated file stays the thing the app imports.
 *
 * Run directly with: npx tsx script/syncPostBodies.ts
 */

import { readFile, writeFile, readdir } from "fs/promises";
import path from "path";

const SOURCE = path.resolve("client/src/lib/blogPosts.source.ts");
const MD_DIR = path.resolve("client/src/content/posts");

/** Escape a body so it survives being pasted back into a template literal. */
function escapeForTemplate(body: string): string {
  return body
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

/** Reverse of the above, so a body can be compared against its markdown. */
function unescapeFromTemplate(literal: string): string {
  let out = "";
  for (let i = 0; i < literal.length; i += 1) {
    if (literal[i] === "\\" && i + 1 < literal.length) {
      const next = literal[i + 1];
      if (next === "\\" || next === "`") {
        out += next;
        i += 1;
        continue;
      }
      if (next === "$" && literal[i + 2] === "{") {
        out += "${";
        i += 2;
        continue;
      }
    }
    out += literal[i];
  }
  return out;
}

interface ContentSpan {
  slug: string;
  /** Index of the first character inside the template literal. */
  start: number;
  /** Index of the closing backtick. */
  end: number;
}

/**
 * Locate every `content: \`...\`` block and the slug it belongs to.
 *
 * Scanning for the closing backtick by hand rather than with a regex,
 * because article bodies are full of fenced code blocks and a lazy match
 * would end the first time it saw one.
 */
function findContentSpans(source: string): ContentSpan[] {
  const spans: ContentSpan[] = [];
  const slugRe = /^\s*slug: "([a-z0-9][a-z0-9-]*)",$/gm;

  for (const match of source.matchAll(slugRe)) {
    const slug = match[1];
    const contentAt = source.indexOf("\n    content: `", match.index);
    if (contentAt === -1) continue;

    // Do not run past the next post: a post without a content field would
    // otherwise claim the following post's body.
    const nextSlug = slugRe.lastIndex;
    const nextMatch = source.indexOf('\n    slug: "', match.index + 1);
    if (nextMatch !== -1 && contentAt > nextMatch) continue;
    void nextSlug;

    const start = contentAt + "\n    content: `".length;
    let i = start;
    while (i < source.length) {
      if (source[i] === "\\") {
        i += 2;
        continue;
      }
      if (source[i] === "`") break;
      i += 1;
    }
    if (i >= source.length) throw new Error(`unterminated content for ${slug}`);
    spans.push({ slug, start, end: i });
  }
  return spans;
}

export async function syncPostBodies(): Promise<number> {
  const source = await readFile(SOURCE, "utf8");
  const spans = findContentSpans(source);
  if (spans.length === 0) {
    throw new Error("parsed zero post bodies out of blogPosts.source.ts");
  }

  const files = new Set(
    (await readdir(MD_DIR)).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)),
  );

  const changed: string[] = [];
  // Rebuild back to front so earlier offsets stay valid.
  let out = source;
  for (const span of [...spans].reverse()) {
    if (!files.has(span.slug)) continue;
    const markdown = await readFile(path.join(MD_DIR, `${span.slug}.md`), "utf8");
    const current = unescapeFromTemplate(source.slice(span.start, span.end));
    if (markdown === current) continue;
    out = out.slice(0, span.start) + escapeForTemplate(markdown) + out.slice(span.end);
    changed.push(span.slug);
  }

  if (changed.length > 0) {
    await writeFile(SOURCE, out, "utf8");
  }

  const missing = [...files].filter((f) => !spans.some((s) => s.slug === f));
  if (missing.length > 0) {
    console.warn(
      `  warning: ${missing.length} markdown files have no entry in the source: ${missing.slice(0, 5).join(", ")}`,
    );
  }

  console.log(
    changed.length === 0
      ? `  post bodies: ${spans.length} in sync`
      : `  post bodies: folded ${changed.length} markdown edits back into the source (${changed.slice(0, 6).join(", ")}${changed.length > 6 ? ", ..." : ""})`,
  );
  return changed.length;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]).endsWith("syncPostBodies.ts");
if (invokedDirectly) {
  await syncPostBodies();
}
