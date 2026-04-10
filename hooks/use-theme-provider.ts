import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { Appearance, Platform } from "react-native";

const THEME_STORAGE_KEY = "globentech-theme-mode";
const SYSTEM_PREFERENCE_KEY = "globentech-follow-system";

type ThemeMode = "light" | "dark" | "system";

/**
 * Enhanced cross-platform theme persistence hook
 * Automatically syncs theme preference across web and native platforms
 * Supports system preference following with automatic label/dark mode detection
 */
export function useThemeProvider() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize theme from storage on mount
  useEffect(() => {
    const initTheme = async () => {
      try {
        if (Platform.OS === "web") {
          const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
          const followSystem = localStorage.getItem(SYSTEM_PREFERENCE_KEY) === "true";
          setThemeModeState(followSystem || !stored ? "system" : stored || "system");
        } else {
          const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
          const followSystem = await AsyncStorage.getItem(SYSTEM_PREFERENCE_KEY);
          setThemeModeState(followSystem === "true" || !stored ? "system" : stored || "system");
        }
      } catch (error) {
        console.warn("Failed to initialize theme from storage", error);
        setThemeModeState("system");
      }
      setIsInitialized(true);
    };

    initTheme();
  }, []);

  // Persist theme preference to storage
  const persistTheme = useCallback(async (mode: ThemeMode) => {
    try {
      if (Platform.OS === "web") {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
        localStorage.setItem(SYSTEM_PREFERENCE_KEY, mode === "system" ? "true" : "false");
      } else {
        await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
        await AsyncStorage.setItem(
          SYSTEM_PREFERENCE_KEY,
          mode === "system" ? "true" : "false",
        );
      }
    } catch (error) {
      console.warn("Failed to persist theme preference", error);
    }
  }, []);

  // Set theme mode with persistence
  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeModeState(mode);
      void persistTheme(mode);
    },
    [persistTheme],
  );

  // Toggle between light and dark (explicit modes)
  const toggleTheme = useCallback(() => {
    setThemeMode(themeMode === "light" ? "dark" : "light");
  }, [themeMode, setThemeMode]);

  // Get current effective theme (resolves "system" to actual preference)
  const getEffectiveTheme = useCallback((): "light" | "dark" => {
    if (themeMode === "system") {
      return Appearance.getColorScheme() === "dark" ? "dark" : "light";
    }
    return themeMode;
  }, [themeMode]);

  // Check if currently in dark mode
  const isDark = getEffectiveTheme() === "dark";

  return {
    themeMode,
    setThemeMode,
    toggleTheme,
    isDark,
    isInitialized,
    getEffectiveTheme,
  };
}
