/**
 * Questions already answered in public, shown on /ask so the same one is not
 * asked twice.
 *
 * Extracted from the page component so the prerenderer renders them into the
 * static HTML rather than shipping an empty document.
 */

export interface Answered {
  question: string;
  /** Internal path. These all go through the router. */
  href: string;
  answer: string;
}

export const ANSWERED: Answered[] = [
  {
    question: "How do I get started with a homelab?",
    href: "/blog/why-homelabs-matter",
    answer: "Why homelabs matter for learning networking",
  },
  {
    question: "Should I chase certifications or build projects?",
    href: "/blog/certifications-versus-projects",
    answer: "Certifications versus projects, and how I split my time",
  },
  {
    question: "What is the National Cyber League actually like?",
    href: "/blog/ncl-competition-lessons",
    answer: "Lessons from competing in the National Cyber League",
  },
  {
    question: "How should I segment a network with VLANs?",
    href: "/blog/vlan-segmentation-guide",
    answer: "Network segmentation with VLANs, a practical guide",
  },
  {
    question: "What have you actually built?",
    href: "/projects",
    answer: "The projects page, with the lab, the club, and the simulator",
  },
];
