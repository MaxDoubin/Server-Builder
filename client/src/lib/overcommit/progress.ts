/** Cases read correctly, per browser. Same caveats as everywhere else here. */

const KEY = "maxdoubin-overcommit-solved";

export const loadSolvedOvercommit = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? parsed : [];
  } catch {
    return [];
  }
};

export function recordSolvedOvercommit(slug: string): void {
  const list = loadSolvedOvercommit();
  if (list.includes(slug)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...list, slug]));
  } catch {
    // Private browsing or a full quota.
  }
}
