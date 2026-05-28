import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ActiveReadingPlan } from "../data/types";

const STORAGE_KEY = "islamic-library:active-plans";

type ActivePlanMap = Record<string, ActiveReadingPlan>;

function getPlanKey(bookId: string, languageId: string, volumeId: string) {
  return `${bookId}::${languageId}::${volumeId}`;
}

export function useReadingPlans(bookId?: string, languageId?: string, volumeId?: string) {
  const [activePlanMap, setActivePlanMap] = useState<ActivePlanMap>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);

      setActivePlanMap(stored ? (JSON.parse(stored) as ActivePlanMap) : {});
      setError(null);
      setIsLoaded(true);
    } catch {
      setActivePlanMap({});
      setError("reading-plans-load-failed");
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    void loadPlans().then(() => {
      if (!isMounted) {
        setActivePlanMap({});
        setIsLoaded(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [loadPlans]);

  const activePlan = useMemo(() => {
    if (!bookId) {
      return undefined;
    }

    if (languageId && volumeId) {
      return activePlanMap[getPlanKey(bookId, languageId, volumeId)];
    }

    const bookPlans = Object.values(activePlanMap).filter((plan) => plan.bookId === bookId);
    return bookPlans.sort((left, right) => {
      return new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime();
    })[0];
  }, [activePlanMap, bookId, languageId, volumeId]);

  const persist = useCallback(async (nextMap: ActivePlanMap) => {
    setActivePlanMap(nextMap);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextMap));
    } catch {
      // Keep in-memory state if persistence fails.
    }
  }, []);

  const selectPlan = useCallback(
    async (plan: ActiveReadingPlan) => {
      await persist({
        ...activePlanMap,
        [getPlanKey(plan.bookId, plan.languageId, plan.volumeId)]: plan,
      });
    },
    [activePlanMap, persist],
  );

  const clearPlan = useCallback(
    async (targetBookId: string, targetLanguageId?: string, targetVolumeId?: string) => {
      const nextMap = { ...activePlanMap };
      if (targetLanguageId && targetVolumeId) {
        delete nextMap[getPlanKey(targetBookId, targetLanguageId, targetVolumeId)];
      } else {
        Object.keys(nextMap).forEach((key) => {
          if (nextMap[key]?.bookId === targetBookId) {
            delete nextMap[key];
          }
        });
      }
      await persist(nextMap);
    },
    [activePlanMap, persist],
  );

  const clearAllPlans = useCallback(async () => {
    await persist({});
  }, [persist]);

  const refreshPlans = useCallback(async () => {
    await loadPlans();
  }, [loadPlans]);

  return {
    error,
    isLoaded,
    activePlan,
    activePlanMap,
    clearAllPlans,
    clearPlan,
    refreshPlans,
    selectPlan,
  };
}
