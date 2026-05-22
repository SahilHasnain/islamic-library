import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ActiveReadingPlan } from "../data/types";

const STORAGE_KEY = "islamic-library:active-plans";

type ActivePlanMap = Record<string, ActiveReadingPlan>;

export function useReadingPlans(bookId?: string) {
  const [activePlanMap, setActivePlanMap] = useState<ActivePlanMap>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPlans() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!isMounted) {
          return;
        }

        setActivePlanMap(stored ? (JSON.parse(stored) as ActivePlanMap) : {});
        setError(null);
        setIsLoaded(true);
      } catch {
        if (isMounted) {
          setActivePlanMap({});
          setError("reading-plans-load-failed");
          setIsLoaded(true);
        }
      }
    }

    void loadPlans();

    return () => {
      isMounted = false;
    };
  }, []);

  const activePlan = useMemo(() => {
    if (!bookId) {
      return undefined;
    }

    return activePlanMap[bookId];
  }, [activePlanMap, bookId]);

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
        [plan.bookId]: plan,
      });
    },
    [activePlanMap, persist],
  );

  const clearPlan = useCallback(
    async (targetBookId: string) => {
      const nextMap = { ...activePlanMap };
      delete nextMap[targetBookId];
      await persist(nextMap);
    },
    [activePlanMap, persist],
  );

  const clearAllPlans = useCallback(async () => {
    await persist({});
  }, [persist]);

  return {
    error,
    isLoaded,
    activePlan,
    activePlanMap,
    clearAllPlans,
    selectPlan,
    clearPlan,
  };
}
