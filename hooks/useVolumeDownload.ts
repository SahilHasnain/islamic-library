import { useCallback, useEffect, useState } from "react";

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

export function useVolumeDownload(manifest: PublicVolumeManifest | null | undefined) {
  const [state, setState] = useState<VolumeDownloadState>({
    cachedPages: 0,
    totalPages: manifest?.totalPages ?? 0,
    isDownloading: false,
    progressPercent: 0,
    canDownload: Boolean(manifest?.baseUrl),
  });

  const refresh = useCallback(async () => {
    if (!manifest) {
      setState({
        cachedPages: 0,
        totalPages: 0,
        isDownloading: false,
        progressPercent: 0,
        canDownload: false,
      });
      return;
    }

    const cachedPages = await getCachedPageCount(
      manifest.bookId,
      manifest.languageId,
      manifest.volumeId,
      manifest.extension ?? "png",
    );

    setState((previousState) => ({
      ...previousState,
      cachedPages,
      totalPages: manifest.totalPages,
      canDownload: Boolean(manifest.baseUrl),
      progressPercent:
        manifest.totalPages > 0
          ? Math.round((cachedPages / manifest.totalPages) * 100)
          : 0,
    }));
  }, [manifest]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const downloadAll = useCallback(async () => {
    if (!manifest?.baseUrl) {
      return;
    }

    setState((previousState) => ({
      ...previousState,
      isDownloading: true,
    }));

    try {
      await downloadVolumeAssets(manifest, (completedPages, totalPages) => {
        setState((previousState) => ({
          ...previousState,
          cachedPages: completedPages,
          totalPages,
          isDownloading: true,
          progressPercent: totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0,
        }));
      });
    } finally {
      setState((previousState) => ({
        ...previousState,
        isDownloading: false,
      }));
      await refresh();
    }
  }, [manifest, refresh]);

  const removeDownload = useCallback(async () => {
    if (!manifest) {
      return;
    }

    await removeVolumeCache(manifest.bookId, manifest.languageId, manifest.volumeId);
    await refresh();
  }, [manifest, refresh]);

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
