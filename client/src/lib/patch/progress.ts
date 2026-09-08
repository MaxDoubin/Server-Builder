/** Findings called right, per browser. Same caveats as everywhere else on the site. */

const KEY = "maxdoubin-patch-solved";

export const loadSolvedPatches = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? parsed : [];
  } catch {
    return [];
  }
};

export function recordSolvedPatch(id: string): void {
  const list = loadSolvedPatches();
  if (list.includes(id)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...list, id]));
  } catch {
    // Private browsing or a full quota.
  }
}
