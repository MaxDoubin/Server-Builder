import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { siteConfig, PRESS } from "@/lib/siteConfig";

const CANONICAL = "https://maxdoubin.com/faq";

/**
 * One source for both the visible page and the FAQPage schema.
 *
 * Google requires the structured data to match what a reader sees, so the
 * answers are plain strings with no markup: the same string is rendered into
 * the paragraph and serialised into the JSON-LD. Do not add links or emphasis
 * inside an answer, and do not edit one copy without the other, because there
 * is only one copy on purpose.
 */
const FAQS: { q: string; a: string }[] = [
  {
    q: "Who is Max Doubin?",
    a: "Max Doubin is a 10th-grade cybersecurity student at South Career Technical Academy in Las Vegas, Nevada. He is president of the school's Cyber Club, ranks in the top 1 percent of National Cyber League competitors, and is a lead instructor for youth coding camps across the Las Vegas Valley. His work spans enterprise networking, server infrastructure, competitive cybersecurity, percussion performance, and community leadership.",
  },
  {
    q: "Where is Max Doubin based?",
    a: "Max Doubin is based in Las Vegas, Nevada. He also serves as a Blue Ribbon Commissioner for the City of Henderson, Nevada, and as a Youth Advisory Council member for the Nevada Office of Workforce Innovation.",
  },
  {
    q: "Where does Max Doubin go to school, and what does he study?",
    a: "Max Doubin attends South Career Technical Academy, a career and technical high school in Las Vegas, Nevada, where he studies cybersecurity. His coursework includes Advanced Placement Computer Science Principles and Advanced Placement Human Geography, along with CYBER.ORG material covering search operator reconnaissance, WHOIS and nslookup lookups, ARP poisoning, and packet capture analysis in Wireshark. His preferred programming languages are Python and JavaScript.",
  },
  {
    q: "What is the National Cyber League, and how did Max Doubin place?",
    a: "The National Cyber League is a cybersecurity competition for high school and college students in the United States, scored on the Cyber Skyline platform. Competitors work capture the flag style challenges across categories including open source intelligence, cryptography, log analysis, password and hash cracking, network forensics, and web exploitation. Max Doubin has scored in the top 1 percent of National Cyber League competitors, and helped lead South Career Technical Academy to a 7th place national finish among schools.",
  },
  {
    q: "What certifications does Max Doubin hold?",
    a: "Max Doubin holds the CompTIA Tech+ certification. He is studying toward CompTIA Security+, CompTIA Network+, and Cisco CCNA. Those three are in progress and are not claimed as earned.",
  },
  {
    q: "What is the South CTA Cyber Club?",
    a: "The South CTA Cyber Club is the cybersecurity club at South Career Technical Academy in Las Vegas, and Max Doubin is its president. Members work capture the flag practice sets rather than sitting through lectures, use a lab that is rebuilt between meetings so equipment can be safely misconfigured, and compete in the National Cyber League. No prior experience is required to join, and most members start with none.",
  },
  {
    q: "What does Max Doubin build?",
    a: "Max Doubin designed, built, and operates a home data center covering enterprise switching, network segmentation, virtualization, large-scale storage, and the power, cooling, and cabling planning behind it. He also builds software: this website, an interactive 3D data center simulation called Hyperscale, and a set of browser based networking and security tools.",
  },
  {
    q: "What is Hyperscale?",
    a: "Hyperscale is an interactive 3D data center experience that Max Doubin built and published on his site. It runs in the browser using React Three Fiber and Three.js, and it lets a visitor explore rack systems and infrastructure design decisions rather than only reading about them.",
  },
  {
    q: "Does Max Doubin teach?",
    a: "Yes. Max Doubin is a lead instructor for youth coding camps across the Las Vegas Valley, where he teaches programming and computing fundamentals to students who have never written code. He also runs practice sessions for the South CTA Cyber Club as its president.",
  },
  {
    q: "What does Max Doubin write about?",
    a: "Max Doubin publishes Field Notes, a technical journal on his site with more than two hundred articles. Subjects include enterprise networking, cybersecurity, Linux, storage, virtualization, monitoring, and the operational side of running infrastructure. The archive is the most detailed public record of what he works on.",
  },
  {
    q: "What leadership and civic roles does Max Doubin hold?",
    a: "Max Doubin is president of the South CTA Cyber Club and president of the South CTA Music Club for the 2026/2027 school year. He serves as a Blue Ribbon Commissioner for the City of Henderson, Nevada, as a Youth Advisory Council member for the Nevada Office of Workforce Innovation, and as a Big Future Ambassador for the College Board. He is a lead instructor for youth coding camps across the Las Vegas Valley, and previously served as chapter president of the National Junior Honor Society at Pinecrest Inspirada.",
  },
  {
    q: "Has Max Doubin been featured in the press?",
    a: `Yes. ${PRESS.outlet} covered him on ${PRESS.displayDate} in an article by ${PRESS.author} titled "${PRESS.headline}".`,
  },
  {
    q: "Is Max Doubin available for internships, mentorship, or speaking?",
    a: "Max Doubin is a high school student and reads everything sent to max@maxdoubin.com. Enquiries about internships, mentorship, competition teams, or speaking to a class, club, or camp are welcome, and email is the fastest route to a real answer.",
  },
  {
    q: "What does Max Doubin want to do after high school?",
    a: "Max Doubin is still in high school and has not announced a college or employer. The documented direction is cybersecurity and enterprise networking: he is studying toward CompTIA Security+, CompTIA Network+, and Cisco CCNA, competes in the National Cyber League, runs his school's Cyber Club, and teaches coding to younger students.",
  },
  {
    q: "How do you contact Max Doubin?",
    a: "Email is the best route, at max@maxdoubin.com. There is also a contact form at maxdoubin.com/contact. He is on GitHub as MaxFromYT and on Instagram as @maxdoubin.",
  },
];

