/**
 * Which endings has this reader found?
 *
 * Per browser, in localStorage, and nowhere else: there is no account here
 * and no server to keep it on. Every read and write is wrapped, because a
 * browser in private mode, a full quota, or a user who has blocked site data
 * throws on access rather than returning null, and losing a list of endings
 * is not worth taking the page down for.
 *
 * Found endings are the only thing kept. Not the path taken, not how long it
 * took, not a score: the interesting fact about a scenario with seven endings
 * is which ones you have seen, and that is small enough to be honest about.
 */

const KEY = "maxdoubin-scenario-endings";

export type FoundMap = Record<string, string[]>;

function read(): FoundMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const found: FoundMap = {};
    for (const [slug, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
        found[slug] = value as string[];
      }
    }
    return found;
  } catch {
    return {};
  }
}

function write(found: FoundMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    // Private browsing, or the quota is gone. The session still works.
  }
}

export const loadFound = (): FoundMap => read();

export function loadFoundFor(slug: string): string[] {
  return read()[slug] ?? [];
}

/** Record an ending and hand back the new list for that scenario. */
export function recordEnding(slug: string, endingId: string): string[] {
  const found = read();
  const list = found[slug] ?? [];
  if (!list.includes(endingId)) {
    found[slug] = [...list, endingId];
    write(found);
    return found[slug];
  }
  return list;
}

export function clearScenario(slug: string): void {
  const found = read();
  delete found[slug];
  write(found);
}

export function clearAllScenarios(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do, and nothing worth telling the reader about.
  }
}
