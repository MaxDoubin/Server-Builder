/** What this browser has judged. Same caveats as everywhere else here. */
import type { TellId } from "./types";

const KEY = "maxdoubin-triage-progress";

export interface Judgement {
  called: "phish" | "legitimate";
  cited?: TellId;
  right: boolean;
  citedRight?: boolean;
}

export type Judgements = Record<string, Judgement>;

export const loadJudgements = (): Judgements => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Judgements = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      if (v.called !== "phish" && v.called !== "legitimate") continue;
      if (typeof v.right !== "boolean") continue;
      out[id] = {
        called: v.called,
        right: v.right,
        cited: typeof v.cited === "string" ? (v.cited as TellId) : undefined,
        citedRight: typeof v.citedRight === "boolean" ? v.citedRight : undefined,
      };
    }
    return out;
  } catch {
    return {};
  }
};

export function saveJudgements(judgements: Judgements): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(judgements));
  } catch {
    // Private browsing or a full quota.
  }
}

export function clearJudgements(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do about it.
  }
}
