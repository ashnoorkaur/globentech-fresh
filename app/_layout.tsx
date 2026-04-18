import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";
import { ensureFirebaseLiveBridge } from "../lib/live-data";
import { hydrateSession } from "../lib/session-store";
import { useAppTheme } from "../lib/theme";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const theme = useAppTheme();

  useEffect(() => {
    ensureFirebaseLiveBridge();
    void hydrateSession();
  }, []);

  return (
    <ThemeProvider value={theme.isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="about" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen
          name="chatbot"
          options={{
            headerShown: false,
            presentation: "transparentModal",
            animation: "slide_from_bottom",
          }}
        />
        <Stack.Screen name="admin-dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="admin-approvals" options={{ headerShown: false }} />
        <Stack.Screen name="admin-calendar" options={{ headerShown: false }} />
        <Stack.Screen
          name="admin-order-history"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="admin-users" options={{ headerShown: false }} />
        <Stack.Screen name="admin-equipment" options={{ headerShown: false }} />
        <Stack.Screen name="admin-reports" options={{ headerShown: false }} />
        <Stack.Screen name="admin-queries" options={{ headerShown: false }} />
        <Stack.Screen
          name="customer-dashboard"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="customer-my-orders"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="customer-new-order"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="customer-contact"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="customer-checkout"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="technician-dashboard"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="technician-tasks"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="technician-equipment"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="technician-samples"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="technician-calendar"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="technician-contact"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="change-password" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style={theme.isDark ? "light" : "dark"} />
    </ThemeProvider>
  );
}
