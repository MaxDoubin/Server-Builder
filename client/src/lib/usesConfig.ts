/**
 * Content for the /uses page.
 *
 * Software and services only. Hardware, rack gear, and model numbers are
 * deliberately absent from this site and must not be added here: the page is
 * about the tools, not the inventory.
 *
 * Every entry that renders is traceable to something in this repository or to
 * a published Field Notes post. Anything seeded from a guess carries
 * `unconfirmed: true` and the page skips it, so nothing unverified ships.
 * Max: confirm an entry, delete the flag, and it appears.
 */

export interface UsesItem {
  name: string;
  /** One honest sentence on why this and not the alternative. */
  why: string;
  /**
   * Seeded but not verified against how Max actually works, so the page does
   * not render it. Remove the flag once the entry is true.
   */
  unconfirmed?: boolean;
}

export interface UsesGroup {
  /** Anchor id and React key. */
  id: string;
  label: string;
  heading: string;
  /** One sentence framing the group. Optional. */
  summary?: string;
  items: UsesItem[];
}

export const usesConfig: { intro: string; groups: UsesGroup[] } = {
  intro:
    "The software I actually reach for, and the reason each one displaced whatever came before it. Short list on purpose: the win is not in having many tools, it is in knowing a few of them well enough to pick the right one without thinking.",

  groups: [
    {
      id: "editor-terminal",
      label: "· Uses · Editor and terminal",
      heading: "Editor and terminal",
      summary:
        "Most of the work happens over SSH on machines that are not in front of me, so the terminal setup matters more than the editor does.",
      items: [
        {
          // Seeded from nothing verifiable: no editor config in this repo and
          // no editor named in any published post. Confirm before shipping.
          name: "Visual Studio Code",
          why: "Placeholder entry. Not rendered until confirmed.",
          unconfirmed: true,
        },
        {
          name: "OpenSSH, with a real ssh_config",
          why: "ControlMaster and ControlPersist reuse one connection instead of handshaking every time, ProxyJump removes the two hop dance, and host patterns mean adding a machine is two lines instead of a new habit.",
        },
        {
          name: "tmux",
          why: "Somewhere to leave a long job running that survives a dropped connection, which is the entire reason I use it. Everything else it does is a bonus.",
        },
        {
          name: "ripgrep",
          why: "Faster than grep -r on a large tree, respects ignore files by default, and skips binaries without being told.",
        },
        {
          name: "jq",
          why: "Nearly everything returns JSON now. Parsing it with grep and cut produces a script that breaks the first time a field moves.",
        },
        {
          name: "Git and GitHub",
          why: "Every post, page, and config on this site is a commit. History is the only revision tool I trust.",
        },
      ],
    },

    {
      id: "languages",
      label: "· Uses · Languages",
      heading: "Languages",
      items: [
        {
          name: "Python",
          why: "First choice for anything that talks to a device or parses output. The standard library covers most of what network automation needs before any dependency does.",
        },
        {
          name: "JavaScript and TypeScript",
          why: "What this site is written in. TypeScript specifically, because a config file that half the pages read should fail at build time when I rename a field, not in someone's browser.",
        },
        {
          name: "Bash",
          why: "The glue. Small, reviewable, and already installed on every box, which is the whole argument for it over something nicer.",
        },
      ],
    },

    {
      id: "networking",
      label: "· Uses · Networking and analysis",
      heading: "Networking and analysis",
      summary:
        "The evidence-gathering set. These are the tools that turn a report of slowness into a specific claim about a specific layer.",
      items: [
        {
          name: "Wireshark",
          why: "When a protocol does not behave the way the documentation implies, the capture is the argument. It is also the fastest way to find out that what I believed about a handshake was approximate.",
        },
        {
          name: "tcpdump",
          why: "Capture where the traffic is, read it somewhere comfortable. Wireshark is the better reader; tcpdump is the one already on the server.",
        },
        {
          name: "nmap",
          why: "Host and service discovery, and a reality check against the network diagram. Scan only what is yours.",
        },
        {
          name: "dig",
          why: "The DNS answer as the resolver actually sees it, including the sections a browser hides. +trace is the flag that turns a guess into a resolution path.",
        },
        {
          name: "ss",
          why: "netstat is deprecated on most distributions and reads through a slower interface. ss -ti gives round trip time, congestion window, and retransmits per socket, which usually settles whether the problem is the network or the application.",
        },
        {
          name: "mtr",
          why: "A traceroute is one sample per hop, which is the wrong sample size for intermittent loss. mtr runs continuously and gives loss per hop over time, which is evidence instead of anecdote.",
        },
      ],
    },

    {
      id: "virtualization",
      label: "· Uses · Virtualization",
      heading: "Virtualization and containers",
      summary:
        "Software layer only. What runs it stays off this page.",
      items: [
        {
          name: "Proxmox VE",
          why: "KVM and LXC under one interface, clustering without a licence server, and a config format I can read. For a lab that gets rebuilt often, that last part matters more than features.",
        },
        {
          name: "KVM and QEMU",
          why: "The layer underneath. Worth knowing directly, because when a VM misbehaves the answer is usually in the hypervisor's view of it and not the management interface's.",
        },
        {
          name: "Docker",
          why: "For services where the whole point is that they are disposable. Anything with state I would rather run in a VM I can snapshot.",
        },
      ],
    },

    {
      id: "monitoring",
      label: "· Uses · Monitoring",
      heading: "Monitoring and logging",
      summary:
        "Nothing here is exotic. The value is in having it running before the incident, not in the tool.",
      items: [
        {
          name: "Prometheus",
          why: "Pull based scraping and a query language that makes a rate over time trivial to ask for. Alerting rules live next to the metrics that fire them.",
        },
        {
          name: "Grafana",
          why: "One place to put the dashboards. A graph nobody looks at is not monitoring, so the bar is whether a panel would change what I do.",
        },
        {
          name: "Centralized syslog",
          why: "Logs on the box that died are logs you do not have. Shipping them off the host first is the cheapest reliability work available.",
        },
        {
          name: "SNMP polling, and streaming telemetry where a platform supports it",
          why: "Polling asks the same question forever and hopes the answer arrives in the window. Streaming flips who talks first, which changes what you can actually see between polls.",
        },
      ],
    },

    {
      id: "writing",
      label: "· Uses · Writing",
      heading: "Writing",
      items: [
        {
          name: "Markdown, one file per post",
          why: "Plain text in the repository. The archive is hundreds of files that any editor can open and that diff cleanly, which is more than a database of posts can say.",
        },
        {
          name: "No CMS",
          why: "A post is a file and a commit. There is no admin login to secure, no database to back up, and nothing to migrate when the tooling changes.",
        },
        {
          name: "Git history as the revision log",
          why: "If I change a claim in an old post, the change is visible. That matters on a site where the writing is the credential.",
        },
      ],
    },

    {
      id: "site",
      label: "· Uses · This site",
      heading: "This site's own stack",
      summary:
        "The short version. The long version, including the decisions that were wrong the first time, is on the colophon.",
      items: [
        {
          name: "React 18 and TypeScript",
          why: "The site is one application with a lot of shared structure. Types are what keep a shared config file from silently breaking a page nobody opened during review.",
        },
        {
          name: "Vite",
          why: "Fast builds, and manual control over chunk splitting, which this site needs more than most because the 3D scene must never load on a page that has no canvas.",
        },
        {
          name: "Tailwind CSS",
          why: "Design tokens in one config and no stylesheet drifting away from the markup that uses it.",
        },
        {
          name: "wouter",
          why: "Routing for a static site should be a few kilobytes, not a framework. It does exactly what this site needs and nothing else.",
        },
        {
          name: "Framer Motion, GSAP, and Lenis",
          why: "Framer for component transitions, GSAP for the pinned scroll scenes, Lenis for the scroll itself. Three libraries because each one is genuinely better at its own job.",
        },
        {
          name: "React Three Fiber",
          why: "The data center scene is real 3D, so it needs a real renderer. It is also the heaviest thing on the site, which is why it is quarantined in its own chunk.",
        },
        {
          name: "Cloudflare Pages",
          why: "Static files on a global edge, no server to patch, and nothing behind the site that can be compromised because there is nothing behind the site.",
        },
      ],
    },
  ],
};
