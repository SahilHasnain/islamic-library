import { useCallback, useEffect, useState } from "react";

import {
  getOfflineBookIds,
  subscribeOfflineLibrary,
} from "../lib/offline-library";

export function useOfflineLibrary() {
  const [offlineBookIds, setOfflineBookIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    setIsLoading(true);

    try {
      const bookIds = await getOfflineBookIds(options);
      setOfflineBookIds(bookIds);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const unsubscribe = subscribeOfflineLibrary(() => {
      void refresh({ force: true });
    });

    return unsubscribe;
  }, [refresh]);

  return {
    isLoading,
    offlineBookIds,
    refresh,
  };
}
