# Max Doubin - Personal Website

A professional personal website for Max Doubin, focused on enterprise networking, cybersecurity, and systems engineering. The site positions Max as a nationally recognized cybersecurity specialist. Key features include hosting youth coding camps in the Las Vegas Valley and high-level cybersecurity achievements.

## Features
- Nationally recognized cybersecurity specialist branding
- Lead Instructor for Youth Coding Camps in Las Vegas Valley
- Stats focusing on technical excellence: Top 1% Cyber League, #7 Nationally Team, #1 Percussionist, All-State Since 2023+
- Full-viewport 3D datacenter hero animation with gradient overlays
- Typing animation cycling through specialties
- Scroll-reveal animations with staggered timing on all sections
- Card hover effects with glow and lift
- Floating grid background effect
- "Scroll" indicator with bounce animation
- Blog: a post per day, 236 published, paginated 24 at a time with tag filtering
- Every post carries a distinct cover: sourced CC photos with attribution where one exists, otherwise a generated rack elevation
- Projects showcase with category filtering
- Contact page with validated mailto form
- Dark/light mode toggle with localStorage persistence
- SEO: every page prerendered to static HTML with its own title, description, canonical, Open Graph and JSON-LD
- sitemap.xml and feed.xml generated at build from the real post list, never hand-maintained
- Error boundaries for WebGL fallback
- prefers-reduced-motion support
- No em dashes anywhere in the codebase

## Things that are easy to break again
- The route wrapper fade is CSS, not Framer. It was a `motion.div` animating opacity, and because every route except `/` is a lazy chunk behind Suspense, the child suspended before the enter animation started and the page stayed at `opacity: 0` forever. Every nav link led to a blank screen. Do not move this back into JavaScript.
- `client/src/pages/Home.tsx` imports `blogPosts`. Keep it lazy. As a static import it pulled the whole 1.2 MB archive into the entry chunk.
- `AnimatedGradientText` clips a gradient to glyphs with `background-clip: text`. Its children must be plain text. Nesting `WordReveal` inside it puts the glyphs in child boxes outside the gradient and they render as a washed-out ghost.
- The game must render with `hideNav`. Its own header is in normal flow and the site nav is `fixed top-0`, so both land in the same strip and the text overlaps.
- `ScrollTrigger.refresh()` is the forced variant. Call `refresh(true)` from observers so it defers past an in-flight gesture.

## Hyperscale Game Equipment System
- Equipment placement uses force-placement: clicking any slot (empty or occupied) opens the picker, and placing equipment auto-removes anything in the way
- `addEquipmentToRack` in game-context.tsx handles overlap by removing existing equipment in the target U-range before placing new equipment
- Save system (save-system.ts) has versioned autosave that auto-clears stale data on version bump
- `normalizeRack` deduplicates overlapping installed equipment entries on load
- Source of truth for rack state is `rack.installedEquipment` (not `rack.slots`)
