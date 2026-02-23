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
    tags: ["three.js", "react", "gamedev", "3d"],
    excerpt: "How I built an immersive 3D datacenter simulation with procedural generation, real-time thermal modeling, and React Three Fiber.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## The Vision

I wanted to build something that felt real — not a toy dashboard, but an actual datacenter you could walk through. The idea was simple: what if you could design and operate a server room from your browser?

## Tech Stack

The foundation is **React Three Fiber**, which gives us the power of Three.js with the ergonomics of React. Every rack, server, and cable is a React component with its own state and lifecycle.

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

The most interesting challenge was procedural generation. Each rack needs realistic equipment — servers, switches, storage arrays — placed in valid U-slots with realistic power and thermal profiles.

I used seeded randomization so the same seed always produces the same datacenter layout. This means the scene is deterministic but still feels organic and varied.

## Thermal Simulation

Every piece of equipment generates heat based on its power draw. Racks accumulate inlet and exhaust temperatures. The visual representation changes — racks glow from green (cool) through yellow and orange to red (critical).

## What's Next

I'm planning to add network traffic visualization, incident management workflows, and a full economic simulation where you manage budgets and SLAs.

Stay tuned for more updates on the build process.
`,
  },
  {
    slug: "modern-web-architecture",
    title: "Lessons in Modern Web Architecture",
    date: "2026-02-10",
    tags: ["architecture", "typescript", "web"],
    excerpt: "Key lessons learned from building complex web applications — from state management patterns to performance optimization.",
    coverImage: "/images/blog-cover-webdev.png",
    content: `
## Keep It Simple

The best architecture is the one you don't notice. After years of building web apps, the biggest lesson is that simplicity wins. Every abstraction you add is a tax on future development.

## State Management

For most applications, React Context plus a good data fetching library (like TanStack Query) is all you need. Redux and other heavy state managers add complexity that rarely pays off.

\`\`\`typescript
const GameContext = createContext<GameState | null>(null);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}
\`\`\`

## Performance Matters

In 3D web applications, performance isn't optional. A few things I've learned:

- **Instanced meshes** for repeated geometry (like server rack posts)
- **LOD (Level of Detail)** switching based on camera distance
- **Lazy loading** for heavy components with React.lazy
- **Web Workers** for computations that don't need to block the main thread

## TypeScript Everywhere

Full-stack TypeScript with shared types between frontend and backend eliminates an entire category of bugs. When your API contract is enforced at compile time, you catch issues before they reach production.

## Build for the User

At the end of the day, architecture serves the user experience. Fast load times, smooth interactions, and intuitive interfaces matter more than clever code patterns.
`,
  },
  {
    slug: "creative-coding-journey",
    title: "My Journey into Creative Coding",
    date: "2026-01-28",
    tags: ["creative", "coding", "personal"],
    excerpt: "How I discovered the intersection of art and engineering, and why building visual experiences is the most rewarding kind of programming.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Where It Started

I've always been drawn to things you can see and interact with. While some developers love optimizing database queries or building APIs, I get excited when pixels move on screen in response to code I wrote.

## The Appeal of 3D on the Web

WebGL and Three.js opened up a world where the browser became a canvas for 3D experiences. No plugins, no downloads — just open a URL and you're inside a virtual world.

The combination of React's component model with Three.js's rendering power (via React Three Fiber) is genuinely exciting. You get the best of both worlds: declarative UI patterns and raw GPU performance.

## What I've Learned

1. **Start with the feeling.** Before writing code, I ask: what should this feel like to use? The technical implementation follows the experience design.

2. **Performance is a feature.** In creative coding, a dropped frame breaks the illusion. Optimize early and often.

3. **Details matter.** The difference between "okay" and "wow" is usually in the small things — a subtle shadow, a smooth transition, the right easing curve.

4. **Ship it.** Perfectionism is the enemy of creative work. Get it in front of people and iterate.

## What's Next

I'm exploring more interactive experiences — things that blur the line between tool and art. The web platform keeps getting more capable, and I want to push it as far as it can go.

If you want to follow along, check out my [Instagram](https://instagram.com/maxdoubin) where I share works in progress and behind-the-scenes looks at what I'm building.
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
