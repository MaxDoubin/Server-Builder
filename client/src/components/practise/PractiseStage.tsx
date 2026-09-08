/**
 * The room a practise surface happens in.
 *
 * A fixed layer behind the whole viewport carrying an accent and a mood, so a
 * page is not a column of text about a problem, it is a screen that is having
 * one. It started on the incident scenarios and is now shared, because the
 * same idea reads correctly everywhere the page has a state worth showing: a
 * firewall chain calms as its checks go green, a resolution that ends in a
 * lame delegation turns the room red, a triage call that was wrong says so
 * with more than a line of text.
 *
 * The mood vocabulary stays the scenarios' one on purpose. Four words that
 * already have contrast-checked colours in both themes beat five words with a
 * new one that has to be legible on white as well as on obsidian. All of it is
 * CSS driven by data attributes; see the "Practise surfaces: the stage" block
 * in index.css for the layers themselves.
 *
 * pointer-events: none and aria-hidden, because it is atmosphere: it must
 * never take a click, appear in the accessibility tree, or reorder focus.
 */

import { useEffect, useState } from "react";
import type { EndingGrade } from "@/lib/scenarios/types";

export type StageAccent = "signal" | "amber" | "cyan" | "danger";
export type SceneMood = "calm" | "tense" | "critical" | "recovering";

/**
 * Category to accent.
 *
 * Four accents rather than one per category, because the site has four
 * accent tokens that are contrast-checked in both themes, and inventing a
 * fifth to give DNS its own colour would mean inventing a fifth that has to
 * be legible on white as well as on obsidian.
 */
export const ACCENT_FOR_CATEGORY: Record<string, StageAccent> = {
  Ransomware: "danger",
  "Insider risk": "danger",
  "Supply chain": "danger",
  "Social engineering": "amber",
  Availability: "amber",
  "Physical security": "amber",
  Secrets: "cyan",
  "TLS and identity": "cyan",
  DNS: "cyan",
  Identity: "cyan",
  Networking: "signal",
  Observability: "signal",
  Data: "signal",
};

export const accentFor = (category: string): StageAccent =>
  ACCENT_FOR_CATEGORY[category] ?? "signal";

interface Props {
  accent: StageAccent;
  mood: SceneMood;
  /** Set on an ending, which overrides the accent with the outcome's colour. */
  ending?: EndingGrade;
  /** Changes on every decision, to trigger one wash of the accent. */
  flashKey: number;
}

export function PractiseStage({ accent, mood, ending, flashKey }: Props) {
  /*
    The flash is keyed on the decision count rather than mounted and
    unmounted, so React restarts the animation by replacing the element. It
    is skipped on the first render, because arriving at a page is not a
    decision and a flash on load reads as a fault.
  */
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (flashKey === 0) return;
    setFlashing(true);
    const timer = window.setTimeout(() => setFlashing(false), 460);
    return () => window.clearTimeout(timer);
  }, [flashKey]);

  return (
    <>
      <div
        className="practise-stage"
        data-accent={accent}
        data-mood={mood}
        data-ending={ending}
        aria-hidden
      >
        <div className="practise-grid" />
      </div>
      <div className="practise-rule" aria-hidden />
      {flashing ? <div key={flashKey} className="practise-flash" aria-hidden /> : null}
    </>
  );
}
