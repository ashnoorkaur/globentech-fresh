import { useSyncExternalStore } from "react";

const THEME_STORAGE_KEY = "globentech-theme-mode";

type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  secondary: string;
  buttonStart: string;
  buttonEnd: string;
  primarySoft: string;
  border: string;
  inputBg: string;
  danger: string;
  dangerSoft: string;
  success: string;
};

type AppTheme = {
  isDark: boolean;
  colors: ThemeColors;
};

export let isDarkMode = false;

const readStoredTheme = () => {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return false;
  }
  try {
    return globalThis.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
  } catch {
    return false;
  }
};

const persistTheme = (value: boolean) => {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return;
  }
  try {
    globalThis.localStorage.setItem(
      THEME_STORAGE_KEY,
      value ? "dark" : "light",
    );
  } catch {
    return;
  }
};

isDarkMode = readStoredTheme();

const subscribers = new Set<() => void>();

const emitThemeChange = () => {
  subscribers.forEach((callback) => callback());
};

export const setDarkMode = (value: boolean) => {
  if (isDarkMode === value) return;
  isDarkMode = value;
  persistTheme(value);
  emitThemeChange();
};

export const getIsDarkMode = () => isDarkMode;

const subscribe = (callback: () => void) => {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
};

const lightTheme: AppTheme = {
  isDark: false,
  colors: {
    background: "#e8ecf7",
    surface: "#ffffff",
    surfaceMuted: "#f2f4f8",
    text: "#1a1d24",
    textSecondary: "#374151",
    textMuted: "#6b7280",
    primary: "#5f72ff",
    secondary: "#9b23ea",
    buttonStart: "#5f72ff",
    buttonEnd: "#9b23ea",
    primarySoft: "#eceeff",
    border: "#d1d5db",
    inputBg: "#eceff4",
    danger: "#B42318",
    dangerSoft: "#FDECEC",
    success: "#1F7A3D",
  },
};

const darkTheme: AppTheme = {
  isDark: true,
  colors: {
    background: "#111213",
    surface: "#1d1e20",
    surfaceMuted: "#2f3237",
    text: "#f8f9fc",
    textSecondary: "#dee3ed",
    textMuted: "#c2c9d6",
    primary: "#6366f1",
    secondary: "#8b5cf6",
    buttonStart: "#6366f1",
    buttonEnd: "#8b5cf6",
    primarySoft: "#2a2d40",
    border: "#5e636e",
    inputBg: "#2f3237",
    danger: "#FF7C7C",
    dangerSoft: "#4B1F2A",
    success: "#6FD49A",
  },
};

export const useAppTheme = (): AppTheme => {
  const dark = useSyncExternalStore(subscribe, getIsDarkMode, getIsDarkMode);
  return dark ? darkTheme : lightTheme;
};

export { darkTheme, lightTheme };
