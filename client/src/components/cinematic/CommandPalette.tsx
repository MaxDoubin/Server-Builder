/**
 * One box that reaches everything on the site.
 *
 * The archive is 247 articles, 20 tools, 16 rack elevations, 249 hardware
 * models, nine competition guides and three dozen other pages, behind a
 * nine item navigation bar. Everything is reachable and almost nothing is
 * findable: knowing the site has a chmod calculator does not tell you it is
 * under Tools rather than under the study material, and knowing there is an
 * article about RAID rebuild arithmetic does not tell you what it is called.
 *
 * Cmd+K, or Ctrl+K, or pressing / anywhere that is not already a text field.
 *
 * WHAT IT SEARCHES. Titles, and only titles, plus the tags and keywords each
 * registry already carries. Not article bodies: /blog has a real full text
 * search that fetches a prebuilt inverted index, and duplicating that here
 * would mean either shipping the index to every page or a palette that is
 * blank until a network round trip finishes. A palette is for getting
 * somewhere you already have in mind. Searching for what you do not is what
 * the archive page is for, and the palette links to it.
 *
 * WHAT IT COSTS on a page where nobody opens it: nothing beyond this file.
 *
 * That took two corrections and both were the same mistake. This component
 * lives in the layout every page uses, so anything it imports at the top is
 * in the critical path of the whole site, and the bundler is quite right to
 * put it there. First the post index went in, and the contact form started
 * downloading the titles of 247 articles. Then, with that fixed, the tool
 * and rack registries were still static, and the entry closure was 51KB over
 * its budget, because a rack definition carries every device in it.
 *
 * So everything the palette searches is now loaded when it is first opened,
 * and nothing before: the registries and the post index by dynamic import,
 * the hardware catalogue by fetch. A reader who never presses the key pays
 * for this file and nothing else.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { PostMeta } from "@/lib/postIndex";
import type { ToolEntry } from "@/lib/toolsRegistry";
import type { RackDefinition } from "@/lib/rackTypes";

/** One thing you can go to. */
interface Entry {
  /** Grouping, and the label on the section header. */
  kind: "Page" | "Tool" | "Rack" | "Hardware" | "Article";
  title: string;
  href: string;
  /** Shown under the title. */
  detail?: string;
  /** Matched as well as the title, never displayed. */
  terms?: string;
}

/** Pages worth reaching by name that are not in any registry. */
const PAGES: Entry[] = [
  { kind: "Page", title: "Home", href: "/" },
  { kind: "Page", title: "Field notes", href: "/blog", detail: "The whole archive, with full text search", terms: "blog articles writing posts" },
  { kind: "Page", title: "Tools", href: "/tools", detail: "Every utility on one page" },
  { kind: "Page", title: "Rack library", href: "/racks", detail: "Annotated elevations" },
  { kind: "Page", title: "Rack builder", href: "/racks/build", detail: "Build one from real hardware", terms: "make create design" },
  { kind: "Page", title: "The wired rack", href: "/racks/wired", detail: "Fourteen units of UniFi, patched" },
  { kind: "Page", title: "Hardware catalogue", href: "/gear", detail: "Every model, measured", terms: "gear devices products ubiquiti unifi" },
  { kind: "Page", title: "Build simulator", href: "/game", detail: "Hyperscale", terms: "game play" },
  { kind: "Page", title: "Projects", href: "/projects" },
  { kind: "Page", title: "Resume", href: "/resume", terms: "cv experience" },
  { kind: "Page", title: "Timeline", href: "/timeline" },
  { kind: "Page", title: "Certifications", href: "/certifications", terms: "certs comptia cisco" },
  { kind: "Page", title: "Study by exam objective", href: "/study", terms: "security+ network+ ccna revision" },
  { kind: "Page", title: "Flashcards", href: "/flashcards", terms: "spaced repetition anki revision" },
  { kind: "Page", title: "Study timer", href: "/study-timer", terms: "pomodoro focus" },
  { kind: "Page", title: "NCL competition guides", href: "/ncl", terms: "ctf cyber league capture the flag" },
  { kind: "Page", title: "Cyber club", href: "/cyber-club" },
  { kind: "Page", title: "Cyber club in a box", href: "/cyber-club/kit", terms: "teaching starter kit" },
  { kind: "Page", title: "Coding camps", href: "/coding-camps" },
  { kind: "Page", title: "Open datasets", href: "/data", terms: "csv json download open data" },
  { kind: "Page", title: "Reading paths", href: "/paths" },
  { kind: "Page", title: "Topics", href: "/topics", terms: "tags subjects" },
  { kind: "Page", title: "Roadmap", href: "/roadmap", terms: "what is next" },
  { kind: "Page", title: "Now", href: "/now", terms: "current" },
  { kind: "Page", title: "Uses", href: "/uses", terms: "setup kit gear" },
  { kind: "Page", title: "Colophon", href: "/colophon", terms: "how this site is built" },
  { kind: "Page", title: "Teardown", href: "/teardown" },
  { kind: "Page", title: "FAQ", href: "/faq", terms: "questions" },
  { kind: "Page", title: "Links", href: "/links" },
  { kind: "Page", title: "Subscribe", href: "/subscribe", terms: "rss newsletter email" },
  { kind: "Page", title: "Ask me anything", href: "/ask" },
  { kind: "Page", title: "Contact", href: "/contact", terms: "email get in touch hire" },
];

