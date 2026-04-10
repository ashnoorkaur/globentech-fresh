import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import {
  adminMenu,
  customerMenu,
  guestMenu,
  technicianMenu,
} from "../constants/role-menus";
import { useSessionState } from "../lib/session-store";
import { useAppTheme } from "../lib/theme";

export default function AboutPage() {
  const theme = useAppTheme();
  const session = useSessionState();

  const menuItems = useMemo(() => {
    const role = session.user?.role;
    if (role === "administrator") return adminMenu;
    if (role === "technician") return technicianMenu;
    if (role === "customer") return customerMenu;
    return guestMenu;
  }, [session.user?.role]);

  const dashboardRoute = useMemo(() => {
    const role = session.user?.role;
    if (role === "administrator") return "/admin-dashboard" as const;
    if (role === "technician") return "/technician-dashboard" as const;
    if (role === "customer") return "/customer-dashboard" as const;
    return "/login" as const;
  }, [session.user?.role]);

  const roleLabel = useMemo(() => {
    if (session.user?.role === "administrator") return "Admin";
    if (session.user?.role === "technician") return "Technician";
    if (session.user?.role === "customer") return "Customer";
    return "Guest";
  }, [session.user?.role]);

  return (
    <RoleContentPage
      title="About"
      subtitle="Project, team, and prototype information."
      role={roleLabel}
      activeKey="about"
      menuItems={menuItems}
      dashboardRoute={dashboardRoute}
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10 }}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.heading, { color: theme.colors.text }]}>
            System Information
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            Project: Phase 3 Prototype
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            Status: Development
          </Text>
          <Text style={[styles.note, { color: theme.colors.textMuted }]}>
            Note: This is a school project prototype demonstrating core
            functionality.
          </Text>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.heading, { color: theme.colors.text }]}>
            Project Information
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            Course: CPSY 301-D
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            Phase 3 Prototype
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            SAIT - 2025
          </Text>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.heading, { color: theme.colors.text }]}>
            Client
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            GMJ Global Energy
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            Astra Agus Pramana
          </Text>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.heading, { color: theme.colors.text }]}>
            Team Members
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            Bhavya Bhavya, Evan Di Placido,
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            Ahmad Fakhry, Gaganpreet Kaur,
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            Ashnoor Kaur, Justice Mazerolle, Ravneet Kaur
          </Text>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.footerCopy, { color: theme.colors.textMuted }]}>
            © 2026 GlobenTech. School Project - All rights reserved.
          </Text>
        </View>

        {!session.user ? (
          <View style={styles.row}>
            <Pressable
              style={[styles.btn, { backgroundColor: theme.colors.primary }]}
              onPress={() => router.push("/login")}
            >
              <Text style={styles.btnText}>Login</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { backgroundColor: theme.colors.secondary }]}
              onPress={() => router.push("/signup")}
            >
              <Text style={styles.btnText}>Register</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  heading: { fontSize: 18, fontWeight: "800" },
  copy: { fontSize: 13, lineHeight: 20 },
  copyStrong: { fontSize: 15, lineHeight: 22, fontWeight: "700" },
  note: { fontSize: 12, lineHeight: 18, fontWeight: "700" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  footerCopy: { fontSize: 12, lineHeight: 18, fontWeight: "700" },
  row: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
