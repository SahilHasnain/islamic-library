import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ReadingProgress } from "../data/types";

const STORAGE_KEY = "islamic-library:reading-progress";

type ReadingProgressMap = Record<string, ReadingProgress>;

function getProgressKey(bookId: string, languageId: string, volumeId: string) {
  return `${bookId}::${languageId}::${volumeId}`;
}

export function useReadingProgress(bookId?: string, languageId?: string, volumeId?: string) {
  const [progressMap, setProgressMap] = useState<ReadingProgressMap>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProgress = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);

      if (!stored) {
        setProgressMap({});
        setError(null);
        setIsLoaded(true);
        return;
      }

      const parsed = JSON.parse(stored) as ReadingProgressMap;
      setProgressMap(parsed);
      setError(null);
      setIsLoaded(true);
    } catch {
      setProgressMap({});
      setError("reading-progress-load-failed");
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    void loadProgress().then(() => {
      if (!isMounted) {
        setProgressMap({});
        setIsLoaded(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [loadProgress]);

  const progress = useMemo(() => {
    if (!bookId) {
      return undefined;
    }

    if (languageId && volumeId) {
      return progressMap[getProgressKey(bookId, languageId, volumeId)];
    }

    const bookProgressEntries = Object.values(progressMap).filter(
      (entry) => entry.bookId === bookId,
    );

    return bookProgressEntries.sort((left, right) => {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    })[0];
  }, [bookId, languageId, progressMap, volumeId]);

  const latestProgressByBook = useMemo(() => {
    const nextMap: ReadingProgressMap = {};

    Object.values(progressMap).forEach((entry) => {
      const current = nextMap[entry.bookId];
      if (!current) {
        nextMap[entry.bookId] = entry;
        return;
      }

      if (new Date(entry.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
        nextMap[entry.bookId] = entry;
      }
    });

    return nextMap;
  }, [progressMap]);

  const saveProgress = useCallback(async (nextProgress: ReadingProgress) => {
    setProgressMap((currentMap) => {
      const key = getProgressKey(
        nextProgress.bookId,
        nextProgress.languageId,
        nextProgress.volumeId,
      );
      const nextMap = {
        ...currentMap,
        [key]: nextProgress,
      };

      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextMap)).catch(() => {
        // Keep in-memory progress even if persistence fails.
      });

      return nextMap;
    });
  }, []);

  const resetProgress = useCallback(async () => {
    const emptyMap = {};
    setProgressMap(emptyMap);

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(emptyMap));
    } catch {
      // Keep in-memory state even if persistence fails.
    }
  }, []);

  const refreshProgress = useCallback(async () => {
    await loadProgress();
  }, [loadProgress]);

  return {
    error,
    isLoaded,
    latestProgressByBook,
    progress,
    progressMap,
    refreshProgress,
    resetProgress,
    saveProgress,
  };
}
