import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { BookCompletion } from "../data/types";

const STORAGE_KEY = "islamic-library:book-completions";

type BookCompletionMap = Record<string, BookCompletion>;

function getCompletionKey(bookId: string, languageId: string, volumeId: string) {
  return `${bookId}::${languageId}::${volumeId}`;
}

export function useBookCompletions(bookId?: string, languageId?: string, volumeId?: string) {
  const [completionMap, setCompletionMap] = useState<BookCompletionMap>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCompletions = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);

      setCompletionMap(stored ? (JSON.parse(stored) as BookCompletionMap) : {});
      setError(null);
      setIsLoaded(true);
    } catch {
      setCompletionMap({});
      setError("book-completions-load-failed");
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    void loadCompletions().then(() => {
      if (!isMounted) {
        setCompletionMap({});
        setIsLoaded(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [loadCompletions]);

  const completion = useMemo(() => {
    if (!bookId || !languageId || !volumeId) {
      return undefined;
    }

    return completionMap[getCompletionKey(bookId, languageId, volumeId)];
  }, [bookId, completionMap, languageId, volumeId]);

  const isCompleted = useMemo(() => {
    return !!completion;
  }, [completion]);

  const completedBookIds = useMemo(() => {
    return Array.from(new Set(Object.values(completionMap).map((c) => c.bookId)));
  }, [completionMap]);

  const persist = useCallback(async (nextMap: BookCompletionMap) => {
    setCompletionMap(nextMap);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextMap));
    } catch {
      // Keep in-memory state if persistence fails.
    }
  }, []);

  const markAsCompleted = useCallback(
    async (completionData: BookCompletion) => {
      const key = getCompletionKey(
        completionData.bookId,
        completionData.languageId,
        completionData.volumeId,
      );
      await persist({
        ...completionMap,
        [key]: completionData,
      });
    },
    [completionMap, persist],
  );

  const removeCompletion = useCallback(
    async (targetBookId: string, targetLanguageId: string, targetVolumeId: string) => {
      const key = getCompletionKey(targetBookId, targetLanguageId, targetVolumeId);
      const nextMap = { ...completionMap };
      delete nextMap[key];
      await persist(nextMap);
    },
    [completionMap, persist],
  );

  const refreshCompletions = useCallback(async () => {
    await loadCompletions();
  }, [loadCompletions]);

  return {
    error,
    isLoaded,
    completion,
    completionMap,
    isCompleted,
    completedBookIds,
    markAsCompleted,
    removeCompletion,
    refreshCompletions,
  };
}
