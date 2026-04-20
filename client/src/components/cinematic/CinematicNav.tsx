import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

const NAV_LINKS = [
  { label: "Index", href: "/" },
  { label: "Dossier", href: "/#dossier" },
  { label: "Projects", href: "/projects" },
  { label: "Field Notes", href: "/blog" },
  { label: "Build", href: "/game" },
  { label: "Contact", href: "/contact" },
];

export function CinematicNav() {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [location]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <>
      <header
        className={`fixed left-0 right-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${
          scrolled || open
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
              const active = isActive(link.href);
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

          <div className="flex items-center gap-3">
            <Link
              href="/contact"
              data-testid="button-nav-cta"
              className="group relative hidden h-9 items-center gap-2 overflow-hidden rounded-full border border-[hsl(var(--brand-signal)/.4)] bg-[hsl(var(--brand-signal)/.06)] px-4 font-mono-tight text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--brand-bone))] transition-colors hover:bg-[hsl(var(--brand-signal)/.12)] sm:inline-flex"
            >
              <span
                className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
              />
              Get in touch
            </Link>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="cinematic-mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
              data-testid="button-nav-toggle"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/.6)] md:hidden"
            >
              <span aria-hidden className="relative block h-3 w-5">
                <span
                  className={`absolute left-0 right-0 top-0 h-px bg-current transition-transform duration-200 ${
                    open ? "translate-y-[6px] rotate-45" : ""
                  }`}
                />
                <span
                  className={`absolute left-0 right-0 top-[6px] h-px bg-current transition-opacity duration-200 ${
                    open ? "opacity-0" : "opacity-100"
                  }`}
                />
                <span
                  className={`absolute bottom-0 left-0 right-0 h-px bg-current transition-transform duration-200 ${
                    open ? "-translate-y-[6px] -rotate-45" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        id="cinematic-mobile-nav"
        data-testid="mobile-nav-drawer"
        aria-hidden={!open}
        className={`fixed inset-x-0 top-16 z-40 origin-top border-b border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.96)] backdrop-blur-md transition-[opacity,transform] duration-200 md:hidden ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <nav className="mx-auto flex max-w-[1400px] flex-col gap-1 px-6 py-4">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                data-testid={`link-mobile-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center justify-between rounded-md border border-transparent px-4 py-3 font-mono-tight text-[13px] uppercase tracking-[0.22em] transition-colors ${
                  active
                    ? "border-[hsl(var(--brand-signal)/.4)] bg-[hsl(var(--brand-signal)/.08)] text-[hsl(var(--brand-bone))]"
                    : "text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-iron))] hover:text-[hsl(var(--brand-bone))]"
                }`}
              >
                <span>{link.label}</span>
                {active && (
                  <span
                    className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                    style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
