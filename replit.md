# Max Doubin - Personal Website

A professional personal website for Max Doubin, focused on enterprise networking, cybersecurity, and systems engineering. The site features an About Me landing page with a 3D datacenter hero animation, 43 blog posts, projects showcase with category filtering, a contact form, and the Hyperscale datacenter simulation game accessible at /game.

## Overview

Full-stack web application built with React + Express. The landing page is the About Me page with a mind-blowing 3D hero section featuring a datacenter flythrough animation, typing effect, animated stat counters, and scroll-reveal animations throughout. The Hyperscale datacenter game is accessible at /game. No em dashes are used anywhere in the codebase.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Express.js + TypeScript (for dev server; site works statically)
- **Styling**: Tailwind CSS + shadcn/ui components
- **3D Visualization**: Three.js + React Three Fiber (hero + game)
- **Markdown**: marked (for blog post rendering)
- **State Management**: React Context + TanStack Query
- **Routing**: wouter
- **Fonts**: Inter (UI), JetBrains Mono (code blocks)

## Project Structure

```
client/
  src/
    components/
      site/                  # Site-wide components
        Navbar.tsx           # Responsive sticky nav with mobile hamburger
        Footer.tsx           # Site footer with social links
        Layout.tsx           # Page layout wrapper
        ScrollReveal.tsx     # Scroll-triggered fade-in animation wrapper
        AnimatedCounter.tsx  # Number counter that animates on scroll
        HeroErrorBoundary.tsx # Error boundary for 3D hero fallback
      hero/
        HeroAnimation.tsx    # 3D datacenter flythrough (lazy-loaded)
      3d/                    # 3D game visualization components
      builder/               # Game builder UI
      ui/                    # shadcn + custom UI components
    lib/
      siteConfig.ts          # Central site configuration (bio, skills, leadership, projects, achievements)
      blogPosts.ts           # 43 blog posts with full markdown content
      useInView.ts           # IntersectionObserver hook for scroll animations
      game-context.tsx       # Game state management
      build-context.tsx      # Builder state management
      theme-provider.tsx     # Dark/light mode
    pages/
      Home.tsx               # Landing page with 3D hero, typing animation, stats, scroll reveals
      Blog.tsx               # Blog index with tag filtering
      BlogPost.tsx           # Individual blog post view
      Projects.tsx           # Projects showcase with category filtering
      Contact.tsx            # Contact form and social links
      GamePage.tsx           # Game wrapper with fullscreen support and error boundary
      datacenter-3d.tsx      # Core game component
    App.tsx                  # Root app with routing
    main.tsx                 # Entry point
  public/
    images/                  # AI-generated images (hero, blog covers, OG)
    robots.txt               # SEO robots file
    sitemap.xml              # SEO sitemap
    favicon.png              # Site favicon
  index.html                 # HTML template with OG tags and JSON-LD structured data
```

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | Home | Professional landing page with 3D hero, stats, expertise, achievements |
| `/blog` | Blog | Blog index with tag filtering (43 posts) |
| `/blog/:slug` | BlogPost | Individual blog post with markdown rendering |
| `/projects` | Projects | Project cards with category filtering |
| `/game` | GamePage | Hyperscale datacenter simulation |
| `/contact` | Contact | Contact form and social links |

## Content Management

### Adding a Blog Post

1. Open `client/src/lib/blogPosts.ts`
2. Add a new entry to the `blogPosts` array with:
   - `slug`: URL-safe identifier
   - `title`: Post title
   - `date`: YYYY-MM-DD format
   - `tags`: Array of tag strings
   - `excerpt`: Short description
   - `coverImage`: Path to cover image in `/images/`
   - `content`: Markdown content string (no em dashes)
3. Optionally add `draft: true` to hide from listing

### Editing Site Info

Edit `client/src/lib/siteConfig.ts` to change:
- Name, tagline, bio
- Social links (Instagram, GitHub)
- Email address
- Skill categories
- Leadership roles
- Achievements
- Currently section
- Projects (with categories for filtering)

## Features

### Personal Website
- Full-viewport 3D datacenter hero animation with gradient overlays
- Typing animation cycling through specialties
- Animated stat counters (Top 1% Cyber League, #7 Nationally Team, #1 Percussionist, All-State Since 2023+)
- Scroll-reveal animations with staggered timing on all sections
- Card hover effects with glow and lift
- Floating grid background effect
- "Scroll" indicator with bounce animation
- Blog with 43 posts and tag filtering
- Projects showcase with category filtering
- Contact page with validated mailto form
- Dark/light mode toggle with localStorage persistence
- SEO meta tags, Open Graph, and JSON-LD structured data
- Error boundaries for WebGL fallback
- prefers-reduced-motion support
- No em dashes anywhere in the codebase

### Blog Topics
- Enterprise servers (Dell PowerEdge R740, Mac Pro rack-mount)
- Apple hardware analysis (Mac Pro, Afterburner, T2 chip, APFS, Xserve history)
- Networking (VLANs, Cisco switching, STP, 10GbE, subnetting, DNS)
- Cybersecurity (Wireshark, Nmap, firewall policy, incident response)
- Infrastructure (ZFS, RAID, UPS, PDUs, cable management, rack planning)
- Homelab (Proxmox vs ESXi, backups, monitoring, automation)

### Hyperscale Game (at /game)
- Interactive 3D datacenter visualization
- Procedural generation up to 500 racks
- Thermal and power simulation
- Multiple camera modes (orbit, auto, cinematic)
- Build and explore modes
- Equipment catalog with real-world hardware specs
- Fullscreen support
- Lazy-loaded to keep other pages fast
- Error boundary shows friendly message if WebGL unavailable

## Design System

- **Theme**: Professional portfolio with dark mode default
- **Primary Color**: Blue (hsl 217)
- **Typography**: Inter for UI, JetBrains Mono for code
- **Layout**: Max-width 5xl (64rem), 6 unit padding
- **Cards**: Gradient backgrounds, subtle borders, hover glow effects
- **Animations**: hero-entrance, scroll-reveal, typing, floating grid, counter animation

## Running the Project

```bash
npm run dev
```

The app runs on port 5000 with both frontend and backend served together.

## Deployment

The site is published via Replit and accessible at maxdoubin.com.

## Important Notes

- Images must be placed in `client/public/images/` to be included in Vite builds
- No em dashes (the character) are used anywhere; use periods, commas, or rewrite sentences instead
- No references to grade levels, "student", "freshman", or "middle school" in public-facing content
- All content about Max is real and specific; no placeholder or filler text
- Contact form uses mailto: protocol to open the user's email client
- The email address is doubinemail@gmail.com
- 3D hero animation has error boundary with gradient fallback for browsers without WebGL

## Social

- Instagram: @maxdoubin - https://instagram.com/maxdoubin
- GitHub: maxdoubin - https://github.com/maxdoubin
