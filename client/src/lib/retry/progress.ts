/** Chains called right, per browser. Same caveats as everywhere else on the site. */

const KEY = "maxdoubin-retry-solved";

export const loadSolvedRetries = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? parsed : [];
  } catch {
    return [];
  }
};

export function recordSolvedRetry(slug: string): void {
  const list = loadSolvedRetries();
  if (list.includes(slug)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...list, slug]));
  } catch {
    // Private browsing or a full quota.
  }
}
