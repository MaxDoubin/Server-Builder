/** Which labs this browser has solved. Same shape and caveats as scenarios. */
const KEY = "maxdoubin-lab-progress";

export const loadSolved = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? (parsed as string[]) : [];
  } catch {
    return [];
  }
};

export function recordSolved(slug: string): string[] {
  const list = loadSolved();
  if (list.includes(slug)) return list;
  const next = [...list, slug];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota. The session still works.
  }
  return next;
}
