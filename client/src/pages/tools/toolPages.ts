/**
 * The slug to page map behind the single /tools/:slug route.
 *
 * App.tsx used to carry one lazy import and one <Route> per tool, and
 * prefetchOnHover.ts one row per tool, which cost the entry bundle about
 * 0.45 KB a tool. This module replaces all of that, and both of those files
 * reach it only through a dynamic import, so it and the registry it reads
 * stay out of the entry. A new tool therefore costs the entry nothing.
 *
 * The glob loaders are lazy (Vite's default), so every page is still its own
 * chunk and a visitor opening one tool downloads that page, this small map
 * and nothing else.
 */

import type { ComponentType } from "react";
import { TOOLS } from "@/lib/toolsRegistry";
import { toolPageName } from "@/lib/toolPageName";

type PageModule = Record<string, ComponentType | undefined>;

// ToolShell is the frame every page renders inside, not a page of its own.
const PAGES = import.meta.glob<PageModule>(["./*.tsx", "!./ToolShell.tsx"]);

/*
  Only registry slugs resolve. The registry is what the tools index, the
  palette, the sitemap and the prerender all list, so a page file with no
  entry stays unreachable here too, exactly as it is everywhere else.
*/
const SLUGS = new Set(TOOLS.map((tool) => tool.slug));

/**
 * The page for a slug, in the { default } shape React.lazy expects. An
 * unknown slug resolves to the site's not-found page, the same one the
 * router's catch-all renders, so /tools/does-not-exist looks exactly as it
 * did when every tool had its own route and nothing matched.
 */
export async function loadToolPage(slug: string): Promise<{ default: ComponentType }> {
  const name = toolPageName(slug);
  const load = SLUGS.has(slug) ? PAGES[`./${name}.tsx`] : undefined;
  const page = load ? (await load())[name] : undefined;
  if (page) return { default: page };

  const { CinematicNotFound } = await import("@/pages/cinematic/CinematicNotFound");
  return { default: CinematicNotFound };
}
