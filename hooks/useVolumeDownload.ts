import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import type { PublicVolumeManifest } from "../data/types";
import { getCachedPageCount, removeVolumeCache } from "../lib/page-asset-cache";
import { downloadVolumeAssets } from "../lib/page-asset-resolver";

type VolumeDownloadState = {
  cachedPages: number;
  totalPages: number;
  isDownloading: boolean;
  progressPercent: number;
  canDownload: boolean;
};

const emptyState: VolumeDownloadState = {
  cachedPages: 0,
  totalPages: 0,
  isDownloading: false,
  progressPercent: 0,
  canDownload: false,
};

const sharedStates = new Map<string, VolumeDownloadState>();
const listeners = new Map<string, Set<() => void>>();
const inFlightDownloads = new Map<string, Promise<void>>();
const inFlightRefreshes = new Map<string, Promise<void>>();

function getManifestKey(manifest: PublicVolumeManifest | null | undefined) {
  if (!manifest) {
    return null;
  }

  return `${manifest.bookId}:${manifest.languageId}:${manifest.volumeId}`;
}

function getBaseState(manifest: PublicVolumeManifest) {
  return {
    cachedPages: 0,
    totalPages: manifest.totalPages,
    isDownloading: false,
    progressPercent: 0,
    canDownload: Boolean(manifest.baseUrl),
  };
}

function emit(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

function setSharedState(
  key: string,
  updater: VolumeDownloadState | ((previousState: VolumeDownloadState) => VolumeDownloadState),
) {
  const previousState = sharedStates.get(key) ?? emptyState;
  const nextState = typeof updater === "function" ? updater(previousState) : updater;
  sharedStates.set(key, nextState);
  emit(key);
}

function getSnapshot(key: string | null) {
  if (!key) {
    return emptyState;
  }

  return sharedStates.get(key) ?? emptyState;
}

function subscribe(key: string | null, listener: () => void) {
  if (!key) {
    return () => undefined;
  }

  const keyListeners = listeners.get(key) ?? new Set<() => void>();
  keyListeners.add(listener);
  listeners.set(key, keyListeners);

  return () => {
    const currentListeners = listeners.get(key);
    if (!currentListeners) {
      return;
    }

    currentListeners.delete(listener);
    if (currentListeners.size === 0) {
      listeners.delete(key);
    }
  };
}

async function refreshSharedState(manifest: PublicVolumeManifest | null | undefined) {
  const key = getManifestKey(manifest);
  if (!manifest || !key) {
    return;
  }

  const existingRefresh = inFlightRefreshes.get(key);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshPromise = (async () => {
    const cachedPages = await getCachedPageCount(
      manifest.bookId,
      manifest.languageId,
      manifest.volumeId,
      manifest.extension ?? "png",
    );

    setSharedState(key, (previousState) => ({
      ...previousState,
      cachedPages,
      totalPages: manifest.totalPages,
      canDownload: Boolean(manifest.baseUrl),
      progressPercent:
        manifest.totalPages > 0 ? Math.round((cachedPages / manifest.totalPages) * 100) : 0,
    }));
  })().finally(() => {
    inFlightRefreshes.delete(key);
  });

  inFlightRefreshes.set(key, refreshPromise);
  return refreshPromise;
}

export function useVolumeDownload(manifest: PublicVolumeManifest | null | undefined) {
  const key = useMemo(() => getManifestKey(manifest), [manifest]);

  useEffect(() => {
    if (!manifest || !key) {
      return;
    }

    setSharedState(key, (previousState) => ({
      ...getBaseState(manifest),
      cachedPages: previousState.cachedPages,
      progressPercent:
        manifest.totalPages > 0
          ? Math.round((previousState.cachedPages / manifest.totalPages) * 100)
          : 0,
    }));

    void refreshSharedState(manifest);
  }, [key, manifest]);

  const state = useSyncExternalStore(
    useCallback((listener: () => void) => subscribe(key, listener), [key]),
    useCallback(() => getSnapshot(key), [key]),
    useCallback(() => getSnapshot(key), [key]),
  );

  const refresh = useCallback(async () => {
    if (!manifest || !key) {
      return;
    }

    setSharedState(key, (previousState) => ({
      ...previousState,
      totalPages: manifest.totalPages,
      canDownload: Boolean(manifest.baseUrl),
    }));

    await refreshSharedState(manifest);
  }, [key, manifest]);

  const downloadAll = useCallback(async () => {
    if (!manifest?.baseUrl || !key) {
      return;
    }

    const existingDownload = inFlightDownloads.get(key);
    if (existingDownload) {
      return existingDownload;
    }

    setSharedState(key, (previousState) => ({
      ...previousState,
      isDownloading: true,
    }));

    const downloadPromise = (async () => {
      try {
        await downloadVolumeAssets(manifest, (completedPages, totalPages) => {
          setSharedState(key, (previousState) => ({
            ...previousState,
            cachedPages: completedPages,
            totalPages,
            isDownloading: true,
            progressPercent:
              totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0,
          }));
        });
      } finally {
        setSharedState(key, (previousState) => ({
          ...previousState,
          isDownloading: false,
        }));
        await refreshSharedState(manifest);
      }
    })().finally(() => {
      inFlightDownloads.delete(key);
    });

    inFlightDownloads.set(key, downloadPromise);
    return downloadPromise;
  }, [key, manifest]);

  const removeDownload = useCallback(async () => {
    if (!manifest || !key) {
      return;
    }

    await removeVolumeCache(manifest.bookId, manifest.languageId, manifest.volumeId);
    await refreshSharedState(manifest);
  }, [key, manifest]);

  const isFullyDownloaded = state.cachedPages >= state.totalPages && state.totalPages > 0;
  const isPartiallyDownloaded = state.cachedPages > 0 && state.cachedPages < state.totalPages;

  return {
    ...state,
    isFullyDownloaded,
    isPartiallyDownloaded,
    refresh,
    downloadAll,
    removeDownload,
  };
}