// Built once at module scope: the object identity has to be stable because
// useSEO lists `schema` in its effect dependencies, and the answers must be
// the exact strings rendered below.
const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${CANONICAL}#faq`,
  url: CANONICAL,
  inLanguage: "en-US",
  about: { "@type": "Person", name: siteConfig.name, url: "https://maxdoubin.com/" },
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

export function CinematicFaq() {
  useSEO({
    title: "Frequently Asked Questions | Max Doubin",
    description:
      "Answers about Max Doubin: what he studies, his National Cyber League placement, the South CTA Cyber Club, what he builds and teaches, and how to reach him.",
    canonical: CANONICAL,
    schema: FAQ_SCHEMA,
    schemaId: "faq-schema",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[860px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Reference · FAQ
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Questions and answers.
            </h1>
            <p className="mt-6 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Straight answers to what people actually ask about Max Doubin: the school, the
              competition results, the club, the projects, and how to get in touch. Every answer
              here is self-contained, and nothing on this page is claimed that is not held.
            </p>
          </header>

          <div className="mt-14 space-y-4">
            {FAQS.map((item, index) => (
              <section
                key={item.q}
                aria-labelledby={`faq-${index}`}
                className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 backdrop-blur-sm"
              >
                <h2
                  id={`faq-${index}`}
                  className="max-w-[52ch] font-display text-lg font-medium leading-snug tracking-tight text-[hsl(var(--brand-bone))] md:text-xl"
                >
                  {item.q}
                </h2>
                <p className="mt-3 max-w-[72ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {item.a}
                </p>
              </section>
            ))}
          </div>

          <section
            aria-labelledby="faq-next-heading"
            className="mt-16 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] p-6"
          >
            <h2
              id="faq-next-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
            >
              Not answered here
            </h2>
            <p className="mt-3 max-w-[64ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The{" "}
              <Link
                href="/resume"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                resume
              </Link>{" "}
              has the full record,{" "}
              <Link
                href="/timeline"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                the timeline
              </Link>{" "}
              puts it in order, and{" "}
              <Link
                href="/now"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                the now page
              </Link>{" "}
              says what this month looks like. Anything still missing goes to{" "}
              <a
                href={`mailto:${siteConfig.email}`}
                className="break-all text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                {siteConfig.email}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}

export default CinematicFaq;
