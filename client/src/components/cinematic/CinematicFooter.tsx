import { Link } from "wouter";

export function CinematicFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] text-[hsl(var(--brand-bone-dim))]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px hairline" />
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-12 px-6 py-20 md:grid-cols-12 md:px-10">
        <div className="md:col-span-5">
          <div className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
            Max Doubin · 15 · Las Vegas, NV
          </div>
          <h3 className="mt-4 max-w-md font-display text-3xl font-medium leading-[1.05] tracking-tight text-[hsl(var(--brand-bone))] md:text-4xl">
            Fifteen years old. Already shipping at enterprise scale.
          </h3>
          <a
            href="mailto:max@maxdoubin.com"
            data-testid="link-footer-email"
            className="mt-6 inline-flex items-center gap-3 font-mono-tight text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--brand-bone))]"
          >
            <span>max@maxdoubin.com</span>
            <span aria-hidden className="inline-block h-px w-8 bg-[hsl(var(--brand-signal))]" />
          </a>
        </div>

        <div className="md:col-span-3">
          <div className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
            Navigate
          </div>
          <ul className="mt-4 space-y-2 font-mono-tight text-sm">
            <li><Link href="/#dossier" className="hover:text-[hsl(var(--brand-bone))]" data-testid="link-footer-dossier">Dossier</Link></li>
            <li><Link href="/projects" className="hover:text-[hsl(var(--brand-bone))]" data-testid="link-footer-projects">Projects</Link></li>
            <li><Link href="/blog" className="hover:text-[hsl(var(--brand-bone))]" data-testid="link-footer-blog">Field notes</Link></li>
            <li><Link href="/game" className="hover:text-[hsl(var(--brand-bone))]" data-testid="link-footer-game">Build simulator</Link></li>
            <li><Link href="/contact" className="hover:text-[hsl(var(--brand-bone))]" data-testid="link-footer-contact-2">Contact</Link></li>
          </ul>
        </div>

        <div className="md:col-span-4">
          <div className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
            Elsewhere
          </div>
          <ul className="mt-4 grid grid-cols-1 gap-2 font-mono-tight text-sm">
            <li>
              <a
                href="https://github.com/MaxFromYT/Server-Builder"
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-[hsl(var(--brand-bone))]"
                data-testid="link-footer-github"
              >
                GitHub · MaxFromYT
              </a>
            </li>
            <li>
              <a
                href="https://instagram.com/maxdoubin"
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-[hsl(var(--brand-bone))]"
                data-testid="link-footer-instagram"
              >
                Instagram · @maxdoubin
              </a>
            </li>
            <li>
              <a
                href="https://instagram.com/percussionmax"
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-[hsl(var(--brand-bone))]"
                data-testid="link-footer-percussionmax"
              >
                Instagram · @percussionmax
              </a>
            </li>
            <li>
              <a
                href="mailto:max@maxdoubin.com"
                className="hover:text-[hsl(var(--brand-bone))]"
                data-testid="link-footer-email-2"
              >
                max@maxdoubin.com
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[hsl(var(--brand-iron)/.6)]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-6 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))] md:px-10">
          <span>© {year} Max Doubin</span>
          <span className="flex items-center gap-2">
            <span
              className="h-[5px] w-[5px] rounded-full bg-[hsl(var(--brand-signal))]"
              style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
            />
            All systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}
