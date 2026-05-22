import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BOOKS } from "../data/books";
import type { LibraryBook, ReadingProgress } from "../data/types";

const STORAGE_KEY = "islamic-library:reading-progress";

type ReadingProgressMap = Record<string, ReadingProgress>;

function createSeedProgress(book: LibraryBook): ReadingProgress {
  return {
    bookId: book.id,
    languageId: book.continueReading.languageId,
    volumeId: book.continueReading.volumeId,
    page: book.continueReading.page,
    updatedAt: new Date().toISOString(),
  };
}

function createSeedMap(): ReadingProgressMap {
  return Object.fromEntries(BOOKS.map((book) => [book.id, createSeedProgress(book)]));
}

export function useReadingProgress(bookId?: string) {
  const [progressMap, setProgressMap] = useState<ReadingProgressMap>(createSeedMap);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProgress() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!isMounted) {
          return;
        }

        if (!stored) {
          setProgressMap(createSeedMap());
          setError(null);
          setIsLoaded(true);
          return;
        }

        const parsed = JSON.parse(stored) as ReadingProgressMap;
        setProgressMap({
          ...createSeedMap(),
          ...parsed,
        });
        setError(null);
        setIsLoaded(true);
      } catch {
        if (isMounted) {
          setProgressMap(createSeedMap());
          setError("reading-progress-load-failed");
          setIsLoaded(true);
        }
      }
    }

    void loadProgress();

    return () => {
      isMounted = false;
    };
  }, []);

  const progress = useMemo(() => {
    if (!bookId) {
      return undefined;
    }

    return progressMap[bookId];
  }, [bookId, progressMap]);

  const saveProgress = useCallback(async (nextProgress: ReadingProgress) => {
    setProgressMap((currentMap) => {
      const nextMap = {
        ...currentMap,
        [nextProgress.bookId]: nextProgress,
      };

      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextMap)).catch(() => {
        // Keep in-memory progress even if persistence fails.
      });

      return nextMap;
    });
  }, []);

  const resetProgress = useCallback(async () => {
    const seedMap = createSeedMap();
    setProgressMap(seedMap);

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seedMap));
    } catch {
      // Keep in-memory state even if persistence fails.
    }
  }, []);

  return {
    error,
    isLoaded,
    progress,
    progressMap,
    resetProgress,
    saveProgress,
  };
}
