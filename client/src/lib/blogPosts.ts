export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  excerpt: string;
  coverImage: string;
  draft?: boolean;
  content: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "building-hyperscale",
    title: "Building Hyperscale: A 3D Datacenter Simulator",
    date: "2026-02-20",
    tags: ["three.js", "react", "simulation", "networking"],
    excerpt:
      "How I built an immersive 3D datacenter simulation with procedural generation, real-time thermal modeling, and React Three Fiber.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## Why I Built This

I wanted to build something that felt like walking through a real datacenter, not a simplified dashboard or an abstract visualization. The idea was straightforward: what if you could design, build, and operate a server room entirely from your browser?

The project started because I was spending a lot of time in my homelab working with real rack hardware, cabling, and airflow planning. I wanted a way to prototype datacenter layouts and test ideas visually before committing to physical changes.

## Tech Stack

The foundation is **React Three Fiber**, which gives you the rendering power of Three.js with the component model of React. Every rack, server, and cable is a React component with its own state and lifecycle.

\`\`\`typescript
function Rack3D({ rack, position, isSelected, onSelect }) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    if (groupRef.current) {
      const targetY = hovered || isSelected ? 0.05 : 0;
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y, targetY, 0.15
      );
    }
  });

  return <group ref={groupRef} position={position}>
    {/* Rack contents */}
  </group>;
}
\`\`\`

## Procedural Generation

The most interesting challenge was procedural generation. Each rack needs realistic equipment (servers, switches, storage arrays) placed in valid U-slots with realistic power and thermal profiles.

I used seeded randomization so the same seed always produces the same datacenter layout. The scene is deterministic but still feels organic and varied.

## Thermal Simulation

Every piece of equipment generates heat based on its power draw. Racks accumulate inlet and exhaust temperatures. The visual representation changes accordingly: racks shift from green (cool) through yellow and orange to red (critical).

This ties directly into real datacenter concepts like hot aisle/cold aisle containment and cooling capacity planning.

## What I Learned

Building this project taught me a lot about the relationship between software and physical infrastructure. Datacenter design is not just about putting servers in a room. It is about airflow, power distribution, redundancy, and monitoring. Translating those real constraints into a simulation forced me to understand them deeply.

## What Is Next

I am planning to add network traffic visualization, incident management workflows, and a full economic simulation where you manage budgets and SLAs. The goal is to make it a real learning tool for anyone interested in infrastructure.
`,
  },
  {
    slug: "why-homelabs-matter",
    title: "Why Homelabs Matter for Learning Networking",
    date: "2026-02-10",
    tags: ["networking", "homelab", "infrastructure"],
    excerpt:
      "How running real enterprise hardware at home changed the way I learn about networking, systems, and troubleshooting.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Beyond the Textbook

Reading about VLANs and subnetting is one thing. Configuring them on real hardware, breaking something, and spending two hours figuring out why your trunk port is dropping tagged traffic is a completely different experience. That is why I run a homelab.

My homelab currently has 14 TB of RAM and over 500 TB of storage across multiple Dell enterprise servers. It is not a Raspberry Pi cluster or a single tower PC. It is enterprise hardware running enterprise workloads, and that is the point.

## What I Actually Run

The core of the lab is built around Dell servers. I use them for:

- **Virtualization workloads** to simulate multi-site environments
- **Network segmentation testing** with real VLANs, trunking, and inter-VLAN routing
- **Storage experiments** to understand capacity planning, redundancy, and performance
- **Security testing** with isolated segments for controlled lab exercises

## Why Scale Matters

A lot of people ask why I need that much hardware at home. The answer is that real environments are messy. When you only have one server and one switch, everything is simple. When you have multiple systems, multiple network segments, and real data moving between them, you start hitting the problems that professionals deal with every day.

That is where the real learning happens: debugging a routing issue across segments, figuring out why a firewall rule is blocking traffic you expected to pass, or tracing a performance problem through layers of infrastructure.

## Building Good Habits

The homelab also taught me documentation habits. When you have complex infrastructure, you cannot rely on memory. I keep diagrams, runbooks, and change logs. Every time I make a change, I document what I did, why I did it, and how to reverse it if something goes wrong.

These habits carry directly into professional environments. The difference between a good administrator and a great one is often just documentation and discipline.

## Getting Started

If you are interested in building a homelab, start with whatever you have. A single used server from eBay and a managed switch will teach you more than months of reading documentation. The important thing is to build, break, fix, and document.
`,
  },
  {
    slug: "ncl-competition-lessons",
    title: "Lessons from Competing in the National Cyber League",
    date: "2026-01-28",
    tags: ["cybersecurity", "competition", "networking"],
    excerpt:
      "What I learned from reaching the 99th percentile in competitive cybersecurity, and why the process matters more than the ranking.",
    coverImage: "/images/blog-cover-webdev.png",
    content: `
## What NCL Actually Tests

The National Cyber League is not about memorizing textbook definitions. It tests practical skills across categories like network traffic analysis, log investigation, scanning and reconnaissance, password cracking, web application security, and cryptography. Every challenge requires you to actually do the work, not just know the theory.

## How I Approach Challenges

My process for each challenge follows a consistent pattern:

1. **Read the problem carefully.** Most mistakes come from rushing past the details.
2. **Identify what tools and techniques apply.** Is this a packet capture? A log file? A web vulnerability?
3. **Work methodically.** Try the most likely explanation first, verify it, and move on.
4. **Document what you find.** Even during a timed competition, noting your process helps you avoid repeating dead ends.

## Tools I Use Most

- **Wireshark** for packet analysis challenges. Understanding TCP flows, DNS queries, and HTTP headers at the packet level is essential.
- **Nmap** for scanning and reconnaissance. Knowing how to interpret scan results tells you a lot about a target's configuration.
- **Python** for quick scripting when a challenge requires processing data or automating repetitive tasks.
- **Linux command line** for log analysis, file manipulation, and general problem solving.

## What Competitions Teach You

The ranking is nice, but the real value is in the habits you build. Competitions force you to stay calm under pressure, verify your work, and think logically when nothing is working the way you expect.

Those habits translate directly to real-world troubleshooting. When a network goes down at 2 AM, the person who stays methodical and follows evidence is the one who finds the problem.

## Advice for New Competitors

Start with the fundamentals. If you understand networking basics (TCP/IP, DNS, HTTP, routing) and know your way around Linux, you already have a strong foundation. From there, practice with capture files, set up vulnerable labs, and work through challenges at your own pace.

The 99th percentile does not come from shortcuts. It comes from consistent practice and the discipline to work through problems even when they are frustrating.
`,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug && !post.draft);
}

export function getAllPosts(): BlogPost[] {
  return blogPosts
    .filter((post) => !post.draft)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostsByTag(tag: string): BlogPost[] {
  return getAllPosts().filter((post) => post.tags.includes(tag));
}

export function getAllTags(): string[] {
  const tags = new Set<string>();
  getAllPosts().forEach((post) => post.tags.forEach((tag) => tags.add(tag)));
  return Array.from(tags).sort();
}
