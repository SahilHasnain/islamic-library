import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import type { ReaderTheme } from "../data/types";

const STORAGE_KEY = "islamic-library:reader-theme";
const READER_THEMES: ReaderTheme[] = ["light", "sepia", "night"];

export function useReaderPreferences() {
  const [theme, setTheme] = useState<ReaderTheme>("light");
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTheme() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!isMounted) {
          return;
        }

        if (stored === "light" || stored === "sepia" || stored === "night") {
          setTheme(stored);
        }
        setError(null);
        setIsLoaded(true);
      } catch {
        if (isMounted) {
          setTheme("light");
          setError("reader-preferences-load-failed");
          setIsLoaded(true);
        }
      }
    }

    void loadTheme();

    return () => {
      isMounted = false;
    };
  }, []);

  const cycleTheme = useCallback(async () => {
    const currentIndex = READER_THEMES.indexOf(theme);
    const nextTheme = READER_THEMES[(currentIndex + 1) % READER_THEMES.length];
    setTheme(nextTheme);

    try {
      await AsyncStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // Keep in-memory preference if persistence fails.
    }
  }, [theme]);

  return {
    error,
    isLoaded,
    theme,
    cycleTheme,
  };
}
