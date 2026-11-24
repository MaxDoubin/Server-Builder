/**
 * Interactive figures placed inside a post's body.
 *
 * The body is Markdown rendered to an HTML string, so there is nowhere in it
 * to write a React element, and teaching the Markdown pipeline a component
 * syntax would mean changing the post source, its mirror in
 * blogPosts.source.ts and the prerenderer together. This does what
 * CodeCopyButtons already does instead: after the body is in the DOM, find
 * the paragraph the figure belongs under, insert a host element after it and
 * portal the component in. The Markdown is untouched, and the cleanup removes
 * the host, so moving to another post leaves nothing behind.
 *
 * The figure is found by a phrase from its paragraph. If the post is edited
 * and the phrase goes, the figure simply does not render: it fails closed
 * rather than landing somewhere it does not belong.
 */

import { lazy, Suspense, useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * THE SWITCH for the spine-leaf ECMP diagram.
 *
 * Set this to null to remove the figure from the site. To move it, change
 * the slug and the phrase: it appears directly under the first paragraph of
 * that post containing the phrase.
 */
export const SPINE_LEAF_FIGURE: { slug: string; afterParagraphContaining: string } | null = {
  slug: "vxlan-network-virtualization",
  afterParagraphContaining: "ECMP hashing in the underlay",
};

// Its own chunk: only the one post that shows the figure ever fetches it.
const SpineLeafFlows = lazy(() => import("@/components/diagrams/spine-leaf/SpineLeafFlows"));

interface Props {
  slug: string;
  /** The element holding the rendered post HTML. */
  contentRef: RefObject<HTMLElement | null>;
  /** Changes when the article does. Normally the rendered HTML itself. */
  contentKey: string;
}

export function PostFigures({ slug, contentRef, contentKey }: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = contentRef.current;
    const figure = SPINE_LEAF_FIGURE;
    if (!root || !contentKey || !figure || figure.slug !== slug) return;

    const anchor = Array.from(root.querySelectorAll("p")).find((p) =>
      p.textContent?.includes(figure.afterParagraphContaining),
    );
    if (!anchor) return;

    const el = document.createElement("div");
    // not-prose: the article's typography rules must not restyle the figure.
    el.className = "not-prose my-10";
    anchor.insertAdjacentElement("afterend", el);
    setHost(el);

    return () => {
      el.remove();
      setHost(null);
    };
  }, [slug, contentRef, contentKey]);

  if (!host) return null;
  return createPortal(
    <Suspense fallback={null}>
      <SpineLeafFlows />
    </Suspense>,
    host,
  );
}
