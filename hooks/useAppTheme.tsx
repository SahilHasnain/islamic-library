import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SystemUI from "expo-system-ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useColorScheme } from "react-native";

import { appThemes, type AppColors, type AppThemeVariant } from "../constants/theme";
import type { AppThemePreference } from "../data/types";

const STORAGE_KEY = "islamic-library:app-theme";

type AppThemeContextValue = {
  colors: AppColors;
  error: string | null;
  isLoaded: boolean;
  resolvedTheme: AppThemeVariant;
  themePreference: AppThemePreference;
  setThemePreference: (preference: AppThemePreference) => Promise<void>;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function getResolvedTheme(
  preference: AppThemePreference,
  systemScheme: ReturnType<typeof useColorScheme>,
): AppThemeVariant {
  if (preference === "light" || preference === "dark") {
    return preference;
  }

  return systemScheme === "dark" ? "dark" : "light";
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<AppThemePreference>("system");
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPreference() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!isMounted) {
          return;
        }

        if (stored === "system" || stored === "light" || stored === "dark") {
          setThemePreferenceState(stored);
        }

        setError(null);
        setIsLoaded(true);
      } catch {
        if (isMounted) {
          setThemePreferenceState("system");
          setError("app-theme-load-failed");
          setIsLoaded(true);
        }
      }
    }

    void loadPreference();

    return () => {
      isMounted = false;
    };
  }, []);

  const resolvedTheme = getResolvedTheme(themePreference, systemScheme);
  const colors = appThemes[resolvedTheme];

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {
      // Keep theme changes resilient if SystemUI is unavailable.
    });
  }, [colors.background]);

  const setThemePreference = useCallback(async (preference: AppThemePreference) => {
    setThemePreferenceState(preference);

    try {
      await AsyncStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Keep the in-memory preference even if persistence fails.
    }
  }, []);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      colors,
      error,
      isLoaded,
      resolvedTheme,
      themePreference,
      setThemePreference,
    }),
    [colors, error, isLoaded, resolvedTheme, setThemePreference, themePreference],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);

  if (!context) {
    throw new Error("useAppTheme must be used within AppThemeProvider");
  }

  return context;
}
