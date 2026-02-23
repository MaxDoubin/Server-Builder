import { Layout } from "@/components/site/Layout";
import { siteConfig } from "@/lib/siteConfig";
import { Instagram, Github, Mail, ArrowUpRight } from "lucide-react";

export function Contact() {
  return (
    <Layout>
      <div className="pb-16 pt-4">
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-contact-title">Contact</h1>
        <p className="mt-2 text-muted-foreground">
          Want to get in touch? Here's how to reach me.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <a
            href={siteConfig.social.instagram.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card/50 p-6 transition-colors hover:border-border hover:bg-card"
            data-testid="link-contact-instagram"
          >
            <div className="rounded-lg bg-accent p-3">
              <Instagram className="h-5 w-5 text-foreground" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-foreground">Instagram</div>
              <div className="text-sm text-muted-foreground">{siteConfig.social.instagram.handle}</div>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>

          <a
            href={siteConfig.social.github.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card/50 p-6 transition-colors hover:border-border hover:bg-card"
            data-testid="link-contact-github"
          >
            <div className="rounded-lg bg-accent p-3">
              <Github className="h-5 w-5 text-foreground" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-foreground">GitHub</div>
              <div className="text-sm text-muted-foreground">{siteConfig.social.github.handle}</div>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>

          <a
            href={`mailto:${siteConfig.email}`}
            className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card/50 p-6 transition-colors hover:border-border hover:bg-card"
            data-testid="link-contact-email"
          >
            <div className="rounded-lg bg-accent p-3">
              <Mail className="h-5 w-5 text-foreground" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-foreground">Email</div>
              <div className="text-sm text-muted-foreground">{siteConfig.email}</div>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>

        <div className="mt-12 rounded-xl border border-border/50 bg-card/50 p-8">
          <h2 className="text-xl font-semibold text-foreground">Let's Connect</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            I'm always interested in hearing about new projects, collaborations, or just chatting about
            tech. The best way to reach me is through Instagram or email. I try to respond within a day or two.
          </p>
        </div>
      </div>
    </Layout>
  );
}
