import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { Appearance, Platform } from "react-native";

const THEME_STORAGE_KEY = "globentech-theme-mode";
type ThemeMode = "system" | "light" | "dark";

type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  backgroundDesignA: string;
  backgroundDesignB: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  secondary: string;
  buttonStart: string;
  buttonEnd: string;
  buttonText: string;
  primarySoft: string;
  border: string;
  inputBg: string;
  warning: string;
  info: string;
  danger: string;
  dangerSoft: string;
  success: string;
};

type AppTheme = {
  isDark: boolean;
  colors: ThemeColors;
};

export let isDarkMode = false;
let themeMode: ThemeMode = "system";

const getSystemPrefersDark = () => Appearance.getColorScheme() === "dark";

const resolveDarkMode = (mode: ThemeMode) => {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return getSystemPrefersDark();
};

const parseThemeMode = (value: string | null): ThemeMode | null => {
  if (value === "dark" || value === "light" || value === "system") {
    return value;
  }
  return null;
};

const readStoredThemeWeb = (): ThemeMode | null => {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return null;
  }

  try {
    return parseThemeMode(globalThis.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
};

const readStoredThemeNative = async (): Promise<ThemeMode | null> => {
  try {
    const value = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    return parseThemeMode(value);
  } catch {
    return null;
  }
};

const persistThemeWeb = (value: ThemeMode) => {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return;
  }

  try {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    return;
  }
};

const persistThemeNative = async (value: ThemeMode) => {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    return;
  }
};

const applyMode = (mode: ThemeMode, shouldEmit = true) => {
  const previousDark = isDarkMode;
  themeMode = mode;
  isDarkMode = resolveDarkMode(mode);
  if (shouldEmit && previousDark !== isDarkMode) {
    emitThemeChange();
  }
};

isDarkMode = resolveDarkMode("system");

const subscribers = new Set<() => void>();

const emitThemeChange = () => {
  subscribers.forEach((callback) => callback());
};

const initializeTheme = async () => {
  if (Platform.OS === "web") {
    const stored = readStoredThemeWeb();
    if (stored) {
      applyMode(stored, false);
      emitThemeChange();
    }
    return;
  }

  const persistedValue = await readStoredThemeNative();
  if (persistedValue) {
    applyMode(persistedValue, false);
    emitThemeChange();
  }
};

void initializeTheme();

Appearance.addChangeListener(() => {
  if (themeMode !== "system") return;
  const next = getSystemPrefersDark();
  if (next !== isDarkMode) {
    isDarkMode = next;
    emitThemeChange();
  }
});

export const setDarkMode = (value: boolean) => {
  const nextMode: ThemeMode = value ? "dark" : "light";
  const hadModeChange = themeMode !== nextMode;
  const hadDarkChange = isDarkMode !== value;

  if (!hadModeChange && !hadDarkChange) return;

  themeMode = nextMode;
  isDarkMode = value;

  if (Platform.OS === "web") {
    persistThemeWeb(nextMode);
  } else {
    void persistThemeNative(nextMode);
  }

  emitThemeChange();
};

export const getIsDarkMode = () => isDarkMode;
export const getThemeMode = () => themeMode;

export const setThemeMode = (mode: ThemeMode) => {
  const previousDark = isDarkMode;
  applyMode(mode, false);

  if (Platform.OS === "web") {
    persistThemeWeb(mode);
  } else {
    void persistThemeNative(mode);
  }

  if (previousDark !== isDarkMode) {
    emitThemeChange();
  }
};

const subscribe = (callback: () => void) => {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
};

const lightTheme: AppTheme = {
  isDark: false,
  colors: {
    background: "#F3F5FA",
    surface: "#FFFFFF",
    surfaceMuted: "#EEF1F7",
    backgroundDesignA: "#E6E8FF",
    backgroundDesignB: "#E8ECF8",
    text: "#333640",
    textSecondary: "#525A69",
    textMuted: "#7B8494",
    primary: "#6A73F6",
    secondary: "#8C5BEA",
    buttonStart: "#6A73F6",
    buttonEnd: "#8C5BEA",
    buttonText: "#FFFFFF",
    primarySoft: "#ECEEFF",
    border: "#D8DDEA",
    inputBg: "#F7F8FC",
    warning: "#B7791F",
    info: "#4F7CFF",
    danger: "#E13A4B",
    dangerSoft: "#FFE8EB",
    success: "#1C9A68",
  },
};

const darkTheme: AppTheme = {
  isDark: true,
  colors: {
    background: "#141625",
    surface: "#1C2034",
    surfaceMuted: "#232844",
    backgroundDesignA: "#2A2E58",
    backgroundDesignB: "#1B2340",
    text: "#F4F5FB",
    textSecondary: "#D8DCF0",
    textMuted: "#A6ADC7",
    primary: "#8E95FF",
    secondary: "#B07CFF",
    buttonStart: "#727BF8",
    buttonEnd: "#9C69F5",
    buttonText: "#FFFFFF",
    primarySoft: "#2A2E58",
    border: "#343A5B",
    inputBg: "#20253D",
    warning: "#F1B44C",
    info: "#8AA0FF",
    danger: "#FF8E9B",
    dangerSoft: "#40212A",
    success: "#6ED7A4",
  },
};

export const useAppTheme = (): AppTheme => {
  const dark = useSyncExternalStore(subscribe, getIsDarkMode, getIsDarkMode);
  return dark ? darkTheme : lightTheme;
};

export { darkTheme, lightTheme };

