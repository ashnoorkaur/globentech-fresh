import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { adminMenu } from "../constants/role-menus";
import { useAppTheme } from "../lib/theme";

export default function AdminCalendarPage() {
  const theme = useAppTheme();

  useEffect(() => {
    router.replace("/admin-order-history");
  }, []);

  return (
    <RoleContentPage
      title="Redirecting"
      subtitle="Admin queue management now lives in Orders & Assignments."
      role="Admin"
      activeKey="order-history"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={[styles.message, { color: theme.colors.text }]}>Opening Orders & Assignments...</Text>
      </View>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 12,
    alignItems: "center",
  },
  message: { fontSize: 14, fontWeight: "700" },
});
