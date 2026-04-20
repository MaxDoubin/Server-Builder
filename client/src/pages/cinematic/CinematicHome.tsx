import { Suspense, lazy, useRef } from "react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { SystemsAct } from "./acts/SystemsAct";

/**
 * The cinematic home is one continuous shot of the same rack — hero,
 * install, service-pull, anatomy, hall — followed by the editorial
 * Telemetry and CTA acts.
 */
const TelemetryAct = lazy(() =>
  import("./acts/TelemetryAct").then((m) => ({ default: m.TelemetryAct })),
);
const CTAAct = lazy(() =>
  import("./acts/CTAAct").then((m) => ({ default: m.CTAAct })),
);

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
        <SystemsAct />
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
