import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import {
    adminMenu,
    customerMenu,
    guestMenu,
    technicianMenu,
} from "../constants/role-menus";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { changeMyPassword } from "../lib/account-api";
import { useSessionState } from "../lib/session-store";
import { useAppTheme } from "../lib/theme";

export default function ChangePasswordPage() {
  const theme = useAppTheme();
  const session = useSessionState();
  const feedback = useFeedbackModal();
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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

  const onSave = async () => {
    setBusy(true);
    try {
      await changeMyPassword(currentPassword, newPassword, confirmPassword);
      feedback.showSuccess(
        "Password Changed",
        "Your password has been changed.",
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      router.replace("/profile");
    } catch (error) {
      feedback.showError(
        "Change Failed",
        error instanceof Error ? error.message : "Unable to change password.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <RoleContentPage
      title="Change Password"
      subtitle="Use your current password, then set a new secure password."
      role={roleLabel}
      activeKey="profile"
      menuItems={menuItems}
      dashboardRoute={dashboardRoute}
      leftActionMode="back"
      onLeftActionPress={() => router.replace("/profile")}
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
        <View style={styles.headerRow}>
          <Ionicons
            name="lock-closed-outline"
            size={20}
            color={theme.colors.secondary}
          />
          <Text style={[styles.headerText, { color: theme.colors.text }]}>
            Security Update
          </Text>
        </View>
        <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
          Choose a strong password with 8+ characters and confirm it below.
        </Text>
        <TextInput
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          placeholder="Current Password *"
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.inputBg,
            },
          ]}
        />
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          placeholder="New Password *"
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.inputBg,
            },
          ]}
        />
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholder="Confirm New Password *"
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.inputBg,
            },
          ]}
        />

        <Pressable
          onPress={onSave}
          style={[
            styles.submitBtn,
            { backgroundColor: theme.colors.secondary },
          ]}
        >
          <Text style={styles.submitText}>
            {busy ? "Saving..." : "Update Password"}
          </Text>
        </Pressable>
      </View>
      {feedback.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 10 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  headerText: { fontSize: 16, fontWeight: "800" },
  helper: { fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: -2 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  submitBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 2,
  },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
