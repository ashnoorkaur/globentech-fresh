import React from "react";
// Re-exported from lib/theme. This file exists only to prevent import breakage.
// Do not add business logic here.
export * from "../lib/theme";

// Satisfies Expo Router's requirement for a default export on files inside app/
export default function ThemeModule(): React.ReactElement | null {
  return null;
}
