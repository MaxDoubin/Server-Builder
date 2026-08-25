import { rackSchema, type Rack } from "@shared/schema";
import { logError, logWarning } from "@/lib/error-log";

export interface SaveSlot {
  id: string;
  label: string;
  savedAt: number;
  racks: Rack[];
}

export interface AutosaveSnapshot {
  id: string;
  savedAt: number;
  racks: Rack[];
}

const SAVE_SLOTS_KEY = "hyperscale-save-slots";
const AUTOSAVE_KEY = "hyperscale-autosave-snapshots";
const SAVE_VERSION_KEY = "hyperscale-save-version";
const CURRENT_SAVE_VERSION = 2;
const MAX_AUTOSAVES = 5;

/**
 * Reading localStorage can throw outright, not just return null: private
 * windows, blocked site data and some enterprise policies all raise on
 * access. This module is imported by the game context, so an unguarded read
 * here takes the whole scene down before it renders.
 */
const readRaw = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    logWarning("Browser storage is unreadable. Continuing without saved data.", error, { key });
    return null;
  }
};

if (typeof window !== "undefined") {
  try {
    const savedVersion = Number(localStorage.getItem(SAVE_VERSION_KEY) || "0");
    if (savedVersion < CURRENT_SAVE_VERSION) {
      localStorage.removeItem(AUTOSAVE_KEY);
      localStorage.removeItem(SAVE_SLOTS_KEY);
      localStorage.setItem(SAVE_VERSION_KEY, String(CURRENT_SAVE_VERSION));
    }
  } catch (error) {
    logWarning("Could not run the save format migration.", error);
  }
}

const cloneRacks = (racks: Rack[]) => {
  try {
    return structuredClone(racks);
  } catch {
    return JSON.parse(JSON.stringify(racks)) as Rack[];
  }
};

const normalizeRack = (rack: Rack): Rack => {
  const totalUs = Number.isFinite(rack.totalUs) && rack.totalUs > 0 ? rack.totalUs : 42;
  const validInstalled = rack.installedEquipment.filter((item) => {
    const validRange = item.uStart >= 1 && item.uEnd <= totalUs && item.uStart <= item.uEnd;
    return Boolean(item.id && item.equipmentId && validRange);
  });

  const installed: typeof validInstalled = [];
  const occupiedSlots = new Set<number>();
  for (const item of validInstalled) {
    let hasOverlap = false;
    for (let u = item.uStart; u <= item.uEnd; u++) {
      if (occupiedSlots.has(u)) {
        hasOverlap = true;
        break;
      }
    }
    if (!hasOverlap) {
      installed.push(item);
      for (let u = item.uStart; u <= item.uEnd; u++) {
        occupiedSlots.add(u);
      }
    }
  }

  const installedIds = new Set(installed.map((item) => item.id));
  const slots = Array.from({ length: totalUs }).map((_, index) => {
    const position = index + 1;
    const existing = rack.slots.find((slot) => slot.uPosition === position);
    const equipmentInstanceId =
      existing?.equipmentInstanceId && installedIds.has(existing.equipmentInstanceId)
        ? existing.equipmentInstanceId
        : null;
    return { uPosition: position, equipmentInstanceId };
  });

  return {
    ...rack,
    totalUs,
    slots,
    installedEquipment: installed,
    currentPowerDraw: Math.max(0, rack.currentPowerDraw),
    inletTemp: Number.isFinite(rack.inletTemp) ? rack.inletTemp : 22,
    exhaustTemp: Number.isFinite(rack.exhaustTemp) ? rack.exhaustTemp : 24,
    airflowRestriction: Math.max(0, rack.airflowRestriction),
    positionX: Number.isFinite(rack.positionX) ? rack.positionX : 0,
    positionY: Number.isFinite(rack.positionY) ? rack.positionY : 0,
  };
};

