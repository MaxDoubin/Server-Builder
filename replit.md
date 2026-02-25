# Max Doubin - Personal Website

A professional personal website for Max Doubin, focused on enterprise networking, cybersecurity, and informatics. The site features an About Me landing page, blog system, projects showcase with category filtering, a contact form, and the Hyperscale datacenter simulation game accessible as a separate section.

## Overview

Full-stack web application built with React + Express. The landing page is the About Me page. The Hyperscale datacenter game is accessible at /game. No em dashes are used anywhere in the codebase.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Express.js + TypeScript (for dev server; site works statically)
- **Styling**: Tailwind CSS + shadcn/ui components
- **3D Visualization**: Three.js + React Three Fiber (game only)
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
      3d/                    # 3D game visualization components
      builder/               # Game builder UI
      ui/                    # shadcn + custom UI components
    lib/
      siteConfig.ts          # Central site configuration (bio, skills, leadership, projects, achievements)
      blogPosts.ts           # Blog post content and utilities
      game-context.tsx       # Game state management
      build-context.tsx      # Builder state management
      theme-provider.tsx     # Dark/light mode
    pages/
      Home.tsx               # Landing page / About Me with hero, skills, achievements, currently section
      Blog.tsx               # Blog index with tag filtering
      BlogPost.tsx           # Individual blog post view
      Projects.tsx           # Projects showcase with category filtering
      Contact.tsx            # Contact form and social links
      GamePage.tsx           # Game wrapper with fullscreen support
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
| `/` | Home | About Me landing page with hero, bio, skills, achievements, currently |
| `/blog` | Blog | Blog index with tag filtering |
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
- Clean, responsive About Me landing page
- Blog with tag filtering and markdown rendering
- Projects showcase with category filtering (networking, simulation, web)
- Contact page with form (mailto-based) and social links
- Dark/light mode toggle with localStorage persistence
- SEO meta tags, Open Graph, and JSON-LD structured data
- Sticky header with backdrop blur
- Mobile hamburger menu with accessibility support
- Skip-to-content link
- prefers-reduced-motion support
- No em dashes anywhere in the codebase

### Hyperscale Game (at /game)
- Interactive 3D datacenter visualization
- Procedural generation up to 500 racks
- Thermal and power simulation
- Multiple camera modes (orbit, auto, cinematic)
- Build and explore modes
- Equipment catalog with real-world hardware specs
- Fullscreen support
- Lazy-loaded to keep other pages fast

## Design System

- **Theme**: Clean, modern personal brand with dark mode default
- **Primary Color**: Blue (hsl 217)
- **Typography**: Inter for UI, JetBrains Mono for code
- **Layout**: Max-width 5xl (64rem), 6 unit padding
- **Cards**: Subtle borders, transparent backgrounds
- **Interactions**: Smooth transitions, hover effects

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
- All content about Max is real and specific; no placeholder or filler text
- Contact form uses mailto: protocol to open the user's email client
- The email address is doubinemail@gmail.com

## Social

- Instagram: @maxdoubin - https://instagram.com/maxdoubin
- GitHub: maxdoubin - https://github.com/maxdoubin
