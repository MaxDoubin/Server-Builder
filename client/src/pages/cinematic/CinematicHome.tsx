import { Suspense, lazy, useRef } from "react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { SystemsAct } from "./acts/SystemsAct";
import { PRESS } from "@/lib/siteConfig";

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
      "Max Doubin is a 10th-grade cybersecurity student at South Career Technical Academy in Las Vegas, Nevada. His work spans enterprise networking, server infrastructure, competitive cybersecurity, percussion performance, and community leadership.",
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
        "10th-grade cybersecurity student at South Career Technical Academy in Las Vegas, Nevada. Work spans networking, server infrastructure, cybersecurity competition, percussion, and community leadership.",
      url: "https://maxdoubin.com/",
      email: "mailto:max@maxdoubin.com",
      image: "https://maxdoubin.com/images/og-image.jpg",
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
        "Top 1% · National Cyber League",
        "South CTA ranked 7th among U.S. high schools in the Cyber Power Rankings",
        "#1 Percussionist · State of Nevada, 2024",
        "PBS Varsity Quiz · State finalist, 2026",
        "Student of the Month · South CTA",
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
      // Topic coverage. Search engines and AI summarisers use knowsAbout to
      // decide what a person is an authority on, and the blog archive backs
      // every one of these with published writing.
      knowsAbout: [
        "Cybersecurity",
        "Capture the Flag competition",
        "Enterprise networking",
        "Network segmentation and VLANs",
        "Server infrastructure",
        "Virtualization",
        "Storage systems",
        "Linux systems administration",
        "Data center operations",
        "Percussion performance",
        "Youth technology education",
      ],
      sameAs: [
        "https://github.com/MaxDoubin",
        "https://instagram.com/maxdoubin",
      ],
      subjectOf: {
        "@type": "NewsArticle",
        headline: PRESS.headline,
        url: PRESS.url,
        datePublished: PRESS.isoDate,
        author: { "@type": "Person", name: PRESS.author },
        publisher: { "@type": "Organization", name: PRESS.outlet },
      },
    },
  });
  return (
    /*
      The hero here is a rack in a dark room, drawn full bleed, with the
      page's own type composited over it. There is no light version of that
      short of a different hero, so the theme control applies from the next
      page on rather than turning this one grey on grey.
    */
    <CinematicLayout pinDark>
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
