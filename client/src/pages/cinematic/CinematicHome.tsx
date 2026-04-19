import { Suspense, lazy, useRef } from "react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { HeroAct } from "./acts/HeroAct";

/**
 * Below-the-fold acts are code-split. HeroAct stays eager so the
 * first paint ships with the hero copy + canvas, but the rest of
 * the scroll narrative — including the heavy ExplodedScene and
 * DatacenterScene — is fetched in the background while the user
 * reads the hero.
 */
const ChapterAct = lazy(() =>
  import("./acts/ChapterAct").then((m) => ({ default: m.ChapterAct })),
);
const ExplodedAct = lazy(() =>
  import("./acts/ExplodedAct").then((m) => ({ default: m.ExplodedAct })),
);
const DatacenterAct = lazy(() =>
  import("./acts/DatacenterAct").then((m) => ({ default: m.DatacenterAct })),
);
const TelemetryAct = lazy(() =>
  import("./acts/TelemetryAct").then((m) => ({ default: m.TelemetryAct })),
);
const CTAAct = lazy(() =>
  import("./acts/CTAAct").then((m) => ({ default: m.CTAAct })),
);

// Visual placeholder preserves vertical rhythm while a chunk loads
// so the Lenis smooth-scroll engine doesn't snap back up.
function ActFallback({ minHeight = "100vh" }: { minHeight?: string }) {
  return (
    <div
      aria-hidden
      className="w-full bg-[hsl(var(--brand-obsidian))]"
      style={{ minHeight }}
    />
  );
}

export function CinematicHome() {
  const shellRef = useRef<HTMLDivElement>(null);
  useSEO({
    title: "Max Doubin | Cybersecurity Specialist & Enterprise Networking Expert",
    description:
      "Max Doubin is a nationally recognized cybersecurity specialist and enterprise networking expert based in Las Vegas, Nevada. Systems live, built to lead.",
    canonical: "https://maxdoubin.com/",
    ogType: "profile",
    schemaId: "home-schema",
    schema: {
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Max Doubin",
      jobTitle: "Cybersecurity Specialist",
      url: "https://maxdoubin.com/",
      image: "https://maxdoubin.com/images/og-image.png",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Las Vegas",
        addressRegion: "NV",
        addressCountry: "US",
      },
      sameAs: [],
    },
  });
  return (
    <CinematicLayout>
      <div ref={shellRef}>
        <HeroAct />
        <Suspense fallback={<ActFallback />}>
          <ChapterAct />
        </Suspense>
        <Suspense fallback={<ActFallback />}>
          <ExplodedAct />
        </Suspense>
        <Suspense fallback={<ActFallback />}>
          <DatacenterAct />
        </Suspense>
        <Suspense fallback={<ActFallback minHeight="80vh" />}>
          <TelemetryAct />
        </Suspense>
        <Suspense fallback={<ActFallback minHeight="60vh" />}>
          <CTAAct />
        </Suspense>
      </div>
    </CinematicLayout>
  );
}