export const sanitizeRacks = (value: unknown): Rack[] => {
  if (!Array.isArray(value)) return [];
  const sanitized: Rack[] = [];
  value.forEach((entry, index) => {
    const parsed = rackSchema.safeParse(entry);
    if (!parsed.success) {
      logWarning("Invalid rack data skipped during load.", parsed.error, { index });
      return;
    }
    sanitized.push(normalizeRack(parsed.data));
  });
  return sanitized;
};

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const getSnapshotId = () =>
  `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const loadSaveSlots = (): SaveSlot[] => {
  if (typeof window === "undefined") return [];
  const raw = safeParse<SaveSlot[]>(readRaw(SAVE_SLOTS_KEY), []);
  return raw.flatMap((slot) => {
    const sanitized = sanitizeRacks(slot.racks);
    if (slot.racks.length > 0 && sanitized.length === 0) {
      logWarning("Dropped invalid save slot payload.", undefined, { slotId: slot.id });
      return [];
    }
    return [{ ...slot, racks: sanitized }];
  });
};

export const saveSlot = (id: string, racks: Rack[], label?: string): SaveSlot => {
  if (typeof window === "undefined") {
    return { id, label: label ?? id, savedAt: Date.now(), racks: cloneRacks(racks) };
  }
  const slots = loadSaveSlots();
  const savedAt = Date.now();
  const nextSlot: SaveSlot = {
    id,
    label: label ?? id,
    savedAt,
    racks: cloneRacks(sanitizeRacks(racks)),
  };
  const nextSlots = [
    nextSlot,
    ...slots.filter((slot) => slot.id !== id),
  ];
  try {
    localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(nextSlots));
  } catch (error) {
    logError("Failed to persist save slot.", error);
  }
  return nextSlot;
};

export const loadSlot = (id: string): SaveSlot | null => {
  const slots = loadSaveSlots();
  return slots.find((slot) => slot.id === id) ?? null;
};

export const deleteSlot = (id: string) => {
  if (typeof window === "undefined") return;
  const slots = loadSaveSlots().filter((slot) => slot.id !== id);
  try {
    localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(slots));
  } catch (error) {
    logError("Failed to delete save slot.", error);
  }
};

export const loadAutosaveSnapshots = (): AutosaveSnapshot[] => {
  if (typeof window === "undefined") return [];
  const snapshots = safeParse<AutosaveSnapshot[]>(readRaw(AUTOSAVE_KEY), []);
  return snapshots.flatMap((snapshot) => {
    const sanitized = sanitizeRacks(snapshot.racks);
    if (snapshot.racks.length > 0 && sanitized.length === 0) {
      logWarning("Dropped invalid autosave payload.", undefined, { snapshotId: snapshot.id });
      return [];
    }
    return [{ ...snapshot, racks: sanitized }];
  });
};

export const addAutosaveSnapshot = (racks: Rack[]): AutosaveSnapshot[] => {
  if (typeof window === "undefined") return [];
  const snapshots = loadAutosaveSnapshots();
  const next: AutosaveSnapshot = {
    id: getSnapshotId(),
    savedAt: Date.now(),
    racks: cloneRacks(sanitizeRacks(racks)),
  };
  const nextSnapshots = [next, ...snapshots].slice(0, MAX_AUTOSAVES);
  const payload = JSON.stringify(nextSnapshots);
  // localStorage is small (~5MB). Large rack counts will exceed it.
  if (payload.length > 4_500_000) {
    logWarning("Autosave payload too large, skipping persistence.", undefined, { bytes: payload.length });
    return nextSnapshots;
  }
  try {
    localStorage.setItem(AUTOSAVE_KEY, payload);
  } catch (error) {
    logError("Failed to persist autosave snapshot.", error);
  }
  return nextSnapshots;
};

export const rollbackAutosaveSnapshot = (): AutosaveSnapshot | null => {
  if (typeof window === "undefined") return null;
  const snapshots = loadAutosaveSnapshots();
  if (snapshots.length < 2) {
    return snapshots[0] ?? null;
  }
  const [, ...rest] = snapshots;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(rest));
  } catch (error) {
    logError("Failed to trim autosave snapshots.", error);
  }
  return rest[0] ?? null;
};

/* ------------------------------------------------------------------ *
 * Named layouts
 *
 * The three fixed slots above are a quick save. These are the ones you
 * name and keep. Same storage, separate key, so an existing quick save
 * is not disturbed.
 *
 * localStorage gives a page somewhere around five megabytes in total,
 * shared with the autosave ring. A dense 500 rack floor serialises to
 * roughly three megabytes on its own, so a single layout is capped well
 * under that and the caller is told in words when a save will not fit,
 * rather than the write throwing somewhere out of sight.
 * ------------------------------------------------------------------ */

const NAMED_LAYOUTS_KEY = "hyperscale-named-layouts";

/** Refuse a layout larger than this. Roughly 250 dense racks. */
export const MAX_LAYOUT_BYTES = 1_500_000;

/** Keeps one bad actor from filling the origin's storage on its own. */
export const MAX_NAMED_LAYOUTS = 12;

export const MAX_LAYOUT_NAME_LENGTH = 40;

export interface NamedLayout {
  id: string;
  name: string;
  savedAt: number;
  rackCount: number;
  equipmentCount: number;
  racks: Rack[];
}

/** Everything but the racks, for listing without paying to parse them. */
export type NamedLayoutSummary = Omit<NamedLayout, "racks">;

export interface LayoutWriteResult {
  ok: boolean;
  layout?: NamedLayout;
  error?: string;
}

const sanitizeName = (name: string) =>
  name.replace(/\s+/g, " ").trim().slice(0, MAX_LAYOUT_NAME_LENGTH);

const readNamedLayouts = (): NamedLayout[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = readRaw(NAMED_LAYOUTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Partial<NamedLayout>;
      if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return [];
      const racks = sanitizeRacks(candidate.racks);
      return [
        {
          id: candidate.id,
          name: sanitizeName(candidate.name) || "Untitled layout",
          savedAt: typeof candidate.savedAt === "number" ? candidate.savedAt : 0,
          rackCount: racks.length,
          equipmentCount: racks.reduce((sum, rack) => sum + rack.installedEquipment.length, 0),
          racks,
        },
      ];
    });
  } catch (error) {
    logWarning("Could not read named layouts. Treating storage as empty.", error);
    return [];
  }
};

const writeNamedLayouts = (layouts: NamedLayout[]): string | null => {
  if (typeof window === "undefined") return "Storage is not available here.";
  try {
    localStorage.setItem(NAMED_LAYOUTS_KEY, JSON.stringify(layouts));
    return null;
  } catch (error) {
    logError("Failed to persist named layouts.", error);
    return "Browser storage refused the write. It is most likely full.";
  }
};

export const listNamedLayouts = (): NamedLayoutSummary[] =>
  readNamedLayouts()
    .map(({ racks, ...summary }) => summary)
    .sort((a, b) => b.savedAt - a.savedAt);

export const loadNamedLayout = (id: string): NamedLayout | null =>
  readNamedLayouts().find((layout) => layout.id === id) ?? null;

/**
 * Create a layout, or overwrite one by id.
 *
 * Overwriting is explicit: pass the id of the layout being replaced. The
 * caller is expected to have confirmed with the user first, which is why
 * there is no prompt in here.
 */
export const saveNamedLayout = (
  name: string,
  racks: Rack[],
  overwriteId?: string,
): LayoutWriteResult => {
  const cleanName = sanitizeName(name);
  if (!cleanName) return { ok: false, error: "Give the layout a name first." };

  const sanitized = sanitizeRacks(racks);
  if (racks.length > 0 && sanitized.length === 0) {
    return { ok: false, error: "The current floor did not pass validation, so it was not saved." };
  }

  const layout: NamedLayout = {
    id: overwriteId ?? `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName,
    savedAt: Date.now(),
    rackCount: sanitized.length,
    equipmentCount: sanitized.reduce((sum, rack) => sum + rack.installedEquipment.length, 0),
    racks: cloneRacks(sanitized),
  };

  let payloadBytes = 0;
  try {
    payloadBytes = JSON.stringify(layout).length;
  } catch (error) {
    logError("Could not measure a layout before saving.", error);
    return { ok: false, error: "The layout could not be serialised." };
  }

  if (payloadBytes > MAX_LAYOUT_BYTES) {
    const megabytes = (payloadBytes / 1_000_000).toFixed(1);
    return {
      ok: false,
      error: `This floor needs about ${megabytes} MB and the per layout limit is ${(
        MAX_LAYOUT_BYTES / 1_000_000
      ).toFixed(1)} MB. Lower the rack density and save again.`,
    };
  }

  const existing = readNamedLayouts();
  const withoutTarget = existing.filter((entry) => entry.id !== layout.id);

  if (!overwriteId && withoutTarget.length >= MAX_NAMED_LAYOUTS) {
    return {
      ok: false,
      error: `There is room for ${MAX_NAMED_LAYOUTS} named layouts. Delete one first.`,
    };
  }

  const error = writeNamedLayouts([layout, ...withoutTarget]);
  if (error) return { ok: false, error };
  return { ok: true, layout };
};

export const renameNamedLayout = (id: string, name: string): LayoutWriteResult => {
  const cleanName = sanitizeName(name);
  if (!cleanName) return { ok: false, error: "A layout needs a name." };
  const layouts = readNamedLayouts();
  const target = layouts.find((layout) => layout.id === id);
  if (!target) return { ok: false, error: "That layout is no longer in storage." };
  const next = layouts.map((layout) =>
    layout.id === id ? { ...layout, name: cleanName } : layout,
  );
  const error = writeNamedLayouts(next);
  if (error) return { ok: false, error };
  return { ok: true, layout: { ...target, name: cleanName } };
};

export const deleteNamedLayout = (id: string): LayoutWriteResult => {
  const layouts = readNamedLayouts();
  if (!layouts.some((layout) => layout.id === id)) {
    return { ok: false, error: "That layout is no longer in storage." };
  }
  const error = writeNamedLayouts(layouts.filter((layout) => layout.id !== id));
  if (error) return { ok: false, error };
  return { ok: true };
};