/** Shape of the hardware catalogue, only the fields the palette needs. */
interface GearItem {
  slug: string;
  name: string;
  sku: string | null;
  group: string;
  mount: string;
}

/**
 * Score a match, so the ordering is useful rather than alphabetical.
 *
 * The rule that matters is that an exact title beats a prefix beats a word
 * boundary beats a substring beats a hit that was only in the hidden terms.
 * Without it, typing "cron" put four articles mentioning cron above the cron
 * explainer, which is certainly what you meant by typing four letters.
 */
function score(entry: Entry, q: string): number {
  const title = entry.title.toLowerCase();
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title)) return 60;
  if (title.includes(q)) return 40;
  const rest = `${entry.detail ?? ""} ${entry.terms ?? ""}`.toLowerCase();
  if (rest.includes(q)) return 20;
  return 0;
}

/** Every term has to land somewhere, so a second word narrows. */
function rank(entry: Entry, terms: string[]): number {
  let total = 0;
  for (const t of terms) {
    const s = score(entry, t);
    if (s === 0) return 0;
    total += s;
  }
  /* A short title matching is a better match than a long one containing it. */
  return total - entry.title.length * 0.05;
}

const KIND_ORDER: Entry["kind"][] = ["Page", "Tool", "Rack", "Hardware", "Article"];
const MAX_SHOWN = 24;

