/** Which challenges this browser has solved. Same caveats as everywhere else. */
const KEY = "maxdoubin-challenge-progress";

export const loadSolvedChallenges = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? (parsed as string[]) : [];
  } catch {
    return [];
  }
};

export function recordSolvedChallenge(slug: string): string[] {
  const list = loadSolvedChallenges();
  if (list.includes(slug)) return list;
  const next = [...list, slug];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota.
  }
  return next;
}
