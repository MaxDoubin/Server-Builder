/**
 * A copy button on every code block in a post.
 *
 * The article body is injected as an HTML string, so there is no React
 * element for a <pre> to hang a button off. Rather than rewriting the HTML
 * (which would mean parsing and re-serialising markup on every navigation,
 * and hand-escaping anything we put back), each <pre> is wrapped in a
 * positioning div at runtime and the real CopyButton is portalled into it.
 * The button stays a normal React component with its own state.
 *
 * Everything this does to the DOM is undone in the cleanup, so React
 * replacing the body for the next post never leaves an orphan behind.
 */

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CopyButton } from "@/components/ui/copy-button";

interface CodeHost {
  key: string;
  host: HTMLElement;
  code: string;
}

interface Props {
  /** The element holding the rendered post HTML. */
  contentRef: RefObject<HTMLElement | null>;
  /** Changes when the article does. Normally the rendered HTML itself. */
  contentKey: string;
}

export function CodeCopyButtons({ contentRef, contentKey }: Props) {
  const [hosts, setHosts] = useState<CodeHost[]>([]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || !contentKey) {
      setHosts([]);
      return;
    }

    const created: Array<{
      entry: CodeHost;
      pre: HTMLElement;
      wrap: HTMLElement;
      /** Whether the markup already carried one, so cleanup restores it. */
      hadTabIndex: boolean;
    }> = [];

    root.querySelectorAll("pre").forEach((pre, i) => {
      const codeEl = pre.querySelector("code");
      if (!codeEl) return;
      const code = codeEl.textContent ?? "";
      if (!code.trim()) return;

      const parent = pre.parentNode;
      if (!parent) return;

      // The <pre> scrolls horizontally, so a button positioned inside it
      // would slide away with the code. The wrapper is what stays put.
      const wrap = document.createElement("div");
      wrap.className = "relative";
      parent.insertBefore(wrap, pre);
      wrap.appendChild(pre);

      const host = document.createElement("div");
      host.className = "absolute right-2 top-2 z-10";
      wrap.appendChild(host);

      // Buy the button a line of its own rather than letting it sit on top
      // of the first line of code.
      pre.style.paddingTop = "2.9em";

      /*
        A code block wider than the column scrolls sideways (overflow-x: auto
        on .cinematic-prose pre), and a scroll container that cannot take
        focus cannot be scrolled without a pointer. Every long command in
        every post was therefore cut off at the right edge for anyone on a
        keyboard, with no way to reach the rest of the line. tabindex makes
        the block a tab stop, which is what gives the arrow keys something to
        scroll.
      */
      const hadTabIndex = pre.hasAttribute("tabindex");
      if (!hadTabIndex) pre.setAttribute("tabindex", "0");

      created.push({ entry: { key: `code-${i}`, host, code }, pre, wrap, hadTabIndex });
    });

    setHosts(created.map((c) => c.entry));

    return () => {
      for (const { pre, wrap, hadTabIndex } of created) {
        pre.style.paddingTop = "";
        if (!hadTabIndex) pre.removeAttribute("tabindex");
        if (wrap.parentNode) {
          wrap.parentNode.insertBefore(pre, wrap);
          wrap.remove();
        }
      }
    };
  }, [contentRef, contentKey]);

  return (
    <>
      {hosts.map((h) =>
        createPortal(
          <CopyButton
            value={h.code}
            label="Copy this code block"
            testId={`button-copy-${h.key}`}
            className="bg-[hsl(var(--brand-obsidian)/0.85)] backdrop-blur-sm"
          />,
          h.host,
          h.key,
        ),
      )}
    </>
  );
}
