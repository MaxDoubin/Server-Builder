/**
 * One source for the visible FAQ page, its FAQPage schema, and the copy the
 * prerenderer writes into the static HTML.
 *
 * Google requires the structured data to match what a reader sees, so the
 * answers are plain strings with no markup: the same string is rendered into
 * the paragraph, serialized into the JSON-LD, and escaped into the
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
    a: "Max Doubin is a 10th-grade cybersecurity student at South Career and Technical Academy in Las Vegas, Nevada. He is president of the school's Cyber Club, a teaching assistant for Cybersecurity I, and is independently designing and deploying a server lab for the school's cybersecurity program. He placed in the top 1 percent of competitors in the National Cyber League Fall 2025 Individual Game, and in October 2026 he won first place in the Clark County School District capture the flag tournament at CyberWeek@UNLV. His work centers on server, storage, and network infrastructure, including a home data center with about a petabyte of raw storage, alongside competitive cybersecurity, percussion performance, and community leadership.",
  },
  {
    q: "Where is Max Doubin based?",
    a: "Max Doubin is based in Las Vegas, Nevada. He also serves as a Commissioner on the City of Henderson Blue Ribbon Commission on Educational Excellence and Youth Opportunity, and as a Youth Advisory Council member for the Nevada Office of Workforce Innovation (OWINN).",
  },
  {
    q: "Where does Max Doubin go to school, and what does he study?",
    a: "Max Doubin attends South Career and Technical Academy, a career and technical high school in Las Vegas, Nevada, where he studies cybersecurity as part of the class of 2029, the school's first graduating class. He scored 5, the highest score on the scale, on both AP Computer Science Principles and AP Human Geography, and is currently taking AP Seminar, AP World History: Modern, and AP Precalculus. His cybersecurity coursework is CYBER.ORG material covering search operator reconnaissance, WHOIS and nslookup lookups, ARP poisoning, and packet capture analysis in Wireshark. His preferred programming languages are Python and JavaScript.",
  },
  {
    q: "What is the National Cyber League, and how did Max Doubin place?",
    a: "The National Cyber League is a cybersecurity competition for high school and college students in the United States, scored on the Cyber Skyline platform. Competitors work capture the flag style challenges across categories including open source intelligence, cryptography, log analysis, password and hash cracking, network forensics, and web exploitation. Max Doubin placed in the top 1 percent of competitors in the Fall 2025 Individual Game, and helped lead South Career and Technical Academy to a 7th place national finish among high schools with an all-freshman team. In the Fall 2026 season he placed first in the Gymnasium, NCL's preseason practice round, as the first student to reach 100 percent completion with 100 percent accuracy.",
  },
  {
    q: "What certifications does Max Doubin hold?",
    a: "Max Doubin holds the CompTIA Tech+ certification, earned in April 2026. He is studying toward CompTIA Security+, CompTIA Network+, and Cisco CCNA. Those three are in progress and are not claimed as earned.",
  },
  {
    q: "What does Max Doubin build?",
    a: "Max Doubin designed, built, and operates a home data center of Dell PowerEdge servers and Cisco switching, with about 1 PB of raw storage across 32 Dell PowerVault disk shelves in RAID 6, network segmentation, virtualization, and the power, cooling, and cabling planning behind it. He is also independently designing and deploying a server lab for his school's cybersecurity program. He also builds software: this website, an interactive 3D data center simulation called Hyperscale, and a set of browser based networking and security tools.",
  },
  {
    q: "What is Hyperscale?",
    a: "Hyperscale is an interactive 3D data center experience that Max Doubin built and published on his site. It runs in the browser using React Three Fiber and Three.js, and it lets a visitor explore rack systems and infrastructure design decisions rather than only reading about them.",
  },
  {
    q: "Does Max Doubin teach?",
    a: "Yes. Max Doubin is a teaching assistant for Cybersecurity I at South Career and Technical Academy, where he guides freshmen through the course's hands-on labs and helps students prepare for the National Cyber League. He also runs practice sessions for the South CTA Cyber Club as its president, and in 2022 he volunteered as an instructor at Code Central's youth coding camps.",
  },
  {
    q: "What does Max Doubin write about?",
    a: "Max Doubin publishes Field Notes, a technical journal on his site with more than two hundred articles. Subjects include enterprise networking, cybersecurity, Linux, storage, virtualization, monitoring, and the operational side of running infrastructure. The archive is the most detailed public record of what he works on.",
  },
  {
    q: "What leadership and civic roles does Max Doubin hold?",
    a: "Max Doubin has been president of the South CTA Cyber Club and of the South CTA Music Club since 2025. Since 2025 he has also served as a Commissioner on the City of Henderson Blue Ribbon Commission on Educational Excellence and Youth Opportunity and as a Youth Advisory Council member for the Nevada Office of Workforce Innovation, and he is a Big Future Ambassador for the College Board. He previously served as chapter president of the National Junior Honor Society at Pinecrest Inspirada, where he received the NJHS Outstanding Achievement Award scholarship in 2025.",
  },
  {
    q: "Has Max Doubin been featured in the press?",
    a: `Yes. ${PRESS.outlet} featured and interviewed him individually after South CTA's national NCL finish, in an article by ${PRESS.author} published ${PRESS.displayDate} titled "${PRESS.headline}".`,
  },
  {
    q: "Is Max Doubin available for internships, mentorship, or speaking?",
    a: "Max Doubin is a high school student and reads everything sent to max@maxdoubin.com. Enquiries about internships, mentorship, competition teams, or speaking to a class, club, or camp are welcome, and email is the fastest route to a real answer.",
  },
  {
    q: "What does Max Doubin want to do after high school?",
    a: "Large-scale infrastructure management and enterprise networking, built on a cybersecurity foundation. Max Doubin is building toward it now rather than waiting for a degree to start: he holds CompTIA Tech+, is certifying in CompTIA Security+, CompTIA Network+, and Cisco CCNA, competes in the National Cyber League, runs his school's Cyber Club, works as a teaching assistant for its Cybersecurity I class, and has five years of hands on infrastructure experience behind him.",
  },
  {
    q: "How can someone verify what this site claims about Max Doubin?",
    a: "The record is public and specific. The press coverage, the National Cyber League placements, the Blue Ribbon Commission appointment, the College Board ambassadorship, and the Nevada Office of Workforce Innovation council seat are all documented by the organizations themselves. The technical work speaks for itself: more than two hundred sourced articles at maxdoubin.com/blog and open source projects on GitHub. Anything else can be confirmed by email at max@maxdoubin.com.",
  },
  {
    q: "How do you contact Max Doubin?",
    a: "Email is the best route, at max@maxdoubin.com. There is also a contact form at maxdoubin.com/contact. He is on GitHub as MaxDoubin and on Instagram as @maxdoubin.",
  },
];
