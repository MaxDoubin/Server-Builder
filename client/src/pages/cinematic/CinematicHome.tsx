import { Suspense, lazy, useRef } from "react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { SystemsAct } from "./acts/SystemsAct";

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
      "Max Doubin | Cybersecurity, Networking, Systems Infrastructure, and Leadership",
    description:
      "Max Doubin is a ninth-grade cybersecurity student at South Career Technical Academy in Las Vegas, Nevada. His work spans enterprise networking, server infrastructure, competitive cybersecurity, percussion performance, and community leadership.",
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
        "Cybersecurity Student",
        "Enterprise Networking Specialist",
        "Competitive Percussionist",
        "Community Leader",
      ],
      description:
        "Ninth-grade cybersecurity student at South Career Technical Academy in Las Vegas, Nevada. Work spans networking, server infrastructure, cybersecurity competition, percussion, and community leadership.",
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
        name: "South Career Technical Academy",
      },
      award: [
        "Top 1% — National Cyber League",
        "South CTA ranked 7th in the nation in National Cyber League competition",
        "#1 Percussionist — State of Nevada, 2024",
        "Student of the Month — South CTA",
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
          name: "City of Henderson Blue Ribbon Commission",
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
