/** Which firewall exercises this browser has solved, and any ruleset in progress. */
const SOLVED_KEY = "maxdoubin-firewall-solved";
const DRAFT_KEY = "maxdoubin-firewall-drafts";

export const loadSolvedFirewall = (): string[] => {
  try {
    const raw = localStorage.getItem(SOLVED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? parsed : [];
  } catch {
    return [];
  }
};

export function recordSolvedFirewall(slug: string): void {
  const list = loadSolvedFirewall();
  if (list.includes(slug)) return;
  try {
    localStorage.setItem(SOLVED_KEY, JSON.stringify([...list, slug]));
  } catch {
    // Private browsing or a full quota.
  }
}

export const loadDraft = (slug: string): string | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = (parsed as Record<string, unknown>)[slug];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
};

export function saveDraft(slug: string, source: string): void {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const drafts =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {};
    drafts[slug] = source;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    // Nothing to do about it.
  }
}

export function clearDraft(slug: string): void {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    const drafts = parsed as Record<string, string>;
    delete drafts[slug];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    // Nothing to do about it.
  }
}
