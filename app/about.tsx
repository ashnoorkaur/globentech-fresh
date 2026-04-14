import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
  const workflowSteps = [
    "Customer submits order and sample details.",
    "Admin reviews pending requests.",
    "Admin approves/rejects and order state changes.",
    "Approved orders move into queue/calendar scheduling.",
    "Technician executes queue and calendar operations.",
    "Completion updates order to results available/completed and can trigger notifications.",
  ];

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
      subtitle="Project overview, workflow, and team details."
      role={roleLabel}
      activeKey="about"
      menuItems={menuItems}
      dashboardRoute={dashboardRoute}
    >
      <View style={{ gap: 10, paddingBottom: 8 }}>
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
            Product: GlobenTech Mobile Laboratory Workflow
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            Course: PROJ-309-SD
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            Institution: SAIT
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            Delivery Year: 2026
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
            Core Workflow
          </Text>
          {workflowSteps.map((step, index) => (
            <Text
              key={step}
              style={[styles.copy, { color: theme.colors.textMuted }]}
            >
              {index + 1}. {step}
            </Text>
          ))}
          <Text style={[styles.note, { color: theme.colors.textMuted }]}> 
            All customer, admin, and technician screens now follow the same live order timeline so approvals, queue scheduling, technician execution, and completion visibility stay aligned.
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
      </View>
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
