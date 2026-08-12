import * as FileSystem from "expo-file-system/legacy";

const DATA_ROOT = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}library-data/`
  : null;

export type CachedJsonEntry<T> = {
  version: string;
  savedAt: string;
  data: T;
};

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}

function getEntryPath(name: string) {
  if (!DATA_ROOT) {
    return null;
  }

  return `${DATA_ROOT}${sanitizeSegment(name)}.json`;
}

async function ensureDataDirectory() {
  if (!DATA_ROOT) {
    return false;
  }

  const info = await FileSystem.getInfoAsync(DATA_ROOT);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DATA_ROOT, { intermediates: true });
  }

  return true;
}

export async function saveJsonEntry<T>(name: string, version: string, data: T) {
  const path = getEntryPath(name);
  if (!path || !(await ensureDataDirectory())) {
    return;
  }

  const entry: CachedJsonEntry<T> = {
    version,
    savedAt: new Date().toISOString(),
    data,
  };

  await FileSystem.writeAsStringAsync(path, JSON.stringify(entry));
}

export async function loadJsonEntry<T>(name: string): Promise<CachedJsonEntry<T> | null> {
  const path = getEntryPath(name);
  if (!path) {
    return null;
  }

  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    return null;
  }

  try {
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as CachedJsonEntry<T>;
    if (!parsed || parsed.data === undefined || parsed.data === null) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function clearJsonEntry(name: string) {
  const path = getEntryPath(name);
  if (!path) {
    return;
  }

  await FileSystem.deleteAsync(path, { idempotent: true });
}
