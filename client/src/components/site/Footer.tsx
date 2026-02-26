import { siteConfig } from "@/lib/siteConfig";
import { Instagram, Github, Mail } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border/50 bg-background/50" data-testid="footer">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <div className="text-sm font-semibold text-foreground">{siteConfig.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Enterprise Networking, Cybersecurity, and Systems Engineering
            </div>
          </div>

          <div className="flex items-center gap-4">
            <a
              href={siteConfig.social.instagram.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Instagram"
              data-testid="link-instagram-footer"
            >
              <Instagram className="h-5 w-5" />
            </a>
            <a
              href={siteConfig.social.github.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="GitHub"
              data-testid="link-github-footer"
            >
              <Github className="h-5 w-5" />
            </a>
            <a
              href={`mailto:${siteConfig.email}`}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Email"
              data-testid="link-email-footer"
            >
              <Mail className="h-5 w-5" />
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-border/30 pt-6 text-center text-xs text-muted-foreground">
          &copy; {currentYear} {siteConfig.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
