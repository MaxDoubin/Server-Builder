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
- Blog with 43 posts and tag filtering
- Projects showcase with category filtering
- Contact page with validated mailto form
- Dark/light mode toggle with localStorage persistence
- SEO meta tags, Open Graph, and JSON-LD structured data
- Error boundaries for WebGL fallback
- prefers-reduced-motion support
- No em dashes anywhere in the codebase

## Hyperscale Game Equipment System
- Equipment placement uses force-placement: clicking any slot (empty or occupied) opens the picker, and placing equipment auto-removes anything in the way
- `addEquipmentToRack` in game-context.tsx handles overlap by removing existing equipment in the target U-range before placing new equipment
- Save system (save-system.ts) has versioned autosave that auto-clears stale data on version bump
- `normalizeRack` deduplicates overlapping installed equipment entries on load
- Source of truth for rack state is `rack.installedEquipment` (not `rack.slots`)
