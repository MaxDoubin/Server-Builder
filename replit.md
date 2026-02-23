# Max Doubin - Personal Website

A modern, professional personal website with an integrated 3D datacenter simulation game. The site features an About Me landing page, blog system, projects showcase, and the Hyperscale game accessible as a separate section.

## Overview

This is a full-stack web application built with React + Express, restructured as a personal portfolio and blog site. The landing page is the About Me page, with the Hyperscale datacenter game accessible at /game.

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
├── src/
│   ├── components/
│   │   ├── site/                  # Site-wide components
│   │   │   ├── Navbar.tsx         # Responsive navigation bar
│   │   │   ├── Footer.tsx         # Site footer with social links
│   │   │   └── Layout.tsx         # Page layout wrapper
│   │   ├── 3d/                    # 3D game visualization components
│   │   ├── builder/               # Game builder UI
│   │   ├── ui/                    # shadcn + custom UI components
│   │   └── ...
│   ├── lib/
│   │   ├── siteConfig.ts          # Central site configuration (name, bio, social, projects)
│   │   ├── blogPosts.ts           # Blog post content and utilities
│   │   ├── game-context.tsx       # Game state management
│   │   ├── build-context.tsx      # Builder state management
│   │   ├── theme-provider.tsx     # Dark/light mode
│   │   └── ...
│   ├── pages/
│   │   ├── Home.tsx               # Landing page / About Me
│   │   ├── Blog.tsx               # Blog index with tag filtering
│   │   ├── BlogPost.tsx           # Individual blog post view
│   │   ├── Projects.tsx           # Projects showcase
│   │   ├── Contact.tsx            # Contact & social links
│   │   ├── GamePage.tsx           # Game wrapper with fullscreen support
│   │   └── datacenter-3d.tsx      # Core game component
│   ├── App.tsx                    # Root app with routing
│   └── main.tsx                   # Entry point
├── public/
│   ├── images/                    # AI-generated images
│   ├── robots.txt                 # SEO robots file
│   └── sitemap.xml                # SEO sitemap
└── index.html                     # HTML template with OG tags
```

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | Home | About Me landing page with hero, bio, skills, recent posts |
| `/blog` | Blog | Blog index with tag filtering |
| `/blog/:slug` | BlogPost | Individual blog post with markdown rendering |
| `/projects` | Projects | Project cards with links |
| `/game` | GamePage | Hyperscale datacenter simulation |
| `/contact` | Contact | Social links and contact info |

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
   - `content`: Markdown content string
3. Optionally add `draft: true` to hide from listing

### Editing Site Info

Edit `client/src/lib/siteConfig.ts` to change:
- Name, tagline, bio
- Social links (Instagram, GitHub)
- Email address
- Skills list
- Highlights
- Projects

## Features

### Personal Website
- Clean, responsive About Me landing page
- Blog with tag filtering and markdown rendering
- Projects showcase with game integration
- Contact page with social links
- Dark/light mode toggle
- SEO meta tags and Open Graph support

### Hyperscale Game (at /game)
- Interactive 3D datacenter visualization
- Procedural generation up to 500 racks
- Thermal and power simulation
- Multiple camera modes (orbit, auto, cinematic)
- Build and explore modes
- Equipment catalog with real-world hardware specs
- Fullscreen support

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

## Instagram

@maxdoubin - https://instagram.com/maxdoubin
