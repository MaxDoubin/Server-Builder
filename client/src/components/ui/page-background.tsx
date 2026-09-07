"use client";

import { useMemo } from "react";
import { useLocation } from "wouter";
import { HeroAnimation } from "@/components/hero/HeroAnimation";

const backgroundPresets = {
  floor: {
    variant: "floor",
  },
  build: {
    variant: "build",
  },
  network: {
    variant: "network",
  },
  noc: {
    variant: "noc",
  },
  incidents: {
    variant: "incidents",
  },
  about: {
    variant: "about",
  },
  fallback: {
    variant: "intro",
  },
} as const;

const resolvePreset = (path: string) => {
  if (path === "/" || path === "/floor") return backgroundPresets.floor;
  if (path.startsWith("/build")) return backgroundPresets.build;
  if (path.startsWith("/network")) return backgroundPresets.network;
  if (path.startsWith("/noc")) return backgroundPresets.noc;
  if (path.startsWith("/incidents")) return backgroundPresets.incidents;
  if (path.startsWith("/about")) return backgroundPresets.about;
  return backgroundPresets.fallback;
};

export function PageBackground() {
  const [location] = useLocation();
  const preset = useMemo(() => resolvePreset(location), [location]);

  return (
    <div data-print-hide className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <HeroAnimation className="absolute inset-0" variant={preset.variant} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80" />
    </div>
  );
}
