/**
 * Captures whose every question has been answered correctly, per browser.
 *
 * These pages had the right-answer mechanic and no memory of it: you got a
 * case right, reloaded, and the page had forgotten. /today's progress panel
 * could not show them either, so three scored surfaces were invisible on the
 * page that summarizes how far you have got.
 *
 * Same shape and same caveats as every other progress store here. It is
 * localStorage in your own browser, it has never left the machine you are
 * on, and clearing site data clears it.
 */

const KEY = "maxdoubin-capture-solved";

export const loadSolvedCaptures = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? parsed : [];
  } catch {
    return [];
  }
};

export function recordSolvedCaptures(id: string): void {
  const list = loadSolvedCaptures();
  if (list.includes(id)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...list, id]));
  } catch {
    // Private browsing or a full quota.
  }
}
