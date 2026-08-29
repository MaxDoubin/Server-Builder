/**
 * The recommended-resources directory behind /links.
 *
 * Extracted from the page component so the prerenderer can render the same
 * list into the static HTML. /links previously shipped the site nav and
 * nothing else to anything that does not run JavaScript.
 */

export interface Resource {
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

export interface ResourceGroup {
  id: string;
  label: string;
  heading: string;
  summary: string;
  items: Resource[];
}

export const LINK_GROUPS: ResourceGroup[] = [
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
