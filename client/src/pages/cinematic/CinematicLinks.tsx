import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";

interface Resource {
  name: string;
  /**
   * Site roots rather than deep paths, on purpose. A guessed deep link rots
   * and takes the reader's trust with it; a root always resolves.
   */
  url: string;
  why: string;
  /** Shown as a text tag, because colour alone must never carry meaning. */
  access: "Free" | "Free, paid extras";
}

interface ResourceGroup {
  id: string;
  label: string;
  heading: string;
  summary: string;
  items: Resource[];
}

const GROUPS: ResourceGroup[] = [
  {
    id: "fundamentals",
    label: "· Links · Fundamentals",
    heading: "Learn the fundamentals",
    summary:
      "Start here if the vocabulary is still new. Everything in this group explains mechanisms rather than products.",
    items: [
      {
        name: "Cloudflare Learning Center",
        url: "https://www.cloudflare.com/learning/",
        why: "Plain, accurate explanations of DNS, TLS, BGP, DDoS, and the rest of the internet's plumbing. When someone asks me what a protocol does, this is usually where I send them first.",
        access: "Free",
      },
      {
        name: "Ben Eater",
        url: "https://eater.net/",
        why: "Builds a working computer on breadboards and explains every wire, including a series on how Ethernet frames actually get onto the wire. Nothing else makes the bottom of the stack this concrete.",
        access: "Free",
      },
      {
        name: "Wizard Zines, by Julia Evans",
        url: "https://wizardzines.com/",
        why: "Illustrated zines on networking, Linux, and debugging. Several are free, and each one explains in a page what a manual takes a chapter to circle around.",
        access: "Free, paid extras",
      },
    ],
  },
  {
    id: "practice",
    label: "· Links · Practice",
    heading: "Practice and capture the flag",
    summary:
      "Reading about security does not make you good at it. These are where you find out what you actually know.",
    items: [
      {
        name: "picoCTF",
        url: "https://picoctf.org/",
        why: "Built by Carnegie Mellon for beginners, and the challenges stay available between competitions. This is the right first capture the flag for a high school student, with no setup required.",
        access: "Free",
      },
      {
        name: "OverTheWire",
        url: "https://overthewire.org/wargames/",
        why: "Wargames you play over SSH. Bandit teaches the Linux command line by making it the only way forward, which is a far better teacher than a tutorial.",
        access: "Free",
      },
      {
        name: "TryHackMe",
        url: "https://tryhackme.com/",
        why: "Guided rooms with a lot of scaffolding. Good when you want a structured path and a working target machine rather than an empty terminal.",
        access: "Free, paid extras",
      },
      {
        name: "Hack The Box",
        url: "https://www.hackthebox.com/",
        why: "Less hand holding than TryHackMe and closer to real enumeration work. Worth moving to once guided rooms start feeling like following instructions.",
        access: "Free, paid extras",
      },
    ],
  },
  {
    id: "tools",
    label: "· Links · Tools",
    heading: "Tool documentation",
    summary:
      "The official documentation is usually better than the tutorial written about it, and it is always more current.",
    items: [
      {
        name: "Wireshark documentation",
        url: "https://www.wireshark.org/docs/",
        why: "The user guide and the display filter reference. Learning the filter syntax properly is the difference between scrolling a capture and querying it.",
        access: "Free",
      },
      {
        name: "Nmap reference guide",
        url: "https://nmap.org/book/",
        why: "The official reference and most of the Nmap Network Scanning book, online. It explains what each scan type puts on the wire, which matters more than memorising flags.",
        access: "Free",
      },
      {
        name: "OWASP",
        url: "https://owasp.org/",
        why: "The reference point for web application security, including the Top Ten and the testing guide. Read it before you read anything else about web exploitation.",
        access: "Free",
      },
    ],
  },
  {
    id: "reading",
    label: "· Links · Reading",
    heading: "Reading",
    summary:
      "Primary sources. A specification tells you what a protocol promises; an article tells you what one person remembered about it.",
    items: [
      {
        name: "RFC Editor",
        url: "https://www.rfc-editor.org/",
        why: "The standards themselves, free and complete. They are less intimidating than they look once you accept that you read the parts you need rather than the document end to end.",
        access: "Free",
      },
      {
        name: "Julia Evans",
        url: "https://jvns.ca/",
        why: "Blog posts that model how to investigate something you do not understand yet. The method is worth as much as the content.",
        access: "Free",
      },
      {
        name: "NIST Computer Security Resource Center",
        url: "https://csrc.nist.gov/",
        why: "Where the special publications live, including the password guidance that most organisations still have not caught up with. Dry, authoritative, and free.",
        access: "Free",
      },
    ],
  },
  {
    id: "certs",
    label: "· Links · Certification",
    heading: "Certification preparation",
    summary:
      "For the CompTIA and Cisco tracks. Both of these cover full exam objectives without a paywall in front of the core material.",
    items: [
      {
        name: "Professor Messer",
        url: "https://www.professormesser.com/",
        why: "Complete video courses for A+, Network+, and Security+, free to watch, organised objective by objective. Notes and practice exams are the paid part.",
        access: "Free, paid extras",
      },
      {
        name: "NetworkChuck",
        url: "https://networkchuck.com/",
        why: "Networking and CCNA material with the lab work shown rather than described. Useful when a concept has not landed from reading about it.",
        access: "Free, paid extras",
      },
    ],
  },
];

