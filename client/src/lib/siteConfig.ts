export const siteConfig = {
  name: "Max Doubin",
  tagline: "Builder. Engineer. Creator.",
  shortBio: "I build things that push boundaries — from hyper-realistic datacenter simulations to full-stack applications. I'm passionate about creating software that's both technically impressive and genuinely useful.",
  fullBio: [
    "I'm a developer and creator who thrives at the intersection of engineering and design. My work spans 3D visualization, systems architecture, and interactive web experiences.",
    "Currently, I'm building Hyperscale — an immersive datacenter simulation that lets you design, build, and operate realistic server infrastructure. It features procedural generation, real-time thermal simulation, and a full 3D environment.",
    "When I'm not coding, you'll find me exploring new technologies, working on creative projects, and sharing what I learn along the way.",
  ],
  email: "hello@maxdoubin.com",
  social: {
    instagram: {
      handle: "@maxdoubin",
      url: "https://instagram.com/maxdoubin",
    },
    github: {
      handle: "maxdoubin",
      url: "https://github.com/maxdoubin",
    },
  },
  siteUrl: "https://maxdoubin.com",
  skills: [
    "TypeScript",
    "React",
    "Three.js",
    "Node.js",
    "3D Visualization",
    "Full-Stack Development",
    "System Design",
    "UI/UX Design",
  ],
  highlights: [
    {
      title: "Hyperscale Simulator",
      description: "Built a 3D datacenter simulation with 500+ procedurally generated racks, real-time thermal modeling, and interactive controls.",
    },
    {
      title: "Full-Stack Engineering",
      description: "End-to-end development from database design to polished frontend experiences with modern frameworks.",
    },
    {
      title: "Creative Technology",
      description: "Combining engineering precision with design thinking to build experiences that feel premium and intuitive.",
    },
  ],
  projects: [
    {
      id: "hyperscale",
      title: "Hyperscale: Data Center Architect",
      description: "An immersive 3D datacenter simulation where you design, build, and operate realistic server infrastructure. Features procedural generation of up to 500 racks, real-time thermal and power simulation, multiple camera modes, and a full build system.",
      tech: ["React", "Three.js", "TypeScript", "React Three Fiber"],
      link: "/game",
      isGame: true,
      coverImage: "/images/blog-cover-datacenter.png",
    },
    {
      id: "portfolio",
      title: "Personal Website",
      description: "This site — a modern, responsive personal website built with React and Tailwind CSS. Features a static blog system, dark mode, and clean design.",
      tech: ["React", "TypeScript", "Tailwind CSS", "Vite"],
      link: "/",
      coverImage: "/images/blog-cover-webdev.png",
    },
  ],
};

export type SiteConfig = typeof siteConfig;
