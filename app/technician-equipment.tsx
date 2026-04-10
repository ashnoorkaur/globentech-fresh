import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";
import { useAppTheme } from "../lib/theme";

export default function TechnicianEquipmentPage() {
  const theme = useAppTheme();

  return (
    <RoleContentPage
      title="Equipment"
      subtitle="Monitor assigned instruments and maintenance reminders."
      role="Technician"
      activeKey="equipment"
      menuItems={technicianMenu}
      dashboardRoute="/technician-dashboard"
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
        <Text style={[styles.heading, { color: theme.colors.text }]}>
          Equipment Controls
        </Text>
        <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
          Track calibration and prepare devices before sample processing
          windows.
        </Text>
        <View style={styles.row}>
          <Pressable
            style={[styles.btn, { backgroundColor: theme.colors.primary }]}
            onPress={() => router.push("/technician-tasks")}
          >
            <Text style={styles.btnText}>Tasks</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, { backgroundColor: theme.colors.secondary }]}
            onPress={() => router.push("/technician-calendar")}
          >
            <Text style={styles.btnText}>Calendar</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, { backgroundColor: theme.colors.buttonStart }]}
            onPress={() => router.push("/technician-dashboard")}
          >
            <Text style={styles.btnText}>Dashboard</Text>
          </Pressable>
        </View>
      </View>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  heading: { fontSize: 18, fontWeight: "800" },
  copy: { fontSize: 13, lineHeight: 20 },
  row: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
