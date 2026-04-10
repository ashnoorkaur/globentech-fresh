import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import {
    adminMenu,
    customerMenu,
    guestMenu,
    technicianMenu,
} from "../constants/role-menus";
import { useConfirmModal } from "../hooks/use-confirm-modal";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import {
    adminActivateUser,
    adminChangeRole,
    adminDeactivateUser,
    changeMyPassword,
    fetchAdminUserList,
    fetchMyProfile,
    type ProfileDto,
    updateMyProfile,
} from "../lib/account-api";
import { logoutSession } from "../lib/auth-api";
import { clearChatSession } from "../lib/chatbot-session";
import { clearNotifications } from "../lib/notifications-store";
import { setSessionUser, useSessionState } from "../lib/session-store";
import { getIsDarkMode, setDarkMode, useAppTheme } from "../lib/theme";

export default function SettingsPage() {
  const theme = useAppTheme();
  const session = useSessionState();
  const [users, setUsers] = useState<ProfileDto[]>([]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [darkMode, setDarkModeState] = useState(getIsDarkMode());
  const [busy, setBusy] = useState(false);
  const feedback = useFeedbackModal();
  const confirm = useConfirmModal();

  const menuItems = useMemo(() => {
    const role = session.user?.role;
    if (role === "administrator") return adminMenu;
    if (role === "technician") return technicianMenu;
    if (role === "customer") return customerMenu;
    return guestMenu;
  }, [session.user?.role]);

  const roleLabel = useMemo(() => {
    const role = session.user?.role;
    if (!role) return "Guest";
    return role.charAt(0).toUpperCase() + role.slice(1);
  }, [session.user?.role]);

  const dashboardRoute = useMemo(() => {
    const role = session.user?.role;
    if (role === "administrator") return "/admin-dashboard" as const;
    if (role === "technician") return "/technician-dashboard" as const;
    if (role === "customer") return "/customer-dashboard" as const;
    return "/login" as const;
  }, [session.user?.role]);

  const loadData = useCallback(async () => {
    try {
      const p = await fetchMyProfile();
      setFullName(p.full_name || "");
      setPhone(p.phone || "");
      setCompanyName(p.company_name || "");
      setAddress(p.address || "");

      if (session.user?.role === "administrator") {
        const list = await fetchAdminUserList();
        setUsers(list);
      }
    } catch {
      return;
    }
  }, [session.user?.role]);

  const toggleTheme = (value: boolean) => {
    setDarkMode(value);
    setDarkModeState(value);
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveProfile = async () => {
    setBusy(true);
    try {
      await updateMyProfile({
        full_name: fullName,
        phone,
        company_name: companyName,
        address,
      });
      feedback.showSuccess(
        "Profile Updated",
        "Your account profile information has been saved successfully.",
      );
      await loadData();
    } catch (error) {
      feedback.showError(
        "Profile Update Failed",
        error instanceof Error
          ? error.message
          : "We could not update your profile right now.",
      );
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    setBusy(true);
    try {
      await changeMyPassword(currentPassword, newPassword, confirmPassword);
      feedback.showSuccess(
        "Password Changed",
        "Your password has been updated successfully.",
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      feedback.showError(
        "Password Update Failed",
        error instanceof Error
          ? error.message
          : "We could not change your password. Please verify your current password and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const logoutNow = () => {
    confirm.openConfirm({
      title: "Log Out?",
      message: "You will be signed out from this device.",
      confirmText: "Log Out",
      cancelText: "Stay Signed In",
      variant: "error",
      onConfirm: async () => {
        try {
          await logoutSession();
        } finally {
          clearChatSession();
          clearNotifications();
          setSessionUser(null);
          router.replace("/login");
        }
      },
    });
  };

  const cycleRole = async (user: ProfileDto) => {
    const roles: ProfileDto["role"][] = [
      "customer",
      "technician",
      "administrator",
    ];
    const idx = roles.indexOf(user.role);
    const next = roles[(idx + 1) % roles.length];
    try {
      await adminChangeRole(user.id, next);
      await loadData();
      feedback.showSuccess(
        "Role Updated",
        `${user.full_name}'s role was changed to ${next}.`,
      );
    } catch (error) {
      feedback.showError(
        "Role Update Failed",
        error instanceof Error ? error.message : "Failed to update user role.",
      );
    }
  };

  const toggleActive = async (user: ProfileDto) => {
    try {
      if (user.is_active) {
        await adminDeactivateUser(user.id);
      } else {
        await adminActivateUser(user.id);
      }
      await loadData();
      feedback.showSuccess(
        "User Status Updated",
        `${user.full_name} is now ${user.is_active ? "deactivated" : "activated"}.`,
      );
    } catch (error) {
      feedback.showError(
        "User Status Update Failed",
        error instanceof Error
          ? error.message
          : "Failed to update user status.",
      );
    }
  };

  return (
    <RoleContentPage
      title="Settings"
      subtitle="Update your profile, security, and account access settings."
      role={roleLabel}
      activeKey="settings"
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
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Profile
          </Text>
          <View
            style={[
              styles.themePanel,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text style={[styles.themeTitle, { color: theme.colors.text }]}>
              Theme Preference
            </Text>
            <Text style={[styles.themeSub, { color: theme.colors.textMuted }]}>
              Choose light or dark mode for your account screens
            </Text>
            <View style={styles.themeRow}>
              <View style={styles.modeItem}>
                <Ionicons
                  name="sunny-outline"
                  size={16}
                  color={theme.colors.warning}
                />
                <Text
                  style={[styles.modeText, { color: theme.colors.textMuted }]}
                >
                  Light
                </Text>
              </View>
              <Switch
                value={darkMode}
                onValueChange={toggleTheme}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primary,
                }}
                accessibilityLabel="Theme toggle"
                accessibilityHint="Switch between light and dark mode"
              />
              <View style={styles.modeItem}>
                <Ionicons
                  name="moon-outline"
                  size={16}
                  color={theme.colors.info}
                />
                <Text
                  style={[styles.modeText, { color: theme.colors.textMuted }]}
                >
                  Dark
                </Text>
              </View>
            </View>
          </View>

          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full Name"
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
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone"
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
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="Company Name"
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
            value={address}
            onChangeText={setAddress}
            placeholder="Address"
            multiline
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.input,
              styles.textarea,
              {
                color: theme.colors.text,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.inputBg,
              },
            ]}
          />
          <View style={styles.inlineActions}>
            <GradientButton
              onPress={saveProfile}
              style={[styles.btn, { flex: 1 }]}
              variant="primary"
            >
              {busy ? "Saving..." : "Update Profile"}
            </GradientButton>
            <GradientButton
              onPress={logoutNow}
              style={[styles.btn, { flex: 1 }]}
              variant="danger"
              colors={[theme.colors.danger, theme.colors.danger]}
            >
              Log Out
            </GradientButton>
          </View>
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
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Change Password
          </Text>
          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            placeholder="Current password"
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
            placeholder="New password"
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
            placeholder="Confirm password"
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
          <GradientButton
            onPress={savePassword}
            style={styles.btn}
            variant="secondary"
          >
            {busy ? "Updating..." : "Change Password"}
          </GradientButton>
        </View>

        {session.user?.role === "administrator" ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Manage Users
            </Text>
            {users.map((user) => (
              <View
                key={user.id}
                style={[
                  styles.userRow,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text style={[styles.userName, { color: theme.colors.text }]}>
                  {user.full_name}
                </Text>
                <Text
                  style={[styles.userMeta, { color: theme.colors.textMuted }]}
                >
                  {user.email} | {user.role}
                </Text>
                <View style={styles.rowBtns}>
                  <GradientButton
                    onPress={() => cycleRole(user)}
                    style={styles.smallBtn}
                    colors={[theme.colors.info, theme.colors.primary]}
                    compact
                  >
                    Change Role
                  </GradientButton>
                  <GradientButton
                    onPress={() => toggleActive(user)}
                    style={styles.smallBtn}
                    colors={
                      user.is_active
                        ? [theme.colors.warning, theme.colors.danger]
                        : [theme.colors.success, theme.colors.info]
                    }
                    compact
                  >
                    {user.is_active ? "Deactivate" : "Activate"}
                  </GradientButton>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      {feedback.modal}
      {confirm.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  themePanel: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  themeTitle: { fontSize: 13, fontWeight: "800" },
  themeSub: { fontSize: 11, fontWeight: "600" },
  themeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modeItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  modeText: { fontSize: 11, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textarea: { minHeight: 74, textAlignVertical: "top" },
  inlineActions: { flexDirection: "row", gap: 8 },
  btn: { borderRadius: 10, marginTop: 2 },
  userRow: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  userName: { fontSize: 14, fontWeight: "800" },
  userMeta: { fontSize: 12 },
  rowBtns: { flexDirection: "row", gap: 8, marginTop: 6 },
  smallBtn: { flex: 1, borderRadius: 10 },
});
