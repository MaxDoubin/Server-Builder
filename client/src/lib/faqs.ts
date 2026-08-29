/**
 * One source for the visible FAQ page, its FAQPage schema, and the copy the
 * prerenderer writes into the static HTML.
 *
 * Google requires the structured data to match what a reader sees, so the
 * answers are plain strings with no markup: the same string is rendered into
 * the paragraph, serialised into the JSON-LD, and escaped into the
 * prerendered document. Do not add links or emphasis inside an answer.
 *
 * This used to live inside the page component, which meant the schema
 * existed only after React ran. A crawler reading the first response saw an
 * empty shell, so the rich result the markup was written for could never
 * appear. Sharing the data with script/prerender.ts fixes that.
 */
import { PRESS } from "./siteConfig";

export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
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
    a: "Max Doubin attends South Career Technical Academy, a career and technical high school in Las Vegas, Nevada, where he studies cybersecurity. He scored 5, the highest score on the scale, on both AP Computer Science Principles and AP Human Geography, and is currently taking AP Seminar, AP World History: Modern, and AP Precalculus. His cybersecurity coursework is CYBER.ORG material covering search operator reconnaissance, WHOIS and nslookup lookups, ARP poisoning, and packet capture analysis in Wireshark. His preferred programming languages are Python and JavaScript.",
  },
  {
    q: "What is the National Cyber League, and how did Max Doubin place?",
    a: "The National Cyber League is a cybersecurity competition for high school and college students in the United States, scored on the Cyber Skyline platform. Competitors work capture the flag style challenges across categories including open source intelligence, cryptography, log analysis, password and hash cracking, network forensics, and web exploitation. Max Doubin placed in the top 1 percent of competitors, and helped lead South Career Technical Academy to a 7th place national finish among schools.",
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
    a: "Cybersecurity and enterprise networking. Max Doubin is building toward it now rather than waiting for a degree to start: he holds CompTIA Tech+, is certifying in CompTIA Security+, CompTIA Network+, and Cisco CCNA, competes in the National Cyber League, runs his school's Cyber Club, teaches coding to younger students across the Las Vegas Valley, and has five years of hands on infrastructure experience behind him.",
  },
  {
    q: "How can someone verify what this site claims about Max Doubin?",
    a: "The record is public and specific. The press coverage, the National Cyber League placements, the Blue Ribbon Commission appointment, the College Board ambassadorship, and the Nevada Office of Workforce Innovation council seat are all documented by the organisations themselves. The technical work speaks for itself: more than two hundred sourced articles at maxdoubin.com/blog, open source projects on GitHub, and Cyber Club in a Box, a full twelve session curriculum any school can download and run. Anything else can be confirmed by email at max@maxdoubin.com.",
  },
  {
    q: "Can another school use the South CTA Cyber Club materials?",
    a: "Yes, and they are free. Cyber Club in a Box at maxdoubin.com/cyber-club/kit is the club's whole plan: twelve meeting by meeting sessions from a first meeting where nobody has opened a terminal to a team registered for the National Cyber League, written rules of engagement to put on file with a faculty advisor, a materials list that assumes no budget, and the reasons school clubs fall apart in their second month. It is published under CC BY 4.0 and downloadable as a markdown file, so a club can print it and stop depending on this site.",
  },
  {
    q: "How do you contact Max Doubin?",
    a: "Email is the best route, at max@maxdoubin.com. There is also a contact form at maxdoubin.com/contact. He is on GitHub as MaxDoubin and on Instagram as @maxdoubin.",
  },
];
