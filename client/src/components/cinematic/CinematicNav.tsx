import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

const NAV_LINKS = [
  { label: "Index", href: "/" },
  { label: "Projects", href: "/projects" },
  { label: "Field Notes", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

export function CinematicNav() {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled
          ? "border-b border-[hsl(var(--brand-iron)/.6)] bg-[hsl(var(--brand-obsidian)/.72)] backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6 md:px-10">
        <Link
          href="/"
          className="group flex items-center gap-3 text-[hsl(var(--brand-bone))]"
          data-testid="link-home-wordmark"
        >
          <span
            className="relative block h-5 w-5 rounded-sm border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))]"
            aria-hidden
          >
            <span
              className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--brand-signal))]"
              style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
            />
          </span>
          <span className="font-techno text-[11px] uppercase tracking-[0.32em]">
            Max Doubin
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active =
              link.href === "/"
                ? location === "/"
                : location.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                data-testid={`link-nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`relative px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.22em] transition-colors ${
                  active
                    ? "text-[hsl(var(--brand-bone))]"
                    : "text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                }`}
              >
                <span className="relative">
                  {link.label}
                  {active && (
                    <span
                      className="absolute -bottom-1 left-0 right-0 h-px bg-[hsl(var(--brand-signal))]"
                      style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                    />
                  )}
                </span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/contact"
          data-testid="button-nav-cta"
          className="group relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full border border-[hsl(var(--brand-signal)/.4)] bg-[hsl(var(--brand-signal)/.06)] px-4 font-mono-tight text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--brand-bone))] transition-colors hover:bg-[hsl(var(--brand-signal)/.12)]"
        >
          <span
            className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
            style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
          />
          Get in touch
        </Link>
      </div>
    </header>
  );
}
