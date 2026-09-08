/** Saved plans and solved problems, per browser. Same caveats as everywhere else. */
import type { Plan } from "./types";

const SOLVED_KEY = "maxdoubin-allocate-solved";
const PLAN_KEY = "maxdoubin-allocate-plans";

export const loadSolvedPlans = (): string[] => {
  try {
    const raw = localStorage.getItem(SOLVED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? parsed : [];
  } catch {
    return [];
  }
};

export function recordSolvedPlan(slug: string): void {
  const list = loadSolvedPlans();
  if (list.includes(slug)) return;
  try {
    localStorage.setItem(SOLVED_KEY, JSON.stringify([...list, slug]));
  } catch {
    // Private browsing or a full quota.
  }
}

const readAll = (): Record<string, Plan> => {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, Plan>;
  } catch {
    return {};
  }
};

export function loadPlan(slug: string): Plan | null {
  const value = readAll()[slug];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Plan = {};
  for (const [id, cidr] of Object.entries(value)) {
    if (typeof cidr === "string") out[id] = cidr;
  }
  return out;
}

export function savePlan(slug: string, plan: Plan): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify({ ...readAll(), [slug]: plan }));
  } catch {
    // Nothing to do about it.
  }
}

export function clearPlan(slug: string): void {
  try {
    const all = readAll();
    delete all[slug];
    localStorage.setItem(PLAN_KEY, JSON.stringify(all));
  } catch {
    // Nothing to do about it.
  }
}
