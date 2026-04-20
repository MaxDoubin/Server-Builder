import { Suspense, lazy, useRef } from "react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { SystemsAct } from "./acts/SystemsAct";

/**
 * The cinematic home is one continuous shot of the same rack — hero,
 * install, service-pull, anatomy, hall — followed by the editorial
 * Telemetry and CTA acts.
 */
const BiographyAct = lazy(() =>
  import("./acts/BiographyAct").then((m) => ({ default: m.BiographyAct })),
);
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
    title:
      "Max Doubin | 15-year-old Cybersecurity Competitor, Certified IT Pro, Percussionist",
    description:
      "Max Doubin is a fifteen-year-old nationally recognized cybersecurity competitor, CompTIA-certified IT professional, award-winning percussionist, and civic leader based in Las Vegas, Nevada.",
    canonical: "https://maxdoubin.com/",
    ogType: "profile",
    schemaId: "home-schema",
    schema: {
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Max Doubin",
      givenName: "Max",
      familyName: "Doubin",
      jobTitle: [
        "Cybersecurity Competitor",
        "Certified IT Professional",
        "Percussionist",
      ],
      description:
        "Fifteen-year-old nationally recognized cybersecurity competitor, CompTIA-certified IT professional, award-winning percussionist, and civic leader.",
      url: "https://maxdoubin.com/",
      email: "mailto:max@maxdoubin.com",
      image: "https://maxdoubin.com/images/og-image.png",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Las Vegas",
        addressRegion: "NV",
        addressCountry: "US",
      },
      alumniOf: {
        "@type": "EducationalOrganization",
        name: "South Career & Technical Academy · Las Vegas",
      },
      award: [
        "Top 1% — National Cyber League (Individual)",
        "#1 Percussionist — State of Nevada, 2024",
        "Nevada All-State Band (6th, 7th, 9th grade)",
        "Student of the Month — South CTA Las Vegas",
      ],
      hasCredential: [
        {
          "@type": "EducationalOccupationalCredential",
          name: "CompTIA Tech+ (FC0-U71)",
          credentialCategory: "certification",
        },
      ],
      memberOf: [
        {
          "@type": "Organization",
          name: "City of Henderson · Blue Ribbon Commission",
        },
        {
          "@type": "Organization",
          name: "College Board Big Future Ambassadors",
        },
        {
          "@type": "Organization",
          name: "Nevada OWINN Youth Advisory Council",
        },
      ],
      sameAs: [
        "https://github.com/MaxFromYT",
        "https://instagram.com/maxdoubin",
        "https://instagram.com/percussionmax",
      ],
    },
  });
  return (
    <CinematicLayout>
      <div ref={shellRef}>
        <SystemsAct />
        <Suspense fallback={<ActFallback minHeight="120vh" />}>
          <BiographyAct />
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
