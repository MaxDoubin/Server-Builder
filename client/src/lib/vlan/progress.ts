/** Paths called right, per browser. Same caveats as everywhere else on the site. */

const KEY = "maxdoubin-vlan-solved";

export const loadSolvedVlans = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? parsed : [];
  } catch {
    return [];
  }
};

export function recordSolvedVlan(slug: string): void {
  const list = loadSolvedVlans();
  if (list.includes(slug)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...list, slug]));
  } catch {
    // Private browsing or a full quota.
  }
}
