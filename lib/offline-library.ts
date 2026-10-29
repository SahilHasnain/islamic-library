import * as FileSystem from "expo-file-system/legacy";

import type { PublicVolumeManifest } from "../data/types";
import type { CachedJsonEntry } from "./library-data-cache";
import { getCachedPageCount } from "./page-asset-cache";

/**
 * Offline availability is derived from the filesystem so it always matches the
 * pages the reader can actually open. Reading a book online also caches a few
 * pages, so we only count an edition as downloaded when every page is cached.
 *
 * This intentionally does not use a separate download registry: a registry can
 * drift from the files, while a scan works for downloads made before this
 * feature existed.
 */

const DATA_ROOT = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}library-data/`
  : null;

const MANIFEST_FILE_PREFIX = "manifest-";
const MANIFEST_FILE_SUFFIX = ".json";

let cachedSnapshot: Set<string> | null = null;
let inFlightSnapshot: Promise<Set<string>> | null = null;
const listeners = new Set<() => void>();

async function readDirectorySafe(path: string | null) {
  if (!path) {
    return [] as string[];
  }

  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || !info.isDirectory) {
      return [];
    }

    return await FileSystem.readDirectoryAsync(path);
  } catch {
    return [];
  }
}

async function readCachedManifest(fileName: string) {
  if (!DATA_ROOT) {
    return null;
  }

  try {
    const raw = await FileSystem.readAsStringAsync(`${DATA_ROOT}${fileName}`);
    const parsed = JSON.parse(raw) as CachedJsonEntry<PublicVolumeManifest>;
    const manifest = parsed?.data;

    if (
      !manifest?.bookId ||
      !manifest?.languageId ||
      !manifest?.volumeId ||
      !(manifest.totalPages > 0)
    ) {
      return null;
    }

    return manifest;
  } catch {
    return null;
  }
}

async function loadCachedManifests() {
  const entries = await readDirectorySafe(DATA_ROOT);
  const manifestFiles = entries.filter(
    (entry) =>
      entry.startsWith(MANIFEST_FILE_PREFIX) && entry.endsWith(MANIFEST_FILE_SUFFIX),
  );

  const manifests = await Promise.all(manifestFiles.map(readCachedManifest));
  return manifests.filter((manifest): manifest is PublicVolumeManifest => Boolean(manifest));
}

async function scanOfflineBooks() {
  const manifests = await loadCachedManifests();
  const offlineBookIds = new Set<string>();

  await Promise.all(
    manifests.map(async (manifest) => {
      try {
        const cachedPages = await getCachedPageCount(
          manifest.bookId,
          manifest.languageId,
          manifest.volumeId,
          manifest.extension ?? "png",
        );

        if (cachedPages >= manifest.totalPages) {
          offlineBookIds.add(manifest.bookId);
        }
      } catch {
        // A single unreadable volume shouldn't hide the rest of the library.
      }
    }),
  );

  return offlineBookIds;
}

export function getOfflineBookIds(options?: { force?: boolean }) {
  if (!options?.force && cachedSnapshot) {
    return Promise.resolve(cachedSnapshot);
  }

  if (inFlightSnapshot) {
    return inFlightSnapshot;
  }

  const snapshot = scanOfflineBooks()
    .then((bookIds) => {
      cachedSnapshot = bookIds;
      return bookIds;
    })
    .finally(() => {
      inFlightSnapshot = null;
    });

  inFlightSnapshot = snapshot;
  return snapshot;
}

export function subscribeOfflineLibrary(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function invalidateOfflineLibrary() {
  cachedSnapshot = null;
  listeners.forEach((listener) => listener());
}