export function CinematicLinks() {
  useSEO({
    title: "Links | Max Doubin",
    description:
      "Free and freemium resources Max Doubin recommends for learning networking and security: fundamentals, capture the flag practice, and certification prep.",
    canonical: "https://maxdoubin.com/links",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Links · Resources
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Where to learn this.
            </h1>
            <p className="mt-6 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The resources I actually recommend when someone asks how to start in networking or
              security. Everything here is free or has a genuinely useful free tier, and each entry
              says why it is worth your time rather than just what it is.
            </p>
            <p className="mt-4 max-w-[64ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              These are external sites with no affiliation to me, and no link here is sponsored.
            </p>
          </header>

          <nav aria-label="Sections on this page" className="mt-10">
            <ul className="flex flex-wrap gap-2">
              {GROUPS.map((group) => (
                <li key={group.id}>
                  <a
                    href={`#${group.id}`}
                    className="inline-flex min-h-[32px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.45)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                  >
                    {group.heading}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-14 space-y-16">
            {GROUPS.map((group) => (
              <section key={group.id} id={group.id} aria-labelledby={`${group.id}-heading`}>
                <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
                  {group.label}
                </div>
                <h2
                  id={`${group.id}-heading`}
                  className="mt-3 font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
                >
                  {group.heading}
                </h2>
                <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {group.summary}
                </p>

                <ul className="mt-6 space-y-3">
                  {group.items.map((item) => (
                    <li key={item.url}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                          <span className="font-display text-base font-medium tracking-tight text-[hsl(var(--brand-bone))]">
                            {item.name} <span aria-hidden>↗</span>
                          </span>
                          <span className="rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-[9px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                            {item.access}
                          </span>
                        </div>
                        <p className="mt-2 max-w-[70ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                          {item.why}
                        </p>
                        <p className="mt-3 break-all font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                          {item.url.replace(/^https:\/\//, "").replace(/\/$/, "")}
                        </p>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section
            aria-labelledby="links-local-heading"
            className="mt-16 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] p-6"
          >
            <h2
              id="links-local-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
            >
              Closer to home
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The{" "}
              <Link
                href="/tools"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                browser tools
              </Link>{" "}
              on this site cover subnetting, packet headers, ciphers, and encoding, and{" "}
              <Link
                href="/blog"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                Field Notes
              </Link>{" "}
              works through most of these topics in more depth. If you are in the Las Vegas area and
              still in school, the{" "}
              <Link
                href="/cyber-club"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                Cyber Club
              </Link>{" "}
              is the fastest way in.
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}

export default CinematicLinks;