export function CommandPalette() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [gear, setGear] = useState<GearItem[] | null>(null);
  const [posts, setPosts] = useState<PostMeta[] | null>(null);
  const [tools, setTools] = useState<ToolEntry[] | null>(null);
  const [racks, setRacks] = useState<RackDefinition[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  /* Where focus was, so closing puts it back rather than on the body. */
  const returnTo = useRef<HTMLElement | null>(null);

  /* Cmd+K, Ctrl+K, or / when the reader is not already typing somewhere. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        returnTo.current = document.activeElement as HTMLElement | null;
        setOpen((v) => !v);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        returnTo.current = document.activeElement as HTMLElement | null;
        setOpen(true);
      }
    };
    /* The navigation's Search button, for readers who never press a shortcut. */
    const onOpen = () => {
      returnTo.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("command-palette:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("command-palette:open", onOpen);
    };
  }, []);

  /* Everything it searches, on first open. See the note at the top. */
  useEffect(() => {
    if (!open || posts) return;
    let live = true;
    Promise.all([
      import("@/lib/postIndex"),
      import("@/lib/toolsRegistry"),
      import("@/lib/racks"),
    ])
      .then(([p, t, r]) => {
        if (!live) return;
        setPosts(p.postIndex);
        setTools(t.TOOLS);
        setRacks(r.RACKS);
      })
      .catch(() => {
        /* Those sections are then absent; pages and hardware still work. */
      });
    return () => {
      live = false;
    };
  }, [open, posts]);

  useEffect(() => {
    if (!open || gear) return;
    let live = true;
    fetch("/data/ubiquiti-catalogue.json")
      .then((r) => r.json())
      .then((d: { devices: GearItem[] }) => {
        if (live) setGear(d.devices);
      })
      .catch(() => {
        /* The palette works without it; the hardware section is just absent. */
      });
    return () => {
      live = false;
    };
  }, [open, gear]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    /* After paint, or the input is not in the document yet to be focused. */
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  /* Nothing behind the palette should scroll while it is up. */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [...PAGES];
    for (const t of tools ?? []) {
      out.push({
        kind: "Tool",
        title: t.name,
        href: `/tools/${t.slug}`,
        detail: t.blurb,
        terms: t.keywords.join(" "),
      });
    }
    for (const r of racks ?? []) {
      out.push({
        kind: "Rack",
        title: r.name,
        href: `/racks/${r.slug}`,
        detail: `${r.height}U, ${r.devices.length} devices`,
        terms: r.devices.map((d) => `${d.vendor} ${d.model}`).join(" "),
      });
    }
    for (const p of posts ?? []) {
      if (p.draft) continue;
      out.push({
        kind: "Article",
        title: p.title,
        href: `/blog/${p.slug}`,
        detail: p.excerpt,
        terms: p.tags.join(" "),
      });
    }
    for (const g of gear ?? []) {
      out.push({
        kind: "Hardware",
        title: g.name,
        href: `/gear?q=${encodeURIComponent(g.sku ?? g.name)}`,
        detail: `${g.sku ?? ""} · ${g.group} · mounts ${g.mount}`.replace(/^ · /, ""),
        terms: `${g.sku ?? ""} ${g.slug}`,
      });
    }
    return out;
  }, [gear, posts, tools, racks]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      /* Nothing typed: the pages, which is what a reader who opened this by
         accident most likely wants, rather than 500 rows of everything. */
      return PAGES.slice(0, MAX_SHOWN);
    }
    const terms = q.split(/\s+/).filter(Boolean);
    return entries
      .map((e) => ({ e, s: rank(e, terms) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || KIND_ORDER.indexOf(a.e.kind) - KIND_ORDER.indexOf(b.e.kind))
      .slice(0, MAX_SHOWN)
      .map((x) => x.e);
  }, [entries, query]);

  useEffect(() => setCursor(0), [query]);

  const close = useCallback(() => {
    setOpen(false);
    returnTo.current?.focus?.();
  }, []);

  const go = useCallback(
    (entry: Entry) => {
      setOpen(false);
      navigate(entry.href);
    },
    [navigate],
  );

  /*
    Search-box keys. Escape is deliberately not here: it belongs to the
    dialog, see onDialogKeyDown.
  */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[cursor];
      if (hit) go(hit);
    }
  };

  /*
    Keep Tab inside the dialog.

    aria-modal="true" is a promise to a screen reader that the rest of the
    page is inert, and it was only half true: tabbing forward stayed inside
    because the results list is long, but one Shift+Tab out of the search box
    landed on the "Get in touch" button behind the overlay, which the reader
    cannot see and did not ask for. A modal that leaks backwards is worse
    than one that does not claim to be modal at all.
  */
  const onDialogKeyDown = (e: React.KeyboardEvent) => {
    /*
      Escape has to be handled here rather than on the search input.

      It was on the input, and Tab is trapped inside this dialog, so a reader
      who opened the palette and pressed Tab once was stuck: focus could not
      leave, and the only key that closes the thing no longer reached a
      handler. The way out was clicking the backdrop, which is no way out for
      someone using a keyboard. That is WCAG 2.1.2, and it took one Tab.

      On the dialog it catches Escape from the input, from any result row,
      and from anything added to the modal later.
    */
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const stops = [...root.querySelectorAll<HTMLElement>(
      'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
    )].filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !root.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /* Keep the highlighted row on screen when arrowing past the fold. */
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  return (
    <div
      data-print-hide
      className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[12vh]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="absolute inset-0 bg-[hsl(var(--brand-obsidian)/0.82)] backdrop-blur-sm" aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search this site"
        data-testid="command-palette"
        onKeyDown={onDialogKeyDown}
        className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))] shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-[hsl(var(--brand-iron))] px-4">
          <span aria-hidden className="font-techno text-[11px] tracking-[0.3em] text-[hsl(var(--brand-signal))]">
            ⌘K
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, tools, racks, hardware and articles..."
            aria-label="Search this site"
            aria-controls="command-palette-results"
            data-testid="input-command-palette"
            className="w-full bg-transparent py-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:outline-none"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close search"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono-tight text-xs text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
          >
            ✕
          </button>
        </div>

        {results.length === 0 ? (
          <div className="px-4 py-10 text-center" data-testid="command-palette-empty">
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              Nothing here matches that.
            </p>
            <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              This searches titles. To search inside the articles themselves, try the{" "}
              <button
                type="button"
                onClick={() => go({ kind: "Page", title: "Field notes", href: "/blog" })}
                className="text-[hsl(var(--brand-signal))] hover:underline"
              >
                archive
              </button>
              .
            </p>
          </div>
        ) : (
          <ul
            ref={listRef}
            id="command-palette-results"
            role="listbox"
            aria-label="Results"
            className="max-h-[52vh] overflow-y-auto py-2"
          >
            {results.map((e, i) => (
              <li key={`${e.kind}:${e.href}:${e.title}`} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(e)}
                  data-testid={`command-result-${i}`}
                  className={`flex w-full items-baseline gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === cursor ? "bg-[hsl(var(--brand-iron)/0.55)]" : ""
                  }`}
                >
                  <span className="w-[4.5rem] shrink-0 font-techno text-[9px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
                    {e.kind}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      {e.title}
                    </span>
                    {e.detail ? (
                      <span className="mt-0.5 block truncate font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                        {e.detail}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
          <span>
            {query.trim() ? `${results.length}${results.length === MAX_SHOWN ? "+" : ""} results` : "Start typing"}
          </span>
          <span aria-hidden>↑↓ move · ⏎ open · esc close</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
