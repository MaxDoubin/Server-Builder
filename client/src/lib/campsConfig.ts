/**
 * What the youth coding camps cover, and what a beginner leaves with.
 *
 * Extracted from the page component so the prerenderer renders the same list
 * into the static HTML. The logistics in CAMP_DETAILS stay in the page: they
 * are deliberately null until confirmed, and a prerendered guess aimed at a
 * parent would be worse than no answer.
 */

export const COVERS = [
  {
    title: "Writing real code",
    detail:
      "Python first, because it reads closely enough to English that a beginner can guess what a line does and be right. Students type the code themselves. Nothing is dragged into place on their behalf.",
  },
  {
    title: "Breaking a problem into steps",
    detail:
      "The part that transfers to everything else. Most of programming is noticing that one large problem is six small ones, and that five of them are already solved.",
  },
  {
    title: "Reading an error message",
    detail:
      "Beginners treat errors as failure. They are the most useful output a computer produces, and learning to read one instead of flinching at it is the single biggest jump in confidence.",
  },
  {
    title: "How a computer actually works",
    detail:
      "Enough of what happens underneath, in files, memory, and networks, that a computer stops being a magic box and becomes something with rules a person can learn.",
  },
];

export const TAKEAWAYS = [
  {
    title: "Something that runs",
    detail:
      "A program they wrote, that works, that they can show someone. Concrete beats a certificate of attendance at this age.",
  },
  {
    title: "Vocabulary",
    detail:
      "Words like variable, loop, function, and file stop being jargon. That vocabulary is what makes the next tutorial, class, or teacher comprehensible.",
  },
  {
    title: "The habit of trying it",
    detail:
      "The most valuable thing a beginner can learn is that changing something and running it again is free. Nothing breaks permanently.",
  },
];
